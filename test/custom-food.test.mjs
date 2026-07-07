import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customFoodForBarcode, normalizeBarcode } from '../js/food/custom.js';

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

test('customFoodForBarcode ignores blank and missing barcodes', () => {
  assert.equal(customFoodForBarcode([{ id: 1, label: 'x', barcode: '' }], '123'), null);
  assert.equal(customFoodForBarcode([{ id: 1, label: 'x', barcode: '123' }], ''), null);
});
