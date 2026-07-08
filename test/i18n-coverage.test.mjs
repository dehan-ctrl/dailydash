import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { TR } from '../js/i18n.js';

// Every string literal passed to t() must have a Turkish dictionary entry.
// Dynamic keys (t(variable)) are covered by their own value entries
// (meal names, weekdays, activity labels, goal titles, engine changes).
test('every literal t() key has a Turkish translation', async () => {
  const files = ['js/app.js', 'js/food/barcode.js'];
  for (const f of await readdir(new URL('../js/views', import.meta.url))) files.push(`js/views/${f}`);
  const missing = new Set();
  for (const f of files) {
    const src = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) missing.add(m[1].replace(/\\'/g, "'"));
    for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) missing.add(m[1]);
  }
  const gaps = [...missing].filter((k) => !(k in TR));
  assert.deepEqual(gaps, [], `Missing TR entries:\n${gaps.join('\n')}`);
});

// Dynamic-key sources: every member of these groups must be translated.
test('dynamic t() groups are fully covered', () => {
  const groups = [
    ['Breakfast', 'Lunch', 'Dinner', 'Snacks'],
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    ['Lose weight', 'Gain weight', 'Maintain', 'Reverse diet'],
    ['hold', 'adjust', 'insufficient'],
    ['two weeks', 'a month', 'off'],
  ];
  for (const g of groups) for (const k of g) assert.ok(k in TR, `missing TR: ${k}`);
});
