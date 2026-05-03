import { fetchAuthorTier, fetchThumbnail } from './api.js';
import { tierFor } from './recommender.js';
import * as store from './store.js';
import { CATEGORIES } from './config.js';
import { buzz } from './notifications.js';

const CAT_COLORS = ['#f97316', '#dd2a7b', '#8b5cf6', '#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#06b6d4'];
function colorFor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CAT_COLORS[h % CAT_COLORS.length];
}
function gradientFor(p) {
  const seed = p.id || p.title || 'x';
  const a = colorFor(seed);
  const b = colorFor(seed.split('').reverse().join(''));
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)    return Math.floor(d) + 's';
  if (d < 3600)  return Math.floor(d / 60) + 'm';
  if (d < 86400) return Math.floor(d / 3600) + 'h';
  return Math.floor(d / 86400) + 'd';
}

function catLabel(id) {
  const c = CATEGORIES.find(x => x.id === id);
  return c ? `${c.emoji} ${c.label}` : id;
}

export function renderCard(paper) {
  const interaction = store.getInteraction(paper.id) || {};
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.id = paper.id;

  const stamp = paper._stamp ? `<div class="stamp stamp-${paper._stamp.label.toLowerCase().replace(/\s/g, '-')}">${paper._stamp.emoji} ${paper._stamp.label}</div>` : '';

  card.innerHTML = `
    <div class="card-thumb" style="background:${gradientFor(paper)}">
      <div class="thumb-overlay"></div>
      <div class="thumb-title">${escapeHtml(paper.title)}</div>
      ${stamp}
    </div>
    <div class="card-body">
      <div class="card-cats">${(paper.categories || []).slice(0, 3).map(c => `<span class="chip">${escapeHtml(catLabel(c))}</span>`).join('')}</div>
      <div class="card-authors">${(paper.authors || []).slice(0, 6).map((a, i) => `<span class="author" data-author="${escapeHtml(a)}">${escapeHtml(a)}</span>${i < Math.min(paper.authors.length, 6) - 1 ? ', ' : ''}`).join('')}${paper.authors && paper.authors.length > 6 ? ` +${paper.authors.length - 6}` : ''}</div>
      <div class="card-summary">${escapeHtml((paper.summary || '').slice(0, 280))}${(paper.summary || '').length > 280 ? '…' : ''}</div>
      <div class="card-meta">
        <span class="ts">${timeAgo(paper.published)}</span>
        <span class="dot">·</span>
        <span class="aid">${escapeHtml(paper.id)}</span>
      </div>
      <div class="card-actions">
        <button class="act act-like ${interaction.liked ? 'on' : ''}" data-act="like" aria-label="like">
          <span class="ico">❤</span><span class="lbl">${interaction.liked ? 'Liked' : 'Like'}</span>
        </button>
        <button class="act act-save ${interaction.saved ? 'on' : ''}" data-act="save" aria-label="save">
          <span class="ico">⛓</span><span class="lbl">${interaction.saved ? 'Saved' : 'Save'}</span>
        </button>
        <button class="act act-open" data-act="open" aria-label="open">
          <span class="ico">↗</span><span class="lbl">Read</span>
        </button>
      </div>
    </div>
  `;

  fetchThumbnail(paper.id).then(src => {
    if (!src) return;
    const t = card.querySelector('.card-thumb');
    if (!t || !card.isConnected) return;
    const img = new Image();
    img.onload = () => {
      t.style.backgroundImage = `url("${src}")`;
      t.style.backgroundSize = 'cover';
      t.style.backgroundPosition = 'center';
      t.classList.add('has-image');
    };
    img.onerror = () => {};
    img.src = src;
  }).catch(() => {});

  for (const a of card.querySelectorAll('.author')) {
    const name = a.dataset.author;
    fetchAuthorTier(name).then(d => {
      if (!a.isConnected || !d) return;
      const t = tierFor(d.hIndex || 0);
      if (!t) return;
      a.classList.add(t.className);
      a.title = `h-index ${d.hIndex} · ${d.citationCount} citations`;
      a.dataset.tier = t.name;
      const badge = document.createElement('span');
      badge.className = 'tier-badge';
      badge.textContent = t.emoji;
      a.appendChild(badge);
    }).catch(() => {});
  }

  card.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (act) {
      e.stopPropagation();
      handleAction(card, paper, act.dataset.act);
      return;
    }
    const author = e.target.closest('.author');
    if (author) {
      e.stopPropagation();
      followAuthorToggle(author.dataset.author);
      return;
    }
    openPaper(paper);
  });

  return card;
}

function handleAction(card, paper, kind) {
  if (kind === 'open') { openPaper(paper); return; }
  store.recordInteraction(paper.id, kind, paper);
  buzz(8);
  const btn = card.querySelector(`[data-act="${kind}"]`);
  if (!btn) return;
  btn.classList.toggle('on');
  const lbl = btn.querySelector('.lbl');
  if (kind === 'like') {
    lbl.textContent = btn.classList.contains('on') ? 'Liked' : 'Like';
    if (btn.classList.contains('on')) burstHeart(btn);
  }
  if (kind === 'save') {
    lbl.textContent = btn.classList.contains('on') ? 'Saved' : 'Save';
  }
}

function burstHeart(anchor) {
  const r = anchor.getBoundingClientRect();
  const burst = document.createElement('div');
  burst.className = 'heart-burst';
  burst.style.left = (r.left + r.width / 2) + 'px';
  burst.style.top  = (r.top  + r.height / 2) + 'px';
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('span');
    p.className = 'heart-particle';
    p.style.setProperty('--ang', (i * 45) + 'deg');
    burst.appendChild(p);
  }
  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 900);
}

function followAuthorToggle(name) {
  const cur = store.getFollows().authors;
  if (cur.includes(name)) { store.removeAuthor(name); }
  else { store.addAuthor(name); buzz(12); }
  for (const el of document.querySelectorAll(`.author[data-author="${cssEscape(name)}"]`)) {
    el.classList.toggle('followed');
  }
}
function cssEscape(s) { return s.replace(/(["\\])/g, '\\$1'); }

export function openPaper(paper) {
  store.recordInteraction(paper.id, 'open', paper);
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" aria-label="close">×</button>
      <h2 class="modal-title">${escapeHtml(paper.title)}</h2>
      <div class="modal-authors">${(paper.authors || []).map(a => escapeHtml(a)).join(', ')}</div>
      <div class="modal-cats">${(paper.categories || []).slice(0, 5).map(c => `<span class="chip">${escapeHtml(catLabel(c))}</span>`).join('')}</div>
      <div class="modal-summary">${escapeHtml(paper.summary)}</div>
      <div class="modal-actions">
        <a class="btn btn-primary" href="${escapeHtml(paper.html)}" target="_blank" rel="noopener">Open arXiv</a>
        ${paper.pdf ? `<a class="btn" href="${escapeHtml(paper.pdf)}" target="_blank" rel="noopener">PDF</a>` : ''}
        <a class="btn" href="https://ar5iv.labs.arxiv.org/html/${escapeHtml(paper.id)}" target="_blank" rel="noopener">HTML</a>
      </div>
    </div>
  `;
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.classList.contains('modal-close')) modal.remove();
  });
  document.body.appendChild(modal);
}
