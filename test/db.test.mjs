import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isProfiledStore,
  storageKeyFor,
  toStorageRecord,
  fromStorageRecord,
  recordBelongsToProfile,
} from '../js/db.js';

test('settings and dated stores use profile-prefixed storage keys', () => {
  assert.equal(storageKeyFor('settings', 'main', 'p1'), 'p1|main');
  assert.equal(storageKeyFor('logs', '2026-07-07', 'p1'), 'p1|2026-07-07');
  assert.equal(isProfiledStore('profiles'), false);
});

test('dated key-path records are stored with a prefixed key and read back unprefixed', () => {
  const stored = toStorageRecord('logs', { date: '2026-07-07', complete: true }, 'p2');
  assert.equal(stored.date, 'p2|2026-07-07');
  assert.equal(stored.profileId, 'p2');
  assert.deepEqual(fromStorageRecord('logs', stored), { date: '2026-07-07', complete: true });
});

test('food cache records are isolated even when external food ids match', () => {
  const stored = toStorageRecord('foodcache', { id: 'off:123', label: 'Oats' }, 'alice');
  assert.equal(stored.id, 'alice|off:123');
  assert.equal(stored.profileId, 'alice');
  assert.deepEqual(fromStorageRecord('foodcache', stored), { id: 'off:123', label: 'Oats' });
});

test('auto-increment stores keep numeric ids and filter by profile id', () => {
  const mine = toStorageRecord('foods', { id: 7, label: 'Shake' }, 'alice');
  const theirs = toStorageRecord('foods', { id: 8, label: 'Shake' }, 'bob');
  assert.equal(mine.id, 7);
  assert.equal(recordBelongsToProfile('foods', mine, 'alice'), true);
  assert.equal(recordBelongsToProfile('foods', theirs, 'alice'), false);
  assert.deepEqual(fromStorageRecord('foods', mine), { id: 7, label: 'Shake' });
});
