I want to make a brainrot version of "arxiv but as addictive as instagram". The plan is to make this a website on my github connorblake1 which I can make a bookmark on my iphone homescreen, so it should be optimized for mobile. The website should have the following features:

Features:
    - Ability to follow researchers and departments at schools. Ability to filter by category (e.g. quant-ph or hep-th)
    - Ability to follow keywords
    - Following and "For You" recommendations mixed together in an *infinite scroll* feed sorted by relevance (ie keyword counts, authors you interact with a lot etc)
    - researchers' names should be highlighted based on publicly available citation counts from Google Scholar (ie gold is super high, different tiers)
    - Red notification badges and other shiny things and generally an "addictive" UI using all the features from Facebook/Instagram/TikTok that make those apps so addictive. The goals is to replace doomscrolling those apps with doomscrolling Arxiv
    - webpage photo thumbnail (the thing that shows up in the tab should be exactly instagram's logo)
    - shows posts in the feed by pulling the first figure from the article via the HTML of the arxiv page
    - should use the arxiv api or something to pull articles on the fly so that the scroll feels infinite

---

# Implementation Plan

## Decisions (confirmed)
- **Hosting**: GitHub project page at `connorblake1.github.io/brainrot-arxiv` (subpath).
- **Persistence**: `localStorage` only. No backend, no login, no cross-device sync.
- **Citation source**: Semantic Scholar API (Google Scholar has no public API). Tiers map h-index → 🏆 / ⚡ / 🔥.
- **Thumbnails**: First `<figure>` from `ar5iv.labs.arxiv.org/html/{id}`, then Semantic Scholar `openAccessPdf` link, finally a generated gradient card.
- **Tab icon**: Instagram-INSPIRED gradient camera SVG. Cannot be an exact Instagram logo (trademark / asset rights). Distinctly stylized, similar vibe.

## Tech stack
- Plain HTML + CSS + ES modules. **No build step.** Drops straight onto GitHub Pages.
- Hash-based router (`#/feed`, `#/explore`, `#/profile`) so deep links survive the 404 problem on subpath GH Pages.
- PWA manifest + apple-touch meta tags so "Add to Home Screen" gives a fullscreen, status-bar-tinted app.

## CORS strategy
arxiv API and ar5iv don't set `Access-Control-Allow-Origin`. Verified via curl. Site routes through `https://api.codetabs.com/v1/proxy/?quest=<encoded url>` with a small fallback chain (codetabs → cors.lol → allorigins). Semantic Scholar usually works direct but is heavily rate-limited unauth, so it goes through the same proxy path with aggressive localStorage caching of author lookups.

## File layout
```
brainrot-arxiv/
├── index.html               # SPA shell, mounts #app, links manifest+icon
├── tests.html               # in-browser unit test runner
├── manifest.webmanifest     # PWA: name, icons, theme, display=standalone
├── README.md                # deploy instructions
├── icons/
│   └── icon.svg             # gradient camera (also used for favicon + apple-touch)
├── css/
│   └── style.css            # mobile-first dark theme
└── js/
    ├── config.js            # constants: proxy URL, tier thresholds, default cats
    ├── store.js             # localStorage CRUD: follows, keywords, interactions, streak
    ├── api.js               # arxiv (Atom XML), Semantic Scholar, ar5iv (figure scrape) + caching
    ├── recommender.js       # score(paper, profile) → number; build profile from interactions
    ├── feed.js              # infinite scroll orchestrator: For You / Following, dedupe, prefetch
    ├── ui.js                # card renderer, modal, citation-tier highlighter, toast queue
    ├── notifications.js     # streak, daily-papers-read counter, variable-reward toasts
    ├── onboarding.js        # 3-step swipeable first-run flow
    ├── router.js            # hash router, mounts views
    ├── app.js               # entry point; bootstraps everything
    └── tests.js             # imported by tests.html
```

## Data flow
1. **Boot** → `app.js` checks `store.isOnboarded()`. If not → `onboarding.js`. Else → router.
2. **Feed view** asks `feed.js` for the next batch. `feed.js` builds an arxiv query from followed categories + keywords + author IDs, calls `api.fetchArxiv()`, parses Atom into paper objects, calls `recommender.score()` per paper, merges with the running deduped list, and renders cards via `ui.renderCard()`.
3. **Card render** kicks off two background fetches:
   - `api.fetchAuthorTier(authorName)` → cached for 30 days; updates name styling when resolved.
   - `api.fetchThumbnail(arxivId)` → tries ar5iv, falls back to gradient. Swaps `<img>` when resolved.
4. **Interaction** (tap, like, save, dwell) → `store.recordInteraction()` updates the user's interest profile, which the recommender reads for future scoring.
5. **Streak / badges** → `notifications.js` checks last-open date on load; bumps streak if yesterday, resets if older. Tracks "papers seen today" counter and fires variable-reward toasts at `1, 5, 10, 25, 50, 100` thresholds.

## arxiv query construction
```
search_query = (cat:X+OR+cat:Y) AND (au:"FirstLast"+OR+au:"...") AND (all:keyword1+OR+all:keyword2)
sortBy=submittedDate&sortOrder=descending
start={page*pageSize}&max_results={pageSize=20}
```
For "For You": include all followed categories + popular keywords + a 20% slice of pure-recent (no filter beyond categories) for serendipity. For "Following": only papers matching followed authors OR categories explicitly marked "Following".

## Recommender scoring
```
score(paper, profile) =
    5 * (#categories overlap with profile.categories)
    + 3 * (#keyword hits in title+abstract)
    + 10 * (paper has any followed author)
    + 0.05 * max(authorHIndex)
    + 2 * (profile.keywordAffinity[k] for each k in paper)        # learned from past likes
    + recencyBoost = 5 * exp(-daysOld / 14)
    + variableNoise = uniform(0, 1)                                # tiny jitter for variety
```
Profile is derived from `store.interactions`: each like = +2 toward author/category/keywords of that paper; each save = +3; each open with >5s dwell = +1.

## Citation tiers (h-index from Semantic Scholar)
| Tier | Threshold | Style |
|------|-----------|-------|
| 🏆 LEGEND | h ≥ 80 | gold gradient text + soft glow |
| ⚡ STAR | h ≥ 40 | silver-blue gradient |
| 🔥 RISING | h ≥ 15 | orange |
| default | — | normal white |

Cached forever per author name. Background-resolved, never blocks render.

## Addictive UI checklist
- [ ] Red unread badge on tab indicator + iOS app icon (badge in title)
- [ ] Streak ribbon ("🔥 Day 7") at top, shakes on increment
- [ ] Heart explosion on like (CSS keyframes, particle burst)
- [ ] Spring-loaded bookmark animation
- [ ] Pull-to-refresh with rubber-band physics
- [ ] "💎 INFLUENTIAL" / "✨ TRENDING" / "🚀 HOT" stamps on cards (5–15% rate, weighted by score)
- [ ] Variable-reward toasts ("+5 XP", "Level up!") at random thresholds
- [ ] Subtle haptic via `navigator.vibrate(10)` on key actions
- [ ] Citation-tier glow pulse animation on legendary names
- [ ] "Papers read today: 12" counter bar at top
- [ ] Auto-loading skeleton cards (never an empty state)
- [ ] Confetti on streak milestones (3, 7, 30, 100 days)

## Mobile/PWA
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `<link rel="apple-touch-icon" href="icons/icon.svg">`
- `<link rel="manifest" href="manifest.webmanifest">`
- CSS uses `100dvh` for fullscreen, `env(safe-area-inset-*)` for notch/home indicator.
- All taps `>= 44×44 px`. No hover-only states. Scroll uses `overscroll-behavior: contain`.

## Testing strategy
1. **`tests.html`** — pure-function unit tests run in browser:
   - arxiv Atom parser handles 0/1/N entries, missing fields, unicode
   - recommender score is deterministic for fixed input + monotonic when overlap grows
   - tier mapping at boundaries (h = 14/15/39/40/79/80)
   - store CRUD round-trips, dedupe, version-migrate
   - URL builders escape special chars
2. **Local smoke** — `python3 -m http.server 8000`, then in headless Chrome:
   - feed loads ≥ 5 cards within 8s
   - like persists across reload
   - onboarding selections persist
   - tests.html reports 100% pass
3. **Mobile real-device check** — open via local IP on iPhone Safari, verify scroll feel, add-to-homescreen.

## Deployment
1. Create repo `brainrot-arxiv` on github.com/connorblake1.
2. Push repo contents.
3. Settings → Pages → Source: `Deploy from a branch` → `main` / `(root)`.
4. Wait ~60s, visit `https://connorblake1.github.io/brainrot-arxiv/`.
5. On iPhone: open in Safari → Share → Add to Home Screen.

## Known limits / caveats
- Semantic Scholar rate-limits unauth requests. Citation tiers may load slowly on first visit; localStorage cache fills in after a few minutes of use.
- ar5iv only has HTML for ~70% of arxiv papers; the rest fall back to gradient cards.
- CORS proxies are public goodwill — they go down. The fallback chain mitigates but doesn't eliminate this. Long-term fix is a personal Cloudflare Worker, out of scope here.
- "Departments at schools" is reduced to "follow an institution name as a search keyword" — Semantic Scholar's affiliation field isn't reliably indexed. Real institution-following needs a backend.
- The favicon is Instagram-INSPIRED, not the actual logo.
