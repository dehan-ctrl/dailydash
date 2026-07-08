---
name: verify
description: How to run and drive MacroCoach end-to-end for verification (headless Chromium against the local server).
---

# Verifying MacroCoach

No build step. Serve and drive with Playwright's cached Chromium (do NOT add
npm to this repo — install `playwright-core` in the session scratchpad).

## Recipe

1. `python3 -m http.server 8000` from the repo root (background).
2. In the scratchpad: `npm i playwright-core`, then launch the cached browser:
   - executable: `~/Library/Caches/ms-playwright/chromium-*/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
   - args `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`
     (barcode scanner gets a fake camera; video should report 1920x1080)
   - context: `{ viewport: {width:390,height:844}, isMobile:true, hasTouch:true }`
3. Fresh profile lands on onboarding: click `[data-next]` ×3 then
   `[data-finish]` (defaults are valid) → `location.reload()` → diary.

## Flows worth driving

- **Food picker** (full page): `.meal button.fab` → `.picker`; tabs
  `[data-tab="recent"|"mine"|"recipe"]`, meal dropdown `#mealpick`,
  back `#pickerback`.
- **Custom food**: My Foods tab → `#newfoodbtn` → `#cname/#cslabel/#csgrams/
  #ck/#cp/#cc/#cf` → `#csave`; `#cmacros` label must flip to "Macros for …
  (N g)" when grams entered; per100g in IndexedDB (`macrocoach` db, `foods`
  store) must be scaled from the serving. Logged customs must appear in the
  Recent tab (lastUsed stamp).
- **Live search**: focus `.searchbar input` → search mode + `#cancelsearch`;
  typing ≥2 chars shows "Recent & My foods (n)" locals instantly, online
  results ~600ms after pause. Input focus must survive re-renders.
- **Food page**: tap `.foodrow` → macro strip `#pkcal/#pp/#pc/#pf`, serving
  `<select id="servsel">`, qty `#pqty`, confirm `#paddconfirm`; `#mealpick`
  changes/moves the target meal.
- **Turkish**: `#langchip` toggles TR/EN everywhere incl. tab bar; with TR
  active a search like "tavuk" must hit USDA as "chicken" (watch requests to
  nal.usda.gov). Coverage test: test/i18n-coverage.test.mjs.
- **Pull-to-refresh**: CDP `Input.dispatchTouchEvent` drag down ~220px from
  y≈250 at scrollTop 0; `#ptr` shows, release → class `refreshing` then
  `done` ("Up to date ✓"). Short pull must not trigger; disabled while
  `.picker` is open (body.picker-open).
- **Scanner**: `#scan` icon in the search bar → `video.scanner` playing.

## Gotchas

- `page.on('pageerror')` + console errors: only expected 404 is /favicon.ico.
- Touch drag needs `hasTouch: true` and a CDP session; Playwright has no
  built-in touch drag.
