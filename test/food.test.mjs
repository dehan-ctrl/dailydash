import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOffSearchUrl, hasMoreOffPages, normalizeProduct, normalizeSearchHit } from '../js/food/off.js';
import { buildUsdaSearchUrl, hasMoreUsdaPages, normalizeUsda, usdaServingsFromFood } from '../js/food/usda.js';

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
test('OFF search URL requests larger paged result sets', () => {
  const u = new URL(buildOffSearchUrl('oat milk', 3));
  assert.equal(u.searchParams.get('q'), 'oat milk');
  assert.equal(u.searchParams.get('page_size'), '50');
  assert.equal(u.searchParams.get('page'), '3');
});
test('OFF paging uses response metadata instead of filtered result count', () => {
  assert.equal(hasMoreOffPages({ page: 1, page_count: 3 }), true);
  assert.equal(hasMoreOffPages({ page: 3, page_count: 3 }), false);
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
test('USDA search result keeps household serving text when it has grams', () => {
  const r = normalizeUsda({
    fdcId: 2575290,
    description: 'EGG',
    brandOwner: 'Brand',
    servingSize: 31.2,
    householdServingFullText: '1 EGG',
    foodNutrients: [{ nutrientId: 1008, value: 155 }],
  });
  assert.equal(r.serving.label, '1 EGG');
  assert.equal(r.serving.grams, 31.2);
});
test('USDA detail imports count servings from food portions', () => {
  const servings = usdaServingsFromFood({
    householdServingFullText: undefined,
    servingSize: undefined,
    foodPortions: [
      { amount: 1, modifier: 'large', gramWeight: 33, measureUnit: { name: 'undetermined', abbreviation: 'undetermined' } },
      { amount: 1, modifier: 'cup', gramWeight: 243, measureUnit: { name: 'undetermined', abbreviation: 'undetermined' } },
    ],
  });
  assert.deepEqual(servings, [
    { label: '1 large', grams: 33 },
    { label: '1 cup', grams: 243 },
  ]);
});
test('USDA search URL uses a saved key when present', () => {
  const u = new URL(buildUsdaSearchUrl('banana bread', 'real-key'));
  assert.equal(u.searchParams.get('api_key'), 'real-key');
  assert.equal(u.searchParams.get('query'), 'banana bread');
  assert.equal(u.searchParams.get('pageSize'), '50');
  assert.equal(u.searchParams.get('pageNumber'), '1');
});
test('USDA search URL accepts a page number', () => {
  const u = new URL(buildUsdaSearchUrl('oat milk', 'real-key', 4));
  assert.equal(u.searchParams.get('pageNumber'), '4');
});
test('USDA paging uses response metadata instead of filtered result count', () => {
  assert.equal(hasMoreUsdaPages({ currentPage: 1, totalPages: 2 }), true);
  assert.equal(hasMoreUsdaPages({ currentPage: 2, totalPages: 2 }), false);
});
test('USDA search URL falls back to the bundled public key', () => {
  const u = new URL(buildUsdaSearchUrl('oats', ''));
  assert.equal(u.searchParams.get('api_key'), 'ZfG8R935gi2GI9b0n1C30bx90eJ4KS65iqRocf4m');
});
