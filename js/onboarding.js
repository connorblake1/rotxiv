import { CATEGORIES, DEFAULT_CATS } from './config.js';
import * as store from './store.js';
import { escapeHtml } from './ui.js';
import { buzz } from './notifications.js';

export function renderOnboarding(mount, onDone) {
  const picked = new Set(DEFAULT_CATS);
  const keywords = [];

  const root = document.createElement('div');
  root.className = 'onboard';
  root.innerHTML = `
    <div class="onboard-step active" data-step="0">
      <div class="onboard-logo"></div>
      <h1 class="onboard-h1">arXivrot</h1>
      <p class="onboard-tag">your daily fix of brain food, scrollable.</p>
      <button class="btn btn-primary onboard-next" data-go="1">Let's go</button>
    </div>

    <div class="onboard-step" data-step="1">
      <h2 class="onboard-h2">pick a few topics</h2>
      <p class="onboard-sub">tap the ones that hit</p>
      <div class="cat-grid">
        ${CATEGORIES.map(c => `
          <button class="cat-chip ${picked.has(c.id) ? 'on' : ''}" data-cat="${c.id}">
            <span class="cat-emoji">${c.emoji}</span>
            <span class="cat-label">${escapeHtml(c.label)}</span>
          </button>
        `).join('')}
      </div>
      <div class="onboard-foot">
        <button class="btn btn-ghost" data-go="0">back</button>
        <button class="btn btn-primary" data-go="2">next</button>
      </div>
    </div>

    <div class="onboard-step" data-step="2">
      <h2 class="onboard-h2">any keywords?</h2>
      <p class="onboard-sub">optional. comma or enter to add.</p>
      <input class="kw-input" type="text" autocomplete="off" autocapitalize="off" placeholder="e.g. transformer, lattice, holography">
      <div class="kw-chips"></div>
      <div class="onboard-foot">
        <button class="btn btn-ghost" data-go="1">back</button>
        <button class="btn btn-primary onboard-finish">finish</button>
      </div>
    </div>
  `;
  mount.innerHTML = '';
  mount.appendChild(root);

  function go(step) {
    for (const s of root.querySelectorAll('.onboard-step')) {
      s.classList.toggle('active', s.dataset.step === String(step));
    }
  }

  root.addEventListener('click', e => {
    const step = e.target.closest('[data-go]');
    if (step) { buzz(6); go(+step.dataset.go); return; }

    const cat = e.target.closest('[data-cat]');
    if (cat) {
      const id = cat.dataset.cat;
      if (picked.has(id)) picked.delete(id); else picked.add(id);
      cat.classList.toggle('on');
      buzz(6);
      return;
    }

    if (e.target.closest('.onboard-finish')) {
      store.setCategories([...picked]);
      for (const k of keywords) store.addKeyword(k);
      store.setOnboarded();
      buzz(20);
      onDone();
    }
  });

  const input = root.querySelector('.kw-input');
  const chipBox = root.querySelector('.kw-chips');
  function paint() {
    chipBox.innerHTML = keywords.map(k => `<span class="kw-chip">${escapeHtml(k)} <button data-rm="${escapeHtml(k)}">×</button></span>`).join('');
  }
  function commit() {
    const v = input.value.trim().toLowerCase();
    if (!v) return;
    for (const k of v.split(',').map(s => s.trim()).filter(Boolean)) {
      if (!keywords.includes(k)) keywords.push(k);
    }
    input.value = '';
    paint();
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
  });
  input.addEventListener('blur', commit);
  chipBox.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (!rm) return;
    const k = rm.dataset.rm;
    const i = keywords.indexOf(k);
    if (i >= 0) keywords.splice(i, 1);
    paint();
  });
}
