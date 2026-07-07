# MacroCoach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build MacroCoach, a personal Carbon-style adaptive diet-coach PWA, in the public `dailydash` repo, deployed on GitHub Pages, per `docs/superpowers/specs/2026-07-06-macrocoach-design.md`.

**Architecture:** No-build vanilla-JS PWA. Pure coaching-engine modules (`js/engine/*`, `js/units.js`, food normalizers) developed TDD with `node --test`; browser-only layers (IndexedDB, views, service worker) verified manually against a local `python3 -m http.server`. Deploy = push to `main`; Pages serves the repo root.

**Tech Stack:** HTML/CSS/ES modules, IndexedDB, vendored ZXing (barcode), Open Food Facts + optional USDA FDC APIs, `node --test`, GitHub Pages.

## Global Constraints

- **No build step, no npm, no framework.** Vendored plain files only (`vendor/`).
- **Repo:** public `dailydash` (bland README: "Personal dashboard experiments."). App display name is **MacroCoach**; never put "MacroCoach" in the README.
- **All URLs relative** (`./…`) — the app is served under `/dailydash/`.
- **All stored data metric** (kg, cm). Convert only at the display edge via `js/units.js`.
- **Engine purity:** files in `js/engine/` and the food normalizers must not touch DOM, DB, network, or `Date.now()` — they take data in, return data out.
- **Calorie floors:** never prescribe or plan below 1200 kcal (female) / 1500 kcal (male).
- **Tests:** `node --test test/` must pass at every commit.
- **Service worker:** bump `CACHE` version string in `sw.js` in any commit that changes shipped files after Task 16.
- **Dates** are local-timezone `YYYY-MM-DD` strings (use `js/util.js` helpers, never `toISOString()` for dates).
- **Commit style:** conventional (`feat:`, `test:`, `chore:`), one commit per plan step that says commit.

### Documented deviations from the spec (approved judgment calls)

- Added `js/util.js` (local-date helpers) — not in the spec's file list but needed by every view.
- Spec's "fully-logged food days" check-in gate is realized as an explicit **"Mark day complete"** toggle on the Log tab (stored on the day's log record) — honest signal, prescriptive UX.
- Spec's `recents`/`favorites` live as `lastUsed`/`fav` fields on `foodcache` records rather than separate stores.

---

### Task 1: Repo scaffold + GitHub Pages walking skeleton

**Files:**
- Create: `README.md`, `CLAUDE.md`, `AGENTS.md`, `.nojekyll`, `index.html`, `css/app.css` (minimal)

**Interfaces:**
- Produces: live GitHub Pages site at `https://<gh-user>.github.io/dailydash/` rendering the app shell; repo `dailydash` on GitHub.

- [ ] **Step 1: Write scaffold files**

`README.md`:

```markdown
# dailydash

Personal dashboard experiments.
```

`CLAUDE.md` (then copy to `AGENTS.md` — identical content, keep in sync):

```markdown
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
- Tests: `node --test test/`
- Local serve: `python3 -m http.server 8000` → http://localhost:8000/
- Deploy: push to `main` (GitHub Pages serves repo root). Bump `CACHE` in
  `sw.js` whenever shipped files change.
```

`index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>MacroCoach</title>
<link rel="stylesheet" href="css/app.css">
</head>
<body>
<main id="view"><h1>MacroCoach</h1><p>Coming soon.</p></main>
<nav id="tabbar"></nav>
</body>
</html>
```

`css/app.css` (placeholder; replaced in Task 7):

```css
body { font-family: -apple-system, system-ui, sans-serif; margin: 2rem; }
```

Create empty `.nojekyll` (`touch .nojekyll`).

- [ ] **Step 2: Commit**

```bash
cd ~/dailydash
cp CLAUDE.md AGENTS.md
git add -A && git commit -m "chore: scaffold repo shell and agent docs"
```

- [ ] **Step 3: Create GitHub repo and enable Pages**

```bash
gh auth status                      # must be logged in
gh repo create dailydash --public --source=. --push
gh api -X POST repos/{owner}/dailydash/pages \
  -f "source[branch]=main" -f "source[path]=/"
```

If the Pages API call 409s ("already exists"), that's fine — continue.

- [ ] **Step 4: Verify live**

```bash
GHUSER=$(gh api user -q .login)
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$GHUSER.github.io/dailydash/")
  [ "$code" = 200 ] && echo LIVE && break; sleep 15
done
curl -s "https://$GHUSER.github.io/dailydash/" | grep -q MacroCoach && echo OK
```

Expected: `LIVE` then `OK` (first Pages build can take ~1–3 min).

---

### Task 2: Unit conversions (`js/units.js`)

**Files:**
- Create: `js/units.js`, `js/util.js`
- Test: `test/units.test.mjs`

**Interfaces:**
- Produces: `kgToLb(kg)`, `lbToKg(lb)`, `cmToFtIn(cm)→{ft,in}`, `ftInToCm(ft,in)`, `fmtWeight(kg, units)`, `fmtHeight(cm, units)` where `units` is `'metric'|'imperial'`; `dstr(date?)→'YYYY-MM-DD'` (local), `addDays(str,n)`, `dowMon(str)→0..6` (Mon=0) from `js/util.js`.

- [ ] **Step 1: Write the failing test** — `test/units.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kgToLb, lbToKg, cmToFtIn, ftInToCm, fmtWeight, fmtHeight } from '../js/units.js';
import { addDays, dowMon } from '../js/util.js';

test('kg to lb', () => { assert.ok(Math.abs(kgToLb(100) - 220.462) < 0.01); });
test('lb/kg roundtrip', () => { assert.ok(Math.abs(lbToKg(kgToLb(82.5)) - 82.5) < 1e-9); });
test('cm to ft/in', () => { assert.deepEqual(cmToFtIn(180), { ft: 5, in: 11 }); });
test('ft/in to cm', () => { assert.ok(Math.abs(ftInToCm(5, 11) - 180.34) < 0.01); });
test('inch rollover 12→next ft', () => { assert.deepEqual(cmToFtIn(182.88), { ft: 6, in: 0 }); });
test('format weight', () => {
  assert.equal(fmtWeight(82.55, 'imperial'), '182.0 lb');
  assert.equal(fmtWeight(82.55, 'metric'), '82.6 kg');
});
test('format height', () => {
  assert.equal(fmtHeight(180, 'imperial'), `5'11"`);
  assert.equal(fmtHeight(180, 'metric'), '180 cm');
});
test('addDays crosses months', () => { assert.equal(addDays('2026-01-31', 1), '2026-02-01'); });
test('dowMon monday is 0', () => { assert.equal(dowMon('2026-07-06'), 0); }); // a Monday
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/units.test.mjs`
Expected: FAIL (`Cannot find module .../js/units.js`)

- [ ] **Step 3: Write minimal implementation**

`js/units.js`:

```js
export const KG_PER_LB = 0.45359237;
export const kgToLb = (kg) => kg / KG_PER_LB;
export const lbToKg = (lb) => lb * KG_PER_LB;

export function cmToFtIn(cm) {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return { ft, in: inch };
}
export const ftInToCm = (ft, inch) => (ft * 12 + inch) * 2.54;

export function fmtWeight(kg, units) {
  return units === 'imperial' ? `${kgToLb(kg).toFixed(1)} lb` : `${kg.toFixed(1)} kg`;
}
export function fmtHeight(cm, units) {
  if (units === 'imperial') { const { ft, in: i } = cmToFtIn(cm); return `${ft}'${i}"`; }
  return `${Math.round(cm)} cm`;
}
```

`js/util.js`:

```js
const p2 = (n) => String(n).padStart(2, '0');
export function dstr(d = new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
export function addDays(s, n) {
  const d = new Date(s + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dstr(d);
}
export function dowMon(s) { return (new Date(s + 'T12:00:00').getDay() + 6) % 7; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/units.test.mjs` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add js/units.js js/util.js test/units.test.mjs
git commit -m "feat: unit conversions and local-date helpers"
```

---

### Task 3: Initial prescription engine (`js/engine/prescribe.js`)

**Files:**
- Create: `js/engine/prescribe.js`
- Test: `test/prescribe.test.mjs`

**Interfaces:**
- Produces:
  - `rmrMifflin({sex:'m'|'f', weightKg, heightCm, age}) → kcal`
  - `ACTIVITY = {sedentary:1.2, light:1.375, moderate:1.55, very:1.725, extra:1.9}`
  - `kcalFloor(sex) → 1500|1200`
  - `prescribe({sex, weightKg, heightCm, age, activity, goal:{type:'lose'|'gain'|'maintain'|'reverse', ratePctPerWeek}, dietStyle:'balanced'|'lowfat'|'lowcarb'|'keto', plantBased, proteinPerKg?, tdeeOverride?}) → {kcal, proteinG, carbG, fatG, tdee}`
  - `editMacro(targets, macro:'proteinG'|'carbG'|'fatG', grams, {weightKg}) → {targets, clamped}` — rebalances so kcal stays constant
  - `ageFromBirthdate(birthdateStr, onDateStr) → integer years`
- Consumes: nothing (pure).

- [ ] **Step 1: Write the failing test** — `test/prescribe.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmrMifflin, prescribe, editMacro, kcalFloor, ageFromBirthdate } from '../js/engine/prescribe.js';

const guy = { sex: 'm', weightKg: 90, heightCm: 180, age: 35, activity: 'moderate' };

test('Mifflin-St Jeor male', () => {
  assert.equal(rmrMifflin(guy), 10 * 90 + 6.25 * 180 - 5 * 35 + 5); // 1855
});
test('Mifflin-St Jeor female', () => {
  assert.equal(rmrMifflin({ sex: 'f', weightKg: 60, heightCm: 165, age: 30 }),
    600 + 6.25 * 165 - 150 - 161);
});
test('balanced fat-loss prescription', () => {
  const t = prescribe({ ...guy, goal: { type: 'lose', ratePctPerWeek: 0.5 }, dietStyle: 'balanced' });
  assert.equal(t.tdee, 2875);            // 1855 * 1.55 rounded
  assert.equal(t.kcal, 2380);            // tdee - 0.45kg*7700/7
  assert.equal(t.proteinG, 180);         // 2.0 g/kg
  assert.equal(t.fatG, 79);              // 30% kcal / 9
  assert.equal(t.carbG, 237);            // remainder / 4
});
test('plant-based protein 1.8 g/kg', () => {
  const t = prescribe({ ...guy, goal: { type: 'maintain', ratePctPerWeek: 0 }, dietStyle: 'balanced', plantBased: true });
  assert.equal(t.proteinG, 162);
});
test('keto pins carbs at 25 g', () => {
  const t = prescribe({ ...guy, goal: { type: 'lose', ratePctPerWeek: 0.5 }, dietStyle: 'keto' });
  assert.equal(t.carbG, 25);
});
test('never below the sex floor', () => {
  const t = prescribe({ sex: 'f', weightKg: 45, heightCm: 150, age: 60, activity: 'sedentary',
    goal: { type: 'lose', ratePctPerWeek: 1.25 }, dietStyle: 'balanced' });
  assert.equal(t.kcal, kcalFloor('f')); // 1200
});
test('reverse starts at maintenance', () => {
  const t = prescribe({ ...guy, goal: { type: 'reverse', ratePctPerWeek: 0 }, dietStyle: 'balanced' });
  assert.equal(t.kcal, t.tdee);
});
test('tdeeOverride replaces formula TDEE', () => {
  const t = prescribe({ ...guy, goal: { type: 'maintain', ratePctPerWeek: 0 }, dietStyle: 'balanced', tdeeOverride: 3100 });
  assert.equal(t.kcal, 3100);
});
test('editMacro keeps calories constant', () => {
  const t = prescribe({ ...guy, goal: { type: 'lose', ratePctPerWeek: 0.5 }, dietStyle: 'balanced' });
  const { targets: e } = editMacro(t, 'proteinG', 200, { weightKg: 90 });
  assert.equal(e.proteinG, 200);
  assert.equal(e.kcal, t.kcal);
  const macroKcal = e.proteinG * 4 + e.carbG * 4 + e.fatG * 9;
  assert.ok(Math.abs(macroKcal - e.kcal) <= 8); // rounding slack only
});
test('editMacro clamps protein to 1.4–2.6 g/kg', () => {
  const t = prescribe({ ...guy, goal: { type: 'lose', ratePctPerWeek: 0.5 }, dietStyle: 'balanced' });
  const r = editMacro(t, 'proteinG', 500, { weightKg: 90 });
  assert.equal(r.clamped, true);
  assert.equal(r.targets.proteinG, Math.round(2.6 * 90));
});
test('editMacro respects fat floor', () => {
  const t = prescribe({ ...guy, goal: { type: 'lose', ratePctPerWeek: 0.5 }, dietStyle: 'balanced' });
  const r = editMacro(t, 'fatG', 10, { weightKg: 90 });
  assert.equal(r.clamped, true);
  assert.equal(r.targets.fatG, Math.round(Math.max(0.6 * 90, 0.2 * t.kcal / 9)));
});
test('age from birthdate', () => {
  assert.equal(ageFromBirthdate('1990-07-10', '2026-07-06'), 35);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/prescribe.test.mjs` — Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `js/engine/prescribe.js`:

```js
// Pure prescription math. Weights kg, heights cm, energy kcal.
export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.9 };
export const PROTEIN_RANGE = [1.4, 2.6]; // g/kg
const KCAL_PER_KG = 7700;

export const kcalFloor = (sex) => (sex === 'm' ? 1500 : 1200);

export function rmrMifflin({ sex, weightKg, heightCm, age }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'm' ? 5 : -161);
}

export function ageFromBirthdate(birth, on) {
  const b = new Date(birth + 'T12:00:00'), o = new Date(on + 'T12:00:00');
  let a = o.getFullYear() - b.getFullYear();
  if (o.getMonth() < b.getMonth() ||
      (o.getMonth() === b.getMonth() && o.getDate() < b.getDate())) a -= 1;
  return a;
}

export function fatFloorG(weightKg, kcal) {
  return Math.max(0.6 * weightKg, 0.20 * kcal / 9);
}

function splitCarbFat(kcal, proteinG, weightKg, dietStyle) {
  const floor = fatFloorG(weightKg, kcal);
  const rest = kcal - proteinG * 4; // kcal left for carbs + fat
  let fatG, carbG;
  if (dietStyle === 'keto') { carbG = 25; fatG = (rest - carbG * 4) / 9; }
  else if (dietStyle === 'lowfat') { fatG = floor; carbG = (rest - fatG * 9) / 4; }
  else if (dietStyle === 'lowcarb') { carbG = 0.25 * kcal / 4; fatG = (rest - carbG * 4) / 9; }
  else { fatG = Math.max(0.30 * kcal / 9, floor); carbG = (rest - fatG * 9) / 4; }
  if (fatG < floor) { fatG = floor; carbG = (rest - fatG * 9) / 4; }
  return { carbG: Math.max(0, Math.round(carbG)), fatG: Math.round(fatG) };
}

export function prescribe(p) {
  const tdee = Math.round(p.tdeeOverride ??
    rmrMifflin(p) * ACTIVITY[p.activity]);
  const sign = p.goal.type === 'lose' ? -1 : p.goal.type === 'gain' ? 1 : 0;
  const rateKgWk = sign * (p.goal.ratePctPerWeek / 100) * p.weightKg;
  let kcal = Math.round(tdee + rateKgWk * KCAL_PER_KG / 7);
  kcal = Math.max(kcal, kcalFloor(p.sex));
  const perKg = p.proteinPerKg ?? (p.plantBased ? 1.8 : 2.0);
  const proteinG = Math.round(perKg * p.weightKg);
  const { carbG, fatG } = splitCarbFat(kcal, proteinG, p.weightKg, p.dietStyle);
  return { kcal, proteinG, carbG, fatG, tdee };
}

// User hand-edits one macro; the flexible remainder rebalances so kcal is constant.
export function editMacro(t, macro, grams, { weightKg }) {
  const kcal = t.kcal;
  let { proteinG, carbG, fatG } = t;
  let clamped = false;
  const floor = fatFloorG(weightKg, kcal);
  const clamp = (v, lo, hi) => { const c = Math.min(Math.max(v, lo), hi ?? Infinity); if (c !== v) clamped = true; return c; };
  if (macro === 'proteinG') {
    proteinG = Math.round(clamp(grams, PROTEIN_RANGE[0] * weightKg, PROTEIN_RANGE[1] * weightKg));
    carbG = (kcal - proteinG * 4 - fatG * 9) / 4;
  } else if (macro === 'fatG') {
    fatG = Math.round(clamp(grams, floor));
    carbG = (kcal - proteinG * 4 - fatG * 9) / 4;
  } else {
    carbG = clamp(grams, 0);
    fatG = (kcal - proteinG * 4 - carbG * 4) / 9;
    if (fatG < floor) { fatG = floor; carbG = (kcal - proteinG * 4 - fatG * 9) / 4; clamped = true; }
  }
  if (carbG < 0) { carbG = 0; clamped = true; }
  return {
    targets: { kcal, proteinG: Math.round(proteinG), carbG: Math.round(carbG), fatG: Math.round(fatG) },
    clamped,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/prescribe.test.mjs` — Expected: all PASS. (If the balanced-prescription grams are off by 1 from the asserted values, fix the assertion to the code's rounding, not vice versa — but the kcal/tdee/protein values are exact and must match.)

- [ ] **Step 5: Commit**

```bash
git add js/engine/prescribe.js test/prescribe.test.mjs
git commit -m "feat: initial macro prescription engine"
```

---

### Task 4: Trend weight (`js/engine/trend.js`)

**Files:**
- Create: `js/engine/trend.js`
- Test: `test/trend.test.mjs`

**Interfaces:**
- Produces: `computeTrend(weighins, alpha=0.1) → [{date, weightKg, trendKg}]` sorted by date ascending; first weigh-in seeds the trend.
- Consumes: `weighins` records `{date:'YYYY-MM-DD', weightKg}`.

- [ ] **Step 1: Write the failing test** — `test/trend.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTrend } from '../js/engine/trend.js';

test('first weigh-in seeds trend', () => {
  const t = computeTrend([{ date: '2026-07-01', weightKg: 80 }]);
  assert.equal(t[0].trendKg, 80);
});
test('EWMA alpha 0.1 in date order regardless of input order', () => {
  const t = computeTrend([
    { date: '2026-07-02', weightKg: 81 },
    { date: '2026-07-01', weightKg: 80 },
  ]);
  assert.equal(t[0].date, '2026-07-01');
  assert.ok(Math.abs(t[1].trendKg - 80.1) < 1e-9);
});
test('does not mutate input', () => {
  const input = [{ date: '2026-07-01', weightKg: 80 }];
  computeTrend(input);
  assert.equal(input[0].trendKg, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trend.test.mjs` — Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `js/engine/trend.js`:

```js
// Hacker's Diet exponentially-smoothed trend. Pure.
export function computeTrend(weighins, alpha = 0.1) {
  const sorted = [...weighins].sort((a, b) => (a.date < b.date ? -1 : 1));
  let trend = null;
  return sorted.map((w) => {
    trend = trend === null ? w.weightKg : trend + alpha * (w.weightKg - trend);
    return { ...w, trendKg: trend };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trend.test.mjs` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add js/engine/trend.js test/trend.test.mjs
git commit -m "feat: trend-weight EWMA"
```

---

### Task 5: Weekly check-in decisions (`js/engine/checkin.js`)

**Files:**
- Create: `js/engine/checkin.js`
- Test: `test/checkin.test.mjs`

**Interfaces:**
- Produces:
  - `runCheckin(input) → {change:'insufficient'|'hold'|'adjust', newTargets|null, tdee, compliantStreak, explanation}`
    where `input = {goal:{type, ratePctPerWeek, goalWeightKg?}, sex, targets:{kcal,proteinG,carbG,fatG}, weightKg, trendStartKg, trendEndKg, avgIntakeKcal, loggedDays, weighinCount, prevTdee|null, compliantStreak}`
  - `applyKcalChange(targets, newKcal) → targets` (protein constant, carbs/fat pro-rata)
  - `targetRateKgPerWeek(goal, weightKg) → kg/week` (negative = loss)
- Consumes: `kcalFloor` semantics from Task 3 (re-exported locally to stay dependency-free is NOT wanted — import it: `import { kcalFloor } from './prescribe.js'`).

- [ ] **Step 1: Write the failing test** — `test/checkin.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheckin, applyKcalChange } from '../js/engine/checkin.js';

const base = {
  goal: { type: 'lose', ratePctPerWeek: 0.5 }, sex: 'm',
  targets: { kcal: 2400, proteinG: 180, carbG: 240, fatG: 80 },
  weightKg: 90, trendStartKg: 90.4, trendEndKg: 90.0,
  avgIntakeKcal: 2380, loggedDays: 7, weighinCount: 7,
  prevTdee: null, compliantStreak: 0,
};

test('adherence gate: too few logged days', () => {
  const r = runCheckin({ ...base, loggedDays: 3 });
  assert.equal(r.change, 'insufficient');
  assert.equal(r.newTargets, null);
  assert.equal(r.compliantStreak, 0);
  assert.match(r.explanation, /log more/i);
});
test('adherence gate: too few weigh-ins', () => {
  assert.equal(runCheckin({ ...base, weighinCount: 2 }).change, 'insufficient');
});
test('hold inside deadband, TDEE still inferred', () => {
  // observed -0.40 vs target -0.45 kg/wk → miss 0.05 ≤ 20% of target
  const r = runCheckin(base);
  assert.equal(r.change, 'hold');
  assert.equal(r.tdee, 2820); // 2380 + 0.4*7700/7
  assert.equal(r.compliantStreak, 1);
  assert.match(r.explanation, /2820/);
});
test('adjust when off target, capped at 150 kcal/week', () => {
  // observed -0.10 vs target -0.45 → needs big cut; cap limits to -150
  const r = runCheckin({ ...base, trendEndKg: 90.3 });
  assert.equal(r.change, 'adjust');
  assert.equal(r.newTargets.kcal, 2250);
  assert.equal(r.newTargets.proteinG, 180); // protein constant
  assert.ok(r.newTargets.carbG < 240 && r.newTargets.fatG < 80);
});
test('adjustment respects sex floor', () => {
  const r = runCheckin({
    ...base, sex: 'f',
    targets: { kcal: 1250, proteinG: 110, carbG: 120, fatG: 35 },
    weightKg: 55, trendStartKg: 55, trendEndKg: 55.2, avgIntakeKcal: 1250,
  });
  if (r.change === 'adjust') assert.ok(r.newTargets.kcal >= 1200);
});
test('reverse diet adds ~100 when trend is flat', () => {
  const r = runCheckin({
    ...base, goal: { type: 'reverse', ratePctPerWeek: 0 },
    trendStartKg: 90.0, trendEndKg: 90.05, avgIntakeKcal: 2400,
  });
  assert.equal(r.change, 'adjust');
  assert.equal(r.newTargets.kcal, 2500);
});
test('reverse diet holds when gaining too fast', () => {
  const r = runCheckin({
    ...base, goal: { type: 'reverse', ratePctPerWeek: 0 },
    trendStartKg: 90.0, trendEndKg: 90.4,
  });
  assert.equal(r.change, 'hold');
});
test('maintain holds inside ±1% band', () => {
  const r = runCheckin({
    ...base, goal: { type: 'maintain', ratePctPerWeek: 0, goalWeightKg: 90 },
    trendStartKg: 90.0, trendEndKg: 90.5, // 0.55% off goal
  });
  assert.equal(r.change, 'hold');
});
test('maintain steers back when outside band', () => {
  const r = runCheckin({
    ...base, goal: { type: 'maintain', ratePctPerWeek: 0, goalWeightKg: 90 },
    trendStartKg: 91.0, trendEndKg: 91.2,
  });
  assert.equal(r.change, 'adjust');
  assert.ok(r.newTargets.kcal < 2400);
});
test('TDEE smoothing uses prevTdee', () => {
  const r = runCheckin({ ...base, prevTdee: 3000 });
  assert.equal(r.tdee, Math.round(3000 + 0.25 * (2820 - 3000))); // 2955
});
test('explanation contains the numbers', () => {
  const r = runCheckin(base);
  assert.match(r.explanation, /-0\.40/);
  assert.match(r.explanation, /2380/);
});
test('applyKcalChange scales carbs/fat pro-rata', () => {
  const t = applyKcalChange({ kcal: 2400, proteinG: 180, carbG: 240, fatG: 80 }, 2250);
  assert.equal(t.proteinG, 180);
  assert.equal(t.kcal, 2250);
  assert.equal(t.carbG, Math.round(240 * (2250 - 720) / (2400 - 720)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/checkin.test.mjs` — Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `js/engine/checkin.js`:

```js
// Weekly check-in decision logic. Pure. All inputs precomputed by the caller.
import { kcalFloor } from './prescribe.js';

const KCAL_PER_KG = 7700;

export function targetRateKgPerWeek(goal, weightKg) {
  if (goal.type === 'lose') return -(goal.ratePctPerWeek / 100) * weightKg;
  if (goal.type === 'gain') return (goal.ratePctPerWeek / 100) * weightKg;
  return 0; // maintain, reverse
}

export function smoothTdee(prev, weekTdee, streakBefore) {
  if (prev == null || !Number.isFinite(prev)) return weekTdee;
  const alpha = streakBefore >= 3 ? 0.15 : 0.25; // long compliance → wider window
  return prev + alpha * (weekTdee - prev);
}

// Protein constant; carbs/fat scale pro-rata with the non-protein calories.
export function applyKcalChange(t, newKcal) {
  const restOld = t.kcal - t.proteinG * 4;
  const restNew = Math.max(0, newKcal - t.proteinG * 4);
  const s = restOld > 0 ? restNew / restOld : 0;
  return { kcal: newKcal, proteinG: t.proteinG, carbG: Math.round(t.carbG * s), fatG: Math.round(t.fatG * s) };
}

const fmtKg = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

export function runCheckin(i) {
  if (i.loggedDays < 4 || i.weighinCount < 3) {
    return {
      change: 'insufficient', newTargets: null, tdee: i.prevTdee ?? null, compliantStreak: 0,
      explanation: `Only ${i.loggedDays}/7 fully-logged days and ${i.weighinCount} weigh-ins (need 4 and 3). ` +
        `Not enough data to coach honestly — targets held; log more this week.`,
    };
  }
  const obs = i.trendEndKg - i.trendStartKg; // kg over the week
  const weekTdee = i.avgIntakeKcal - (obs * KCAL_PER_KG) / 7;
  const tdee = Math.round(smoothTdee(i.prevTdee, weekTdee, i.compliantStreak ?? 0));
  const streak = (i.compliantStreak ?? 0) + 1;
  const target = targetRateKgPerWeek(i.goal, i.weightKg);
  const nums = `Trend ${fmtKg(obs)} kg this week vs target ${fmtKg(target)}; ` +
    `average intake ${Math.round(i.avgIntakeKcal)} kcal/day; estimated TDEE ${tdee} kcal.`;

  const hold = (msg) =>
    ({ change: 'hold', newTargets: null, tdee, compliantStreak: streak, explanation: `${msg} ${nums}` });

  const adjust = (wantKcal, msg) => {
    const maxDelta = Math.min(150, 0.075 * i.targets.kcal);
    let k = Math.round(Math.min(Math.max(wantKcal, i.targets.kcal - maxDelta), i.targets.kcal + maxDelta));
    k = Math.max(k, kcalFloor(i.sex));
    if (k === i.targets.kcal) return hold(`${msg} The needed change rounds to zero — holding.`);
    return {
      change: 'adjust', newTargets: applyKcalChange(i.targets, k), tdee, compliantStreak: streak,
      explanation: `${msg} Calories ${k > i.targets.kcal ? 'up' : 'down'} ${Math.abs(k - i.targets.kcal)} ` +
        `to ${k} kcal/day (changes capped at ±${Math.round(maxDelta)}/week). ${nums}`,
    };
  };

  if (i.goal.type === 'reverse') {
    if (obs <= 0.001 * i.weightKg) return adjust(i.targets.kcal + 100, 'Reverse diet on track — nudging calories up.');
    return hold('Gaining faster than the reverse-diet tolerance — holding until the trend settles.');
  }
  if (i.goal.type === 'maintain') {
    const g = i.goal.goalWeightKg ?? i.weightKg;
    if (Math.abs(i.trendEndKg - g) <= 0.01 * g) return hold('Weight is inside the ±1% maintenance band.');
    const dir = g > i.trendEndKg ? 1 : -1; // 1 = need to gain back
    return adjust(tdee + (dir * 0.0025 * i.weightKg * KCAL_PER_KG) / 7,
      `Trend drifted ${dir > 0 ? 'below' : 'above'} the maintenance band — steering back.`);
  }
  // lose / gain
  const miss = obs - target;
  const inBand = (target !== 0 && Math.abs(miss) <= 0.2 * Math.abs(target)) || Math.abs(miss) < 0.001 * i.weightKg;
  if (inBand) return hold('On track — within the deadband.');
  return adjust(tdee + (target * KCAL_PER_KG) / 7, 'Off the target rate — adjusting toward it.');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/checkin.test.mjs` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add js/engine/checkin.js test/checkin.test.mjs
git commit -m "feat: weekly check-in decision engine"
```

---

### Task 6: Diet planner redistribution (`js/engine/planner.js`)

**Files:**
- Create: `js/engine/planner.js`
- Test: `test/planner.test.mjs`

**Interfaces:**
- Produces:
  - `defaultPlan(dailyKcal) → days[7]` of `{dow:0..6 (Mon=0), kcal, locked:false}`
  - `weeklyTotal(days) → kcal`
  - `editDay(days, idx, wantKcal, floorKcal) → {days, applied:boolean, message:''|string}` — weekly total invariant; locked days untouched; clamps at floors
  - `rescalePlan(days, newDailyKcal) → days` — proportional rescale, locks preserved
  - `dayMacros(dayKcal, targets) → {kcal, proteinG, carbG, fatG}` — protein constant, carbs/fat scaled
- Consumes: `targets` shape `{kcal, proteinG, carbG, fatG}` from Task 3.

- [ ] **Step 1: Write the failing test** — `test/planner.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlan, weeklyTotal, editDay, rescalePlan, dayMacros } from '../js/engine/planner.js';

test('default plan is 7 equal unlocked days', () => {
  const p = defaultPlan(2000);
  assert.equal(p.length, 7);
  assert.equal(weeklyTotal(p), 14000);
  assert.ok(p.every((d) => !d.locked));
});
test('raising one day lowers the others equally; total invariant', () => {
  const { days, applied } = editDay(defaultPlan(2000), 0, 2300, 1500);
  assert.equal(applied, true);
  assert.equal(days[0].kcal, 2300);
  for (let i = 1; i < 7; i++) assert.equal(days[i].kcal, 1950);
  assert.equal(weeklyTotal(days), 14000);
});
test('locked days never change', () => {
  const p = defaultPlan(2000);
  p[1].locked = true;
  const { days } = editDay(p, 0, 2300, 1500);
  assert.equal(days[1].kcal, 2000);
  for (let i = 2; i < 7; i++) assert.equal(days[i].kcal, 1940);
  assert.equal(days[0].kcal, 2300);
  assert.equal(weeklyTotal(days), 14000);
});
test('clamps when receivers hit the floor, and explains', () => {
  const p = defaultPlan(1210);
  const { days, message } = editDay(p, 0, 1710, 1200); // capacity = 6*10
  assert.equal(days[0].kcal, 1270);
  for (let i = 1; i < 7; i++) assert.equal(days[i].kcal, 1200);
  assert.equal(weeklyTotal(days), 7 * 1210);
  assert.match(message, /1200/);
});
test('refuses when everything else is locked', () => {
  const p = defaultPlan(2000);
  for (let i = 1; i < 7; i++) p[i].locked = true;
  const { applied, message } = editDay(p, 0, 2300, 1500);
  assert.equal(applied, false);
  assert.match(message, /locked/i);
});
test('refuses editing a locked day', () => {
  const p = defaultPlan(2000);
  p[0].locked = true;
  assert.equal(editDay(p, 0, 2300, 1500).applied, false);
});
test('lowering a day raises the others', () => {
  const { days } = editDay(defaultPlan(2000), 3, 1400, 1200);
  assert.equal(days[3].kcal, 1400);
  assert.equal(weeklyTotal(days), 14000);
});
test('rescale keeps proportions and locks, hits new weekly total', () => {
  let p = editDay(defaultPlan(2000), 0, 2300, 1500).days;
  p[0].locked = true;
  const r = rescalePlan(p, 2100);
  assert.equal(weeklyTotal(r), 14700);
  assert.equal(r[0].locked, true);
  assert.ok(r[0].kcal > r[1].kcal); // pattern survives
});
test('dayMacros holds protein constant and scales the rest', () => {
  const t = { kcal: 2000, proteinG: 150, carbG: 200, fatG: 62 };
  const m = dayMacros(2300, t);
  assert.equal(m.proteinG, 150);
  assert.ok(m.carbG > 200 && m.fatG > 62);
  const low = dayMacros(1700, t);
  assert.ok(low.carbG < 200 && low.fatG < 62);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/planner.test.mjs` — Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `js/engine/planner.js`:

```js
// High/low-day planner. Weekly total is invariant under edits. Pure.
export function defaultPlan(dailyKcal) {
  return Array.from({ length: 7 }, (_, dow) => ({ dow, kcal: dailyKcal, locked: false }));
}

export const weeklyTotal = (days) => days.reduce((s, d) => s + d.kcal, 0);

export function editDay(days, idx, wantKcal, floorKcal) {
  if (days[idx].locked) return { days, applied: false, message: 'That day is locked. Unlock it to edit.' };
  const out = days.map((d) => ({ ...d }));
  const receivers = out.filter((d, i) => i !== idx && !d.locked);
  if (!receivers.length) {
    return { days, applied: false, message: 'Every other day is locked — nowhere to redistribute.' };
  }
  const total = weeklyTotal(out);
  const target = Math.max(Math.round(wantKcal), floorKcal);
  let delta = target - out[idx].kcal; // receivers absorb -delta
  if (delta > 0) {
    const capacity = receivers.reduce((s, d) => s + Math.max(0, d.kcal - floorKcal), 0);
    if (delta > capacity) delta = capacity;
  }
  let rem = -delta;
  let pool = [...receivers];
  while (pool.length && Math.abs(rem) > 1e-9) {
    const share = rem / pool.length;
    const next = [];
    rem = 0;
    for (const d of pool) {
      const v = d.kcal + share;
      if (v < floorKcal) { rem += v - floorKcal; d.kcal = floorKcal; }
      else { d.kcal = v; next.push(d); }
    }
    pool = next;
  }
  for (const d of out) d.kcal = Math.round(d.kcal);
  out[idx].kcal = total - out.filter((_, i) => i !== idx).reduce((s, d) => s + d.kcal, 0);
  const message = out[idx].kcal === Math.round(wantKcal) ? '' :
    `Clamped to ${out[idx].kcal} kcal — no other day can go below ${floorKcal} kcal.`;
  return { days: out, applied: true, message };
}

// After a check-in changes the daily target: proportional rescale, locks preserved.
export function rescalePlan(days, newDailyKcal) {
  const f = (newDailyKcal * 7) / weeklyTotal(days);
  const out = days.map((d) => ({ ...d, kcal: Math.round(d.kcal * f) }));
  out[0].kcal += newDailyKcal * 7 - weeklyTotal(out); // absorb rounding drift
  return out;
}

// Protein constant every day; carbs/fat flex with the day's calories.
export function dayMacros(dayKcal, t) {
  const restT = t.kcal - t.proteinG * 4;
  const restD = dayKcal - t.proteinG * 4;
  const s = restT > 0 ? Math.max(0, restD) / restT : 0;
  return {
    kcal: dayKcal, proteinG: t.proteinG,
    carbG: Math.round(t.carbG * s), fatG: Math.round(t.fatG * s),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/planner.test.mjs` — Expected: all PASS. Then run the whole suite: `node --test test/` — all PASS.

- [ ] **Step 5: Commit**

```bash
git add js/engine/planner.js test/planner.test.mjs
git commit -m "feat: planner day redistribution with locks and floors"
```

---

### Task 7: IndexedDB layer + app shell (`js/db.js`, `js/app.js`, `index.html`, `css/app.css`)

No node tests (browser-only APIs); verified with a scripted browser smoke test. **Load the `frontend-design` skill before writing the CSS** — the palette below is the starting direction (deep slate surfaces, electric-lime accent, system font), refine it with taste, keep it dark/light aware.

**Files:**
- Create: `js/db.js`
- Modify: `index.html` (full shell), `css/app.css` (full styles)
- Create: `js/app.js`

**Interfaces:**
- Produces (`js/db.js`): `get(store, key)`, `getAll(store)`, `put(store, value, key?)`, `del(store, key)`, `exportAll()`, `importAll(data)`, `wipe()`. Stores: `settings`/`planner` (out-of-line key, always `'main'`), `targets` (keyPath `effectiveDate`), `weighins`/`logs`/`checkins` (keyPath `date`), `foods`/`recipes` (keyPath `id`, autoIncrement), `foodcache` (keyPath `id`).
- Produces (`js/app.js`): `navigate(viewId)`; each view module must export `mount(el, ctx)` with `ctx = {db, navigate, refresh}`.
- Views land in `js/views/{onboarding,log,coach,trends,plan,settings}.js` (later tasks). Until they exist, `navigate` shows a "coming soon" stub for missing modules.

- [ ] **Step 1: Write `js/db.js`**

```js
// Thin promise wrapper over IndexedDB. All app data lives here, on-device only.
const NAME = 'macrocoach', VERSION = 1;
const STORES = {
  settings: undefined, planner: undefined,                       // out-of-line key 'main'
  targets: { keyPath: 'effectiveDate' },
  weighins: { keyPath: 'date' }, logs: { keyPath: 'date' }, checkins: { keyPath: 'date' },
  foods: { keyPath: 'id', autoIncrement: true },
  recipes: { keyPath: 'id', autoIncrement: true },
  foodcache: { keyPath: 'id' },
};

let _db = null;
export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      for (const [n, opt] of Object.entries(STORES))
        if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, opt);
    };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const store = async (n, mode = 'readonly') => (await openDB()).transaction(n, mode).objectStore(n);

export const get = async (n, k) => req((await store(n)).get(k));
export const getAll = async (n) => req((await store(n)).getAll());
export const put = async (n, v, k) => req((await store(n, 'readwrite')).put(v, k));
export const del = async (n, k) => req((await store(n, 'readwrite')).delete(k));

export async function exportAll() {
  const out = { _app: 'macrocoach', _exportedAt: new Date().toISOString(), _dbVersion: VERSION };
  for (const n of Object.keys(STORES))
    out[n] = (n === 'settings' || n === 'planner') ? await get(n, 'main') : await getAll(n);
  return out;
}
export async function importAll(data) {
  if (data._app !== 'macrocoach') throw new Error('Not a MacroCoach backup file.');
  for (const n of Object.keys(STORES)) {
    if (data[n] == null) continue;
    if (n === 'settings' || n === 'planner') await put(n, data[n], 'main');
    else for (const v of data[n]) await put(n, v);
  }
}
export function wipe() {
  _db?.close(); _db = null;
  return new Promise((res, rej) => {
    const r = indexedDB.deleteDatabase(NAME);
    r.onsuccess = res; r.onerror = () => rej(r.error);
  });
}
```

- [ ] **Step 2: Write `js/app.js`**

```js
import * as db from './db.js';

const TABS = [['log', 'Log'], ['coach', 'Coach'], ['trends', 'Trends'], ['plan', 'Plan'], ['settings', 'Settings']];
let current = 'log';
const ctx = { db, navigate, refresh: () => navigate(current) };

export async function navigate(id) {
  current = id;
  document.querySelectorAll('#tabbar button')
    .forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  const main = document.getElementById('view');
  main.innerHTML = '';
  try {
    (await import(`./views/${id}.js`)).mount(main, ctx);
  } catch (e) {
    main.innerHTML = `<div class="card"><h2>${id}</h2><p>Coming soon.</p></div>`;
    console.error(e);
  }
}

async function boot() {
  navigator.storage?.persist?.();
  const tb = document.getElementById('tabbar');
  tb.innerHTML = TABS.map(([id, l]) => `<button data-id="${id}">${l}</button>`).join('');
  tb.onclick = (e) => { const b = e.target.closest('button'); if (b) navigate(b.dataset.id); };
  const settings = await db.get('settings', 'main');
  if (!settings) {
    document.body.classList.add('onboarding');
    (await import('./views/onboarding.js')).mount(document.getElementById('view'), ctx);
  } else navigate('log');
}
boot();
```

- [ ] **Step 3: Replace `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>MacroCoach</title>
<meta name="theme-color" content="#0e131a">
<link rel="stylesheet" href="css/app.css">
</head>
<body>
<main id="view"></main>
<nav id="tabbar" aria-label="Sections"></nav>
<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Replace `css/app.css`** (full app styles — every later view's classes are defined here once)

```css
:root {
  --bg: #0e131a; --surface: #171f29; --surface2: #202a37; --line: #2b3745;
  --text: #e8edf2; --muted: #8b98a5; --accent: #b8e62e; --accent-ink: #16200a;
  --danger: #ff6b5e; --ok: #4cd97b;
  --radius: 14px;
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f4f6f8; --surface: #ffffff; --surface2: #eef1f4; --line: #dde3e9;
    --text: #17202a; --muted: #5d6b78; --accent: #5a9e00; --accent-ink: #ffffff;
    color-scheme: light;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font: 16px/1.45 -apple-system, system-ui, 'Segoe UI', sans-serif;
  background: var(--bg); color: var(--text);
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
}
h1, h2, h3 { margin: 0 0 .5rem; letter-spacing: -0.01em; }
h1 { font-size: 1.5rem; } h2 { font-size: 1.15rem; } h3 { font-size: 1rem; }
#view { max-width: 480px; margin: 0 auto; padding: 16px 14px 24px; }

/* tab bar */
#tabbar {
  position: fixed; bottom: 0; left: 0; right: 0; display: flex; z-index: 20;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(12px); border-top: 1px solid var(--line);
  padding-bottom: env(safe-area-inset-bottom);
}
#tabbar button {
  flex: 1; padding: 12px 0 10px; background: none; border: 0;
  color: var(--muted); font: inherit; font-size: .8rem; font-weight: 600;
}
#tabbar button.active { color: var(--accent); }
body.onboarding #tabbar { display: none; }

/* cards & layout */
.card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 14px; margin-bottom: 12px;
}
.row { display: flex; gap: 10px; align-items: center; }
.row > * { flex: 1; }
.spread { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.muted { color: var(--muted); font-size: .85rem; }
.hint { color: var(--muted); font-size: .8rem; margin: .4rem 0 0; }
.msg { color: var(--danger); font-size: .85rem; margin: .4rem 0 0; }

/* forms */
label { display: block; font-size: .8rem; font-weight: 600; color: var(--muted); margin: 10px 0 4px; }
input, select, textarea {
  width: 100%; padding: 10px 12px; font: inherit; color: var(--text);
  background: var(--surface2); border: 1px solid var(--line); border-radius: 10px;
}
input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
button.primary {
  width: 100%; padding: 13px; margin-top: 14px; font: inherit; font-weight: 700;
  background: var(--accent); color: var(--accent-ink); border: 0; border-radius: 12px;
}
button.ghost {
  padding: 9px 13px; font: inherit; font-size: .85rem; font-weight: 600;
  background: var(--surface2); color: var(--text); border: 1px solid var(--line); border-radius: 10px;
}
button.danger { background: var(--danger); color: #fff; border: 0; }
button:active { transform: scale(.985); }

/* segmented choice */
.seg { display: flex; background: var(--surface2); border-radius: 10px; padding: 3px; gap: 3px; }
.seg button {
  flex: 1; border: 0; background: none; color: var(--muted); font: inherit;
  font-size: .85rem; font-weight: 600; padding: 8px 4px; border-radius: 8px;
}
.seg button.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgb(0 0 0 / .25); }

/* macro rings */
.rings { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.ring { text-align: center; }
.ring svg { width: 100%; max-width: 76px; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: var(--surface2); stroke-width: 7; }
.ring-fg { fill: none; stroke: var(--accent); stroke-width: 7; stroke-linecap: round; }
.ring-fg.over { stroke: var(--danger); }
.ring b { display: block; font-size: .95rem; margin-top: -4px; }
.ring span { font-size: .68rem; color: var(--muted); }

/* meals & entries */
.meal { margin-bottom: 10px; }
.entry { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; border-top: 1px solid var(--line); font-size: .9rem; }
.entry small { color: var(--muted); display: block; }
.entry .del { background: none; border: 0; color: var(--danger); font-size: 1rem; padding: 0 4px; }

/* bottom sheet */
.sheet-back { position: fixed; inset: 0; background: rgb(0 0 0 / .5); z-index: 30; }
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 31; max-height: 85vh; overflow-y: auto;
  background: var(--surface); border-radius: 18px 18px 0 0; padding: 16px 14px calc(20px + env(safe-area-inset-bottom));
  max-width: 480px; margin: 0 auto;
}
.result { display: flex; justify-content: space-between; gap: 8px; padding: 9px 0; border-top: 1px solid var(--line); font-size: .9rem; align-items: center; }
.result button { flex: none; }
.fav { background: none; border: 0; font-size: 1.05rem; color: var(--muted); }
.fav.on { color: var(--accent); }

/* planner */
.planday { display: grid; grid-template-columns: 44px 1fr 84px 40px; gap: 8px; align-items: center; padding: 6px 0; }
.planday input[type='number'] { text-align: right; }
.lock { background: none; border: 0; font-size: 1.1rem; opacity: .45; }
.lock.on { opacity: 1; }

/* charts */
.chart svg { width: 100%; height: auto; display: block; }
.chart-line { fill: none; stroke: var(--accent); stroke-width: 2; }
.chart-line2 { fill: none; stroke: var(--muted); stroke-width: 1.5; stroke-dasharray: 4 3; }
.chart-dot { fill: var(--muted); opacity: .55; }
.chart-grid { stroke: var(--line); stroke-width: 1; }
.chart-lbl { fill: var(--muted); font-size: 9px; font-family: inherit; }
.chart-bar { fill: var(--accent); opacity: .85; }
.chart-bar.over { fill: var(--danger); }

/* misc */
.banner { background: var(--accent); color: var(--accent-ink); border-radius: var(--radius); padding: 12px 14px; font-weight: 600; margin-bottom: 12px; }
.wizard .stepnum { color: var(--muted); font-size: .8rem; margin-bottom: 2px; }
.checkin-rec { border-top: 1px solid var(--line); padding: 10px 0; font-size: .9rem; }
video.scanner { width: 100%; border-radius: var(--radius); background: #000; aspect-ratio: 3/4; object-fit: cover; }
```

- [ ] **Step 5: Browser smoke test**

```bash
cd ~/dailydash && python3 -m http.server 8000 &
```

Open `http://localhost:8000/` with claude-in-chrome. Expected: onboarding stub errors to "Coming soon" is **not** shown — instead, since `views/onboarding.js` doesn't exist yet, the console shows an import error and the view stays blank. Verify instead: tab bar renders 5 tabs; in DevTools console run
`(await import('./js/db.js')).put('weighins', {date:'2026-07-06', weightKg: 82}) .then(()=>import('./js/db.js')).then(db=>db.get('weighins','2026-07-06')).then(console.log)`
Expected: the stored record logs. Also confirm `indexedDB` shows a `macrocoach` DB with 9 stores. Kill the server after.

- [ ] **Step 6: Commit**

```bash
git add js/db.js js/app.js index.html css/app.css
git commit -m "feat: IndexedDB layer, app shell, tab bar, full stylesheet"
```

---

### Task 8: Onboarding wizard (`js/views/onboarding.js`)

**Files:**
- Create: `js/views/onboarding.js`

**Interfaces:**
- Consumes: `prescribe`, `editMacro`, `ageFromBirthdate`, `ACTIVITY` (Task 3); `lbToKg`, `ftInToCm` (Task 2); `dstr` (Task 2); `ctx.db` (Task 7).
- Produces on finish: `settings` record `{sex, birthdate, heightCm, activityLevel, goal:{type, ratePctPerWeek, goalWeightKg?}, dietStyle, plantBased, units, checkInDay:0..6, usdaApiKey:'', onboardedAt}` at key `'main'`; first `targets` record `{...macros, tdee, effectiveDate: today, reason:'Initial prescription'}`; first `weighins` record. Then reloads the page.

- [ ] **Step 1: Write the view**

```js
import { prescribe, editMacro, ageFromBirthdate, ACTIVITY } from '../engine/prescribe.js';
import { lbToKg, ftInToCm } from '../units.js';
import { dstr } from '../util.js';

const s = {
  units: 'imperial', sex: 'm', birthdate: '1990-01-01', activity: 'moderate',
  heightCm: 175, weightKg: 80,
  goalType: 'lose', rate: 0.5, goalWeightKg: null,
  dietStyle: 'balanced', plantBased: false,
  targets: null,
};
const RATE_BOUNDS = { lose: [0.25, 1.25], gain: [0.125, 0.5] };
let step = 0, root, ctx;

export function mount(el, c) { root = el; ctx = c; render(); }

const seg = (name, opts, cur) =>
  `<div class="seg" data-seg="${name}">` +
  opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('') +
  `</div>`;

function render() {
  const steps = [profile, goal, style, review];
  root.innerHTML = `<div class="wizard"><p class="stepnum">Step ${step + 1} of 4</p>${steps[step]()}</div>`;
  wire();
}

function profile() {
  const imp = s.units === 'imperial';
  const { ft, in: inch } = imp ? cmFt(s.heightCm) : { ft: 0, in: 0 };
  return `<div class="card"><h1>Welcome to MacroCoach</h1>
  <label>Units</label>${seg('units', [['imperial', 'lb + ft/in'], ['metric', 'kg + cm']], s.units)}
  <label>Sex</label>${seg('sex', [['m', 'Male'], ['f', 'Female']], s.sex)}
  <label>Birthdate</label><input type="date" id="birth" value="${s.birthdate}">
  <label>Height</label>${imp
    ? `<div class="row"><input type="number" id="hft" value="${ft}" min="3" max="7"> <input type="number" id="hin" value="${inch}" min="0" max="11"></div><p class="hint">feet / inches</p>`
    : `<input type="number" id="hcm" value="${Math.round(s.heightCm)}" min="120" max="230"><p class="hint">cm</p>`}
  <label>Current weight (${imp ? 'lb' : 'kg'})</label>
  <input type="number" id="wt" step="0.1" value="${imp ? (s.weightKg / 0.45359237).toFixed(1) : s.weightKg}">
  <label>Activity (outside workouts)</label>
  <select id="act">${Object.keys(ACTIVITY).map((k) =>
    `<option value="${k}" ${k === s.activity ? 'selected' : ''}>${k}</option>`).join('')}</select>
  <button class="primary" data-next>Next</button></div>`;
}
function cmFt(cm) { const t = cm / 2.54; const ft = Math.floor(t / 12); return { ft, in: Math.round(t - ft * 12) }; }

function goal() {
  const b = RATE_BOUNDS[s.goalType];
  return `<div class="card"><h2>Your goal</h2>
  ${seg('goalType', [['lose', 'Lose'], ['maintain', 'Maintain'], ['gain', 'Gain'], ['reverse', 'Reverse']], s.goalType)}
  ${b ? `<label>Rate: <span id="ratev">${s.rate}</span> % of body weight / week</label>
    <input type="range" id="rate" min="${b[0]}" max="${b[1]}" step="0.125" value="${Math.min(Math.max(s.rate, b[0]), b[1])}">` : ''}
  ${s.goalType === 'maintain' ? `<label>Goal weight (${s.units === 'imperial' ? 'lb' : 'kg'}, optional)</label>
    <input type="number" id="gw" step="0.1" value="${s.goalWeightKg ? (s.units === 'imperial' ? (s.goalWeightKg / 0.45359237).toFixed(1) : s.goalWeightKg) : ''}">` : ''}
  ${s.goalType === 'reverse' ? `<p class="hint">Start at estimated maintenance; calories climb week by week while weight stays stable.</p>` : ''}
  <button class="primary" data-next>Next</button></div>`;
}

function style() {
  return `<div class="card"><h2>Diet style</h2>
  ${seg('dietStyle', [['balanced', 'Balanced'], ['lowfat', 'Low-fat'], ['lowcarb', 'Low-carb'], ['keto', 'Keto']], s.dietStyle)}
  <label><input type="checkbox" id="plant" ${s.plantBased ? 'checked' : ''} style="width:auto"> Plant-based (protein 1.8 g/kg)</label>
  <button class="primary" data-next>Next</button></div>`;
}

function review() {
  s.targets ??= computeTargets();
  const t = s.targets;
  return `<div class="card"><h2>Your daily targets</h2>
  <p class="muted">Tweak grams if you like — calories stay fixed; the other macros rebalance.</p>
  <div class="spread"><b>${t.kcal} kcal</b><span class="muted">est. TDEE ${t.tdee}</span></div>
  <label>Protein (g)</label><input type="number" id="mp" data-macro="proteinG" value="${t.proteinG}">
  <label>Carbs (g)</label><input type="number" id="mc" data-macro="carbG" value="${t.carbG}">
  <label>Fat (g)</label><input type="number" id="mf" data-macro="fatG" value="${t.fatG}">
  <label>Weekly check-in day</label>
  <select id="ciday">${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    .map((d, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>${d}</option>`).join('')}</select>
  <p class="msg" id="clampmsg" hidden>Adjusted to stay within safe ranges.</p>
  <button class="primary" data-finish>Start coaching</button></div>`;
}

function computeTargets() {
  return prescribe({
    sex: s.sex, weightKg: s.weightKg, heightCm: s.heightCm,
    age: ageFromBirthdate(s.birthdate, dstr()), activity: s.activity,
    goal: { type: s.goalType, ratePctPerWeek: s.goalType === 'lose' || s.goalType === 'gain' ? s.rate : 0 },
    dietStyle: s.dietStyle, plantBased: s.plantBased,
  });
}

function collect() {
  const v = (id) => root.querySelector('#' + id)?.value;
  if (step === 0) {
    s.birthdate = v('birth') || s.birthdate;
    s.activity = v('act');
    if (s.units === 'imperial') {
      s.heightCm = ftInToCm(+v('hft') || 5, +v('hin') || 8);
      s.weightKg = lbToKg(+v('wt') || 170);
    } else { s.heightCm = +v('hcm') || 175; s.weightKg = +v('wt') || 80; }
  }
  if (step === 1) {
    if (root.querySelector('#rate')) s.rate = +v('rate');
    const gw = v('gw');
    s.goalWeightKg = gw ? (s.units === 'imperial' ? lbToKg(+gw) : +gw) : null;
  }
  s.targets = null; // recompute on review
}

function wire() {
  root.querySelectorAll('[data-seg]').forEach((el) => {
    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      s[el.dataset.seg] = el.dataset.seg === 'plantBased' ? b.dataset.v === 'true' : b.dataset.v;
      collectSafe(); render();
    };
  });
  const rate = root.querySelector('#rate');
  if (rate) rate.oninput = () => { root.querySelector('#ratev').textContent = rate.value; };
  const plant = root.querySelector('#plant');
  if (plant) plant.onchange = () => { s.plantBased = plant.checked; s.targets = null; };
  root.querySelectorAll('[data-macro]').forEach((inp) => {
    inp.onchange = () => {
      const r = editMacro(s.targets, inp.dataset.macro, +inp.value, { weightKg: s.weightKg });
      s.targets = { ...r.targets, tdee: s.targets.tdee };
      root.querySelector('#clampmsg').hidden = !r.clamped;
      root.querySelector('#mp').value = s.targets.proteinG;
      root.querySelector('#mc').value = s.targets.carbG;
      root.querySelector('#mf').value = s.targets.fatG;
    };
  });
  const next = root.querySelector('[data-next]');
  if (next) next.onclick = () => { collect(); step += 1; render(); };
  const fin = root.querySelector('[data-finish]');
  if (fin) fin.onclick = finish;
}
function collectSafe() { try { collect(); } catch { /* mid-step segment click */ } }

async function finish() {
  const today = dstr();
  const ciday = +root.querySelector('#ciday').value;
  await ctx.db.put('settings', {
    sex: s.sex, birthdate: s.birthdate, heightCm: s.heightCm, activityLevel: s.activity,
    goal: { type: s.goalType, ratePctPerWeek: s.goalType === 'lose' || s.goalType === 'gain' ? s.rate : 0, goalWeightKg: s.goalWeightKg },
    dietStyle: s.dietStyle, plantBased: s.plantBased, units: s.units,
    checkInDay: ciday, usdaApiKey: '', onboardedAt: today,
  }, 'main');
  await ctx.db.put('targets', { ...s.targets, effectiveDate: today, reason: 'Initial prescription' });
  await ctx.db.put('weighins', { date: today, weightKg: s.weightKg });
  location.reload();
}
```

- [ ] **Step 2: Verify in browser**

Serve locally, open a fresh profile (or wipe: DevTools → Application → delete `macrocoach` DB). Walk all 4 steps: toggle units and confirm height/weight fields switch; pick lose 0.5%; on review, bump protein and watch carbs drop with calories fixed; finish. Expected: page reloads into the (stub) Log tab; DB contains `settings`, one `targets`, one `weighins`.

- [ ] **Step 3: Commit**

```bash
git add js/views/onboarding.js
git commit -m "feat: onboarding wizard with live macro editing"
```

---

### Task 9: Food data clients (`js/food/off.js`, `js/food/usda.js`)

**Files:**
- Create: `js/food/off.js`, `js/food/usda.js`
- Test: `test/food.test.mjs`

**Interfaces:**
- Produces a normalized **FoodResult** used by all logging code:
  `{id, source:'off'|'usda'|'custom'|'recipe', label, brand, barcode?, per100g:{kcal,p,c,f}, serving:{grams,label}|null}`
  - `off.js`: `normalizeProduct(p) → FoodResult|null` (pure), `searchFoods(q) → FoodResult[]`, `lookupBarcode(code) → FoodResult|null`
  - `usda.js`: `normalizeUsda(f) → FoodResult|null` (pure), `searchUsda(q, apiKey) → FoodResult[]`
- Consumes: nothing internal.

- [ ] **Step 1: Write the failing test** — `test/food.test.mjs` (normalizers only; fetch paths are browser-verified):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProduct } from '../js/food/off.js';
import { normalizeUsda } from '../js/food/usda.js';

test('OFF product normalizes to per-100g', () => {
  const r = normalizeProduct({
    code: '123', product_name: 'Peanut Butter', brands: 'Brand X',
    serving_quantity: 32, serving_size: '2 tbsp (32 g)',
    nutriments: { 'energy-kcal_100g': 588, proteins_100g: 25, carbohydrates_100g: 20, fat_100g: 50 },
  });
  assert.equal(r.id, 'off:123');
  assert.equal(r.source, 'off');
  assert.deepEqual(r.per100g, { kcal: 588, p: 25, c: 20, f: 50 });
  assert.equal(r.serving.grams, 32);
});
test('OFF product without nutrition data is dropped', () => {
  assert.equal(normalizeProduct({ code: '9', product_name: 'Mystery', nutriments: {} }), null);
});
test('USDA food normalizes via nutrient ids', () => {
  const r = normalizeUsda({
    fdcId: 456, description: 'Banana, raw', brandOwner: '',
    foodNutrients: [
      { nutrientId: 1008, value: 89 }, { nutrientId: 1003, value: 1.1 },
      { nutrientId: 1005, value: 22.8 }, { nutrientId: 1004, value: 0.3 },
    ],
  });
  assert.equal(r.id, 'usda:456');
  assert.deepEqual(r.per100g, { kcal: 89, p: 1.1, c: 22.8, f: 0.3 });
});
test('USDA food without calories is dropped', () => {
  assert.equal(normalizeUsda({ fdcId: 1, description: 'x', foodNutrients: [] }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/food.test.mjs` — Expected: FAIL (module not found).

- [ ] **Step 3: Write implementations**

`js/food/off.js`:

```js
// Open Food Facts client. normalizeProduct is pure; fetchers are browser-only.
const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';

export function normalizeProduct(p) {
  const n = p?.nutriments || {};
  const kcal = +n['energy-kcal_100g'];
  if (!Number.isFinite(kcal)) return null;
  return {
    id: 'off:' + p.code, source: 'off',
    label: p.product_name || 'Unnamed product', brand: p.brands || '', barcode: p.code,
    per100g: { kcal, p: +n.proteins_100g || 0, c: +n.carbohydrates_100g || 0, f: +n.fat_100g || 0 },
    serving: +p.serving_quantity > 0
      ? { grams: +p.serving_quantity, label: p.serving_size || `${p.serving_quantity} g` } : null,
  };
}

export async function searchFoods(q) {
  const u = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Open Food Facts error ${r.status}`);
  return ((await r.json()).products || []).map(normalizeProduct).filter(Boolean);
}

export async function lookupBarcode(code) {
  const r = await fetch(`${BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.status === 1 ? normalizeProduct(d.product) : null;
}
```

`js/food/usda.js`:

```js
// USDA FoodData Central client — only used when the user supplies an API key.
const NUTRIENT = { kcal: 1008, p: 1003, c: 1005, f: 1004 };

export function normalizeUsda(f) {
  const by = {};
  for (const n of f?.foodNutrients || []) by[n.nutrientId] = n.value;
  const kcal = by[NUTRIENT.kcal];
  if (!Number.isFinite(kcal)) return null;
  return {
    id: 'usda:' + f.fdcId, source: 'usda',
    label: f.description || 'Unnamed food', brand: f.brandOwner || '',
    per100g: { kcal, p: by[NUTRIENT.p] || 0, c: by[NUTRIENT.c] || 0, f: by[NUTRIENT.f] || 0 },
    serving: null, // FDC search results are per-100g
  };
}

export async function searchUsda(q, apiKey) {
  if (!apiKey) return [];
  const u = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}` +
    `&query=${encodeURIComponent(q)}&pageSize=15&dataType=Foundation,SR%20Legacy,Branded`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`USDA error ${r.status}`);
  return ((await r.json()).foods || []).map(normalizeUsda).filter(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/` — Expected: all PASS.

- [ ] **Step 5: Live API spot-check (browser console, local server running)**

`(await import('./js/food/off.js')).searchFoods('greek yogurt').then(console.log)` — Expected: array of FoodResults with sane kcal values.

- [ ] **Step 6: Commit**

```bash
git add js/food/off.js js/food/usda.js test/food.test.mjs
git commit -m "feat: Open Food Facts and USDA clients with pure normalizers"
```

---

### Task 10: Log view (`js/views/log.js`)

The largest view: date switcher, weigh-in entry, macro rings, meals, and the add-food sheet (search / recents+favorites / custom foods / recipes / quick add), plus copy-yesterday and the "day complete" toggle.

**Files:**
- Create: `js/views/log.js`

**Interfaces:**
- Consumes: FoodResult shape (Task 9), `dayMacros` (Task 6), `db` stores (Task 7), `dstr/addDays/dowMon` (Task 2), `fmtWeight/lbToKg/kgToLb` (Task 2).
- Produces:
  - `logs` records `{date, complete:boolean, meals:[{name, entries:[Entry]}]}` with `Entry = {label, brand, foodId?, qty, unit:'g'|'serving'|'x', grams?, kcal, p, c, f}`
  - `foodcache` records: FoodResult + `{lastUsed:epochMs, fav:boolean}`
  - `foods` records: FoodResult (`source:'custom'`, id auto) ; `recipes` records `{id, name, servings, ingredients:[{label, grams, per100g}], perServing:{kcal,p,c,f}}`
  - Exports `latestTargets(allTargets)` and `dayTargetFor(db, dateStr)` reused by Coach/Trends/Plan views.

- [ ] **Step 1: Write the view** — `js/views/log.js`:

```js
import { dstr, addDays, dowMon } from '../util.js';
import { fmtWeight, lbToKg } from '../units.js';
import { dayMacros } from '../engine/planner.js';
import { searchFoods } from '../food/off.js';
import { searchUsda } from '../food/usda.js';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
let date = dstr(), root, ctx, settings, sheet = null; // sheet = {meal, tab, q, results, picked, recipeDraft}

export function latestTargets(all) {
  return [...all].sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))[0];
}
export async function dayTargetFor(db, d) {
  const t = latestTargets(await db.getAll('targets'));
  const plan = await db.get('planner', 'main');
  return plan?.enabled ? dayMacros(plan.days[dowMon(d)].kcal, t) : t;
}

export async function mount(el, c) { root = el; ctx = c; settings = await c.db.get('settings', 'main'); render(); }

const blankLog = () => ({ date, complete: false, meals: MEALS.map((name) => ({ name, entries: [] })) });
const totals = (log) => log.meals.flatMap((m) => m.entries)
  .reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f }),
    { kcal: 0, p: 0, c: 0, f: 0 });

function ring(label, used, total) {
  const pct = total ? used / total : 0, r = 26, c = 2 * Math.PI * r;
  return `<div class="ring"><svg viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="${r}" class="ring-bg"/>
    <circle cx="32" cy="32" r="${r}" class="ring-fg ${pct > 1 ? 'over' : ''}"
      stroke-dasharray="${(Math.min(pct, 1) * c).toFixed(1)} ${c.toFixed(1)}"/></svg>
    <b>${Math.round(total - used)}</b><span>${label} left</span></div>`;
}

async function render() {
  const log = (await ctx.db.get('logs', date)) ?? blankLog();
  const target = await dayTargetFor(ctx.db, date);
  const weighin = await ctx.db.get('weighins', date);
  const t = totals(log);
  root.innerHTML = `
  <div class="spread">
    <button class="ghost" data-nav="-1">‹</button>
    <h2>${date === dstr() ? 'Today' : date}</h2>
    <button class="ghost" data-nav="1">›</button>
  </div>
  <div class="card"><div class="row">
    <input type="number" step="0.1" id="wt" placeholder="Weigh-in (${settings.units === 'imperial' ? 'lb' : 'kg'})"
      value="${weighin ? (settings.units === 'imperial' ? (weighin.weightKg / 0.45359237).toFixed(1) : weighin.weightKg) : ''}">
    <button class="ghost" id="savewt" style="flex:none">Save</button>
  </div></div>
  <div class="card"><div class="rings">
    ${ring('kcal', t.kcal, target.kcal)}${ring('protein', t.p, target.proteinG)}
    ${ring('carbs', t.c, target.carbG)}${ring('fat', t.f, target.fatG)}
  </div><p class="hint">Target today: ${target.kcal} kcal · P ${target.proteinG} · C ${target.carbG} · F ${target.fatG}</p></div>
  ${log.meals.map((m, mi) => `<div class="card meal"><div class="spread"><h3>${m.name}</h3>
    <button class="ghost" data-add="${mi}">+ Add</button></div>
    ${m.entries.map((e, ei) => `<div class="entry"><div>${e.label}
      <small>${e.unit === 'x' ? 'quick add' : e.unit === 'serving' ? `${e.qty} serving` : `${e.grams} g`} · P ${e.p} C ${e.c} F ${e.f}</small></div>
      <div style="flex:none">${e.kcal} <button class="del" data-del="${mi}:${ei}">×</button></div></div>`).join('')}
  </div>`).join('')}
  <div class="row">
    <button class="ghost" id="copy">Copy yesterday</button>
    <button class="ghost" id="complete">${log.complete ? '✓ Day complete' : 'Mark day complete'}</button>
  </div>
  <p class="hint">Days marked complete count toward your weekly check-in.</p>
  <div id="sheetroot"></div>`;
  wire(log);
  if (sheet) renderSheet(log);
}

function wire(log) {
  root.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => { date = addDays(date, +b.dataset.nav); sheet = null; render(); }));
  root.querySelector('#savewt').onclick = async () => {
    const v = +root.querySelector('#wt').value;
    if (!v) return;
    const kg = settings.units === 'imperial' ? lbToKg(v) : v;
    await ctx.db.put('weighins', { date, weightKg: +kg.toFixed(2) });
    render();
  };
  root.querySelector('#complete').onclick = async () => { log.complete = !log.complete; await save(log); };
  root.querySelector('#copy').onclick = async () => {
    const prev = await ctx.db.get('logs', addDays(date, -1));
    if (!prev) return alert('Nothing logged yesterday.');
    log.meals = structuredClone(prev.meals);
    await save(log);
  };
  root.querySelectorAll('[data-add]').forEach((b) =>
    (b.onclick = () => { sheet = { meal: +b.dataset.add, tab: 'search', q: '', results: [], picked: null, recipeDraft: null }; render(); }));
  root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    const [mi, ei] = b.dataset.del.split(':').map(Number);
    log.meals[mi].entries.splice(ei, 1);
    await save(log);
  }));
}

async function save(log) { await ctx.db.put('logs', log); render(); }

/* ---------- add-food sheet ---------- */

const entryFromFood = (food, qty, unit) => {
  const grams = unit === 'serving' ? qty * (food.serving?.grams || 100) : qty;
  const s = grams / 100, f = food.per100g;
  return {
    label: food.label, brand: food.brand || '', foodId: food.id, qty, unit, grams: Math.round(grams),
    kcal: Math.round(f.kcal * s), p: +(f.p * s).toFixed(1), c: +(f.c * s).toFixed(1), f: +(f.f * s).toFixed(1),
  };
};

async function addEntry(entry) {
  const log = (await ctx.db.get('logs', date)) ?? blankLog();
  log.meals[sheet.meal].entries.push(entry);
  await ctx.db.put('logs', log);
  sheet = null;
  render();
}

async function cacheFood(food) {
  const prev = await ctx.db.get('foodcache', food.id);
  await ctx.db.put('foodcache', { ...food, fav: prev?.fav || false, lastUsed: Date.now() });
}

function resultRow(f, i, favs = {}) {
  const per = f.serving ? `${Math.round(f.per100g.kcal * f.serving.grams / 100)} kcal/serving` : `${Math.round(f.per100g.kcal)} kcal/100g`;
  return `<div class="result"><div>${f.label}<small class="muted"> ${f.brand}</small><br><small class="muted">${per}</small></div>
    <button class="fav ${favs[f.id] ? 'on' : ''}" data-fav="${i}">★</button>
    <button class="ghost" data-pick="${i}">Add</button></div>`;
}

function portionForm(f) {
  const hasServing = !!f.serving;
  return `<div class="card"><b>${f.label}</b>
    <div class="row" style="margin-top:8px">
      <input type="number" id="pqty" step="0.1" value="${hasServing ? 1 : 100}">
      <select id="punit">${hasServing ? `<option value="serving">serving (${f.serving.grams} g)</option>` : ''}
        <option value="g" ${hasServing ? '' : 'selected'}>grams</option></select>
      <button class="ghost" id="paddconfirm" style="flex:none">Add</button>
    </div></div>`;
}

async function renderSheet() {
  const el = root.querySelector('#sheetroot');
  const favsList = sheet.tab === 'recent' ? await ctx.db.getAll('foodcache') : [];
  const customs = sheet.tab === 'custom' ? await ctx.db.getAll('foods') : [];
  const recipes = sheet.tab === 'recipe' ? await ctx.db.getAll('recipes') : [];
  const favs = Object.fromEntries((sheet.results || []).map((f) => [f.id, false]));
  for (const c of await ctx.db.getAll('foodcache')) if (c.fav) favs[c.id] = true;

  const tabs = [['search', 'Search'], ['recent', 'Recent'], ['custom', 'Custom'], ['recipe', 'Recipes'], ['quick', 'Quick']];
  let body = '';
  if (sheet.picked) body = portionForm(sheet.picked);
  else if (sheet.tab === 'search') {
    body = `<div class="row"><input id="q" placeholder="Search foods…" value="${sheet.q}">
      <button class="ghost" id="go" style="flex:none">Search</button>
      <button class="ghost" id="scan" style="flex:none">📷</button></div>
      <div id="scanbox"></div>
      ${sheet.busy ? '<p class="muted">Searching…</p>' : ''}
      ${(sheet.results || []).map((f, i) => resultRow(f, i, favs)).join('')}`;
  } else if (sheet.tab === 'recent') {
    const rec = favsList.sort((a, b) => (b.fav - a.fav) || (b.lastUsed - a.lastUsed)).slice(0, 30);
    sheet.results = rec;
    body = rec.length ? rec.map((f, i) => resultRow(f, i, favs)).join('') : '<p class="muted">Foods you log will appear here.</p>';
  } else if (sheet.tab === 'custom') {
    sheet.results = customs.map((f) => ({ ...f, id: 'custom:' + f.id }));
    body = `${sheet.results.map((f, i) => resultRow(f, i, favs)).join('')}
      <h3 style="margin-top:12px">New custom food (per 100 g)</h3>
      <input id="cname" placeholder="Name">
      <div class="row"><input id="ck" type="number" placeholder="kcal"><input id="cp" type="number" placeholder="protein"></div>
      <div class="row"><input id="cc" type="number" placeholder="carbs"><input id="cf" type="number" placeholder="fat"></div>
      <input id="cserv" type="number" placeholder="serving size in g (optional)">
      <button class="ghost" id="csave" style="margin-top:8px">Save food</button>`;
  } else if (sheet.tab === 'recipe') {
    body = renderRecipeTab(recipes);
  } else { // quick
    body = `<h3>Quick add</h3><input id="qlabel" placeholder="Label (optional)">
      <div class="row"><input id="qk" type="number" placeholder="kcal"><input id="qp" type="number" placeholder="protein g"></div>
      <div class="row"><input id="qc" type="number" placeholder="carbs g"><input id="qf" type="number" placeholder="fat g"></div>
      <button class="ghost" id="qadd" style="margin-top:8px">Add</button>`;
  }

  el.innerHTML = `<div class="sheet-back" id="back"></div><div class="sheet">
    <div class="spread"><h2>Add to ${MEALS[sheet.meal]}</h2><button class="ghost" id="close">Close</button></div>
    <div class="seg" style="margin:8px 0">${tabs.map(([id, l]) =>
      `<button data-tab="${id}" class="${sheet.tab === id ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${body}</div>`;
  wireSheet(el);
}

function wireSheet(el) {
  const q = (sel) => el.querySelector(sel);
  q('#back').onclick = q('#close').onclick = () => { sheet = null; render(); };
  el.querySelectorAll('[data-tab]').forEach((b) =>
    (b.onclick = () => { sheet.tab = b.dataset.tab; sheet.picked = null; sheet.results = []; renderSheet(); }));
  el.querySelectorAll('[data-pick]').forEach((b) =>
    (b.onclick = () => { sheet.picked = sheet.results[+b.dataset.pick]; renderSheet(); }));
  el.querySelectorAll('[data-fav]').forEach((b) => (b.onclick = async () => {
    const f = sheet.results[+b.dataset.fav];
    const prev = await ctx.db.get('foodcache', f.id);
    await ctx.db.put('foodcache', { ...f, fav: !(prev?.fav), lastUsed: prev?.lastUsed || Date.now() });
    renderSheet();
  }));
  const go = q('#go');
  if (go) {
    const run = async () => {
      sheet.q = q('#q').value.trim();
      if (!sheet.q) return;
      sheet.busy = true; renderSheet();
      try {
        const [off, usda] = await Promise.all([
          searchFoods(sheet.q).catch(() => []),
          searchUsda(sheet.q, settings.usdaApiKey).catch(() => []),
        ]);
        sheet.results = [...off, ...usda];
      } finally { sheet.busy = false; renderSheet(); }
    };
    go.onclick = run;
    q('#q').onkeydown = (e) => { if (e.key === 'Enter') run(); };
    q('#q').focus();
  }
  const scan = q('#scan');
  if (scan) scan.onclick = () => startBarcodeScan(el); // wired for real in Task 11
  const confirm = q('#paddconfirm');
  if (confirm) confirm.onclick = async () => {
    const f = sheet.picked;
    await cacheFood(f);
    await addEntry(entryFromFood(f, +q('#pqty').value || 1, q('#punit').value));
  };
  const csave = q('#csave');
  if (csave) csave.onclick = async () => {
    const name = q('#cname').value.trim();
    if (!name) return;
    const servG = +q('#cserv').value;
    await ctx.db.put('foods', {
      source: 'custom', label: name, brand: '',
      per100g: { kcal: +q('#ck').value || 0, p: +q('#cp').value || 0, c: +q('#cc').value || 0, f: +q('#cf').value || 0 },
      serving: servG > 0 ? { grams: servG, label: `${servG} g` } : null,
    });
    renderSheet();
  };
  const qadd = q('#qadd');
  if (qadd) qadd.onclick = () => addEntry({
    label: q('#qlabel').value.trim() || 'Quick add', brand: '', qty: 1, unit: 'x',
    kcal: +q('#qk').value || 0, p: +q('#qp').value || 0, c: +q('#qc').value || 0, f: +q('#qf').value || 0,
  });
  wireRecipeTab(el);
}

/* ---------- recipes ---------- */

function renderRecipeTab(recipes) {
  const d = sheet.recipeDraft;
  if (!d) {
    return `${recipes.map((r) => `<div class="result"><div>${r.name}
        <small class="muted">${Math.round(r.perServing.kcal)} kcal/serving · makes ${r.servings}</small></div>
        <button class="ghost" data-recadd="${r.id}">Add</button></div>`).join('')
      || '<p class="muted">No recipes yet.</p>'}
      <button class="ghost" id="recnew" style="margin-top:10px">+ New recipe</button>`;
  }
  return `<h3>New recipe</h3>
    <input id="rname" placeholder="Recipe name" value="${d.name}">
    <label>Servings it makes</label><input id="rserv" type="number" value="${d.servings}">
    <div class="row" style="margin-top:8px"><input id="rq" placeholder="Search ingredient…">
      <button class="ghost" id="rgo" style="flex:none">Search</button></div>
    ${(d.results || []).map((f, i) => `<div class="result"><div>${f.label}<small class="muted"> ${Math.round(f.per100g.kcal)} kcal/100g</small></div>
      <input type="number" placeholder="g" data-ring-g="${i}" style="width:70px;flex:none">
      <button class="ghost" data-ringadd="${i}">Add</button></div>`).join('')}
    ${d.ingredients.length ? `<h3 style="margin-top:10px">Ingredients</h3>` : ''}
    ${d.ingredients.map((ing, i) => `<div class="entry"><div>${ing.label} <small>${ing.grams} g</small></div>
      <button class="del" data-ringdel="${i}">×</button></div>`).join('')}
    <button class="ghost" id="rsave" style="margin-top:10px">Save recipe</button>`;
}

function wireRecipeTab(el) {
  const q = (sel) => el.querySelector(sel);
  const recnew = q('#recnew');
  if (recnew) recnew.onclick = () => { sheet.recipeDraft = { name: '', servings: 4, results: [], ingredients: [] }; renderSheet(); };
  el.querySelectorAll('[data-recadd]').forEach((b) => (b.onclick = async () => {
    const r = await ctx.db.get('recipes', +b.dataset.recadd);
    const qty = +prompt(`How many servings of ${r.name}?`, '1') || 0;
    if (!qty) return;
    await addEntry({
      label: r.name, brand: 'recipe', foodId: 'recipe:' + r.id, qty, unit: 'serving',
      kcal: Math.round(r.perServing.kcal * qty), p: +(r.perServing.p * qty).toFixed(1),
      c: +(r.perServing.c * qty).toFixed(1), f: +(r.perServing.f * qty).toFixed(1),
    });
  }));
  const d = sheet.recipeDraft;
  if (!d) return;
  const keep = () => { d.name = q('#rname').value; d.servings = +q('#rserv').value || 1; };
  const rgo = q('#rgo');
  if (rgo) rgo.onclick = async () => { keep(); d.results = await searchFoods(q('#rq').value.trim()).catch(() => []); renderSheet(); };
  el.querySelectorAll('[data-ringadd]').forEach((b) => (b.onclick = () => {
    keep();
    const i = +b.dataset.ringadd;
    const grams = +el.querySelector(`[data-ring-g="${i}"]`).value;
    if (!grams) return;
    const f = d.results[i];
    d.ingredients.push({ label: f.label, grams, per100g: f.per100g });
    renderSheet();
  }));
  el.querySelectorAll('[data-ringdel]').forEach((b) => (b.onclick = () => { keep(); d.ingredients.splice(+b.dataset.ringdel, 1); renderSheet(); }));
  const rsave = q('#rsave');
  if (rsave) rsave.onclick = async () => {
    keep();
    if (!d.name || !d.ingredients.length) return;
    const tot = d.ingredients.reduce((a, ing) => {
      const s = ing.grams / 100;
      return { kcal: a.kcal + ing.per100g.kcal * s, p: a.p + ing.per100g.p * s, c: a.c + ing.per100g.c * s, f: a.f + ing.per100g.f * s };
    }, { kcal: 0, p: 0, c: 0, f: 0 });
    const n = d.servings || 1;
    await ctx.db.put('recipes', {
      name: d.name, servings: n, ingredients: d.ingredients,
      perServing: { kcal: tot.kcal / n, p: tot.p / n, c: tot.c / n, f: tot.f / n },
    });
    sheet.recipeDraft = null;
    renderSheet();
  };
}

/* Barcode: stub until Task 11 replaces it. */
function startBarcodeScan() { alert('Barcode scanning lands in the next update.'); }
export { startBarcodeScan as _scanStub };
```

- [ ] **Step 2: Verify in browser (scripted walkthrough)**

Local server + claude-in-chrome, onboarded profile:
1. Log tab shows 4 rings and 4 meals; target line matches onboarding targets.
2. Add via Search: "greek yogurt" → results appear → Add → portion form → confirm. Ring numbers drop.
3. Entry delete (×) restores numbers.
4. Recent tab now shows the yogurt; star it; it pins to top.
5. Custom: create "My Shake" 400 kcal/40p/30c/10f per 100 g with 300 g serving; add 1 serving.
6. Recipes: build a 2-ingredient recipe, save, add 1 serving; kcal ≈ sum/servings.
7. Quick add 200 kcal.
8. Weigh-in save; navigate ‹ › across days; Copy yesterday onto tomorrow; Mark day complete toggles.

- [ ] **Step 3: Commit**

```bash
git add js/views/log.js
git commit -m "feat: log view with food search, recents, customs, recipes, quick add"
```

---

### Task 11: Barcode scanning (`vendor/zxing.min.js`, `js/food/barcode.js`)

**Files:**
- Create: `vendor/zxing.min.js` (vendored), `js/food/barcode.js`
- Modify: `index.html` (script tag), `js/views/log.js` (replace scan stub)

**Interfaces:**
- Produces: `startScan(videoEl, onCode)` / `stopScan()` from `js/food/barcode.js`; global `ZXing` from the vendored UMD build.
- Consumes: `lookupBarcode` (Task 9).

- [ ] **Step 1: Vendor ZXing**

```bash
curl -sL https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js -o vendor/zxing.min.js
head -c 200 vendor/zxing.min.js   # sanity: minified JS, not an error page
```

Add to `index.html` before the module script: `<script src="vendor/zxing.min.js" defer></script>`

- [ ] **Step 2: Write `js/food/barcode.js`**

```js
// Camera barcode scanning via vendored ZXing UMD (global ZXing).
let reader = null;

export async function startScan(video, onCode) {
  if (!window.ZXing) throw new Error('Scanner library not loaded.');
  reader = new ZXing.BrowserMultiFormatReader();
  const devices = await reader.listVideoInputDevices();
  const back = devices.find((d) => /back|rear|environment/i.test(d.label)) || devices.at(-1);
  await reader.decodeFromVideoDevice(back?.deviceId ?? null, video, (result) => {
    if (result) onCode(result.getText());
  });
}

export function stopScan() { reader?.reset(); reader = null; }
```

- [ ] **Step 3: Replace the stub in `js/views/log.js`**

Add imports at the top:

```js
import { lookupBarcode } from '../food/off.js';
import { startScan, stopScan } from '../food/barcode.js';
```

Replace the `startBarcodeScan` stub function (and its export line) with:

```js
async function startBarcodeScan(el) {
  const box = el.querySelector('#scanbox');
  box.innerHTML = `<video class="scanner" playsinline muted></video>
    <button class="ghost" id="scanstop" style="margin-top:6px">Stop</button>
    <p class="muted" id="scanmsg">Point the camera at a barcode…</p>`;
  const video = box.querySelector('video');
  el.querySelector('#scanstop').onclick = () => { stopScan(); box.innerHTML = ''; };
  try {
    await startScan(video, async (code) => {
      stopScan();
      box.querySelector('#scanmsg').textContent = `Looking up ${code}…`;
      const food = await lookupBarcode(code);
      if (!food) { box.querySelector('#scanmsg').textContent = `No product found for ${code}.`; return; }
      sheet.picked = food;
      renderSheet();
    });
  } catch (e) {
    box.innerHTML = `<p class="msg">Camera unavailable: ${e.message}</p>`;
  }
}
```

- [ ] **Step 4: Verify**

`node --test test/` still passes (no engine changes). In the browser (localhost is a secure context): open Add → 📷 → camera permission prompt appears, video renders; Stop tears it down. Full scan-to-food is confirmed on the iPhone after deploy (Task 16).

- [ ] **Step 5: Commit**

```bash
git add vendor/zxing.min.js js/food/barcode.js js/views/log.js index.html
git commit -m "feat: camera barcode scanning via vendored ZXing"
```

---

### Task 12: Coach view (`js/views/coach.js`)

**Files:**
- Create: `js/views/coach.js`

**Interfaces:**
- Consumes: `runCheckin` (Task 5), `computeTrend` (Task 4), `rescalePlan` (Task 6), `latestTargets` (Task 10), db stores.
- Produces: `checkins` records `{date, inputs, change, explanation, tdee, compliantStreak, oldTargets, newTargets|null}`; on accepted adjustments, a new `targets` record and a rescaled `planner`.

- [ ] **Step 1: Write the view** — `js/views/coach.js`:

```js
import { dstr, addDays, dowMon } from '../util.js';
import { computeTrend } from '../engine/trend.js';
import { runCheckin } from '../engine/checkin.js';
import { rescalePlan } from '../engine/planner.js';
import { latestTargets } from './log.js';

let root, ctx, preview = null;

export async function mount(el, c) { root = el; ctx = c; preview = null; render(); }

const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

async function gather() {
  const [settings, allTargets, weighins, logs, checkins] = await Promise.all([
    ctx.db.get('settings', 'main'), ctx.db.getAll('targets'),
    ctx.db.getAll('weighins'), ctx.db.getAll('logs'), ctx.db.getAll('checkins'),
  ]);
  checkins.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { settings, targets: latestTargets(allTargets), weighins, logs, checkins };
}

function isDue(settings, checkins, today) {
  const last = checkins[0]?.date ?? settings.onboardedAt;
  const since = daysBetween(last, today);
  return since >= 8 || (dowMon(today) === settings.checkInDay && since >= 6);
}

function buildInputs({ settings, targets, weighins, logs, checkins }, today) {
  const start = addDays(today, -6);
  const trend = computeTrend(weighins);
  const inWin = (d) => d >= start && d <= today;
  const winTrend = trend.filter((t) => inWin(t.date));
  const before = trend.filter((t) => t.date < start);
  const trendStartKg = before.length ? before.at(-1).trendKg : winTrend[0]?.trendKg ?? 0;
  const trendEndKg = winTrend.at(-1)?.trendKg ?? trendStartKg;
  const dayKcal = (log) => log.meals.flatMap((m) => m.entries).reduce((s, e) => s + e.kcal, 0);
  const complete = logs.filter((l) => inWin(l.date) && l.complete && dayKcal(l) > 0);
  const avgIntakeKcal = complete.length ? complete.reduce((s, l) => s + dayKcal(l), 0) / complete.length : 0;
  const last = checkins[0];
  return {
    goal: settings.goal, sex: settings.sex, targets,
    weightKg: trend.at(-1)?.weightKg ?? 0,
    trendStartKg, trendEndKg, avgIntakeKcal,
    loggedDays: complete.length, weighinCount: winTrend.length,
    prevTdee: last?.tdee ?? null, compliantStreak: last?.compliantStreak ?? 0,
  };
}

async function render() {
  const data = await gather();
  const { settings, targets, checkins } = data;
  const today = dstr();
  const due = isDue(settings, checkins, today) && checkins[0]?.date !== today;
  root.innerHTML = `
  ${due ? `<div class="banner spread">Check-in is due<button class="ghost" id="run">Run check-in</button></div>` : ''}
  <div class="card"><h2>Current prescription</h2>
    <div class="spread"><b style="font-size:1.6rem">${targets.kcal} kcal</b>
      <span class="muted">since ${targets.effectiveDate}</span></div>
    <p>P ${targets.proteinG} g · C ${targets.carbG} g · F ${targets.fatG} g</p>
    <p class="muted">${targets.reason ?? ''}</p>
    <p class="muted">Estimated TDEE: ${checkins[0]?.tdee ?? targets.tdee ?? '—'} kcal
      ${checkins[0] ? '(learned from your data)' : '(formula estimate)'}</p>
  </div>
  <div id="flow"></div>
  <div class="card"><h2>Check-in history</h2>
    ${checkins.map((r) => `<div class="checkin-rec"><div class="spread"><b>${r.date}</b>
      <span class="muted">${r.change}${r.newTargets ? ` → ${r.newTargets.kcal} kcal` : ''}</span></div>
      <p class="muted">${r.explanation}</p></div>`).join('') || '<p class="muted">No check-ins yet.</p>'}
  </div>`;
  const run = root.querySelector('#run');
  if (run) run.onclick = async () => {
    const inputs = buildInputs(data, today);
    preview = { date: today, inputs, result: runCheckin(inputs) };
    renderFlow(data);
  };
  if (preview) renderFlow(data);
}

function renderFlow(data) {
  const el = root.querySelector('#flow');
  const { result } = preview;
  el.innerHTML = `<div class="card"><h2>This week's check-in</h2>
    <p>${result.explanation}</p>
    ${result.newTargets ? `<p><b>New targets:</b> ${result.newTargets.kcal} kcal ·
      P ${result.newTargets.proteinG} · C ${result.newTargets.carbG} · F ${result.newTargets.fatG}</p>` : ''}
    <button class="primary" id="accept">${result.change === 'adjust' ? 'Apply new targets' : 'Record check-in'}</button></div>`;
  el.querySelector('#accept').onclick = async () => {
    const { date, inputs, result } = preview;
    await ctx.db.put('checkins', {
      date, inputs, change: result.change, explanation: result.explanation,
      tdee: result.tdee, compliantStreak: result.compliantStreak,
      oldTargets: data.targets, newTargets: result.newTargets,
    });
    if (result.newTargets) {
      await ctx.db.put('targets', { ...result.newTargets, tdee: result.tdee, effectiveDate: date, reason: 'Weekly check-in' });
      const plan = await ctx.db.get('planner', 'main');
      if (plan?.enabled) await ctx.db.put('planner', { ...plan, days: rescalePlan(plan.days, result.newTargets.kcal) }, 'main');
    }
    preview = null;
    render();
  };
}
```

- [ ] **Step 2: Verify in browser (simulated week)**

Seed a week of data from the console so the check-in has something to chew on (localhost, onboarded profile — adapt kcal to your onboarding targets):

```js
const db = await import('./js/db.js');
const today = new Date();
for (let i = 6; i >= 0; i--) {
  const d = new Date(today); d.setDate(d.getDate() - i);
  const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  await db.put('weighins', { date: ds, weightKg: 82 - (6 - i) * 0.05 });
  await db.put('logs', { date: ds, complete: true, meals: [{ name: 'Breakfast',
    entries: [{ label: 'Seed day', brand: '', qty: 1, unit: 'x', kcal: 2300, p: 170, c: 230, f: 75 }] },
    { name: 'Lunch', entries: [] }, { name: 'Dinner', entries: [] }, { name: 'Snacks', entries: [] }] });
}
```

Reload → Coach tab. Expected: due banner (onboardedAt is ≥6 days back only if you also backdate it — otherwise temporarily set `checkInDay` to today's weekday via Settings/console). Run check-in → explanation shows the seeded numbers; accept → history entry appears; if it adjusted, Log tab target changes and (when planner enabled) Plan days rescale.
Also verify the insufficient path: wipe logs' `complete` flags for 4 days and re-run → "Not enough data" explanation, targets unchanged.

- [ ] **Step 3: Commit**

```bash
git add js/views/coach.js
git commit -m "feat: coach view with weekly check-in flow and history"
```

---

### Task 13: Charts + Trends view (`js/charts.js`, `js/views/trends.js`)

**Load the `dataviz` skill before implementing this task** — it governs chart form and color use. The CSS classes from Task 7 (`chart-line`, `chart-dot`, `chart-grid`, `chart-bar`, …) carry the palette; keep one accent series per chart, muted grid, no legends where a title suffices.

**Files:**
- Create: `js/charts.js`, `js/views/trends.js`

**Interfaces:**
- Produces: `lineChart({w,h,pad,series,bars,xTicks,yFmt}) → svgString` where `series = [{points:[{x,y}], cls, dots}]`, `bars = [{x,y,cls}]`, `xTicks = [{x,label}]`.
- Consumes: `computeTrend` (Task 4), `dayTargetFor`/`latestTargets` (Task 10), db stores.

- [ ] **Step 1: Write `js/charts.js`**

```js
// Hand-rolled SVG charts; colors come from CSS classes so they theme automatically.
export function lineChart(cfg) {
  const { w = 340, h = 170, pad = 34, series = [], bars = [], xTicks = [], yFmt = (v) => Math.round(v) } = cfg;
  const ys = [...series.flatMap((s) => s.points.map((p) => p.y)), ...bars.map((b) => b.y)];
  const xs = [...series.flatMap((s) => s.points.map((p) => p.x)), ...bars.map((b) => b.x)];
  if (ys.length < 2) return '<p class="muted">Not enough data yet — keep logging.</p>';
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const s0 = yMax - yMin; yMin -= s0 * 0.08; yMax += s0 * 0.08;
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const X = (x) => pad + ((x - xMin) / (xMax - xMin || 1)) * (w - pad - 8);
  const Y = (y) => (h - 18) - ((y - yMin) / (yMax - yMin)) * (h - 18 - 8);
  let out = '';
  for (let i = 0; i < 4; i++) {
    const v = yMin + ((yMax - yMin) * i) / 3;
    out += `<line class="chart-grid" x1="${pad}" x2="${w}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>` +
      `<text class="chart-lbl" x="2" y="${(Y(v) + 3).toFixed(1)}">${yFmt(v)}</text>`;
  }
  const bw = Math.max(3, (w - pad) / ((xMax - xMin + 1) || 1) - 3);
  for (const b of bars)
    out += `<rect class="chart-bar ${b.cls || ''}" x="${(X(b.x) - bw / 2).toFixed(1)}" width="${bw.toFixed(1)}"` +
      ` y="${Y(b.y).toFixed(1)}" height="${(h - 18 - Y(b.y)).toFixed(1)}"/>`;
  for (const s of series) {
    if (s.points.length > 1 && s.cls !== 'dots-only')
      out += `<polyline class="${s.cls || 'chart-line'}" points="${s.points.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}"/>`;
    if (s.dots) out += s.points.map((p) => `<circle class="chart-dot" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.5"/>`).join('');
  }
  for (const t of xTicks)
    out += `<text class="chart-lbl" x="${X(t.x).toFixed(1)}" y="${h - 4}" text-anchor="middle">${t.label}</text>`;
  return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img">${out}</svg></div>`;
}
```

- [ ] **Step 2: Write `js/views/trends.js`**

```js
import { dstr, addDays } from '../util.js';
import { computeTrend } from '../engine/trend.js';
import { lineChart } from '../charts.js';
import { dayTargetFor } from './log.js';

let root, ctx;
export async function mount(el, c) { root = el; ctx = c; render(); }

const dayIdx = (d0, d) => Math.round((new Date(d + 'T12:00:00') - new Date(d0 + 'T12:00:00')) / 86400000);
const dayKcal = (log) => log.meals.flatMap((m) => m.entries).reduce((s, e) => s + e.kcal, 0);

async function render() {
  const [weighins, logs, checkins] = await Promise.all([
    ctx.db.getAll('weighins'), ctx.db.getAll('logs'), ctx.db.getAll('checkins')]);
  const trend = computeTrend(weighins);
  const today = dstr();

  // Weight: raw scatter + trend line
  let weight = '<p class="muted">Weigh in to see your trend.</p>';
  if (trend.length) {
    const d0 = trend[0].date;
    weight = lineChart({
      series: [
        { points: trend.map((t) => ({ x: dayIdx(d0, t.date), y: t.weightKg })), cls: 'dots-only', dots: true },
        { points: trend.map((t) => ({ x: dayIdx(d0, t.date), y: t.trendKg })), cls: 'chart-line' }],
      xTicks: [{ x: 0, label: d0.slice(5) }, { x: dayIdx(d0, trend.at(-1).date), label: trend.at(-1).date.slice(5) }],
      yFmt: (v) => v.toFixed(1),
    });
  }

  // Calories: last 14 days, bars vs target line
  const bars = [], targetPts = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const log = logs.find((l) => l.date === d);
    const t = await dayTargetFor(ctx.db, d);
    targetPts.push({ x: 13 - i, y: t.kcal });
    if (log && dayKcal(log) > 0) bars.push({ x: 13 - i, y: dayKcal(log), cls: dayKcal(log) > t.kcal * 1.05 ? 'over' : '' });
  }
  const kcalChart = lineChart({ bars, series: [{ points: targetPts, cls: 'chart-line2' }],
    xTicks: [{ x: 0, label: addDays(today, -13).slice(5) }, { x: 13, label: 'today' }] });

  // Adherence: complete days per week, last 4 weeks
  const adh = [];
  for (let wk = 3; wk >= 0; wk--) {
    const end = addDays(today, -7 * wk), start = addDays(end, -6);
    const n = logs.filter((l) => l.date >= start && l.date <= end && l.complete).length;
    adh.push(`<div class="spread"><span class="muted">${start.slice(5)} – ${end.slice(5)}</span><b>${n}/7 days</b></div>`);
  }

  // TDEE over time
  const cks = [...checkins].sort((a, b) => (a.date < b.date ? -1 : 1)).filter((c) => c.tdee);
  const tdeeChart = cks.length >= 2 ? lineChart({
    series: [{ points: cks.map((c, i) => ({ x: i, y: c.tdee })), cls: 'chart-line', dots: true }],
    xTicks: [{ x: 0, label: cks[0].date.slice(5) }, { x: cks.length - 1, label: cks.at(-1).date.slice(5) }],
  }) : '<p class="muted">Appears after two check-ins.</p>';

  root.innerHTML = `
    <div class="card"><h2>Weight</h2>${weight}</div>
    <div class="card"><h2>Calories vs target</h2>${kcalChart}</div>
    <div class="card"><h2>Logging adherence</h2>${adh.join('')}</div>
    <div class="card"><h2>Estimated TDEE</h2>${tdeeChart}</div>`;
}
```

- [ ] **Step 3: Verify in browser**

With the Task 12 seed data: weight chart shows dots + smooth line; calories chart shows 14-day bars with the dashed target line (over-target bars red); adherence rows count seeded complete days; TDEE chart appears after a second check-in (or shows its empty state). Check both light and dark system themes.

- [ ] **Step 4: Commit**

```bash
git add js/charts.js js/views/trends.js
git commit -m "feat: trends view with SVG weight, calorie, adherence, TDEE charts"
```

---

### Task 14: Plan view (`js/views/plan.js`)

**Files:**
- Create: `js/views/plan.js`

**Interfaces:**
- Consumes: `defaultPlan/editDay/weeklyTotal/dayMacros` (Task 6), `kcalFloor` (Task 3), `latestTargets` (Task 10).
- Produces: `planner` record `{enabled, days}` at key `'main'` (shape consumed by Log and Coach).

- [ ] **Step 1: Write the view** — `js/views/plan.js`:

```js
import { defaultPlan, editDay, weeklyTotal, dayMacros } from '../engine/planner.js';
import { kcalFloor } from '../engine/prescribe.js';
import { latestTargets } from './log.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let root, ctx, msg = '';

export async function mount(el, c) { root = el; ctx = c; msg = ''; render(); }

async function load() {
  const settings = await ctx.db.get('settings', 'main');
  const targets = latestTargets(await ctx.db.getAll('targets'));
  const plan = (await ctx.db.get('planner', 'main')) ?? { enabled: false, days: defaultPlan(targets.kcal) };
  return { settings, targets, plan };
}

async function render() {
  const { settings, targets, plan } = await load();
  const total = weeklyTotal(plan.days), budget = targets.kcal * 7;
  root.innerHTML = `
  <div class="card"><div class="spread"><h2>Diet planner</h2>
    <label style="margin:0"><input type="checkbox" id="en" ${plan.enabled ? 'checked' : ''} style="width:auto"> On</label></div>
  <p class="muted">Shift calories between days — the weekly total stays ${budget} kcal. Lock days to pin them.</p></div>
  <div class="card" ${plan.enabled ? '' : 'style="opacity:.45;pointer-events:none"'}>
    ${plan.days.map((d, i) => {
      const m = dayMacros(d.kcal, targets);
      return `<div class="planday"><b>${DOW[i]}</b>
        <span class="muted">P ${m.proteinG} · C ${m.carbG} · F ${m.fatG}</span>
        <input type="number" value="${d.kcal}" data-day="${i}" ${d.locked ? 'disabled' : ''}>
        <button class="lock ${d.locked ? 'on' : ''}" data-lock="${i}">${d.locked ? '🔒' : '🔓'}</button></div>`;
    }).join('')}
    <div class="spread" style="margin-top:8px"><span class="muted">Weekly total</span>
      <b>${total} / ${budget} kcal ${total === budget ? '✓' : '⚠️'}</b></div>
    ${msg ? `<p class="msg">${msg}</p>` : ''}
    <button class="ghost" id="even" style="margin-top:8px">Even out week</button>
  </div>`;
  wire(plan, targets, settings);
}

function wire(plan, targets, settings) {
  const save = async () => { await ctx.db.put('planner', plan, 'main'); render(); };
  root.querySelector('#en').onchange = async (e) => { plan.enabled = e.target.checked; msg = ''; await save(); };
  root.querySelector('#even').onclick = async () => { plan.days = defaultPlan(targets.kcal); msg = ''; await save(); };
  root.querySelectorAll('[data-lock]').forEach((b) => (b.onclick = async () => {
    plan.days[+b.dataset.lock].locked = !plan.days[+b.dataset.lock].locked;
    msg = ''; await save();
  }));
  root.querySelectorAll('[data-day]').forEach((inp) => (inp.onchange = async () => {
    const r = editDay(plan.days, +inp.dataset.day, +inp.value, kcalFloor(settings.sex));
    msg = r.applied ? r.message : r.message;
    if (r.applied) plan.days = r.days;
    await save();
  }));
}
```

- [ ] **Step 2: Verify in browser**

Enable planner. Raise Saturday by 300 → other days drop ~50 each, weekly total still shows ✓. Lock Monday, raise Saturday again → Monday untouched. Drive days near the floor → clamp message appears. Log tab on a planned high day shows that day's higher target. "Even out week" resets. Disable → Log tab returns to flat daily target.

- [ ] **Step 3: Commit**

```bash
git add js/views/plan.js
git commit -m "feat: planner view with per-day calories, locks, weekly invariant"
```

---

### Task 15: Settings view (`js/views/settings.js`)

**Files:**
- Create: `js/views/settings.js`

**Interfaces:**
- Consumes: `prescribe/ageFromBirthdate/ACTIVITY` (Task 3), `rescalePlan` (Task 6), units helpers (Task 2), `exportAll/importAll/wipe` (Task 7), `latestTargets` (Task 10).
- Produces: updated `settings`; on profile/goal/diet changes, a new `targets` record (using the learned TDEE when one exists) and rescaled planner; JSON backup file download; import; full wipe.

- [ ] **Step 1: Write the view** — `js/views/settings.js`:

```js
import { prescribe, ageFromBirthdate, ACTIVITY } from '../engine/prescribe.js';
import { rescalePlan } from '../engine/planner.js';
import { lbToKg, kgToLb, ftInToCm, cmToFtIn } from '../units.js';
import { dstr } from '../util.js';
import { latestTargets } from './log.js';

let root, ctx;
export async function mount(el, c) { root = el; ctx = c; render(); }

async function render() {
  const s = await ctx.db.get('settings', 'main');
  const imp = s.units === 'imperial';
  const { ft, in: inch } = cmToFtIn(s.heightCm);
  root.innerHTML = `
  <div class="card"><h2>Profile & goal</h2>
    <label>Units</label><select id="units">
      <option value="imperial" ${imp ? 'selected' : ''}>lb + ft/in</option>
      <option value="metric" ${imp ? '' : 'selected'}>kg + cm</option></select>
    <label>Height</label>${imp
      ? `<div class="row"><input id="hft" type="number" value="${ft}"><input id="hin" type="number" value="${inch}"></div>`
      : `<input id="hcm" type="number" value="${Math.round(s.heightCm)}">`}
    <label>Activity</label><select id="act">${Object.keys(ACTIVITY).map((k) =>
      `<option ${k === s.activityLevel ? 'selected' : ''}>${k}</option>`).join('')}</select>
    <label>Goal</label><select id="gtype">${['lose', 'maintain', 'gain', 'reverse'].map((g) =>
      `<option ${g === s.goal.type ? 'selected' : ''}>${g}</option>`).join('')}</select>
    <label>Rate (% body weight / week; ignored for maintain/reverse)</label>
    <input id="grate" type="number" step="0.125" value="${s.goal.ratePctPerWeek}">
    <label>Diet style</label><select id="dstyle">${['balanced', 'lowfat', 'lowcarb', 'keto'].map((d) =>
      `<option ${d === s.dietStyle ? 'selected' : ''}>${d}</option>`).join('')}</select>
    <label><input id="plant" type="checkbox" ${s.plantBased ? 'checked' : ''} style="width:auto"> Plant-based</label>
    <label>Check-in day</label><select id="ciday">${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
      .map((d, i) => `<option value="${i}" ${i === s.checkInDay ? 'selected' : ''}>${d}</option>`).join('')}</select>
    <button class="primary" id="saveprofile">Save & re-prescribe</button>
    <p class="hint">Saving recalculates your targets — using your learned TDEE once check-ins exist.</p>
  </div>
  <div class="card"><h2>Food database</h2>
    <label>USDA FoodData Central API key (optional)</label>
    <input id="usda" value="${s.usdaApiKey || ''}" placeholder="free key from fdc.nal.usda.gov">
    <button class="ghost" id="savekey" style="margin-top:8px">Save key</button>
  </div>
  <div class="card"><h2>Data</h2>
    <p class="muted">Everything lives on this device. Export a backup regularly.</p>
    <div class="row"><button class="ghost" id="exp">Export backup</button>
      <button class="ghost" id="impbtn">Import backup</button></div>
    <input type="file" id="impfile" accept=".json" hidden>
    <button class="ghost danger" id="wipe" style="margin-top:12px;width:100%">Erase all data</button>
  </div>`;
  wire(s);
}

function wire(s) {
  const q = (sel) => root.querySelector(sel);
  q('#units').onchange = async () => { s.units = q('#units').value; await ctx.db.put('settings', s, 'main'); render(); };
  q('#saveprofile').onclick = async () => {
    if (s.units === 'imperial') s.heightCm = ftInToCm(+q('#hft').value || 5, +q('#hin').value || 8);
    else s.heightCm = +q('#hcm').value || s.heightCm;
    s.activityLevel = q('#act').value;
    s.goal = { type: q('#gtype').value, ratePctPerWeek: +q('#grate').value || 0, goalWeightKg: s.goal.goalWeightKg };
    s.dietStyle = q('#dstyle').value;
    s.plantBased = q('#plant').checked;
    s.checkInDay = +q('#ciday').value;
    await ctx.db.put('settings', s, 'main');
    const weighins = await ctx.db.getAll('weighins');
    const weightKg = weighins.sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.weightKg ?? 80;
    const checkins = (await ctx.db.getAll('checkins')).sort((a, b) => (a.date < b.date ? 1 : -1));
    const t = prescribe({
      sex: s.sex, weightKg, heightCm: s.heightCm, age: ageFromBirthdate(s.birthdate, dstr()),
      activity: s.activityLevel, goal: s.goal, dietStyle: s.dietStyle, plantBased: s.plantBased,
      tdeeOverride: checkins[0]?.tdee ?? undefined,
    });
    await ctx.db.put('targets', { ...t, effectiveDate: dstr(), reason: 'Settings change' });
    const plan = await ctx.db.get('planner', 'main');
    if (plan?.enabled) await ctx.db.put('planner', { ...plan, days: rescalePlan(plan.days, t.kcal) }, 'main');
    ctx.navigate('coach');
  };
  q('#savekey').onclick = async () => { s.usdaApiKey = q('#usda').value.trim(); await ctx.db.put('settings', s, 'main'); };
  q('#exp').onclick = async () => {
    const data = await ctx.db.exportAll();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = `macrocoach-backup-${dstr()}.json`;
    a.click();
    s.lastBackupAt = dstr();
    await ctx.db.put('settings', s, 'main');
  };
  q('#impbtn').onclick = () => q('#impfile').click();
  q('#impfile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await ctx.db.importAll(JSON.parse(await file.text()));
    location.reload();
  };
  q('#wipe').onclick = async () => {
    if (!confirm('Erase ALL MacroCoach data on this device? This cannot be undone.')) return;
    await ctx.db.wipe();
    location.reload();
  };
}
```

- [ ] **Step 2: Verify in browser**

Change goal rate → Save & re-prescribe → Coach shows new targets with reason "Settings change"; with a check-in recorded, the new kcal derives from the learned TDEE. Export downloads a JSON containing your logs; wipe (on a throwaway profile), reload lands on onboarding; import the backup restores everything. Units switch flips Log's weigh-in placeholder. (Skip clicking wipe/confirm during automated browser runs — modal dialogs block the automation session; test it by hand.)

- [ ] **Step 3: Commit**

```bash
git add js/views/settings.js
git commit -m "feat: settings with re-prescription, backup export/import, wipe"
```

---

### Task 16: PWA (manifest, icons, service worker) + deploy + E2E

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `icons/icon.svg`, `icons/icon-{512,192,180}.png`
- Modify: `index.html` (manifest + iOS meta + SW registration), `js/app.js` (backup nudge)

**Interfaces:**
- Produces: installable offline PWA at the live Pages URL; `CACHE` version string in `sw.js` that must be bumped on every future deploy.

- [ ] **Step 1: Icons**

```bash
mkdir -p icons
cat > icons/icon.svg <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0e131a"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#2b3745" stroke-width="40"/>
  <path d="M256 106 A150 150 0 1 1 126 331" fill="none" stroke="#b8e62e" stroke-width="40" stroke-linecap="round"/>
  <text x="256" y="300" font-family="Helvetica" font-size="140" font-weight="800" fill="#e8edf2" text-anchor="middle">M</text>
</svg>
EOF
qlmanage -t -s 1024 -o icons icons/icon.svg          # renders icons/icon.svg.png
for s in 512 192 180; do sips -z $s $s icons/icon.svg.png --out icons/icon-$s.png; done
rm icons/icon.svg.png
```

(If `qlmanage` produces nothing, open `icons/icon.svg` in Chrome, screenshot the square, and `sips` that — any square PNG unblocks the task.)

- [ ] **Step 2: Write `manifest.webmanifest`**

```json
{
  "name": "MacroCoach",
  "short_name": "MacroCoach",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "background_color": "#0e131a",
  "theme_color": "#0e131a",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 3: Write `sw.js`**

```js
const CACHE = 'macrocoach-v1'; // bump on every deploy that changes shipped files
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/units.js', 'js/util.js', 'js/charts.js',
  'js/engine/prescribe.js', 'js/engine/trend.js', 'js/engine/checkin.js', 'js/engine/planner.js',
  'js/food/off.js', 'js/food/usda.js', 'js/food/barcode.js',
  'js/views/onboarding.js', 'js/views/log.js', 'js/views/coach.js',
  'js/views/trends.js', 'js/views/plan.js', 'js/views/settings.js',
  'vendor/zxing.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== CACHE + '-api').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    // app shell: cache-first (precached, versioned)
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
  } else {
    // food APIs: network-first with cache fallback for offline reuse
    e.respondWith(fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE + '-api').then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request)));
  }
});
```

- [ ] **Step 4: Update `index.html` head + SW registration**

Add to `<head>`:

```html
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

Add before `</body>`:

```html
<script>
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
</script>
```

- [ ] **Step 5: Monthly backup nudge in `js/app.js`**

In `boot()`, after the `else navigate('log');` branch runs for an onboarded user, add:

```js
const last = settings.lastBackupAt ?? settings.onboardedAt;
if ((Date.now() - new Date(last + 'T12:00:00')) / 86400000 > 30) {
  const b = document.createElement('div');
  b.className = 'banner spread';
  b.innerHTML = `It's been a month since your last backup <button class="ghost" id="nudge">Export now</button>`;
  document.getElementById('view').before(b);
  b.querySelector('#nudge').onclick = () => { b.remove(); navigate('settings'); };
}
```

- [ ] **Step 6: Full local E2E, then deploy**

1. `node --test test/` — all pass.
2. Fresh-profile walkthrough with claude-in-chrome on localhost: onboard → log a searched food + custom + quick add → weigh in → seed a week (Task 12 script) → run check-in → accept → Trends renders all four cards → enable planner, shift + lock days → Log target follows the planned day → Settings export downloads.
3. Deploy:

```bash
node --test test/ && git push
GHUSER=$(gh api user -q .login)
sleep 90 && curl -s -o /dev/null -w '%{http_code}\n' "https://$GHUSER.github.io/dailydash/"   # expect 200
```

4. On the live URL: hard-reload twice (SW installs on first load, controls on second); DevTools → Application shows the SW active and `macrocoach-v1` cache; toggle offline in DevTools → app still opens.
5. Commit anything outstanding:

```bash
git add manifest.webmanifest sw.js icons/ index.html js/app.js
git commit -m "feat: installable offline PWA (manifest, icons, service worker)"
git push
```

- [ ] **Step 7: Hand to the user (their part, not yours)**

Ask the user to, on their iPhone: open the live URL in Safari → Share → **Add to Home Screen** → launch MacroCoach from the icon → confirm standalone (no Safari chrome), camera barcode scan works, and the app opens in airplane mode. Optionally add a free USDA key (fdc.nal.usda.gov) in Settings.

---

## Self-review (completed during planning)

**Spec coverage:** onboarding/prescription → Tasks 3, 8; trend weight → 4, 13; weekly check-in incl. adherence gate, deadband, caps, reverse, maintain band, TDEE learning → 5, 12; planner locks/redistribution/floors/rescale → 6, 14; food search/barcode/custom/recipes/recents/favorites/quick-add/copy-day → 9, 10, 11; rings/log/weigh-in → 10; charts → 13; units both ways, metric storage → 2 and all views; settings/export/import/wipe/USDA key/re-prescribe → 15; PWA/offline/iOS/persist/backup nudge → 7 (persist), 16; disguised public repo + Pages → 1; agent portability (CLAUDE.md/AGENTS.md) → 1; hand-rolled SVG per dataviz → 13; frontend-design pass → 7.

**Known simplifications (intentional, spec-compatible):** USDA serving sizes normalized per-100g only; recipe portioning uses a `prompt()` for serving count; "fully-logged day" = explicit complete-toggle + nonzero kcal. None violate the spec's requirements.

**Type consistency check:** `FoodResult`, `Entry`, `targets`, `planner.days`, `checkins` shapes are defined once (Tasks 3–10 Interfaces blocks) and consumed by name everywhere else — verified consistent.




