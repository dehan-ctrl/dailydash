import { dstr } from './util.js';

export const DEFAULT_BACKUP_REMINDER_DAYS = 14;

export function backupReminderLabel(days) {
  if (!days) return 'off';
  if (+days === 14) return 'two weeks';
  if (+days === 30) return 'a month';
  return `${days} days`;
}

export function backupReminder(settings, now = new Date()) {
  const days = +(settings.backupReminderDays ?? DEFAULT_BACKUP_REMINDER_DAYS);
  if (!days) return { due: false, days, label: backupReminderLabel(days) };
  const last = settings.lastBackupAt ?? settings.onboardedAt;
  if (!last) return { due: false, days, label: backupReminderLabel(days) };
  const elapsed = (now - new Date(last + 'T12:00:00')) / 86400000;
  return { due: elapsed >= days, days, label: backupReminderLabel(days) };
}

export async function downloadBackup(db) {
  const data = await db.exportAll();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `macrocoach-backup-${dstr()}.json`;
  a.click();
  const settings = await db.get('settings', 'main');
  await db.put('settings', { ...settings, lastBackupAt: dstr() }, 'main');
}
