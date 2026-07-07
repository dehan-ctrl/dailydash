import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupReminder, backupReminderLabel } from '../js/backup.js';

test('backup reminder is due after the configured two-week interval', () => {
  assert.equal(backupReminder({
    lastBackupAt: '2026-07-01',
    onboardedAt: '2026-07-01',
    backupReminderDays: 14,
  }, new Date('2026-07-15T12:00:00')).due, true);
});

test('backup reminder is not due before the configured interval', () => {
  assert.equal(backupReminder({
    lastBackupAt: '2026-07-01',
    onboardedAt: '2026-07-01',
    backupReminderDays: 14,
  }, new Date('2026-07-14T11:59:00')).due, false);
});

test('backup reminder can still be monthly', () => {
  assert.equal(backupReminder({
    lastBackupAt: '2026-07-01',
    onboardedAt: '2026-07-01',
    backupReminderDays: 30,
  }, new Date('2026-07-31T12:01:00')).due, true);
});

test('backup reminder can be disabled', () => {
  assert.equal(backupReminder({
    lastBackupAt: '2026-07-01',
    onboardedAt: '2026-07-01',
    backupReminderDays: 0,
  }, new Date('2026-08-30T12:00:00')).due, false);
});

test('backup reminder label describes two weeks', () => {
  assert.equal(backupReminderLabel(14), 'two weeks');
});
