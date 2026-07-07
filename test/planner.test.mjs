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
  assert.equal(r[0].kcal, 2415); // locked day rescaled proportionally; drift on unlocked
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
test('edited day never lands below the floor', () => {
  // Main case: start from defaultPlan(1501) with floor 1500
  const days = defaultPlan(1501);
  const { days: result } = editDay(days, 0, 1200, 1500);
  assert.ok(result[0].kcal >= 1500, `day 0 is ${result[0].kcal}, below 1500`);
  for (let i = 1; i < 7; i++) {
    assert.ok(result[i].kcal >= 1500, `day ${i} is ${result[i].kcal}, below 1500`);
  }
  assert.equal(weeklyTotal(result), 7 * 1501);

  // Loop test: several odd totals with editDay to floor
  for (const daily of [1507, 1511, 1523]) {
    const p = defaultPlan(daily);
    const { days: r } = editDay(p, 0, 1500, 1500);
    assert.ok(r[0].kcal >= 1500, `day 0 for daily=${daily} is ${r[0].kcal}, below 1500`);
    for (let i = 1; i < 7; i++) {
      assert.ok(r[i].kcal >= 1500, `day ${i} for daily=${daily} is ${r[i].kcal}, below 1500`);
    }
    assert.equal(weeklyTotal(r), 7 * daily, `weekly total mismatch for daily=${daily}`);
  }
});
