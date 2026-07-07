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
