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

- **Diary add sheet**: `.meal button.fab` → tabs via `[data-tab="custom"]` etc.
- **Custom food**: `#cname/#cslabel/#csgrams/#ck/#cp/#cc/#cf` → `#csave`;
  `#cmacros` label must flip to "Macros for … (N g)" when grams entered;
  per100g in IndexedDB (`macrocoach` db, `foods` store) must be scaled from
  the serving.
- **Portion detail**: open `.result button.open`; serving chips `[data-serv]`,
  preview values `#pkcal/#pp/#pc/#pf`, confirm `#paddconfirm`.
- **Pull-to-refresh**: CDP `Input.dispatchTouchEvent` drag down ~220px from
  y≈250 at scrollTop 0; `#ptr` shows, release → class `refreshing` then
  `done` ("Up to date ✓"). Short pull (<72px threshold-equivalent) must not
  trigger.
- **Scanner**: `button#scan` in the search tab → `video.scanner` playing.

## Gotchas

- `page.on('pageerror')` + console errors: only expected 404 is /favicon.ico.
- Touch drag needs `hasTouch: true` and a CDP session; Playwright has no
  built-in touch drag.
