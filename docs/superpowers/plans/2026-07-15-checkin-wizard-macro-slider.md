# Check-in Wizard + Early Check-in + Fat↔Carb Slider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guided check-in wizard runnable from day 4 with period-length-aware coach math, plus a fat↔carb slider (kcal/protein fixed) reachable from the diary rings.

**Architecture:** Extend the pure engine (`js/engine/checkin.js`) with `periodDays`/`trackedAll` inputs; coach view gets an availability helper, a persistent check-in button, and a 4-step wizard overlay replacing the old preview flow; diary rings open a bottom sheet that rebalances fat/carb via existing `editMacro` and writes a date-versioned targets record.

**Tech Stack:** Vanilla ES modules, IndexedDB, `node --test`. No build step, no new deps.

## Global Constraints (from CLAUDE.md)

- No npm/bundler/framework; vanilla ES modules only.
- `js/engine/*` stays pure (no DOM/DB/network/Date.now).
- Calorie floor 1200 (f) / 1500 (m) everywhere.
- Every user-facing string through `t()` with a Turkish entry in `js/i18n.js`; engine sentences stay English, translated at display edge via `tExplain`.
- Metric storage; local `YYYY-MM-DD` dates.
- Bump `CACHE` in `sw.js` when shipping.

---

### Task 1: Engine — `trackedAll` hold + variable `periodDays`

**Files:**
- Modify: `js/engine/checkin.js`
- Test: `test/checkin.test.mjs`

**Interfaces:**
- Produces: `runCheckin(i)` accepting new optional inputs `periodDays` (int ≥1, default 7) and `trackedAll` (boolean, default true); `smoothTdee(prev, weekTdee, streakBefore, periodDays = 7)`.
- Result shape unchanged: `{ change, newTargets, tdee, compliantStreak, explanation }`.

- [ ] **Step 1: Write failing tests** — append to `test/checkin.test.mjs`:

```js
test('untracked period holds and learns nothing', () => {
  const r = runCheckin({ ...base, trackedAll: false, prevTdee: 2900 });
  assert.equal(r.change, 'hold');
  assert.equal(r.newTargets, null);
  assert.equal(r.tdee, 2900);
  assert.equal(r.compliantStreak, 0);
  assert.match(r.explanation, /not fully tracked/i);
});
test('untracked beats the data gate', () => {
  const r = runCheckin({ ...base, trackedAll: false, loggedDays: 2, weighinCount: 1 });
  assert.equal(r.change, 'hold');
});
test('4-day early check-in: TDEE from actual period length', () => {
  // obs -0.24 kg over 4 days → -0.42 kg/wk vs target -0.45 → inside 20% deadband
  const r = runCheckin({ ...base, periodDays: 4, loggedDays: 4, weighinCount: 3,
    trendStartKg: 90.24, trendEndKg: 90.0 });
  assert.equal(r.change, 'hold');
  assert.equal(r.tdee, 2842); // 2380 + 0.24*7700/4
  assert.match(r.explanation, /over 4 days/);
});
test('short periods shrink the smoothing step', () => {
  const r = runCheckin({ ...base, periodDays: 4, loggedDays: 4, weighinCount: 3,
    trendStartKg: 90.24, trendEndKg: 90.0, prevTdee: 3000 });
  assert.equal(r.tdee, Math.round(3000 + 0.25 * (4 / 7) * (2842 - 3000))); // 2977
});
test('4-day rate normalization catches an off-target weekly rate', () => {
  // obs -0.06 over 4 days → -0.105 kg/wk vs -0.45 → adjust
  const r = runCheckin({ ...base, periodDays: 4, loggedDays: 4, weighinCount: 3,
    trendStartKg: 90.06, trendEndKg: 90.0 });
  assert.equal(r.change, 'adjust');
});
```

- [ ] **Step 2: Run** `node --test test/checkin.test.mjs` — expect the 5 new tests FAIL, existing ones pass.

- [ ] **Step 3: Implement** in `js/engine/checkin.js`:

`smoothTdee` gains a period-scaled alpha:

```js
export function smoothTdee(prev, weekTdee, streakBefore, periodDays = 7) {
  if (prev == null || !Number.isFinite(prev)) return weekTdee;
  const base = streakBefore >= 3 ? 0.15 : 0.25; // long compliance → wider window
  const alpha = base * Math.min(periodDays, 7) / 7; // short periods are noisy → smaller step
  return prev + alpha * (weekTdee - prev);
}
```

`runCheckin` — new prologue and normalized math (only changed lines shown with context; keep the rest):

```js
export function runCheckin(i) {
  const days = Math.max(1, i.periodDays ?? 7);
  if (i.trackedAll === false) {
    return {
      change: 'hold', newTargets: null, tdee: i.prevTdee ?? null, compliantStreak: 0,
      explanation: 'You said this period was not fully tracked — nothing learned, targets held. ' +
        'Track everything you eat and check in again.',
    };
  }
  if (i.loggedDays < 4 || i.weighinCount < 3) {
    return {
      change: 'insufficient', newTargets: null, tdee: i.prevTdee ?? null, compliantStreak: 0,
      explanation: `Only ${i.loggedDays}/${days} fully-logged days and ${i.weighinCount} weigh-ins (need 4 and 3). ` +
        `Not enough data to coach honestly — targets held; log more this week.`,
    };
  }
  const obs = i.trendEndKg - i.trendStartKg;      // kg over the period
  const obsWeekly = (obs * 7) / days;             // normalized for rate comparisons
  const weekTdee = i.avgIntakeKcal - (obs * KCAL_PER_KG) / days;
  const tdee = Math.round(smoothTdee(i.prevTdee, weekTdee, i.compliantStreak ?? 0, days));
  const streak = (i.compliantStreak ?? 0) + 1;
  const target = targetRateKgPerWeek(i.goal, i.weightKg);
  const nums = days === 7
    ? `Trend ${fmtKg(obs)} kg this week vs target ${fmtKg(target)}; ` +
      `average intake ${Math.round(i.avgIntakeKcal)} kcal/day; estimated TDEE ${tdee} kcal.`
    : `Trend ${fmtKg(obs)} kg over ${days} days (${fmtKg(obsWeekly)} kg/week) vs target ${fmtKg(target)}; ` +
      `average intake ${Math.round(i.avgIntakeKcal)} kcal/day; estimated TDEE ${tdee} kcal.`;
```

Reverse branch uses `obsWeekly` instead of `obs`; lose/gain miss becomes `const miss = obsWeekly - target;`. The maintain branch is position-based — unchanged.

Note: the insufficient branch keeps `tdee: i.prevTdee ?? null` (it already did via `i.prevTdee ?? null`).

- [ ] **Step 4: Run** `node --test test/checkin.test.mjs` — all pass (existing 7-day tests unchanged: default `days = 7` reproduces old math and the old "this week" sentence).

- [ ] **Step 5: Commit** `feat(engine): check-in supports variable periods and untracked-hold`

---

### Task 2: Coach inputs — period window since last check-in + availability helper

**Files:**
- Modify: `js/views/coach.js` (`buildInputs`, export `isDue`, new `checkinAvailability`)
- Test: `test/coach.test.mjs`

**Interfaces:**
- Consumes: Task 1's `periodDays` input.
- Produces: `buildInputs(data, today)` now returns `periodDays` in its result; `checkinAvailability(settings, checkins, today)` → `{ status: 'done'|'wait'|'early'|'due', since, daysLeft? }` (checkins sorted date-desc, as `gather()` provides).

- [ ] **Step 1: Write failing tests** — append to `test/coach.test.mjs` (import `checkinAvailability` too):

```js
const wk = (d, kg) => ({ date: d, weightKg: kg });
test('buildInputs sizes the window from the last check-in', () => {
  const inputs = buildInputs({
    settings: { goal: { type: 'lose' }, sex: 'm', onboardedAt: '2026-06-01' },
    targets: { kcal: 2000 },
    weighins: [wk('2026-07-04', 90), wk('2026-07-05', 89.9), wk('2026-07-07', 89.8)],
    logs: [{ date: '2026-07-02', meals: [{ entries: [{ kcal: 1800 }] }] },
           { date: '2026-07-05', meals: [{ entries: [{ kcal: 1800 }] }] }],
    checkins: [{ date: '2026-07-03', tdee: 2800 }],
  }, '2026-07-07');
  assert.equal(inputs.periodDays, 4);
  assert.equal(inputs.loggedDays, 1); // Jul 2 log is outside the window
  assert.equal(inputs.prevTdee, 2800);
});
test('buildInputs caps very overdue periods at 14 days', () => {
  const inputs = buildInputs({
    settings: { goal: { type: 'lose' }, sex: 'm', onboardedAt: '2026-06-01' },
    targets: { kcal: 2000 }, weighins: [], logs: [], checkins: [{ date: '2026-06-10' }],
  }, '2026-07-07');
  assert.equal(inputs.periodDays, 14);
});
test('checkinAvailability gates at 4 days and flags due vs early', () => {
  const s = { onboardedAt: '2026-07-01', checkInDay: 0 }; // Monday
  assert.deepEqual(checkinAvailability(s, [], '2026-07-03').status, 'wait');
  assert.equal(checkinAvailability(s, [], '2026-07-03').daysLeft, 2);
  assert.equal(checkinAvailability(s, [], '2026-07-05').status, 'early'); // day 4
  assert.equal(checkinAvailability(s, [], '2026-07-09').status, 'due');   // day 8
  assert.equal(checkinAvailability(s, [{ date: '2026-07-05' }], '2026-07-05').status, 'done');
});
```

- [ ] **Step 2: Run** `node --test test/coach.test.mjs` — new tests FAIL.

- [ ] **Step 3: Implement** in `js/views/coach.js`:

```js
export function isDue(settings, checkins, today) { /* unchanged body, now exported */ }

export function checkinAvailability(settings, checkins, today) {
  if (checkins[0]?.date === today) return { status: 'done', since: 0 };
  const last = checkins[0]?.date ?? settings.onboardedAt;
  const since = last ? daysBetween(last, today) : Infinity;
  if (since < 4) return { status: 'wait', since, daysLeft: 4 - since };
  return { status: isDue(settings, checkins, today) ? 'due' : 'early', since };
}
```

`buildInputs`: replace `const start = addDays(today, -6);` with

```js
  const last = checkins[0]?.date ?? settings.onboardedAt;
  const periodDays = last ? Math.min(Math.max(daysBetween(last, today), 1), 14) : 7;
  const start = addDays(today, -(periodDays - 1));
```

and add `periodDays` to the returned object.

- [ ] **Step 4: Run** `node --test test/coach.test.mjs` — all pass (the existing no-checkin test still gets `periodDays: 7` via the `?? settings.onboardedAt` fallback being undefined).

- [ ] **Step 5: Commit** `feat(coach): period window since last check-in + availability states`

---

### Task 3: Check-in wizard UI

**Files:**
- Modify: `js/views/coach.js` (button row, wizard overlay replacing `preview`/`renderFlow`), `js/i18n.js` (TR entries + `tExplain` rules), `css/app.css` (wizard overlay styles)

**Interfaces:**
- Consumes: `checkinAvailability`, `buildInputs` (Task 2), `runCheckin` with `trackedAll` (Task 1), existing `periodStats`/`complianceRange`/`activeTargets`.
- Produces: checkin DB records gain `trackedAll` and `metTargets` booleans.

- [ ] **Step 1: Replace the due banner** in `render()` with a persistent row driven by availability:

```js
  const avail = checkinAvailability(settings, checkins, today);
  const ciRow =
    avail.status === 'done' ? `<div class="banner">${t('✓ Checked in today')}</div>`
    : avail.status === 'wait' ? `<div class="banner spread">${avail.daysLeft === 1
        ? t('Check-in unlocks tomorrow') : t('Check-in unlocks in {n} days', { n: avail.daysLeft })}
        <button class="ghost" disabled>${t('Run check-in')}</button></div>`
    : `<div class="banner spread">${avail.status === 'due' ? t('Check-in is due') : t('Early check-in available')}
        <button class="ghost" id="run">${avail.status === 'due' ? t('Run check-in') : t('Early check-in')}</button></div>`;
```

Use `${ciRow}` where the `${due ? …}` banner was; delete the old `due` const.

- [ ] **Step 2: Replace `preview`/`renderFlow` with the wizard.** Module state `let wizard = null;` (`{ step, trackedAll, metTargets, result }`). `#run` click → `wizard = { step: 1 }; renderWizard(data);`. Wizard renders into a fixed overlay appended to `root` (`<div class="ciwizard wizard">…</div>`):

- Step 1: stepnum "Step 1 of 3", h2 `t('Did you track everything you ate this period?')`, buttons `t('Yes')` / `t('No, some things are missing')`, ✕ close.
- Step 2: stepnum "Step 2 of 3", h2 `t('Did you meet your macro targets?')`, the period compliance mini-rows (reuse `periodStats` numbers vs `activeTargets` bands, same markup family as the compliance card), buttons Yes/No.
- Step 3: stepnum "Step 3 of 3", `t('Calculating…')` + three pulsing dots; `setTimeout(1400)` → compute `const inputs = { ...buildInputs(data, today), trackedAll: wizard.trackedAll }; wizard.result = runCheckin(inputs);` → step 4. Guard the timer so closing the wizard cancels the advance.
- Step 4: `tExplain(result.explanation)`; if `newTargets`: the new-targets line and the custom-mode heads-up (both exist today in `renderFlow`); primary button `Apply new targets` / `Record check-in`; ✕ close abandons without writing.

Apply handler = old `#accept` handler plus the two answers:

```js
await ctx.db.put('checkins', {
  date: today, inputs, change: r.change, explanation: r.explanation,
  tdee: r.tdee, compliantStreak: r.compliantStreak,
  trackedAll: wizard.trackedAll, metTargets: wizard.metTargets,
  oldTargets: data.targets, newTargets: r.newTargets,
});
```

(targets record write + planner rescale unchanged). Then `wizard = null; render();`

- [ ] **Step 3: History marks.** In the check-in history map, after the explanation `<p>`, add:

```js
${r.trackedAll != null ? `<p class="muted">${r.trackedAll ? '✓' : '✕'} ${t('tracked everything')} · ${r.metTargets ? '✓' : '✕'} ${t('met targets')}</p>` : ''}
```

- [ ] **Step 4: CSS** — append to `css/app.css`:

```css
.ciwizard {
  position: fixed; inset: 0; z-index: 30; background: var(--bg);
  padding: calc(env(safe-area-inset-top) + 18px) 16px calc(env(safe-area-inset-bottom) + 24px);
  overflow-y: auto; display: flex; flex-direction: column;
}
.ciwizard .closex { align-self: flex-end; }
.ciwizard .bigbtns { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
.calcdots { display: flex; gap: 8px; justify-content: center; margin: 32px 0; }
.calcdots i { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); animation: calcpulse 1s infinite ease-in-out; }
.calcdots i:nth-child(2) { animation-delay: .18s; }
.calcdots i:nth-child(3) { animation-delay: .36s; }
@keyframes calcpulse { 0%, 100% { opacity: .25; transform: scale(.8); } 50% { opacity: 1; transform: scale(1); } }
```

- [ ] **Step 5: i18n.** Add TR entries for every new string ('✓ Checked in today', 'Check-in unlocks tomorrow', 'Check-in unlocks in {n} days', 'Early check-in available', 'Early check-in', 'Did you track everything you ate this period?', 'No, some things are missing', 'Did you meet your macro targets?', 'Yes', 'No', 'Calculating…', 'Step {n} of 3', 'tracked everything', 'met targets'). Update `EXPLAIN_RULES`: insufficient regex `\/7` → `\/(\d+)` (renumber `$` groups in the TR string), add rules for the untracked-hold sentence and the "over N days" trend sentence from Task 1.

- [ ] **Step 6: Run** `node --test` — full suite passes (i18n-coverage enforces the TR entries).

- [ ] **Step 7: Commit** `feat(coach): guided check-in wizard with early check-in`

---

### Task 4: Fat↔carb slider from the diary rings

**Files:**
- Modify: `js/engine/prescribe.js` (add `fatBounds`), `js/views/diary.js` (rings button + balance sheet), `js/i18n.js`, `css/app.css`
- Test: `test/prescribe.test.mjs`

**Interfaces:**
- Consumes: `editMacro(t, 'fatG', grams, { weightKg })`, `fatFloorG`, `latestTargets`/`activeTargets`.
- Produces: `fatBounds(t, weightKg)` → `{ min, max }` fat grams; targets records with `reason: 'Macro balance'`.

- [ ] **Step 1: Failing test** in `test/prescribe.test.mjs`:

```js
test('fatBounds spans fat floor to all non-protein calories', () => {
  const t = { kcal: 2400, proteinG: 180, carbG: 240, fatG: 80 };
  const b = fatBounds(t, 90);
  assert.equal(b.min, Math.ceil(Math.max(0.6 * 90, 0.20 * 2400 / 9))); // 54
  assert.equal(b.max, Math.floor((2400 - 180 * 4) / 9)); // 186
  assert.ok(b.min <= b.max);
});
```

- [ ] **Step 2: Run** `node --test test/prescribe.test.mjs` — FAILS.

- [ ] **Step 3: Implement** in `js/engine/prescribe.js`:

```js
// Slider bounds for rebalancing fat↔carb at fixed kcal and protein.
export function fatBounds(t, weightKg) {
  const min = Math.ceil(fatFloorG(weightKg, t.kcal));
  const max = Math.max(min, Math.floor((t.kcal - t.proteinG * 4) / 9));
  return { min, max };
}
```

- [ ] **Step 4: Run test — passes. Commit** `feat(engine): fatBounds for macro-balance slider`

- [ ] **Step 5: Diary sheet.** In `js/views/diary.js`:

- Wrap the rings: `ringsSvg` output becomes `<button class="ringsbtn" id="balance" aria-label="${t('Adjust macro balance')}">…existing crings div…</button>`.
- Module state `let balance = null;` (`{ fatG }`). In `wire()`:

```js
root.querySelector('#balance').onclick = async () => {
  const s = await ctx.db.get('settings', 'main');
  const base = activeTargets(s, latestTargets(await ctx.db.getAll('targets')));
  const weighins = await ctx.db.getAll('weighins');
  const weightKg = weighins.sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.weightKg ?? 80;
  balance = { base, weightKg, fatG: base.fatG };
  renderBalance();
};
```

- `renderBalance()` appends a bottom sheet to `root` (import `editMacro`, `fatBounds` from `../engine/prescribe.js`, `latestTargets` alongside the existing `targetsFor, activeTargets` import):

```js
function renderBalance() {
  const { base, weightKg } = balance;
  const b = fatBounds(base, weightKg);
  const cur = editMacro(base, 'fatG', balance.fatG, { weightKg }).targets;
  const pct = Math.round((cur.fatG * 9 / (base.kcal - base.proteinG * 4)) * 100);
  let el = root.querySelector('.balsheet');
  if (!el) { el = document.createElement('div'); el.className = 'balsheet'; root.appendChild(el); }
  el.innerHTML = `<div class="card">
    <h2>${t('Macro balance')}</h2>
    <p class="muted">${t('Calories and protein stay fixed — slide to trade fat for carbs.')}</p>
    <div class="spread"><span>${base.kcal} kcal · P ${base.proteinG} g</span><b>${t('{pct}% fat', { pct })}</b></div>
    <input type="range" id="balf" min="${b.min}" max="${b.max}" step="1" value="${cur.fatG}">
    <div class="spread"><span><i class="dot c"></i>${t('Carbs')} <b>${cur.carbG} g</b></span>
      <span><i class="dot f"></i>${t('Fat')} <b>${cur.fatG} g</b></span></div>
    <div class="row" style="margin-top:12px">
      <button class="ghost" id="balcancel">${t('Cancel')}</button>
      <button class="primary" id="balsave">${t('Save balance')}</button></div>
  </div>`;
  el.querySelector('#balf').oninput = (e) => { balance.fatG = +e.target.value; renderBalance(); };
  el.querySelector('#balcancel').onclick = () => { balance = null; el.remove(); };
  el.querySelector('#balsave').onclick = async () => {
    const s = await ctx.db.get('settings', 'main');
    const next = editMacro(balance.base, 'fatG', balance.fatG, { weightKg }).targets;
    if (s.targetMode === 'custom' && s.customTargets?.kcal) {
      s.customTargets = next;
      await ctx.db.put('settings', s, 'main');
    } else {
      const latest = latestTargets(await ctx.db.getAll('targets'));
      await ctx.db.put('targets', { ...next, tdee: latest.tdee, effectiveDate: dstr(), reason: 'Macro balance' });
    }
    balance = null; el.remove(); settings = s; render();
  };
}
```

(Slider `oninput` re-render keeps focus on the range input since the element is re-created — instead update only the text nodes: give the carb/fat/pct values `id`s and set `textContent`, re-rendering the whole sheet only on open. Implement it that way.)

- [ ] **Step 6: CSS** — append:

```css
.ringsbtn { background: none; border: 0; padding: 0; display: block; }
.balsheet {
  position: fixed; inset: 0; z-index: 30; background: rgb(9 20 34 / .45);
  display: flex; align-items: flex-end;
}
.balsheet .card {
  width: 100%; margin: 0; border-radius: 16px 16px 0 0;
  padding-bottom: calc(env(safe-area-inset-bottom) + 16px);
}
```

- [ ] **Step 7: i18n** — TR entries for 'Macro balance', 'Calories and protein stay fixed — slide to trade fat for carbs.', '{pct}% fat', 'Save balance', 'Adjust macro balance'.

- [ ] **Step 8: Run** `node --test` — full suite green. **Commit** `feat(diary): fat↔carb balance slider on the macro rings`

---

### Task 5: Ship

- [ ] **Step 1:** `node --test` — everything green.
- [ ] **Step 2:** Use the `dailydash:verify` skill — drive the app headless: onboard → log food → coach page shows the check-in button state → (with seeded weigh-ins/logs) run the wizard end-to-end → open the rings sheet, move the slider, save, confirm the rings/targets update; check both EN and TR.
- [ ] **Step 3:** Bump `CACHE` in `sw.js`.
- [ ] **Step 4:** Commit `chore: bump service-worker cache` and push to `main` (GitHub Pages deploy).

## Self-review

- Spec coverage: engine (§1) → Task 1; button/window/wizard (§2) → Tasks 2–3; slider (§3) → Task 4; cross-cutting i18n/tests/CACHE → embedded + Task 5. `metTargets` stored-not-used: Task 3 Step 2. ✓
- No placeholders; types consistent (`periodDays`, `trackedAll`, `{status, since, daysLeft}`, `fatBounds → {min,max}`). ✓
