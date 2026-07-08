# Turkish localization (TR/EN toggle) — design

Approved by Dehan 2026-07-08 ("Yes, do it!").

## Goal

The whole app usable in Turkish, switchable at any time with a small TR/EN
button at the top of every screen, including onboarding. Food search must
work for Turkish queries even though USDA is English-only.

## Language state

- `js/i18n.js` owns the language. Persisted in `localStorage('mc-lang')` so it
  is readable synchronously at boot and before onboarding creates settings.
  (Deliberate, narrow exception to the IndexedDB rule: it is a UI preference,
  not personal data, and must exist pre-DB.)
- `t(str, vars)` — English-as-key lookup into a Turkish dictionary; missing
  entries fall back to the English string. `{name}` placeholders substitute
  after lookup so Turkish word order and suffixes stay correct
  (e.g. `'Add to {meal}'` → `'{meal} öğününe ekle'`).
- `locale()` returns `tr-TR`/`en-US` for date formatting.

## Toggle UI

- A small ghost pill labeled with the language you'd switch TO ("TR" while in
  English) — a Turkish speaker instantly spots "TR".
- Placement: diary hero row beside the date arrows; beside the title on
  Coach/Me/Settings; on onboarding step 1. Tap → `setLang` → re-render the
  current screen (`ctx.refresh()`; onboarding re-renders locally).
- Tab bar labels re-translate on every `navigate()`.

## Data stays English internally

Meal names in stored logs, `reason` strings on targets, etc. remain English in
IndexedDB; translation happens only at the display edge. Engine modules stay
pure and untouched.

## Turkish food search

- Open Food Facts: query passed through unchanged (multilingual).
- USDA: query bridged TR→EN when Turkish is active:
  1. `js/food/tr-foods.js` — pure dictionary (~300 common foods and
     food words), full-phrase first, then word-by-word (all words must
     translate).
  2. Fallback: MyMemory free translation API
     (`api.mymemory.translated.net`), result cached in-memory per session
     (`js/food/translate.js`).
  3. Both fail → skip USDA for that search, show OFF results plus a notice.
- USDA result names remain English (per-result translation would be an API
  call per row and would mangle nutrition terms).

## Out of scope

Translating food names returned by USDA/OFF; unit-system changes; any server.

## Testing / deploy

Unit tests for `t()` fallback + vars, dictionary lookups, and the USDA query
bridge. Browser verification of the toggle round-trip and a Turkish search
(assert the outgoing USDA request contains the English term). Service worker
cache → v21.
