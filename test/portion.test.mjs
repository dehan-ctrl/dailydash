import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeServings, portionMacros, entryFromPortion, reconcileCustomFood } from '../js/food/portion.js';

const oats = {
  id: 'off:1', label: 'Oats', brand: 'Bulk',
  per100g: { kcal: 389, p: 16.9, c: 66.3, f: 6.9 },
  servings: [{ label: '100 g', grams: 100 }, { label: '1 cup', grams: 80 }],
};

test('normalizeServings always includes a 100 g base', () => {
  const s = normalizeServings({ per100g: { kcal: 100, p: 1, c: 1, f: 1 } });
  assert.deepEqual(s, [{ label: '100 g', grams: 100 }]);
});
test('normalizeServings upgrades a legacy single serving', () => {
  const s = normalizeServings({ serving: { label: '2 tbsp (32 g)', grams: 32 } });
  assert.equal(s.length, 2);
  assert.equal(s[0].grams, 100);
  assert.equal(s[1].grams, 32);
});
test('normalizeServings keeps an existing servings list intact', () => {
  const s = normalizeServings(oats);
  assert.deepEqual(s.map((x) => x.grams), [100, 80]);
});
test('normalizeServings preserves per-serving macros', () => {
  const s = normalizeServings({
    servings: [{ label: '1 egg', grams: 50, macros: { kcal: 70, p: 6, c: 0.4, f: 5 } }],
  });
  assert.deepEqual(s[0], { label: '100 g', grams: 100 });
  assert.deepEqual(s[1], { label: '1 egg', grams: 50, macros: { kcal: 70, p: 6, c: 0.4, f: 5 } });
});
test('portionMacros scales per-100g values', () => {
  assert.deepEqual(portionMacros(oats.per100g, 50), { kcal: 195, p: 8.4, c: 33.1, f: 3.5 });
});
test('entryFromPortion: 2 × 1 cup of oats', () => {
  const e = entryFromPortion(oats, oats.servings[1], 2);
  assert.equal(e.grams, 160);
  assert.equal(e.kcal, Math.round(389 * 1.6));
  assert.equal(e.servingLabel, '1 cup');
  assert.equal(e.qty, 2);
});
test('entryFromPortion: half a 100 g serving', () => {
  const e = entryFromPortion(oats, oats.servings[0], 0.5);
  assert.equal(e.grams, 50);
  assert.equal(e.kcal, 195);
});
test('entryFromPortion uses serving macros when present', () => {
  const egg = {
    id: 'usda:1', label: 'Egg', brand: '',
    per100g: { kcal: 155, p: 13, c: 1.1, f: 11 },
    servings: [{ label: '100 g', grams: 100 }, { label: '1 large', grams: 50, macros: { kcal: 70, p: 6, c: 0.4, f: 5 } }],
  };
  const e = entryFromPortion(egg, egg.servings[1], 2);
  assert.equal(e.grams, 100);
  assert.equal(e.kcal, 140);
  assert.equal(e.p, 12);
});
test('reconcileCustomFood derives 100 g macros from a sized serving', () => {
  const food = reconcileCustomFood({
    source: 'custom', label: 'Cracker', brand: '',
    per100g: { kcal: 0, p: 0, c: 0, f: 0 },
    servings: [{ label: '100 g', grams: 100 }, { label: '1 large cracker', grams: 22, macros: { kcal: 110, p: 2, c: 15, f: 5 } }],
  });
  assert.deepEqual(food.per100g, { kcal: 500, p: 9.1, c: 68.2, f: 22.7 });
  assert.equal(food.servings[1].macros.kcal, 110);
});
