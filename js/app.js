import * as store from './store.js';
import * as router from './router.js';
import { renderOnboarding } from './onboarding.js';
import { FeedEngine } from './feed.js';
import { renderCard, escapeHtml } from './ui.js';
import { CATEGORIES } from './config.js';
import { onAppOpen, onPaperViewed, pushToast, buzz } from './notifications.js';
import * as sync from './sync.js';

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
    <div class="feed-sentinel" id="feed-sentinel"></div>
    <div class="feed-end" id="feed-end" hidden>that's all for now — pull to refresh</div>
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
  const cfg = sync.getGistConfig();
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

      <div class="follows-summary">
        <h3>storage</h3>
        <p id="storage-status">checking…</p>
        <button class="btn" id="ask-persist">make storage permanent</button>
      </div>

      <div class="follows-summary">
        <h3>cloud sync (github gist)</h3>
        <p class="muted">paste a github personal access token with the <b>gist</b> scope. your follows + history will sync to a private gist on your account, surviving wipes and following you across devices.</p>
        <div class="sync-row">
          <input class="kw-input" id="gist-token" type="password" autocomplete="off" placeholder="${cfg.token ? '••• token saved •••' : 'ghp_… (gist scope only)'}" value="">
        </div>
        <div class="sync-buttons">
          <button class="btn btn-primary" id="sync-save-token">${cfg.token ? 'replace token' : 'save & push now'}</button>
          ${cfg.token ? '<button class="btn" id="sync-pull">pull from gist</button>' : ''}
          ${cfg.token ? '<button class="btn" id="sync-push">push now</button>' : ''}
          ${cfg.token ? '<button class="btn btn-ghost" id="sync-disable">disable sync</button>' : ''}
        </div>
        <p class="muted" id="sync-status">${cfg.gistId ? `synced to gist <code>${cfg.gistId.slice(0,8)}…</code>` : (cfg.token ? 'token saved — push to create gist' : 'not signed in')}</p>
        <p class="muted hint">create a token at <a href="https://github.com/settings/tokens?scopes=gist&amp;description=arXivrot%20sync" target="_blank" rel="noopener">github.com/settings/tokens</a> — fine-grained or classic, only the <b>gist</b> scope.</p>
      </div>

      <div class="follows-summary">
        <h3>backup code</h3>
        <p class="muted">a long string with all your data. paste into a note for safekeeping or restore on any other browser.</p>
        <div class="sync-buttons">
          <button class="btn" id="backup-copy">copy backup</button>
          <button class="btn" id="backup-restore">restore from clipboard</button>
        </div>
      </div>

      <div class="danger">
        <button class="btn btn-ghost" id="reset">reset everything</button>
      </div>
    </div>
  `);

  sync.isPersisted().then(p => {
    const el = document.getElementById('storage-status');
    if (!el) return;
    if (p === true)        el.innerHTML = '✅ <b>persistent</b> — won\'t be evicted.';
    else if (p === false)  el.innerHTML = '⚠️ best-effort — iOS Safari can clear this. tap below to upgrade.';
    else                   el.innerHTML = 'storage status unknown on this browser.';
  });

  document.getElementById('ask-persist').addEventListener('click', async () => {
    const r = await sync.requestPersistent();
    if (!r.supported)     pushToast('this browser does not support persistent storage.', 'info');
    else if (r.granted)   { pushToast('✅ storage is now persistent.', 'xp'); buzz(20); }
    else                  pushToast('browser said no — try installing to home screen first, then retry.', 'info');
    setTimeout(() => router.resolve(), 600);
  });

  document.getElementById('sync-save-token').addEventListener('click', async () => {
    const v = document.getElementById('gist-token').value.trim();
    if (!v && !cfg.token) { pushToast('paste a token first.', 'info'); return; }
    if (v) sync.saveGistToken(v, cfg.gistId);
    setStatus('pushing…');
    try {
      const r = await sync.pushToGist();
      pushToast(`✅ ${r.action} gist`, 'xp');
      buzz(20);
      sync.startAutoSync();
      setTimeout(() => router.resolve(), 400);
    } catch (e) { setStatus('push failed: ' + e.message); }
  });

  const pull = document.getElementById('sync-pull');
  if (pull) pull.addEventListener('click', async () => {
    if (!confirm('replace local data with whatever is in your gist?')) return;
    setStatus('pulling…');
    try {
      const r = await sync.pullFromGist();
      pushToast(`✅ pulled from ${r.gistId.slice(0,8)}…`, 'xp');
      buzz(20);
      setTimeout(() => router.resolve(), 400);
    } catch (e) { setStatus('pull failed: ' + e.message); }
  });

  const push = document.getElementById('sync-push');
  if (push) push.addEventListener('click', async () => {
    setStatus('pushing…');
    try {
      const r = await sync.pushToGist();
      pushToast(`✅ pushed (${r.action})`, 'xp');
      setTimeout(() => router.resolve(), 400);
    } catch (e) { setStatus('push failed: ' + e.message); }
  });

  const dis = document.getElementById('sync-disable');
  if (dis) dis.addEventListener('click', () => {
    if (!confirm('forget the token from this device? your gist itself is not deleted.')) return;
    sync.saveGistToken('', '');
    pushToast('sync disabled on this device.', 'info');
    setTimeout(() => router.resolve(), 200);
  });

  document.getElementById('backup-copy').addEventListener('click', async () => {
    const code = sync.exportToString();
    try { await navigator.clipboard.writeText(code); pushToast('✅ backup copied to clipboard', 'xp'); buzz(20); }
    catch { prompt('copy this:', code); }
  });

  document.getElementById('backup-restore').addEventListener('click', async () => {
    let s = '';
    try { s = await navigator.clipboard.readText(); } catch {}
    if (!s) s = prompt('paste backup code:') || '';
    if (!s) return;
    if (!confirm('replace all current data with the pasted backup?')) return;
    try { sync.importFromString(s.trim()); pushToast('✅ restored', 'xp'); setTimeout(() => router.resolve(), 400); }
    catch (e) { pushToast('failed: ' + e.message, 'info'); }
  });

  document.getElementById('reset').addEventListener('click', () => {
    if (confirm('Wipe all data and re-onboard?')) { store.reset(); location.hash = ''; boot(); }
  });

  function setStatus(s) { const el = document.getElementById('sync-status'); if (el) el.textContent = s; }
});

function skeleton() {
  return Array.from({ length: 4 }).map(() => '<div class="card skeleton"><div class="card-thumb skel"></div><div class="card-body"><div class="skel-line"></div><div class="skel-line"></div></div></div>').join('');
}

let feedObserver = null;

function bindFeed() {
  const tabs = app.querySelector('.feed-tabs');
  if (tabs) tabs.addEventListener('click', e => {
    const t = e.target.closest('[data-mode]');
    if (!t) return;
    activeMode = t.dataset.mode;
    for (const x of tabs.querySelectorAll('[data-mode]')) x.classList.toggle('on', x === t);
    loadFeed(true);
  });
  const bell = app.querySelector('[data-bell]');
  if (bell) bell.addEventListener('click', () => { pushToast('keep scrolling — knowledge unlocks at <b>25</b>/day.', 'info'); buzz(8); });

  const sentinel = app.querySelector('#feed-sentinel');
  const content = app.querySelector('.content');
  if (feedObserver) { feedObserver.disconnect(); feedObserver = null; }
  if (sentinel && content) {
    feedObserver = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting && !scrollLock) {
          scrollLock = true;
          loadFeed(false).finally(() => { scrollLock = false; });
        }
      }
    }, { root: content, rootMargin: '800px 0px', threshold: 0 });
    feedObserver.observe(sentinel);
  }
}

let scrollLock = false;

async function loadFeed(reset) {
  const feed = document.getElementById('feed');
  const end  = document.getElementById('feed-end');
  if (!feed) return;
  if (reset) {
    feed.innerHTML = skeleton();
    engines[activeMode] = new FeedEngine(activeMode);
    if (end) end.hidden = true;
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
  if (!feed.children.length && eng.isDone()) {
    feed.innerHTML = '<div class="empty">arxiv is being shy. try again in a sec.</div>';
  }
  if (eng.isDone() && end) end.hidden = false;
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
  sync.requestPersistent().catch(() => {});
  sync.startAutoSync();
  if (sync.gistEnabled()) {
    sync.pullFromGist().catch(() => {});
  }
  onAppOpen();
  if (!location.hash) location.hash = '#/feed';
  router.resolve();
}

boot();
