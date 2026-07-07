import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetsFor, latestTargets } from '../js/views/log.js';

const T = [
  { kcal: 2000, effectiveDate: '2026-07-01', proteinG: 150, carbG: 200, fatG: 62 },
  { kcal: 2150, effectiveDate: '2026-07-08', proteinG: 150, carbG: 225, fatG: 68 },
];
test('targetsFor picks the prescription in effect on that date', () => {
  assert.equal(targetsFor(T, '2026-07-05').kcal, 2000);
  assert.equal(targetsFor(T, '2026-07-08').kcal, 2150);
  assert.equal(targetsFor(T, '2026-07-20').kcal, 2150);
});
test('targetsFor before first record falls back to the earliest', () => {
  assert.equal(targetsFor(T, '2026-06-20').kcal, 2000);
});
test('latestTargets returns newest', () => {
  assert.equal(latestTargets(T).kcal, 2150);
});
