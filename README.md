# arXivrot

doomscroll arXiv like it's instagram. mobile-first PWA, no backend, deploys to GitHub Pages.

## Run locally

```bash
python3 -m http.server 8765
# open http://localhost:8765
```

Visit `http://localhost:8765/tests.html` to run the unit tests.

## Deploy to GitHub Pages (project page at `connorblake1.github.io/brainrot-arxiv`)

1. **Create the repo** on github.com:
   - Name: `brainrot-arxiv`
   - Public
   - Don't initialize with anything

2. **Push these files** from `/Users/cjblake/Documents/Github/brainrot/`:
   ```bash
   cd /Users/cjblake/Documents/Github/brainrot
   git init
   git add .
   git commit -m "initial"
   git branch -M main
   git remote add origin https://github.com/connorblake1/brainrot-arxiv.git
   git push -u origin main
   ```

3. **Enable Pages**:
   - Repo → **Settings** → **Pages**
   - Source: **Deploy from a branch**
   - Branch: **main** / folder: **/ (root)**
   - Save. Wait ~60 seconds.

4. **Visit** `https://connorblake1.github.io/brainrot-arxiv/`

5. **Add to iPhone home screen**:
   - Open the URL in **Safari** (not Chrome — Chrome on iOS won't install PWA-style)
   - Tap **Share** → **Add to Home Screen**
   - Tap → fullscreen, no Safari chrome, gradient camera icon

## How it works

- **arxiv API + Semantic Scholar API** routed through `api.codetabs.com` CORS proxy (with fallbacks to allorigins / cors.lol).
- **`localStorage` only** — your follows, interactions, and streak live on your phone.
- **Recommender** scores papers from your interaction history (likes weight categories/keywords/authors) blended with followed-categories and a recency boost.
- **Citation tiers** come from Semantic Scholar's `hIndex`. Cached 30 days.
- **Thumbnails** scrape the first `<figure>` from `ar5iv.labs.arxiv.org/html/{id}` via the proxy. Falls back to a deterministic gradient card when ar5iv has no HTML version.

## Caveats

- Semantic Scholar rate-limits unauthenticated traffic. Author tiers fill in over the first few minutes of use; cached forever after.
- ar5iv has HTML for ~70% of papers. Misses get gradient cards.
- Public CORS proxies sometimes go down. The fallback chain helps but isn't bulletproof. If everything 5xxs at once, retry in a minute.
- The favicon is Instagram-INSPIRED — gradient camera. Not the actual Instagram logo (trademark / asset rights).
- "Follow a department" is approximated by following the institution name as a keyword. Real institution-following needs a backend, which this isn't.

## Editing categories

`js/config.js` → `CATEGORIES`. arXiv category list: <https://arxiv.org/category_taxonomy>.

## Resetting

`/#/profile` → "reset everything", or DevTools → Application → Local Storage → delete `arxivrot.v1`.
