import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trFoodToEn } from '../js/food/tr-foods.js';

test('translates single common foods', () => {
  assert.equal(trFoodToEn('tavuk'), 'chicken');
  assert.equal(trFoodToEn('yumurta'), 'egg');
  assert.equal(trFoodToEn('Yoğurt'), 'yogurt');
});

test('translates known multi-word phrases', () => {
  assert.equal(trFoodToEn('tavuk göğsü'), 'chicken breast');
  assert.equal(trFoodToEn('tam buğday ekmeği'), 'whole wheat bread');
});

test('translates word-by-word when every word is known', () => {
  assert.equal(trFoodToEn('ızgara tavuk'), 'grilled chicken');
});

test('returns null when any word is unknown (caller falls back to API)', () => {
  assert.equal(trFoodToEn('enginar kalbi konservesi'), null);
  assert.equal(trFoodToEn(''), null);
});

test('is case-insensitive with Turkish letters (İ→i, I→ı)', () => {
  assert.equal(trFoodToEn('TAVUK'), 'chicken');
  assert.equal(trFoodToEn('IZGARA TAVUK'), 'grilled chicken');
  assert.equal(trFoodToEn('İncir'), 'fig');
});
