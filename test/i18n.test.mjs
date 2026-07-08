import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { t, setLang, getLang, locale } from '../js/i18n.js';

beforeEach(() => setLang('en'));

test('t returns the English string as-is in English mode', () => {
  assert.equal(t('Add food'), 'Add food');
});

test('t translates known strings in Turkish mode', () => {
  setLang('tr');
  assert.equal(t('Breakfast'), 'Kahvaltı');
  assert.equal(t('Diary'), 'Günlük');
});

test('t falls back to English for unknown strings in Turkish mode', () => {
  setLang('tr');
  assert.equal(t('Some brand-new string'), 'Some brand-new string');
});

test('t substitutes {vars} after lookup so Turkish word order works', () => {
  setLang('tr');
  assert.equal(t('Add to {meal}', { meal: t('Breakfast') }), 'Kahvaltı öğününe ekle');
  setLang('en');
  assert.equal(t('Add to {meal}', { meal: 'Lunch' }), 'Add to Lunch');
});

test('setLang persists and normalizes; locale follows', () => {
  setLang('tr');
  assert.equal(getLang(), 'tr');
  assert.equal(locale(), 'tr-TR');
  setLang('nonsense');
  assert.equal(getLang(), 'en');
  assert.equal(locale(), 'en-US');
});
