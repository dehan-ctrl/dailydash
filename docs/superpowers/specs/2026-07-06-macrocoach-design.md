# MacroCoach — Design Spec

**Date:** 2026-07-06
**Status:** Approved pending user review
**Repo:** `dehan-ctrl/dailydash` (public, deliberately generic name for profile privacy)
**Live URL:** https://dehan-ctrl.github.io/dailydash/

## Context

Dehan wants a personal-use clone of the Carbon Diet Coach app (joincarbon.com): an
adaptive nutrition coach that prescribes daily macro targets, tracks food and body
weight, and adjusts the prescription weekly based on observed results. It must run
on his iPhone in the browser (installable PWA), cost nothing to operate, and keep
all personal data on-device. He prefers prescriptive coaching — the app tells him
exactly what to eat (macro targets), not open-ended self-tracking.

## Decisions log

| Decision | Choice |
|---|---|
| Hosting | GitHub Pages, **public repo with disguised name** `dailydash` (free plan can't do Pages on private repos; user accepted the trade-off) |
| Device | iPhone (Safari, installed PWA) |
| Scope | Full Carbon feature clone (v1) |
| Units | Both lbs+ft/in and kg+cm, switchable in Settings; **all storage metric** |
| App name | MacroCoach (display/manifest); repo name stays generic |
| Stack | No-build vanilla JS PWA; vendored libs only; `node --test` for unit tests |
| Agent portability | `CLAUDE.md` + `AGENTS.md` (identical content) so Codex CLI can continue work if Claude quota runs out |
| Food data | Open Food Facts (primary, no key); USDA FoodData Central optional via user-supplied key in Settings |

## Architecture

Static PWA, no server, no accounts. All personal data in IndexedDB on-device;
JSON export/import in Settings is the backup story. Service worker precaches the
app shell (cache-first, versioned) so the app opens instantly and works offline;
only live food-database search and barcode lookup require network. `navigator.storage.persist()`
requested on first run. Public repo contains code only — never user data.

### File layout

```
index.html                 app shell, tab bar
css/app.css
js/app.js                  boot, router/tabs, view mounting
js/db.js                   IndexedDB wrapper (hand-rolled, promise-based)
js/units.js                kg⇄lb, cm⇄ft/in conversions + formatting
js/engine/prescribe.js     initial macro prescription (pure)
js/engine/trend.js         trend-weight EWMA (pure)
js/engine/checkin.js       weekly check-in decision logic (pure)
js/engine/planner.js       high/low day redistribution with locks (pure)
js/food/off.js             Open Food Facts search + barcode lookup client
js/food/usda.js            USDA FDC client (used only when key present)
js/food/barcode.js         camera + ZXing wiring
js/views/{onboarding,log,coach,trends,plan,settings}.js
js/charts.js               hand-rolled SVG charts (per dataviz skill)
vendor/zxing.min.js        vendored barcode library
sw.js                      service worker
manifest.webmanifest       name: MacroCoach; standalone; icons
icons/                     app icons incl. apple-touch-icon
test/*.test.mjs            node --test unit tests for js/engine/* and units
CLAUDE.md / AGENTS.md      identical agent instructions
docs/superpowers/          this spec + implementation plan
```

All engine modules are pure functions (data in → data out, no DOM, no DB) so they
run under `node --test` with zero tooling.

## Data model (IndexedDB `macrocoach`, one object store per line)

- `settings` — profile (sex, birthdate, heightCm, activityLevel), goal
  (type: lose|gain|maintain|reverse, ratePctPerWeek), dietStyle, unit system,
  checkInDay, usdaApiKey?, onboardedAt
- `targets` — current prescription {kcal, proteinG, carbG, fatG, effectiveDate}
  plus full history
- `weighins` — {date, weightKg} (one per date, latest wins)
- `logs` — keyed by date: {meals: [{name, entries: [{source, foodId?, label,
  qty, unit, per100g|perServing macros, computed kcal/p/c/f}]}]}
- `foods` — custom foods; `recipes` — ingredient lists with computed per-serving macros
- `foodcache` — OFF/USDA results by id/barcode for offline reuse; `recents`, `favorites`
- `checkins` — one record per check-in: period, inputs (avg intake, logged-day
  count, weigh-in count, Δtrend), decision, old/new targets, explanation text,
  tdeeEstimate
- `planner` — {enabled, days: [{dow, kcalOffset or absolute kcal, locked}]}

Everything stored metric; `js/units.js` converts at the display edge only.

## Coaching engine

### Initial prescription (`prescribe.js`)

1. RMR via Mifflin-St Jeor (weight kg, height cm, age, sex).
2. TDEE = RMR × activity multiplier (1.2 / 1.375 / 1.55 / 1.725 / 1.9).
3. Daily calories = TDEE + (targetRate_kgPerWeek × 7700) / 7. Loss rates
   0.25–1.25 %BW/week; gain 0.125–0.5 %BW/week; maintain 0; reverse starts at
   estimated maintenance (TDEE) and climbs via check-ins.
4. Protein 2.0 g/kg (plant-based 1.8), user-adjustable 1.4–2.6 g/kg.
5. Fat floor: max(0.6 g/kg, 20% kcal); diet style sets the carb/fat split of
   remaining calories — balanced ≈ fat 30% kcal; low-fat: fat at floor; low-carb:
   carbs ≈ 25% kcal; keto: carbs fixed 25 g, fat fills.
6. User may hand-edit macro grams within the safe ranges; edits rebalance the
   other flexible macro to keep calories constant (Carbon behavior).
7. Hard floor: never prescribe < 1200 kcal (female) / 1500 kcal (male).

### Trend weight (`trend.js`)

Exponentially smoothed: `trend = prev + 0.1 × (weight − prev)`, applied once per
weigh-in in date order (Hacker's Diet). First weigh-in seeds the trend. Charts
show raw scatter + trend line.

### Weekly check-in (`checkin.js`)

Runs on the user's chosen check-in day (banner on Coach tab; can be taken late).

1. **Adherence gate:** requires ≥4 fully-logged food days and ≥3 weigh-ins in
   the 7-day period; otherwise no change + explanation ("not enough data to
   coach honestly — log more this week").
2. Observed rate = Δtrend weight over the period (kg/week), compared to target
   rate.
3. **Expenditure inference:** weekTDEE = avgDailyIntake − (Δtrend_kg × 7700)/7.
   Smoothed across weeks with EWMA (α = 0.25) → stable personal TDEE estimate.
   After 3+ consecutive compliant weeks, the rolling average window widens
   (mirrors Carbon's behavior).
4. **Decision:**
   - Within deadband (observed rate within ±20% of target, or |miss| <
     0.1 %BW/week) → hold, explain "on track".
   - Off target → newCalories = smoothedTDEE + desired daily delta, but capped
     at ±150 kcal (or ±7.5%, whichever smaller) change per week.
   - Maintain goal: keep weight within ±1% band of goal weight; adjust only when
     trend drifts out.
   - Reverse diet: if trend gain ≤ 0.1 %BW/week, add +75–125 kcal; else hold or
     trim.
5. Calorie changes go to carbs and fat pro-rata; protein held constant.
6. Every check-in stores a record and produces a plain-English explanation of
   the exact decision path (numbers included).

### Diet planner (`planner.js`)

- Off by default; when enabled, the week's budget = 7 × current daily target
  (calories and each macro).
- Each weekday shows its calories; user can edit any day's calories directly
  and can **lock** any day.
- **Redistribution invariant:** weekly total never changes. When day D is edited
  by Δ, the opposite of Δ is spread equally across unlocked days other than D
  (locked days and D untouched). If a receiving day would cross its floor
  (1200/1500 kcal) or all other days are locked, the edit is clamped to what's
  redistributable and the UI says why.
- Per-day macros: protein constant every day; carbs/fat scale with the day's
  calories using the prescription's ratio.
- After a check-in changes the daily target, all planner days scale
  proportionally (locks preserved, values rescaled) so the pattern survives.
- The Log tab's daily target reflects that weekday's planned calories.

## Food logging

- **Search:** Open Food Facts `search` API (no key, CORS-friendly). Results
  normalized to per-100g + per-serving macros and cached in `foodcache`.
  If a USDA FDC key is present in Settings, a second "USDA" results section
  appears (better for whole foods).
- **Barcode:** camera via `getUserMedia` + vendored ZXing → OFF product-by-barcode
  lookup. Works in installed iOS PWAs (iOS 14.3+).
- **Custom foods & recipes:** user-defined foods; recipes = ingredient list →
  computed per-serving macros; both searchable locally and usable offline.
- **Conveniences:** recents, favorites, copy meal/day from yesterday, quick-add
  raw macros. Meals: Breakfast / Lunch / Dinner / Snacks.
- Log tab shows remaining vs target per macro (rings) for the active day.

## UI

Mobile-first, bottom tab bar, five tabs:

1. **Log** — date switcher, macro rings (kcal/P/C/F remaining), meals list, add
   via search/barcode/custom/recent, weigh-in quick-entry at top.
2. **Coach** — current prescription with rationale, check-in banner when due,
   check-in flow, full check-in history with explanations, estimated TDEE.
3. **Trends** — weight scatter + trend line; calories eaten vs target; weekly
   adherence; TDEE estimate over time. Hand-rolled SVG per the dataviz skill.
4. **Plan** — planner toggle, per-day calorie editor with lock toggles,
   weekly-total invariant indicator.
5. **Settings** — profile & goal editing (re-prescribes), units toggle, check-in
   day, USDA key, export/import JSON, danger zone (wipe).

Onboarding wizard on first launch: profile → goal + rate → diet style →
proposed macros (tweakable) → done. Visual design via frontend-design skill:
distinctive, not template-y; dark-mode aware.

## Offline / PWA

- `manifest.webmanifest`: name MacroCoach, standalone display, theme color, icons
  (incl. 180px apple-touch-icon).
- `sw.js`: versioned precache of shell; network-first for food APIs with cache
  fallback; bump cache version on deploy.
- iOS quirks: installed PWAs are exempt from Safari's 7-day storage eviction;
  still request persistent storage and surface an "export backup" nudge monthly.

## Testing

- **Unit (TDD):** `node --test test/` — prescribe, trend, check-in decisions
  (deadband, caps, adherence gate, reverse mode), planner redistribution
  (locks, floors, invariant), unit conversions. No dependencies.
- **E2E (manual, scripted):** run a local `python3 -m http.server`, drive with
  Chrome (claude-in-chrome): onboard → log foods → weigh in → simulate a week →
  check-in fires and explains itself. Verify on the live GitHub Pages URL after
  deploy; user confirms install-to-home-screen on iPhone.

## Deployment

- Public repo `dehan-ctrl/dailydash`, GitHub Pages serving from `main` root
  (`.nojekyll`). README kept deliberately bland ("personal dashboard
  experiments").
- Deploy = `git push` (`gh repo create` once). App served under
  `/dailydash/` path — all URLs relative, SW scope-safe.

## Agent portability (Codex fallback)

`CLAUDE.md` and `AGENTS.md` carry identical instructions: project map, "run
tests with `node --test`", "serve locally with `python3 -m http.server`",
deploy steps, and pointers to this spec + the implementation plan in
`docs/superpowers/`. Any agent (Claude Code or Codex CLI) can resume work from
the repo alone.

## Out of scope (v1)

Multi-user/auth, cloud sync, Apple Health integration, micronutrients, photo
logging, push notifications (a due-check-in banner suffices).
