# Check-in wizard, early check-in, and fat↔carb slider

Date: 2026-07-15. Approved by Dehan in-session.

## Goal

Three additions to the existing coach system:

1. Check-ins can run early — any time from day 4 after the last check-in.
2. Running a check-in opens a guided wizard (tracked everything? → met
   targets? → calculating → result) instead of dumping a preview card.
3. A fat↔carb slider lets the user rebalance carbs and fat while calories
   and protein stay fixed, reachable by tapping the macro rings on the diary.

## 1. Engine: variable-length periods (`js/engine/checkin.js`)

`runCheckin(i)` gains two inputs:

- `periodDays` (integer ≥ 1; callers send 4–14): the number of days the
  check-in covers.
- `trackedAll` (boolean): the user's answer to "did you track everything?"

Behavior:

- **`trackedAll === false` → hold.** Logged intake is unreliable, so the
  coach does not learn TDEE from it and does not adjust. Targets held, TDEE
  carried forward unchanged (`prevTdee`), compliance streak reset to 0.
  Explanation says the log was incomplete and asks for a fully tracked
  period. This check runs before the data-sufficiency gate.
- **Data gate unchanged:** fewer than 4 logged days or fewer than 3
  weigh-ins → `insufficient` (as today).
- **TDEE estimate** uses the actual period length:
  `periodTdee = avgIntakeKcal − (Δtrend × 7700) / periodDays`.
- **Rate comparisons normalize to weekly:** `obsWeekly = Δtrend × 7 /
  periodDays` replaces raw `obs` in the lose/gain miss calculation and the
  reverse-diet tolerance. The maintain branch is position-based (trend vs.
  goal band) and needs no normalization.
- **Smoothing scales with period length:** `smoothTdee` takes the effective
  alpha `base × periodDays / 7` (base 0.25, or 0.15 at streak ≥ 3). A 4-day
  early check-in moves the learned TDEE ~57% as much as a full week.
  `periodDays` above 7 is clamped to 7 for alpha (never exceed base).
- Existing rails unchanged: ±min(150, 7.5%) kcal/week cap, calorie floors,
  deadband holds.

## 2. Coach page: always-visible check-in button + wizard (`js/views/coach.js`)

**Button.** The due-banner becomes a persistent check-in row:

- `since < 4`: disabled, "Check-in available in {n} days".
- `since ≥ 4` and not due: enabled, "Early check-in".
- Due (existing `isDue` logic): enabled, "Run check-in".
- Already checked in today: row hidden (as the banner is today).

**Period window.** `buildInputs` changes from a fixed 7-day window to
"since the last check-in": `periodDays = min(daysBetween(lastCheckin,
today), 14)`, window = the last `periodDays` days ending today. Trend start
still anchors to the last trend point before the window.

**Wizard.** Clicking the button opens a full-screen step sheet (same visual
family as the food-picker sheet):

1. "Did you track everything you ate this period?" — Yes / No.
2. "Did you meet your macro targets?" — Yes / No, with the period
   compliance numbers (existing `periodStats`) shown as context.
3. "Calculating…" — brief animated beat (~1.4 s), then auto-advances.
4. Result: the coach explanation; new targets if adjusting, "targets held"
   otherwise. **Apply** writes the records (below) and closes; **✕**
   abandons without writing anything.

Applying writes the checkin record as today, including `trackedAll` and
`metTargets`, plus `oldTargets`/`newTargets`; on adjust it writes a new
targets record and rescales the planner (existing logic). The cycle resets:
next check-in is 7 days after this one (already how `lastCk` works).
History rows show tracked/met marks.

`metTargets` is informational only — stored and displayed, never used in
the math (actual logged intake already captures what happened).

## 3. Fat↔carb slider (diary rings → sheet)

Tapping the macro rings on the diary opens a "Macro balance" sheet:

- Calories and protein displayed as fixed values.
- One slider whose position is fat grams, from the fat floor
  (`fatFloorG(weightKg, kcal)`) up to all non-protein calories as fat
  (carbs 0). Live preview of resulting C/F grams and the fat share of
  non-protein calories. Reuses `editMacro(t, 'fatG', …)` for the math.
- **Save:** custom mode → update `settings.customTargets`; coach mode →
  write a targets record `{kcal, proteinG, carbG, fatG, tdee (carried),
  effectiveDate: today, reason: 'Macro balance'}`. Calories unchanged, so
  no planner rescale.
- Rings, compliance bands, plan page all pick the change up through
  `activeTargets`/`targetsFor` automatically. Past days keep their old
  targets (date-versioned records).
- The balance persists across future check-ins for free:
  `applyKcalChange` scales carb/fat pro-rata around fixed protein.

## Cross-cutting

- i18n: every new user-facing string through `t()` with a Turkish entry;
  new coach explanation sentences get `tExplain` patterns.
- Tests: `test/checkin.test.mjs` — variable `periodDays` math, alpha
  scaling, hold-on-untracked; coach view tests for button states and
  `buildInputs` period window; slider math is already covered by
  `editMacro` tests, add a regression test for the save-record shape if a
  helper is extracted.
- `sw.js` CACHE bump when shipping.

## Out of scope

Protein adjustment UI (protein is already a separate, held-constant
target); changing the diet-style presets; multi-slider designs.
