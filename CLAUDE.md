# Ritmo

Damian's phone-first training and nutrition app. Static site on GitHub Pages: pushing to `main` deploys to https://damianlapenavidal.github.io/ritmo/ in about a minute.

## How it works
- No build step, no framework, no dependencies. `index.html` (shell + tabs), `app.js` (state, data layer, views, events), `charts.js` (hand-written SVG charts), `progression.js` (last time + suggested load, pure functions), `styles.css` (tokens + components).
- `library/exercises.json`: 876 exercises from Free Exercise DB (public domain, pinned commit; rebuild with `python3 scripts/build_library.py`). Loaded on first use; photos are hotlinked from that commit, not stored here. Don't add exercise data, images or code from wger, Liftosaur or Lyfta (licenses); see THIRD_PARTY.md.
- Simple first: screens show one line per item (name, sets × reps, today's weight); explanations, history and options open in bottom sheets (`S.sheet` stack, `sheets.*`, `renderSheet()`): exercise, cardio drill, day, warm-up, effort, how weights go up, tests, full report, all sessions, add/swap picker, program preview. Program switches write `data/program.json`, `data/programs/index.json` and (on a phase change) `data/profile.json` in one commit via the Git Data API (`commitFiles`).
- The workout being logged (`S.draft`) is saved to localStorage (`ritmo.draft`) after every change and restored on load; Start sets `startedAt` for the live timer, Finish saves and clears it. Discard workout (own line under Finish, only once started or something is logged, two taps) clears it and goes to Today. Edit/Delete of logged workouts use `replaceLine` (matched by exact JSON). Log line shape: the private repo's `knowledge/data-schema.md`.
- Real data lives in the **private** repo `damianlapenavidal/fitness-coach`. The app reads and writes it through the GitHub contents API with a fine-grained token kept in the browser's localStorage. Log files are JSON Lines; their schema is in that repo's `knowledge/data-schema.md`.
- `demo/` holds **made-up** data mirroring that repo's layout, used when no token is set. Regenerate it from the private repo with `python3 scripts/make_demo.py ../ritmo/demo`.
- Views are functions in `views` returning HTML strings; `after[view]` draws charts after render. Clicks route through `data-act` attributes in one delegated handler.
- Today stays short (Damian's choice): the session title, one line "N exercises · about 60 min" (`todaySummary`) that opens the day sheet, and Start workout. The full list (warm-up, parts, cool-down) lives in Plan → that day (`sheets.day`).
- Plan shows sessions in parts (`groupBlocks`: Jumps + speed, Strength, Extras, Finisher) from each exercise's `pattern`; order never changes. Coach notes follow the private repo's `knowledge/coach-notes.md` (six `###` sections); `coachNotesHtml` styles each one, and `md()` handles tables, numbered lists and `- [ ]` checkboxes.
- The weight box follows each exercise's `load` in the private repo's `data/exercises.json` (`loadRule()`): column label (lb total / lb each / lb help) and one line under the exercise saying what number to type (bar + plates, one dumbbell, stack, plates only, machine help); `none` hides the box. `load: "assist"` progresses backwards in `progression.js` (less help = harder).
- Exercise notes: "+ Note" on each exercise in the Log (one text line, Return closes the keyboard and never submits) saves `notes` on that exercise in the log line; a note alone (no sets) is kept. The newest note shows under the exercise next time ("Your note, <day>: …") and the exercise sheet lists the last 5 (`exNotes`).
- Warm-up and Cool-down rows (Today, Plan day sheet; "Warm-up first" in the Log) open `sheets.warmup` / `sheets.cooldown`, built by `routineBody()` from program.json `warmup` / `cooldown` (steps with optional items; each item links to a YouTube search). Plyo-only sessions (jumps before a run) save as `conditioning`, not `lift`.
- The automatic checks in `reports/latest.json` → `flags` (and the weekly report's "## Flags") are NOT shown in the app, by Damian's choice: they're for the weekly check-in and the coach chats. The Coach card on Today only has Ask coach; the report sheet strips "## Flags".
- Ask coach opens a new Claude cloud session (`coachSessionUrl()`: claude.ai/code with `repositories=<owner>/<repo>,<owner>/ritmo` and `environment=Quick`, Damian's Haiku environment), so every coach chat reads the live repos. It replaced the old project-chat link setting.
- Exercises without library photos get a "Watch how it's done" video link (exercises.json `video`, else a YouTube search).
- Phone steps: `logs/steps.jsonl` (written by an Action from an iPhone Shortcut; last line per date wins) → Progress → Steps chart.
- Meal photos are resized on the phone (max 1024 px JPEG) and uploaded to `inbox/meals/` in the private repo; a GitHub Action there asks Claude for the estimate and appends it to `logs/nutrition.jsonl` with `source: "photo-ai"` and `photo_id`. The photo form asks "Where?" (halls from `profile.json` → `food.dining_halls`); the upload's `location` makes the estimator add that hall's URI NetNutrition menu (fetched daily into the private repo's `menus/`) to the prompt. For a named `place` with a description or note, the estimator first web-searches the place's published nutrition; the line then has `sources` (shown under the meal) and items marked `from_web`.

## Rules
- Never commit real logs, tokens or API keys here. This repo is public.
- Follow `DESIGN.md`: use the CSS tokens in `styles.css`, never raw hex in components; uppercase only for display headings and labels; status colors always with an icon and words; touch targets at least 44px.
- Target devices are only **iPhone 17 / iPhone 17 Pro (402 × 874 CSS px)** and **iPhone 16 Pro Max (440 × 956)**, in Safari and as a home-screen app. Every change must look right at 402 and 440 px wide, in light and dark mode (it follows the phone's appearance via `prefers-color-scheme`; there's no in-app toggle). Desktop layout exists but isn't a target; just don't break it.
- Respect the safe areas: the top bar clears the Dynamic Island (`--safe-top`), the tab bar and page bottom clear the home indicator (`--safe-bottom`), and landscape side insets use `--gutter-l` / `--gutter-r`.
- Escape anything user-provided with `esc()` before putting it in HTML.
- Keep it dependency-free. Charts are SVG in `charts.js`; follow the existing patterns (one y-axis per chart, dashed target lines, hover/tap tooltips).

## Run and check locally
```bash
python3 -m http.server 8000   # then open http://localhost:8000 (demo mode)
```
To test with real data locally, open Settings and enter the token again (localStorage is per site, so localhost doesn't share the phone's token).
Before pushing: run `node tests/progression.test.js`, then click through Today, Log (all four tabs), Progress, Food, Plan and Settings, plus the exercise sheet, Swap, + Exercise and a program preview, in light and dark, with no console errors.
