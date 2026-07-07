import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProduct, normalizeSearchHit } from '../js/food/off.js';
import { buildUsdaSearchUrl, normalizeUsda } from '../js/food/usda.js';

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
test('OFF Search-a-licious hit normalizes to per-100g', () => {
  const r = normalizeSearchHit({
    code: '0039978041432',
    product_name: 'Oat Bran',
    brands: ['Bob\'s Red Mill'],
    nutriments: { 'energy-kcal_100g': 150, proteins_100g: 7, carbohydrates_100g: 26, fat_100g: 2.5 },
  });
  assert.equal(r.id, 'off:0039978041432');
  assert.equal(r.label, 'Oat Bran');
  assert.equal(r.brand, 'Bob\'s Red Mill');
  assert.deepEqual(r.per100g, { kcal: 150, p: 7, c: 26, f: 2.5 });
});
test('OFF Search-a-licious hit without nutrition data is dropped', () => {
  assert.equal(normalizeSearchHit({ code: '1', product_name: 'No macros' }), null);
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
test('USDA search URL uses a saved key when present', () => {
  const u = new URL(buildUsdaSearchUrl('banana bread', 'real-key'));
  assert.equal(u.searchParams.get('api_key'), 'real-key');
  assert.equal(u.searchParams.get('query'), 'banana bread');
});
test('USDA search URL falls back to the bundled public key', () => {
  const u = new URL(buildUsdaSearchUrl('oats', ''));
  assert.equal(u.searchParams.get('api_key'), 'ZfG8R935gi2GI9b0n1C30bx90eJ4KS65iqRocf4m');
});
