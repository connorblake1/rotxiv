import * as store from './store.js';
import { MILESTONES, STREAK_MILESTONES } from './config.js';

export function buzz(ms = 8) {
  if (navigator.vibrate) try { navigator.vibrate(ms); } catch {}
}

export function pushToast(msg, kind = 'info') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.innerHTML = msg;
  stack.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast-in'));
  setTimeout(() => {
    t.classList.remove('toast-in');
    t.classList.add('toast-out');
    setTimeout(() => t.remove(), 400);
  }, 2400);
}

export function confetti(count = 80) {
  const root = document.body;
  const colors = ['#feda77', '#f58529', '#dd2a7b', '#8134af', '#515bd4', '#22c55e', '#fbbf24'];
  const wrap = document.createElement('div');
  wrap.className = 'confetti-wrap';
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = (Math.random() * 0.4) + 's';
    piece.style.animationDuration = (1.2 + Math.random() * 1.4) + 's';
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    wrap.appendChild(piece);
  }
  root.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3000);
}

export function onPaperViewed() {
  const stats = store.bumpPapersRead();
  for (const m of MILESTONES) {
    if (stats.papersToday === m && store.markMilestone(`day-${stats.todayDateISO}-${m}`)) {
      pushToast(`✨ <b>${m}</b> papers today — +${m} XP`, 'xp');
      buzz(15);
    }
  }
  return stats;
}

export function onAppOpen() {
  const r = store.bumpStreakOnLoad();
  if (r.changed && STREAK_MILESTONES.includes(r.count) && store.markStreakMilestone(r.count)) {
    setTimeout(() => {
      pushToast(`🔥 <b>${r.count}-day streak!</b> Keep going.`, 'streak');
      confetti();
      buzz(40);
    }, 800);
  }
  return r;
}
