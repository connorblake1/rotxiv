import { CORS_PROXIES, ARXIV_API, SS_API, AR5IV, PAGE_SIZE } from './config.js';
import * as store from './store.js';

async function viaProxy(url, init = {}) {
  let lastErr = null;
  for (const wrap of CORS_PROXIES) {
    try {
      const r = await fetch(wrap(url), init);
      if (r.ok) return r;
      lastErr = new Error(`${r.status} from proxy`);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('all proxies failed');
}

export function buildArxivQuery({ categories = [], authors = [], keywords = [], catBranch = 'OR' } = {}) {
  const parts = [];
  if (categories.length) {
    parts.push('(' + categories.map(c => `cat:${c}`).join(`+${catBranch}+`) + ')');
  }
  if (authors.length) {
    parts.push('(' + authors.map(a => `au:"${a.replace(/"/g, '')}"`).join('+OR+') + ')');
  }
  if (keywords.length) {
    parts.push('(' + keywords.map(k => `all:${encodeQ(k)}`).join('+OR+') + ')');
  }
  return parts.join('+AND+') || 'all:physics';
}

function encodeQ(s) { return s.replace(/[^\w]+/g, '+'); }

export async function fetchArxiv({ query, start = 0, max = PAGE_SIZE, sort = 'submittedDate' }) {
  const url = `${ARXIV_API}?search_query=${query}&sortBy=${sort}&sortOrder=descending&start=${start}&max_results=${max}`;
  const r = await viaProxy(url);
  const xml = await r.text();
  return parseArxivAtom(xml);
}

export function parseArxivAtom(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return [];
  const entries = [...doc.getElementsByTagName('entry')];
  return entries.map(e => {
    const idUrl  = txt(e, 'id');
    const m      = idUrl.match(/abs\/([^v\s]+)(v\d+)?/);
    const arxivId = m ? m[1] : idUrl.split('/').pop();
    const title  = squash(txt(e, 'title'));
    const summary = squash(txt(e, 'summary'));
    const published = txt(e, 'published');
    const updated   = txt(e, 'updated');
    const authors = [...e.getElementsByTagName('author')].map(a => txt(a, 'name'));
    const categories = [...e.getElementsByTagName('category')].map(c => c.getAttribute('term')).filter(Boolean);
    const links = [...e.getElementsByTagName('link')];
    const pdf  = (links.find(l => l.getAttribute('title') === 'pdf') || {}).getAttribute?.('href') || null;
    const html = `https://arxiv.org/abs/${arxivId}`;
    return { id: arxivId, title, summary, published, updated, authors, categories, pdf, html };
  });
}

function txt(parent, tag) {
  const el = parent.getElementsByTagName(tag)[0];
  return el ? el.textContent.trim() : '';
}
function squash(s) { return s.replace(/\s+/g, ' ').trim(); }

export async function fetchAuthorTier(name) {
  const cached = store.getAuthorCache(name);
  if (cached) return cached;
  const url = `${SS_API}/author/search?query=${encodeURIComponent(name)}&limit=1&fields=name,hIndex,citationCount,paperCount`;
  try {
    const r = await viaProxy(url);
    const j = await r.json();
    const a = j.data?.[0];
    if (!a) {
      const empty = { name, hIndex: 0, citationCount: 0, paperCount: 0, missing: true };
      store.setAuthorCache(name, empty);
      return empty;
    }
    const data = { name: a.name || name, hIndex: a.hIndex || 0, citationCount: a.citationCount || 0, paperCount: a.paperCount || 0 };
    store.setAuthorCache(name, data);
    return data;
  } catch {
    return { name, hIndex: 0, citationCount: 0, paperCount: 0, missing: true };
  }
}

export async function fetchThumbnail(arxivId) {
  try {
    const r = await viaProxy(AR5IV(arxivId));
    if (!r.ok) return null;
    const html = await r.text();
    return extractFirstFigure(html, arxivId);
  } catch {
    return null;
  }
}

export function extractFirstFigure(html, arxivId) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const fig = doc.querySelector('figure img, .ltx_figure img, img.ltx_graphics, img[src*="/html/"]');
  if (!fig) return null;
  let src = fig.getAttribute('src');
  if (!src) return null;
  if (src.startsWith('//')) src = 'https:' + src;
  else if (src.startsWith('/')) src = 'https://ar5iv.labs.arxiv.org' + src;
  else if (!/^https?:/.test(src)) src = `https://ar5iv.labs.arxiv.org/html/${arxivId}/${src}`;
  return src;
}
