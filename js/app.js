import * as db from './db.js';

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
  try {
    (await import(`./views/${id}.js`)).mount(main, ctx);
  } catch (e) {
    main.innerHTML = `<div class="card"><h2>${id}</h2><p>Something went wrong loading this screen.</p></div>`;
    console.error(e);
  }
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
  if (dirty) await db.put('settings', settings, 'main');
  return settings;
}

async function boot() {
  navigator.storage?.persist?.();
  const tb = document.getElementById('tabbar');
  tb.innerHTML = TABS.map(([id, l]) => `<button data-id="${id}">${l}</button>`).join('');
  tb.onclick = (e) => { const b = e.target.closest('button'); if (b) navigate(b.dataset.id); };
  let settings = await db.get('settings', 'main');
  if (!settings) {
    document.body.classList.add('onboarding');
    (await import('./views/onboarding.js')).mount(document.getElementById('view'), ctx);
  } else {
    settings = await migrate(settings);
    navigate('diary');
    const last = settings.lastBackupAt ?? settings.onboardedAt;
    if ((Date.now() - new Date(last + 'T12:00:00')) / 86400000 > 30) {
      const b = document.createElement('div');
      b.className = 'banner spread';
      b.style.margin = `calc(14px + env(safe-area-inset-top)) 14px 0`;
      b.innerHTML = `It's been a month since your last backup <button class="ghost" id="nudge">Export now</button>`;
      document.getElementById('view').before(b);
      b.querySelector('#nudge').onclick = () => { b.remove(); navigate('settings'); };
    }
  }
}
boot();
