import { parseArxivAtom, buildArxivQuery, extractFirstFigure } from './api.js';
import { tierFor, score, rank, buildProfile } from './recommender.js';
import { TIERS } from './config.js';
import * as store from './store.js';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'} — got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); }

const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.12345v1</id>
    <updated>2026-04-30T18:00:00Z</updated>
    <published>2026-04-30T17:00:00Z</published>
    <title>Test Paper on Quantum Foo</title>
    <summary>This explores foo and bar in the lattice.</summary>
    <author><name>Alice Smith</name></author>
    <author><name>Bob Müller</name></author>
    <link href="http://arxiv.org/pdf/2401.12345v1" title="pdf"/>
    <category term="quant-ph"/>
    <category term="hep-th"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2402.99999v2</id>
    <published>2026-04-29T17:00:00Z</published>
    <title>Another  paper   with   weird whitespace</title>
    <summary>Short.</summary>
    <author><name>Carol Doe</name></author>
    <category term="cs.AI"/>
  </entry>
</feed>`;

test('parseArxivAtom: handles N entries with unicode and missing fields', () => {
  const r = parseArxivAtom(SAMPLE_ATOM);
  eq(r.length, 2, 'count');
  eq(r[0].id, '2401.12345', 'id strips abs/ and version');
  eq(r[0].title, 'Test Paper on Quantum Foo', 'title');
  eq(r[0].authors.length, 2, 'authors');
  eq(r[0].authors[1], 'Bob Müller', 'unicode author');
  eq(r[0].categories[0], 'quant-ph', 'category');
  eq(r[0].pdf, 'http://arxiv.org/pdf/2401.12345v1', 'pdf link');
  eq(r[1].title, 'Another paper with weird whitespace', 'title squashed');
  eq(r[1].id, '2402.99999', 'id v2 stripped');
});

test('parseArxivAtom: empty/malformed feeds return []', () => {
  eq(parseArxivAtom('<?xml version="1.0"?><feed></feed>').length, 0);
  eq(parseArxivAtom('not xml at all <<<').length, 0);
});

test('buildArxivQuery: composes cat/au/keyword with AND', () => {
  const q = buildArxivQuery({ categories: ['quant-ph', 'hep-th'], keywords: ['lattice'] });
  assert(q.includes('cat:quant-ph'), 'cat present');
  assert(q.includes('cat:hep-th'), 'cat2 present');
  assert(q.includes('all:lattice'), 'kw present');
  assert(q.includes('+AND+'), 'AND join');
});

test('buildArxivQuery: empty input falls back to all:physics', () => {
  eq(buildArxivQuery({}), 'all:physics');
});

test('buildArxivQuery: escapes author quotes safely', () => {
  const q = buildArxivQuery({ authors: ['Smith "Joe"'] });
  assert(!q.includes('""'), 'no double quotes');
  assert(q.includes('au:'), 'au prefix');
});

test('tierFor: boundaries', () => {
  eq(tierFor(80).name, 'LEGEND');
  eq(tierFor(79).name, 'STAR');
  eq(tierFor(40).name, 'STAR');
  eq(tierFor(39).name, 'RISING');
  eq(tierFor(15).name, 'RISING');
  eq(tierFor(14), null);
  eq(tierFor(0), null);
});

test('tierFor: TIERS sorted descending', () => {
  for (let i = 1; i < TIERS.length; i++) assert(TIERS[i - 1].minH > TIERS[i].minH, 'descending');
});

test('score: more category overlap → higher score (deterministic except jitter)', () => {
  const profile = { categories: { 'quant-ph': 10, 'hep-th': 5 }, keywords: {}, authors: {} };
  const p1 = { id: 'a', categories: ['quant-ph'], authors: [], title: '', summary: '', published: null };
  const p2 = { id: 'b', categories: ['quant-ph', 'hep-th'], authors: [], title: '', summary: '', published: null };
  const s1 = score(p1, profile, Date.now()) - 0.5;
  const s2 = score(p2, profile, Date.now()) - 0.5;
  assert(s2 - s1 >= 4.5, `s2 should be ~5 higher: got ${s2 - s1}`);
});

test('score: keyword profile rewards matching text', () => {
  const profile = { categories: {}, keywords: { 'lattice': 8 }, authors: {} };
  const p = { id: 'a', categories: [], authors: [], title: 'On the lattice', summary: '', published: null };
  const s = score(p, profile, Date.now()) - 0.5;
  assert(s >= 7.5, `keyword score: ${s}`);
});

test('rank: dedupes by id and sorts descending', () => {
  const profile = { categories: { 'cs.AI': 100 }, keywords: {}, authors: {} };
  const papers = [
    { id: '1', categories: [], authors: [], title: '', summary: '', published: null },
    { id: '2', categories: ['cs.AI'], authors: [], title: '', summary: '', published: null },
    { id: '1', categories: [], authors: [], title: '', summary: '', published: null },
  ];
  const r = rank(papers, profile);
  eq(r.length, 2, 'deduped');
  eq(r[0].id, '2', 'higher score first');
});

test('extractFirstFigure: pulls first figure src and resolves relative urls', () => {
  const html = `<html><body>
    <figure class="ltx_figure"><img src="x1.png"/></figure>
    <figure><img src="x2.png"/></figure>
  </body></html>`;
  const r = extractFirstFigure(html, '2401.99999');
  assert(r.endsWith('x1.png'), `got ${r}`);
  assert(r.includes('ar5iv.labs.arxiv.org/html/2401.99999'), 'resolved relative url');
});

test('extractFirstFigure: returns null when no img', () => {
  eq(extractFirstFigure('<html><body><p>hi</p></body></html>', '0'), null);
});

test('extractFirstFigure: keeps absolute https url', () => {
  const html = `<figure><img src="https://example.com/foo.png"/></figure>`;
  eq(extractFirstFigure(html, '0'), 'https://example.com/foo.png');
});

test('store: round-trip follows + interactions', () => {
  store.reset();
  store.toggleCategory('quant-ph');
  store.addKeyword('Lattice');
  store.addAuthor('Edward Witten');
  eq(store.getFollows().categories[0], 'quant-ph');
  eq(store.getFollows().keywords[0], 'lattice', 'keyword lowercased');
  eq(store.getFollows().authors[0], 'Edward Witten');
  store.recordInteraction('1', 'like', { categories: ['quant-ph'], authors: ['Edward Witten'], title: 'Foo bar' });
  eq(store.getInteraction('1').liked, true);
  store.recordInteraction('1', 'like', null);
  eq(store.getInteraction('1').liked, false, 'toggle back off');
});

test('buildProfile: weights interactions and follows', () => {
  store.reset();
  store.toggleCategory('cs.AI');
  store.addKeyword('foo');
  store.recordInteraction('p1', 'like', { categories: ['cs.AI'], authors: ['X Y'], title: 'foo bar' });
  store.recordInteraction('p1', 'save', { categories: ['cs.AI'], authors: ['X Y'], title: 'foo bar' });
  const prof = buildProfile();
  assert(prof.categories['cs.AI'] >= 4, 'follow boost');
  assert(prof.keywords['foo'] >= 5, 'kw follow');
  assert(prof.authors['X Y'] >= 5, 'author from interactions');
  store.reset();
});

test('store: streak increments on consecutive day, resets on gap', () => {
  store.reset();
  const a = store.bumpStreakOnLoad(new Date('2026-01-01T12:00:00Z'));
  eq(a.count, 1, 'first day');
  const b = store.bumpStreakOnLoad(new Date('2026-01-02T12:00:00Z'));
  eq(b.count, 2, 'consecutive');
  const c = store.bumpStreakOnLoad(new Date('2026-01-02T20:00:00Z'));
  eq(c.changed, false, 'no double-bump same day');
  const d = store.bumpStreakOnLoad(new Date('2026-01-05T12:00:00Z'));
  eq(d.count, 1, 'reset after gap');
  store.reset();
});

test('store: papersToday resets at day boundary', () => {
  store.reset();
  store.bumpStreakOnLoad(new Date('2026-01-01T12:00:00Z'));
  store.bumpPapersRead();
  store.bumpPapersRead();
  eq(store.get().stats.papersToday, 2);
  store.bumpStreakOnLoad(new Date('2026-01-02T12:00:00Z'));
  eq(store.get().stats.papersToday, 0, 'reset');
  store.reset();
});

export async function run(target) {
  let pass = 0, fail = 0;
  const out = [];
  for (const t of tests) {
    try {
      await t.fn();
      out.push({ name: t.name, ok: true });
      pass++;
    } catch (e) {
      out.push({ name: t.name, ok: false, err: e && e.message || String(e) });
      fail++;
    }
  }
  if (target) {
    target.innerHTML = `
      <h1 class="${fail ? 'fail' : 'pass'}">${fail ? '✘' : '✔'} ${pass} pass / ${fail} fail</h1>
      <ul>${out.map(r => `<li class="${r.ok ? 'p' : 'f'}">${r.ok ? '✔' : '✘'} ${r.name}${r.err ? `<br><code>${r.err}</code>` : ''}</li>`).join('')}</ul>
    `;
  }
  return { pass, fail, results: out };
}
