# dailydash (MacroCoach)

A personal diet-coach PWA (Carbon-style adaptive macro coaching). Spec:
`docs/superpowers/specs/2026-07-06-macrocoach-design.md`. Plan:
`docs/superpowers/plans/2026-07-06-macrocoach.md`.

## Rules
- No build step. Vanilla ES modules only. Never add npm, a bundler, or a
  framework. Vendor third-party libs as plain files in `vendor/`.
- All personal data lives in IndexedDB on-device. Never add analytics,
  accounts, or any server.
- All stored data is metric (kg/cm). Convert at the display edge via
  `js/units.js`. Dates are local `YYYY-MM-DD` strings via `js/util.js`.
- `js/engine/*` and food normalizers stay pure (no DOM/DB/network/Date.now).
- Calorie floor: 1200 kcal (female) / 1500 kcal (male), everywhere.

## Commands
- Tests: `node --test` (auto-discovers test/*.test.mjs)
- Local serve: `python3 -m http.server 8000` → http://localhost:8000/
- Deploy: push to `main` (GitHub Pages serves repo root). Bump `CACHE` in
  `sw.js` whenever shipped files change.
