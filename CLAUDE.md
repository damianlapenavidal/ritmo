# Ritmo

Damian's phone-first training and nutrition app. Static site on GitHub Pages: pushing to `main` deploys to https://damianlapenavidal.github.io/ritmo/ in about a minute.

## How it works
- No build step, no framework, no dependencies. `index.html` (shell + tabs), `app.js` (state, data layer, views, events), `charts.js` (hand-written SVG charts), `styles.css` (tokens + components).
- Real data lives in the **private** repo `damianlapenavidal/fitness-coach`. The app reads and writes it through the GitHub contents API with a fine-grained token kept in the browser's localStorage. Log files are JSON Lines; their schema is in that repo's `knowledge/data-schema.md`.
- `demo/` holds **made-up** data mirroring that repo's layout, used when no token is set. Regenerate it from the private repo with `python3 scripts/make_demo.py ../ritmo/demo`.
- Views are functions in `views` returning HTML strings; `after[view]` draws charts after render. Clicks route through `data-act` attributes in one delegated handler.
- Meal photos are resized on the phone (max 1024 px JPEG) and uploaded to `inbox/meals/` in the private repo; a GitHub Action there asks Claude for the estimate and appends it to `logs/nutrition.jsonl` with `source: "photo-ai"` and `photo_id`.

## Rules
- Never commit real logs, tokens or API keys here. This repo is public.
- Follow `DESIGN.md`: use the CSS tokens in `styles.css`, never raw hex in components; uppercase only for display headings and labels; status colors always with an icon and words; touch targets at least 44px.
- Target devices are only **iPhone 17 / iPhone 17 Pro (402 × 874 CSS px)** and **iPhone 16 Pro Max (440 × 956)**, in Safari and as a home-screen app. Every change must look right at 402 and 440 px wide, in light and dark mode (`data-theme` toggle and `prefers-color-scheme`). Desktop layout exists but isn't a target; just don't break it.
- Respect the safe areas: the top bar clears the Dynamic Island (`--safe-top`), the tab bar and page bottom clear the home indicator (`--safe-bottom`), and landscape side insets use `--gutter-l` / `--gutter-r`.
- Escape anything user-provided with `esc()` before putting it in HTML.
- Keep it dependency-free. Charts are SVG in `charts.js`; follow the existing patterns (one y-axis per chart, dashed target lines, hover/tap tooltips).

## Run and check locally
```bash
python3 -m http.server 8000   # then open http://localhost:8000 (demo mode)
```
To test with real data locally, open Settings and enter the token again (localStorage is per site, so localhost doesn't share the phone's token).
Before pushing: click through Today, Log (all four tabs), Progress, Food, Plan and Settings, in light and dark, with no console errors.
