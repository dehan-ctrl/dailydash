import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPickerState } from '../js/views/diary-state.js';

test('createPickerState can initialize directly on the food update screen', () => {
  const food = { id: 'usda:egg', label: 'Egg' };
  const state = createPickerState(0, {
    picked: { food, servingIdx: 1, qty: 2 },
    editEntry: { meal: 0, index: 1, entryId: 'entry-1' },
  });

  assert.equal(state.meal, 0);
  assert.equal(state.picked.food, food);
  assert.deepEqual(state.editEntry, { meal: 0, index: 1, entryId: 'entry-1' });
  assert.equal(state.searchMode, false);
});
