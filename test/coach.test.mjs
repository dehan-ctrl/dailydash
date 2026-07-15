import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInputs, checkinAvailability, complianceRange, goalProgress, periodStats } from '../js/views/coach.js';

test('goalProgress measures loss progress from start toward goal', () => {
  assert.deepEqual(goalProgress({ type: 'lose', startKg: 100, currentKg: 90, goalKg: 80 }), {
    pct: 50, remainingKg: 10, doneKg: 10, totalKg: 20,
  });
});

test('goalProgress measures gain progress from start toward goal', () => {
  assert.deepEqual(goalProgress({ type: 'gain', startKg: 70, currentKg: 75, goalKg: 80 }), {
    pct: 50, remainingKg: 5, doneKg: 5, totalKg: 10,
  });
});

test('goalProgress returns null when a weight goal is not configured', () => {
  assert.equal(goalProgress({ type: 'maintain', startKg: 80, currentKg: 80, goalKg: null }), null);
});

test('complianceRange can include or exclude today', () => {
  assert.deepEqual(complianceRange('2026-07-06', '2026-07-07', true), {
    from: '2026-07-06', to: '2026-07-07', label: 'Jul 6 - 7',
  });
  assert.deepEqual(complianceRange('2026-07-06', '2026-07-07', false), {
    from: '2026-07-06', to: '2026-07-06', label: 'Jul 6',
  });
});

test('periodStats honors the selected compliance range', () => {
  const logs = [
    { date: '2026-07-06', meals: [{ entries: [{ kcal: 2000, p: 150, c: 180, f: 70 }] }] },
    { date: '2026-07-07', meals: [{ entries: [{ kcal: 1000, p: 50, c: 80, f: 30 }] }] },
  ];
  const stats = periodStats({ logs }, '2026-07-06', '2026-07-06');
  assert.equal(stats.n, 1);
  assert.equal(stats.kcal, 2000);
  assert.equal(stats.p, 150);
});

test('buildInputs counts logged calorie days without a manual complete flag', () => {
  const inputs = buildInputs({
    settings: { goal: { type: 'lose' }, sex: 'm' },
    targets: { kcal: 2000 },
    weighins: [
      { date: '2026-07-01', weightKg: 90 },
      { date: '2026-07-07', weightKg: 89 },
    ],
    logs: [
      { date: '2026-07-07', complete: false, meals: [{ entries: [{ kcal: 1800 }] }] },
    ],
    checkins: [],
  }, '2026-07-07');
  assert.equal(inputs.loggedDays, 1);
  assert.equal(inputs.avgIntakeKcal, 1800);
});

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
  assert.equal(checkinAvailability(s, [], '2026-07-03').status, 'wait');
  assert.equal(checkinAvailability(s, [], '2026-07-03').daysLeft, 2);
  assert.equal(checkinAvailability(s, [], '2026-07-05').status, 'early'); // day 4
  assert.equal(checkinAvailability(s, [], '2026-07-09').status, 'due');   // day 8
  assert.equal(checkinAvailability(s, [{ date: '2026-07-05' }], '2026-07-05').status, 'done');
});
