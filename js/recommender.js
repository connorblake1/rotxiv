import * as store from './store.js';
import { TIERS } from './config.js';

export function tierFor(hIndex) {
  for (const t of TIERS) if (hIndex >= t.minH) return t;
  return null;
}

export function buildProfile() {
  const s = store.get();
  const profile = { categories: {}, keywords: {}, authors: {} };
  const incr = (m, k, v) => { m[k] = (m[k] || 0) + v; };
  for (const [, e] of Object.entries(s.interactions)) {
    let weight = 0;
    if (e.liked) weight += 2;
    if (e.saved) weight += 3;
    if (e.opens) weight += 1;
    if ((e.dwellMs || 0) > 5000) weight += 1;
    if (!weight) continue;
    for (const c of e.cats || [])    incr(profile.categories, c, weight);
    for (const a of e.authors || []) incr(profile.authors, a, weight);
    for (const w of tokenize(e.title || '')) incr(profile.keywords, w, weight);
  }
  for (const c of s.follows.categories) incr(profile.categories, c, 4);
  for (const k of s.follows.keywords)   incr(profile.keywords, k.toLowerCase(), 5);
  for (const a of s.follows.authors)    incr(profile.authors, a, 8);
  return profile;
}

const STOP = new Set('a an the of and or for to in on with by from is are was were be been being via using new toward towards via between among'.split(' '));
function tokenize(s) {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w));
}

export function score(paper, profile, now = Date.now()) {
  let s = 0;
  const cats = paper.categories || [];
  const auths = paper.authors || [];
  const text = ((paper.title || '') + ' ' + (paper.summary || '')).toLowerCase();
  for (const c of cats) s += (profile.categories[c] || 0);
  for (const a of auths) s += (profile.authors[a] || 0);
  for (const k of Object.keys(profile.keywords)) {
    if (text.includes(k)) s += profile.keywords[k];
  }
  if (paper.maxHIndex)   s += 0.05 * paper.maxHIndex;
  if (paper.published) {
    const days = (now - new Date(paper.published).getTime()) / 864e5;
    if (days >= 0) s += 5 * Math.exp(-days / 14);
  }
  s += Math.random() * 0.5;
  return s;
}

export function rank(papers, profile) {
  const seen = new Set();
  const deduped = [];
  for (const p of papers) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    deduped.push({ ...p, _score: score(p, profile) });
  }
  deduped.sort((a, b) => b._score - a._score);
  return deduped;
}
