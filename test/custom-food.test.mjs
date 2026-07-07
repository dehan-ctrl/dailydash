import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomFood, customFoodForBarcode, normalizeBarcode } from '../js/food/custom.js';

test('normalizeBarcode keeps only digits', () => {
  assert.equal(normalizeBarcode(' 0123-45 '), '012345');
});

test('customFoodForBarcode finds a custom food by barcode', () => {
  const food = customFoodForBarcode([
    { id: 7, label: 'Large cracker', barcode: '012345', per100g: { kcal: 500, p: 9, c: 68, f: 23 } },
  ], '12345');
  assert.equal(food.id, 'custom:7');
  assert.equal(food.source, 'custom');
  assert.equal(food.label, 'Large cracker');
});

test('buildCustomFood treats entered macros as the serving, not per 100 g', () => {
  const food = buildCustomFood({
    label: 'Oats', barcode: '',
    macros: { kcal: 200, p: 10, c: 30, f: 5 },
    servingLabel: '2/3 cup', servingGrams: 130,
  });
  // per-100g must be scaled DOWN from the 130 g serving
  assert.deepEqual(food.per100g, { kcal: 154, p: 7.7, c: 23.1, f: 3.8 });
  const serving = food.servings.find((s) => s.label === '2/3 cup');
  assert.equal(serving.grams, 130);
  assert.deepEqual(serving.macros, { kcal: 200, p: 10, c: 30, f: 5 });
});

test('buildCustomFood without a serving keeps macros as per 100 g', () => {
  const food = buildCustomFood({
    label: 'Rice', barcode: ' 0123-45 ',
    macros: { kcal: 360, p: 7, c: 78, f: 1 },
    servingLabel: '', servingGrams: 0,
  });
  assert.deepEqual(food.per100g, { kcal: 360, p: 7, c: 78, f: 1 });
  assert.deepEqual(food.servings, [{ label: '100 g', grams: 100 }]);
  assert.equal(food.barcode, '012345');
});

test('customFoodForBarcode ignores blank and missing barcodes', () => {
  assert.equal(customFoodForBarcode([{ id: 1, label: 'x', barcode: '' }], '123'), null);
  assert.equal(customFoodForBarcode([{ id: 1, label: 'x', barcode: '123' }], ''), null);
});
