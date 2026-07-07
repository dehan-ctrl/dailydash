import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmrMifflin, rmrKatch, rmr, leanMassKg, clampRateKg, prescribe, editMacro, kcalFloor, ageFromBirthdate } from '../js/engine/prescribe.js';

const guy = { sex: 'm', weightKg: 90, heightCm: 180, age: 35, activity: 'moderate' };

test('Mifflin-St Jeor male', () => {
  assert.equal(rmrMifflin(guy), 10 * 90 + 6.25 * 180 - 5 * 35 + 5); // 1855
});
test('Mifflin-St Jeor female', () => {
  assert.equal(rmrMifflin({ sex: 'f', weightKg: 60, heightCm: 165, age: 30 }),
    600 + 6.25 * 165 - 150 - 161);
});
test('balanced fat-loss prescription', () => {
  const t = prescribe({ ...guy, goal: { type: 'lose', rateKgPerWeek: 0.45 }, dietStyle: 'balanced' });
  assert.equal(t.tdee, 2875);            // 1855 * 1.55 rounded
  assert.equal(t.kcal, 2380);            // tdee - 0.45kg*7700/7
  assert.equal(t.proteinG, 180);         // 2.0 g/kg
  assert.equal(t.fatG, 79);              // 30% kcal / 9
  assert.equal(t.carbG, 237);            // remainder / 4
});
test('plant-based protein 1.8 g/kg', () => {
  const t = prescribe({ ...guy, goal: { type: 'maintain', rateKgPerWeek: 0 }, dietStyle: 'balanced', plantBased: true });
  assert.equal(t.proteinG, 162);
});
test('keto pins carbs at 25 g', () => {
  const t = prescribe({ ...guy, goal: { type: 'lose', rateKgPerWeek: 0.45 }, dietStyle: 'keto' });
  assert.equal(t.carbG, 25);
});
test('never below the sex floor', () => {
  const t = prescribe({ sex: 'f', weightKg: 45, heightCm: 150, age: 60, activity: 'sedentary',
    goal: { type: 'lose', rateKgPerWeek: 0.5625 }, dietStyle: 'balanced' });
  assert.equal(t.kcal, kcalFloor('f')); // 1200
});
test('reverse starts at maintenance', () => {
  const t = prescribe({ ...guy, goal: { type: 'reverse', rateKgPerWeek: 0 }, dietStyle: 'balanced' });
  assert.equal(t.kcal, t.tdee);
});
test('tdeeOverride replaces formula TDEE', () => {
  const t = prescribe({ ...guy, goal: { type: 'maintain', rateKgPerWeek: 0 }, dietStyle: 'balanced', tdeeOverride: 3100 });
  assert.equal(t.kcal, 3100);
});
test('editMacro keeps calories constant', () => {
  const t = prescribe({ ...guy, goal: { type: 'lose', rateKgPerWeek: 0.45 }, dietStyle: 'balanced' });
  const { targets: e } = editMacro(t, 'proteinG', 200, { weightKg: 90 });
  assert.equal(e.proteinG, 200);
  assert.equal(e.kcal, t.kcal);
  const macroKcal = e.proteinG * 4 + e.carbG * 4 + e.fatG * 9;
  assert.ok(Math.abs(macroKcal - e.kcal) <= 8); // rounding slack only
});
test('editMacro clamps protein to 1.4–2.6 g/kg', () => {
  const t = prescribe({ ...guy, goal: { type: 'lose', rateKgPerWeek: 0.45 }, dietStyle: 'balanced' });
  const r = editMacro(t, 'proteinG', 500, { weightKg: 90 });
  assert.equal(r.clamped, true);
  assert.equal(r.targets.proteinG, Math.round(2.6 * 90));
});
test('editMacro respects fat floor', () => {
  const t = prescribe({ ...guy, goal: { type: 'lose', rateKgPerWeek: 0.45 }, dietStyle: 'balanced' });
  const r = editMacro(t, 'fatG', 10, { weightKg: 90 });
  assert.equal(r.clamped, true);
  assert.equal(r.targets.fatG, Math.round(Math.max(0.6 * 90, 0.2 * t.kcal / 9)));
});
test('age from birthdate', () => {
  assert.equal(ageFromBirthdate('1990-07-10', '2026-07-06'), 35);
});
test('Katch-McArdle used when body fat is known', () => {
  assert.equal(leanMassKg(90, 20), 72);
  assert.equal(rmrKatch(90, 20), 370 + 21.6 * 72); // 1925.2
  assert.equal(rmr({ ...guy, bodyFatPct: 20 }), rmrKatch(90, 20));
  assert.equal(rmr(guy), rmrMifflin(guy)); // no body fat → Mifflin
  const t = prescribe({ ...guy, bodyFatPct: 20, goal: { type: 'maintain', rateKgPerWeek: 0 }, dietStyle: 'balanced' });
  assert.equal(t.tdee, Math.round(rmrKatch(90, 20) * 1.55));
});
test('weekly rate is clamped to safety rails', () => {
  // 90 kg: loss capped at 1.125 kg/wk, gain at 0.45 kg/wk
  assert.equal(clampRateKg({ type: 'lose', rateKgPerWeek: 2.0 }, 90), 1.125);
  assert.equal(clampRateKg({ type: 'lose', rateKgPerWeek: 0.45 }, 90), 0.45);
  assert.equal(clampRateKg({ type: 'gain', rateKgPerWeek: 1.0 }, 90), 0.45);
  const t = prescribe({ ...guy, goal: { type: 'lose', rateKgPerWeek: 5 }, dietStyle: 'balanced' });
  assert.equal(t.kcal, Math.round(2875 - 1.125 * 7700 / 7)); // clamped deficit
});
