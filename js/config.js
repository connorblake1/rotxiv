export const CORS_PROXIES = [
  url => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
];

export const ARXIV_API = 'https://export.arxiv.org/api/query';
export const SS_API = 'https://api.semanticscholar.org/graph/v1';
export const AR5IV = id => `https://ar5iv.labs.arxiv.org/html/${id}`;

export const CATEGORIES = [
  { id: 'cs.AI',     label: 'AI',                  emoji: '🤖' },
  { id: 'cs.LG',     label: 'Machine Learning',    emoji: '🧠' },
  { id: 'cs.CL',     label: 'NLP',                 emoji: '💬' },
  { id: 'cs.CV',     label: 'Computer Vision',     emoji: '👁️' },
  { id: 'cs.RO',     label: 'Robotics',            emoji: '🦾' },
  { id: 'cs.CR',     label: 'Crypto / Security',   emoji: '🔐' },
  { id: 'cs.DS',     label: 'Data Structures',     emoji: '🌲' },
  { id: 'cs.SY',     label: 'Systems & Control',   emoji: '🎛️' },
  { id: 'quant-ph',  label: 'Quantum Physics',     emoji: '⚛️' },
  { id: 'hep-th',    label: 'High Energy Theory',  emoji: '🌌' },
  { id: 'hep-ph',    label: 'High Energy Pheno',   emoji: '💥' },
  { id: 'gr-qc',     label: 'Gen. Relativity',     emoji: '🕳️' },
  { id: 'astro-ph',  label: 'Astrophysics',        emoji: '🔭' },
  { id: 'cond-mat',  label: 'Condensed Matter',    emoji: '💎' },
  { id: 'math.AG',   label: 'Algebraic Geometry',  emoji: '📐' },
  { id: 'math.NT',   label: 'Number Theory',       emoji: '🔢' },
  { id: 'math.PR',   label: 'Probability',         emoji: '🎲' },
  { id: 'stat.ML',   label: 'Stat ML',             emoji: '📊' },
  { id: 'q-bio',     label: 'Quantitative Biology',emoji: '🧬' },
  { id: 'econ',      label: 'Economics',           emoji: '💰' },
];

export const TIERS = [
  { name: 'LEGEND', emoji: '🏆', minH: 80, className: 'tier-legend' },
  { name: 'STAR',   emoji: '⚡', minH: 40, className: 'tier-star' },
  { name: 'RISING', emoji: '🔥', minH: 15, className: 'tier-rising' },
];

export const PAGE_SIZE = 20;
export const PREFETCH_TRIGGER = 5;
export const SS_CACHE_DAYS = 30;
export const FEED_CACHE_MIN = 5;

export const MILESTONES = [1, 5, 10, 25, 50, 100, 250];
export const STREAK_MILESTONES = [3, 7, 14, 30, 100, 365];

export const DEFAULT_CATS = ['cs.AI', 'quant-ph'];
