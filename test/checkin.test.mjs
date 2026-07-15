import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheckin, applyKcalChange } from '../js/engine/checkin.js';

const base = {
  goal: { type: 'lose', rateKgPerWeek: 0.45 }, sex: 'm',
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
    ...base, goal: { type: 'reverse', rateKgPerWeek: 0 },
    trendStartKg: 90.0, trendEndKg: 90.05, avgIntakeKcal: 2400,
  });
  assert.equal(r.change, 'adjust');
  assert.equal(r.newTargets.kcal, 2500);
});
test('reverse diet holds when gaining too fast', () => {
  const r = runCheckin({
    ...base, goal: { type: 'reverse', rateKgPerWeek: 0 },
    trendStartKg: 90.0, trendEndKg: 90.4,
  });
  assert.equal(r.change, 'hold');
});
test('maintain holds inside ±1% band', () => {
  const r = runCheckin({
    ...base, goal: { type: 'maintain', rateKgPerWeek: 0, goalWeightKg: 90 },
    trendStartKg: 90.0, trendEndKg: 90.5, // 0.55% off goal
  });
  assert.equal(r.change, 'hold');
});
test('maintain steers back when outside band', () => {
  const r = runCheckin({
    ...base, goal: { type: 'maintain', rateKgPerWeek: 0, goalWeightKg: 90 },
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
test('applyKcalChange scales carbs/fat pro-rata', () => {
  const t = applyKcalChange({ kcal: 2400, proteinG: 180, carbG: 240, fatG: 80 }, 2250);
  assert.equal(t.proteinG, 180);
  assert.equal(t.kcal, 2250);
  assert.equal(t.carbG, Math.round(240 * (2250 - 720) / (2400 - 720)));
});
