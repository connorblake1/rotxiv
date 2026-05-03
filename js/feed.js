import { buildArxivQuery, fetchArxiv } from './api.js';
import * as store from './store.js';
import { buildProfile, rank } from './recommender.js';
import { DEFAULT_CATS, PAGE_SIZE } from './config.js';

export class FeedEngine {
  constructor(mode = 'foryou') {
    this.mode = mode;
    this.page = 0;
    this.seen = new Set();
    this.queue = [];
    this.done = false;
    this.fetching = null;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.page = 0;
    this.seen = new Set();
    this.queue = [];
    this.done = false;
  }

  async ensureBatch(target = 10) {
    while (this.queue.length < target && !this.done) {
      await this.loadNextPage();
    }
  }

  async loadNextPage() {
    if (this.fetching) return this.fetching;
    this.fetching = (async () => {
      try {
        const follows = store.getFollows();
        const profile = buildProfile();

        const cats = follows.categories.length ? follows.categories : DEFAULT_CATS;
        const params = (this.mode === 'following')
          ? { categories: cats, authors: follows.authors, keywords: follows.keywords }
          : { categories: cats, keywords: follows.keywords };

        const query = buildArxivQuery(params);
        let papers = [];
        try {
          papers = await fetchArxiv({ query, start: this.page * PAGE_SIZE, max: PAGE_SIZE });
        } catch (e) {
          console.warn('feed fetch failed', e);
        }

        if (!papers.length) {
          this.done = this.page > 0 || true;
        } else {
          this.page += 1;
        }

        const ranked = (this.mode === 'foryou') ? rank(papers, profile) : papers;
        for (const p of ranked) {
          if (this.seen.has(p.id)) continue;
          this.seen.add(p.id);
          p._stamp = pickStamp(p);
          this.queue.push(p);
        }
      } finally {
        this.fetching = null;
      }
    })();
    return this.fetching;
  }

  takeOne() {
    return this.queue.shift() || null;
  }

  size() { return this.queue.length; }
  isDone() { return this.done && this.queue.length === 0; }
}

function pickStamp(p) {
  if (!p) return null;
  const r = Math.random();
  const text = ((p.title || '') + ' ' + (p.summary || '')).toLowerCase();
  if (/state[- ]of[- ]the[- ]art|sota|outperform|breakthrough|first|novel/.test(text) && r < 0.35) return { label: 'TRENDING', emoji: '✨' };
  if (r < 0.04) return { label: 'INFLUENTIAL', emoji: '💎' };
  if (r < 0.10) return { label: 'HOT',         emoji: '🚀' };
  if (r < 0.14) return { label: 'MUST READ',   emoji: '👀' };
  return null;
}
