import * as db from './db.js';

const TABS = [['log', 'Log'], ['coach', 'Coach'], ['trends', 'Trends'], ['plan', 'Plan'], ['settings', 'Settings']];
let current = 'log';
const ctx = { db, navigate, refresh: () => navigate(current) };

export async function navigate(id) {
  current = id;
  document.querySelectorAll('#tabbar button')
    .forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  const main = document.getElementById('view');
  main.innerHTML = '';
  try {
    (await import(`./views/${id}.js`)).mount(main, ctx);
  } catch (e) {
    main.innerHTML = `<div class="card"><h2>${id}</h2><p>Coming soon.</p></div>`;
    console.error(e);
  }
}

async function boot() {
  navigator.storage?.persist?.();
  const tb = document.getElementById('tabbar');
  tb.innerHTML = TABS.map(([id, l]) => `<button data-id="${id}">${l}</button>`).join('');
  tb.onclick = (e) => { const b = e.target.closest('button'); if (b) navigate(b.dataset.id); };
  const settings = await db.get('settings', 'main');
  if (!settings) {
    document.body.classList.add('onboarding');
    (await import('./views/onboarding.js')).mount(document.getElementById('view'), ctx);
  } else navigate('log');
}
boot();
