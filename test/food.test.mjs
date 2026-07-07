import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProduct } from '../js/food/off.js';
import { normalizeUsda } from '../js/food/usda.js';

test('OFF product normalizes to per-100g', () => {
  const r = normalizeProduct({
    code: '123', product_name: 'Peanut Butter', brands: 'Brand X',
    serving_quantity: 32, serving_size: '2 tbsp (32 g)',
    nutriments: { 'energy-kcal_100g': 588, proteins_100g: 25, carbohydrates_100g: 20, fat_100g: 50 },
  });
  assert.equal(r.id, 'off:123');
  assert.equal(r.source, 'off');
  assert.deepEqual(r.per100g, { kcal: 588, p: 25, c: 20, f: 50 });
  assert.equal(r.serving.grams, 32);
});
test('OFF product without nutrition data is dropped', () => {
  assert.equal(normalizeProduct({ code: '9', product_name: 'Mystery', nutriments: {} }), null);
});
test('USDA food normalizes via nutrient ids', () => {
  const r = normalizeUsda({
    fdcId: 456, description: 'Banana, raw', brandOwner: '',
    foodNutrients: [
      { nutrientId: 1008, value: 89 }, { nutrientId: 1003, value: 1.1 },
      { nutrientId: 1005, value: 22.8 }, { nutrientId: 1004, value: 0.3 },
    ],
  });
  assert.equal(r.id, 'usda:456');
  assert.deepEqual(r.per100g, { kcal: 89, p: 1.1, c: 22.8, f: 0.3 });
});
test('USDA food without calories is dropped', () => {
  assert.equal(normalizeUsda({ fdcId: 1, description: 'x', foodNutrients: [] }), null);
});
