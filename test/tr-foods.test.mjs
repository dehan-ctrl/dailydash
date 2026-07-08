import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trFoodToEn, enFoodToTr } from '../js/food/tr-foods.js';

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

test('enFoodToTr renders English result names in Turkish', () => {
  assert.equal(enFoodToTr('Bananas, raw'), 'Muz, çiğ');
  assert.equal(enFoodToTr('Chicken breast, grilled'), 'Tavuk göğsü, ızgara');
  assert.equal(enFoodToTr('Egg, whole, boiled'), 'Yumurta, tam, haşlanmış');
});

test('enFoodToTr passes unknown words (brands) through unchanged', () => {
  assert.equal(enFoodToTr('Zwixxle bar'), 'Zwixxle bar');
  assert.equal(enFoodToTr(''), '');
});

test('enFoodToTr handles plurals and uppercase', () => {
  assert.equal(enFoodToTr('EGGS'), 'Yumurtalar');
  assert.equal(enFoodToTr('Tomatoes, canned'), 'Domates, konserve');
});
