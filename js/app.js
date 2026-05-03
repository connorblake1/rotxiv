import * as store from './store.js';
import * as router from './router.js';
import { renderOnboarding } from './onboarding.js';
import { FeedEngine } from './feed.js';
import { renderCard, escapeHtml } from './ui.js';
import { CATEGORIES } from './config.js';
import { onAppOpen, onPaperViewed, pushToast, buzz } from './notifications.js';

const app = document.getElementById('app');

function chrome(activeTab, body) {
  const s = store.get();
  return `
    <header class="topbar">
      <div class="brand">
        <span class="brand-logo"></span>
        <span class="brand-name">arXivrot</span>
      </div>
      <div class="streak" title="day streak">
        <span class="streak-fire">🔥</span><span class="streak-num">${s.streak.count || 0}</span>
      </div>
      <div class="counter" title="papers today">
        📖 <b>${s.stats.papersToday || 0}</b>
      </div>
      <button class="bell" data-bell>🔔<span class="badge ${unread() > 0 ? 'on' : ''}">${unread()}</span></button>
    </header>
    <main class="content">${body}</main>
    <nav class="tabbar">
      <a class="tab ${activeTab === 'feed' ? 'on' : ''}" href="#/feed">▶ Feed</a>
      <a class="tab ${activeTab === 'explore' ? 'on' : ''}" href="#/explore">🔎 Explore</a>
      <a class="tab ${activeTab === 'saved' ? 'on' : ''}" href="#/saved">⛓ Saved</a>
      <a class="tab ${activeTab === 'profile' ? 'on' : ''}" href="#/profile">👤 You</a>
    </nav>
  `;
}

function unread() {
  const s = store.get();
  const target = 25;
  return Math.max(0, target - (s.stats.papersToday || 0));
}

const engines = { foryou: new FeedEngine('foryou'), following: new FeedEngine('following') };
let activeMode = 'foryou';

router.register('/feed', mount => {
  mount.innerHTML = chrome('feed', `
    <div class="feed-tabs">
      <button class="ftab ${activeMode === 'foryou' ? 'on' : ''}" data-mode="foryou">For You</button>
      <button class="ftab ${activeMode === 'following' ? 'on' : ''}" data-mode="following">Following</button>
    </div>
    <div class="feed" id="feed">
      ${skeleton()}
    </div>
    <div class="loadmore"><button class="btn" id="loadmore">load more</button></div>
  `);
  bindFeed();
  loadFeed(true);
});

router.register('/explore', mount => {
  mount.innerHTML = chrome('explore', `
    <div class="explore">
      <h2>topics</h2>
      <div class="cat-grid explore-grid">
        ${CATEGORIES.map(c => {
          const on = store.getFollows().categories.includes(c.id);
          return `<button class="cat-chip ${on ? 'on' : ''}" data-cat="${c.id}"><span class="cat-emoji">${c.emoji}</span><span class="cat-label">${escapeHtml(c.label)}</span></button>`;
        }).join('')}
      </div>
      <h2>keywords</h2>
      <div class="kw-row">
        <input class="kw-input" type="text" placeholder="add keyword and press enter">
      </div>
      <div class="kw-chips" id="kw-chips"></div>
      <h2>authors</h2>
      <div class="kw-row">
        <input class="au-input" type="text" placeholder="add author full name">
      </div>
      <div class="kw-chips" id="au-chips"></div>
    </div>
  `);
  bindExplore();
});

router.register('/saved', mount => {
  const saved = store.getSaved().map(e => ({
    id: e.id, title: e.title || `arXiv:${e.id}`, summary: '', authors: e.authors || [], categories: e.cats || [], pdf: null, html: `https://arxiv.org/abs/${e.id}`, published: null,
  }));
  mount.innerHTML = chrome('saved', `<div class="feed">${saved.length ? '' : '<div class="empty">nothing saved yet — go scroll</div>'}</div>`);
  const f = mount.querySelector('.feed');
  for (const p of saved) f.appendChild(renderCard(p));
});

router.register('/profile', mount => {
  const s = store.get();
  mount.innerHTML = chrome('profile', `
    <div class="profile">
      <div class="profile-avatar"></div>
      <h2 class="profile-name">scrolling enjoyer</h2>
      <div class="stats">
        <div class="stat"><b>${s.stats.papersRead || 0}</b><span>read</span></div>
        <div class="stat"><b>${(s.streak.count || 0)}</b><span>day streak</span></div>
        <div class="stat"><b>${s.stats.xp || 0}</b><span>XP</span></div>
      </div>
      <div class="follows-summary">
        <h3>following</h3>
        <p>${s.follows.categories.length} topics · ${s.follows.keywords.length} keywords · ${s.follows.authors.length} authors</p>
        <a class="btn" href="#/explore">manage</a>
      </div>
      <div class="danger">
        <button class="btn btn-ghost" id="reset">reset everything</button>
      </div>
    </div>
  `);
  document.getElementById('reset').addEventListener('click', () => {
    if (confirm('Wipe all data and re-onboard?')) { store.reset(); location.hash = ''; boot(); }
  });
});

function skeleton() {
  return Array.from({ length: 4 }).map(() => '<div class="card skeleton"><div class="card-thumb skel"></div><div class="card-body"><div class="skel-line"></div><div class="skel-line"></div></div></div>').join('');
}

function bindFeed() {
  const tabs = app.querySelector('.feed-tabs');
  if (tabs) tabs.addEventListener('click', e => {
    const t = e.target.closest('[data-mode]');
    if (!t) return;
    activeMode = t.dataset.mode;
    for (const x of tabs.querySelectorAll('[data-mode]')) x.classList.toggle('on', x === t);
    loadFeed(true);
  });
  const more = app.querySelector('#loadmore');
  if (more) more.addEventListener('click', () => loadFeed(false));
  const bell = app.querySelector('[data-bell]');
  if (bell) bell.addEventListener('click', () => { pushToast('keep scrolling — knowledge unlocks at <b>25</b>/day.', 'info'); buzz(8); });

  const content = app.querySelector('.content');
  content.addEventListener('scroll', onScroll, { passive: true });
}

let scrollLock = false;
async function onScroll(e) {
  if (scrollLock) return;
  const el = e.currentTarget;
  if (el.scrollTop + el.clientHeight > el.scrollHeight - 600) {
    scrollLock = true;
    await loadFeed(false);
    scrollLock = false;
  }
}

async function loadFeed(reset) {
  const feed = document.getElementById('feed');
  if (!feed) return;
  if (reset) {
    feed.innerHTML = skeleton();
    engines[activeMode] = new FeedEngine(activeMode);
  }
  const eng = engines[activeMode];
  await eng.ensureBatch(8);
  if (reset) feed.innerHTML = '';
  let added = 0;
  while (eng.size() && added < 12) {
    const p = eng.takeOne();
    if (!p) break;
    feed.appendChild(renderCard(p));
    onPaperViewed();
    added++;
  }
  if (eng.isDone() && !feed.children.length) {
    feed.innerHTML = '<div class="empty">arxiv is being shy. try again in a sec.</div>';
  }
}

function bindExplore() {
  const root = app.querySelector('.explore');
  root.addEventListener('click', e => {
    const c = e.target.closest('[data-cat]');
    if (c) { store.toggleCategory(c.dataset.cat); c.classList.toggle('on'); buzz(6); }
  });
  const kw = root.querySelector('.kw-input');
  const au = root.querySelector('.au-input');
  const kwBox = root.querySelector('#kw-chips');
  const auBox = root.querySelector('#au-chips');
  function paintKw() { kwBox.innerHTML = store.getFollows().keywords.map(k => `<span class="kw-chip">${escapeHtml(k)} <button data-rmkw="${escapeHtml(k)}">×</button></span>`).join(''); }
  function paintAu() { auBox.innerHTML = store.getFollows().authors.map(a => `<span class="kw-chip">${escapeHtml(a)} <button data-rmau="${escapeHtml(a)}">×</button></span>`).join(''); }
  paintKw(); paintAu();
  kw.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      for (const k of kw.value.split(',').map(s => s.trim()).filter(Boolean)) store.addKeyword(k);
      kw.value = ''; paintKw();
    }
  });
  au.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = au.value.trim();
      if (v) store.addAuthor(v);
      au.value = ''; paintAu();
    }
  });
  root.addEventListener('click', e => {
    const r1 = e.target.closest('[data-rmkw]'); if (r1) { store.removeKeyword(r1.dataset.rmkw); paintKw(); return; }
    const r2 = e.target.closest('[data-rmau]'); if (r2) { store.removeAuthor(r2.dataset.rmau); paintAu(); return; }
  });
}

function boot() {
  router.init(app);
  if (!store.isOnboarded()) {
    renderOnboarding(app, () => { boot(); });
    return;
  }
  onAppOpen();
  if (!location.hash) location.hash = '#/feed';
  router.resolve();
}

boot();
