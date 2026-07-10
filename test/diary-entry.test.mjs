import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureEntryIds, withEntryId, updateLogEntry } from '../js/food/log-entry.js';

const meals = (...entries) => [
  { name: 'Breakfast', entries: entries[0] || [] },
  { name: 'Lunch', entries: entries[1] || [] },
  { name: 'Dinner', entries: entries[2] || [] },
  { name: 'Snacks', entries: entries[3] || [] },
];

test('withEntryId gives duplicate foods distinct identities', () => {
  const egg = { label: 'Egg', foodId: 'usda:egg', qty: 2, unit: 'serving', kcal: 140, p: 12, c: 0.8, f: 10 };
  const first = withEntryId(egg, () => 'entry-1');
  const second = withEntryId(egg, () => 'entry-2');

  assert.equal(first.foodId, second.foodId);
  assert.notEqual(first.entryId, second.entryId);
});

test('ensureEntryIds backfills legacy entries without changing existing ids', () => {
  const log = {
    date: '2026-07-09',
    meals: meals([
      { label: 'Egg', foodId: 'usda:egg' },
      { entryId: 'kept', label: 'Toast', foodId: 'usda:toast' },
    ]),
  };

  const changed = ensureEntryIds(log, () => 'new-id');

  assert.equal(changed, true);
  assert.equal(log.meals[0].entries[0].entryId, 'new-id');
  assert.equal(log.meals[0].entries[1].entryId, 'kept');
});

test('updateLogEntry updates only the matching duplicate entry id', () => {
  const log = {
    date: '2026-07-09',
    meals: meals(
      [
        { entryId: 'breakfast-eggs', label: 'Egg', foodId: 'usda:egg', qty: 2, kcal: 140 },
        { entryId: 'breakfast-eggs-2', label: 'Egg', foodId: 'usda:egg', qty: 1, kcal: 70 },
      ],
      [
        { entryId: 'lunch-eggs', label: 'Egg', foodId: 'usda:egg', qty: 2, kcal: 140 },
      ],
    ),
  };

  updateLogEntry(log, { entryId: 'breakfast-eggs', meal: 0, index: 0 }, { label: 'Egg', foodId: 'usda:egg', qty: 3, kcal: 210 });

  assert.equal(log.meals[0].entries[0].qty, 3);
  assert.equal(log.meals[0].entries[1].qty, 1);
  assert.equal(log.meals[1].entries[0].qty, 2);
});

test('updateLogEntry can move one duplicate to another meal', () => {
  const log = {
    date: '2026-07-09',
    meals: meals(
      [{ entryId: 'breakfast-eggs', label: 'Egg', foodId: 'usda:egg', qty: 2 }],
      [{ entryId: 'lunch-eggs', label: 'Egg', foodId: 'usda:egg', qty: 2 }],
    ),
  };

  updateLogEntry(log, { entryId: 'breakfast-eggs', meal: 0, index: 0 }, { label: 'Egg', foodId: 'usda:egg', qty: 1 }, 1);

  assert.deepEqual(log.meals[0].entries.map((e) => e.entryId), []);
  assert.deepEqual(log.meals[1].entries.map((e) => e.entryId), ['lunch-eggs', 'breakfast-eggs']);
  assert.equal(log.meals[1].entries[1].qty, 1);
});
