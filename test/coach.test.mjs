import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress } from '../js/views/coach.js';

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
