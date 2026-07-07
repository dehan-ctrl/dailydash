import * as db from './db.js';
import { backupReminder, downloadBackup, DEFAULT_BACKUP_REMINDER_DAYS } from './backup.js';

const TABS = [['diary', 'Diary'], ['coach', 'Coach'], ['me', 'Me'], ['settings', 'Settings']];
let current = 'diary';
const ctx = { db, navigate, refresh: () => navigate(current) };

export async function navigate(id) {
  current = id;
  const tab = ['plan'].includes(id) ? 'diary' : id; // sub-screens highlight their parent tab
  document.querySelectorAll('#tabbar button')
    .forEach((b) => b.classList.toggle('active', b.dataset.id === tab));
  const main = document.getElementById('view');
  main.innerHTML = '';
  main.scrollTop = 0;
  try {
    (await import(`./views/${id}.js`)).mount(main, ctx);
  } catch (e) {
    main.innerHTML = `<div class="card"><h2>${id}</h2><p>Something went wrong loading this screen.</p></div>`;
    console.error(e);
  }
}

// Pull-to-refresh: drag down from the top of the view to re-render the
// current screen and check for an app update. Touch-only, so desktop is
// unaffected; disabled during onboarding (no `current` view to reload yet).
function setupPullToRefresh(view) {
  const THRESHOLD = 72;
  const ptr = document.createElement('div');
  ptr.id = 'ptr';
  ptr.innerHTML = '<i></i><span>Up to date ✓</span>';
  document.body.appendChild(ptr);
  const ring = ptr.querySelector('i');
  let startY = 0, pull = 0, tracking = false, busy = false;

  const reset = () => {
    ptr.classList.add('settle');
    ptr.classList.remove('done');
    ptr.style.transform = 'translate(-50%, -24px)';
    ptr.style.opacity = '0';
    setTimeout(() => { ptr.classList.remove('settle'); busy = false; }, 300);
  };

  view.addEventListener('touchstart', (e) => {
    tracking = !busy && view.scrollTop <= 0 && !document.body.classList.contains('onboarding');
    startY = e.touches[0].clientY;
    pull = 0;
  }, { passive: true });

  view.addEventListener('touchmove', (e) => {
    if (!tracking || busy) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || view.scrollTop > 0) { pull = 0; return; }
    e.preventDefault(); // replace the native rubber-band with the indicator
    pull = Math.min(dy * 0.45, 104);
    ptr.classList.remove('settle');
    ptr.style.transform = `translate(-50%, ${Math.min(pull * 0.4, 40) - 24}px)`;
    ptr.style.opacity = Math.min(pull / THRESHOLD, 1);
    ring.style.transform = `rotate(${pull * 3}deg)`;
  }, { passive: false });

  const release = async () => {
    if (!tracking) return;
    tracking = false;
    if (busy) return;
    if (pull < THRESHOLD) { if (pull > 0) reset(); return; }
    busy = true;
    ptr.classList.add('settle', 'refreshing');
    ptr.style.transform = 'translate(-50%, 8px)';
    ptr.style.opacity = '1';
    const t0 = Date.now();
    navigator.serviceWorker?.getRegistration?.().then((r) => r?.update()).catch(() => {});
    try { await navigate(current); } catch { /* navigate renders its own error */ }
    // keep the spinner up long enough to read as "something happened"
    await new Promise((r) => setTimeout(r, Math.max(0, 650 - (Date.now() - t0))));
    ptr.classList.remove('refreshing');
    ptr.classList.add('done');
    setTimeout(reset, 900);
  };
  view.addEventListener('touchend', release);
  view.addEventListener('touchcancel', release);
}

// One-time upgrades for data written by earlier versions.
async function migrate(settings) {
  let dirty = false;
  if (settings.goal && settings.goal.rateKgPerWeek == null) {
    const pct = settings.goal.ratePctPerWeek ?? 0;
    const w = (await db.getAll('weighins')).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.weightKg ?? 80;
    settings.goal.rateKgPerWeek = +((pct / 100) * w).toFixed(2);
    dirty = true;
  }
  if (!settings.targetMode) { settings.targetMode = 'coach'; dirty = true; }
  if (settings.bodyFatPct === undefined) { settings.bodyFatPct = null; dirty = true; }
  if (settings.backupReminderDays === undefined) { settings.backupReminderDays = DEFAULT_BACKUP_REMINDER_DAYS; dirty = true; }
  if (dirty) await db.put('settings', settings, 'main');
  return settings;
}

async function boot() {
  navigator.storage?.persist?.();
  const tb = document.getElementById('tabbar');
  tb.innerHTML = TABS.map(([id, l]) => `<button data-id="${id}">${l}</button>`).join('');
  tb.onclick = (e) => { const b = e.target.closest('button'); if (b) navigate(b.dataset.id); };
  setupPullToRefresh(document.getElementById('view'));
  let settings = await db.get('settings', 'main');
  if (!settings) {
    document.body.classList.add('onboarding');
    (await import('./views/onboarding.js')).mount(document.getElementById('view'), ctx);
  } else {
    settings = await migrate(settings);
    navigate('diary');
    const reminder = backupReminder(settings);
    if (reminder.due) {
      const b = document.createElement('div');
      b.className = 'banner spread';
      b.style.margin = `calc(14px + env(safe-area-inset-top)) 14px 0`;
      b.innerHTML = `It's been ${reminder.label} since your last backup <button class="ghost" id="nudge">Export now</button>`;
      document.getElementById('view').before(b);
      b.querySelector('#nudge').onclick = async () => { await downloadBackup(db); b.remove(); };
    }
  }
}
boot();
