import * as store from './store.js';

export async function requestPersistent() {
  if (!navigator.storage || !navigator.storage.persist) return { supported: false };
  try {
    const already = await navigator.storage.persisted();
    if (already) return { supported: true, granted: true };
    const granted = await navigator.storage.persist();
    return { supported: true, granted };
  } catch {
    return { supported: true, granted: false };
  }
}

export async function isPersisted() {
  if (!navigator.storage || !navigator.storage.persisted) return null;
  try { return await navigator.storage.persisted(); } catch { return null; }
}

const HEADER = 'arxivrot.v1:';

export function exportToString() {
  const json = JSON.stringify({ v: 1, savedAt: Date.now(), state: store.snapshot() });
  return HEADER + b64UrlEncode(json);
}

export function importFromString(s) {
  if (!s || !s.startsWith(HEADER)) throw new Error('not an arxivrot backup');
  const json = b64UrlDecode(s.slice(HEADER.length));
  const parsed = JSON.parse(json);
  if (!parsed || !parsed.state) throw new Error('malformed backup');
  store.setAll(parsed.state);
  return parsed.savedAt || null;
}

function b64UrlEncode(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64UrlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const TOKEN_KEY = 'arxivrot.gist.token';
const GIST_KEY  = 'arxivrot.gist.id';
const GIST_FILE = 'arxivrot-state.json';

export function saveGistToken(token, gistId = null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (gistId) localStorage.setItem(GIST_KEY, gistId);
  else localStorage.removeItem(GIST_KEY);
}
export function getGistConfig() {
  return { token: localStorage.getItem(TOKEN_KEY) || '', gistId: localStorage.getItem(GIST_KEY) || '' };
}
export function gistEnabled() { return !!localStorage.getItem(TOKEN_KEY); }

async function gh(path, init = {}) {
  const { token } = getGistConfig();
  if (!token) throw new Error('no token');
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`github ${r.status}: ${body.slice(0, 160)}`);
  }
  return r.json();
}

async function findExistingGist() {
  const list = await gh('/gists?per_page=100');
  for (const g of list) {
    if (g.files && g.files[GIST_FILE]) return g;
  }
  return null;
}

export async function pushToGist() {
  const { gistId } = getGistConfig();
  const body = JSON.stringify({
    description: 'arXivrot state — auto-synced',
    public: false,
    files: { [GIST_FILE]: { content: JSON.stringify({ v: 1, savedAt: Date.now(), state: store.snapshot() }, null, 2) } },
  });
  if (gistId) {
    await gh(`/gists/${gistId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    return { gistId, action: 'updated' };
  }
  const existing = await findExistingGist();
  if (existing) {
    await gh(`/gists/${existing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    saveGistToken(getGistConfig().token, existing.id);
    return { gistId: existing.id, action: 'updated' };
  }
  const created = await gh('/gists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  saveGistToken(getGistConfig().token, created.id);
  return { gistId: created.id, action: 'created' };
}

export async function pullFromGist() {
  let { gistId } = getGistConfig();
  if (!gistId) {
    const existing = await findExistingGist();
    if (!existing) throw new Error('no arxivrot gist found on this account');
    gistId = existing.id;
    saveGistToken(getGistConfig().token, gistId);
  }
  const g = await gh(`/gists/${gistId}`);
  const file = g.files && g.files[GIST_FILE];
  if (!file) throw new Error(`gist ${gistId} missing ${GIST_FILE}`);
  let content = file.content;
  if (file.truncated && file.raw_url) {
    const r = await fetch(file.raw_url);
    content = await r.text();
  }
  const parsed = JSON.parse(content);
  if (!parsed || !parsed.state) throw new Error('malformed remote state');
  store.setAll(parsed.state);
  return { gistId, savedAt: parsed.savedAt || null };
}

let pushTimer = null;
export function scheduleAutoPush() {
  if (!gistEnabled()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushToGist().catch(e => console.warn('gist auto-push failed', e)); }, 4000);
}

export function startAutoSync() {
  if (!gistEnabled()) return;
  store.subscribe(() => scheduleAutoPush());
  window.addEventListener('beforeunload', () => {
    if (gistEnabled()) {
      try { navigator.sendBeacon && pushToGist(); } catch {}
    }
  });
}
