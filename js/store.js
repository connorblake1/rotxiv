const KEY = 'arxivrot.v1';

const DEFAULT = {
  onboarded: false,
  follows: { categories: [], authors: [], keywords: [] },
  interactions: {},
  authorCache: {},
  streak: { count: 0, lastOpenISO: null },
  stats: { papersRead: 0, papersToday: 0, todayDateISO: null, xp: 0, milestonesHit: [], streakMilestonesHit: [] },
  lastSeenArxivIds: [],
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT), ...parsed,
      follows: { ...DEFAULT.follows, ...(parsed.follows || {}) },
      stats:   { ...DEFAULT.stats,   ...(parsed.stats || {}) },
      streak:  { ...DEFAULT.streak,  ...(parsed.streak || {}) } };
  } catch {
    return structuredClone(DEFAULT);
  }
}

let state = load();
const listeners = new Set();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  for (const l of listeners) l(state);
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function get() { return state; }

export function isOnboarded() { return !!state.onboarded; }
export function setOnboarded() { state.onboarded = true; persist(); }

export function getFollows() { return state.follows; }

export function toggleCategory(id) {
  const arr = state.follows.categories;
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1); else arr.push(id);
  persist();
}
export function setCategories(ids) {
  state.follows.categories = [...new Set(ids)];
  persist();
}

export function addKeyword(kw) {
  kw = kw.trim().toLowerCase();
  if (!kw) return;
  if (!state.follows.keywords.includes(kw)) state.follows.keywords.push(kw);
  persist();
}
export function removeKeyword(kw) {
  state.follows.keywords = state.follows.keywords.filter(k => k !== kw);
  persist();
}

export function addAuthor(name) {
  name = name.trim();
  if (!name) return;
  if (!state.follows.authors.includes(name)) state.follows.authors.push(name);
  persist();
}
export function removeAuthor(name) {
  state.follows.authors = state.follows.authors.filter(a => a !== name);
  persist();
}

export function recordInteraction(arxivId, kind, paper = null) {
  const e = state.interactions[arxivId] || { liked: false, saved: false, opens: 0, dwellMs: 0 };
  if (kind === 'like')  e.liked = !e.liked;
  if (kind === 'save')  e.saved = !e.saved;
  if (kind === 'open')  e.opens = (e.opens || 0) + 1;
  if (kind === 'dwell' && paper && paper.dwellMs) e.dwellMs = (e.dwellMs || 0) + paper.dwellMs;
  if (paper) {
    e.cats = paper.categories;
    e.authors = paper.authors;
    e.title = paper.title;
  }
  state.interactions[arxivId] = e;
  persist();
}
export function getInteraction(arxivId) {
  return state.interactions[arxivId] || null;
}
export function getSaved() {
  return Object.entries(state.interactions)
    .filter(([, v]) => v.saved)
    .map(([id, v]) => ({ id, ...v }));
}

export function getAuthorCache(name) {
  const e = state.authorCache[name];
  if (!e) return null;
  const ageDays = (Date.now() - e.fetchedAt) / 864e5;
  if (ageDays > 30) return null;
  return e;
}
export function setAuthorCache(name, data) {
  state.authorCache[name] = { ...data, fetchedAt: Date.now() };
  persist();
}

export function bumpStreakOnLoad(now = new Date()) {
  const todayISO = now.toISOString().slice(0, 10);
  const last = state.streak.lastOpenISO;
  if (last === todayISO) return { changed: false, count: state.streak.count };

  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const yISO = yesterday.toISOString().slice(0, 10);
  if (last === yISO)        state.streak.count = (state.streak.count || 0) + 1;
  else if (last == null)    state.streak.count = 1;
  else                      state.streak.count = 1;

  state.streak.lastOpenISO = todayISO;

  if (state.stats.todayDateISO !== todayISO) {
    state.stats.todayDateISO = todayISO;
    state.stats.papersToday = 0;
  }

  persist();
  return { changed: true, count: state.streak.count };
}

export function bumpPapersRead() {
  const todayISO = new Date().toISOString().slice(0, 10);
  if (state.stats.todayDateISO !== todayISO) {
    state.stats.todayDateISO = todayISO;
    state.stats.papersToday = 0;
  }
  state.stats.papersRead = (state.stats.papersRead || 0) + 1;
  state.stats.papersToday = (state.stats.papersToday || 0) + 1;
  state.stats.xp = (state.stats.xp || 0) + 1;
  persist();
  return state.stats;
}

export function markMilestone(n) {
  if (!state.stats.milestonesHit.includes(n)) {
    state.stats.milestonesHit.push(n);
    persist();
    return true;
  }
  return false;
}
export function markStreakMilestone(n) {
  if (!state.stats.streakMilestonesHit.includes(n)) {
    state.stats.streakMilestonesHit.push(n);
    persist();
    return true;
  }
  return false;
}

export function reset() { state = structuredClone(DEFAULT); persist(); }

export function setAll(next) {
  if (!next || typeof next !== 'object') throw new Error('invalid state');
  state = { ...structuredClone(DEFAULT), ...next,
    follows: { ...DEFAULT.follows, ...(next.follows || {}) },
    stats:   { ...DEFAULT.stats,   ...(next.stats || {}) },
    streak:  { ...DEFAULT.streak,  ...(next.streak || {}) } };
  persist();
}

export function snapshot() {
  return JSON.parse(JSON.stringify(state));
}
