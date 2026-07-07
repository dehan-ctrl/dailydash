import { defaultPlan, editDay, weeklyTotal, dayMacros } from '../engine/planner.js';
import { kcalFloor } from '../engine/prescribe.js';
import { latestTargets, activeTargets } from '../engine/targets.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let root, ctx, msg = '';

export async function mount(el, c) {
  root = el;
  ctx = c;
  msg = '';
  render();
}

async function load() {
  const settings = await ctx.db.get('settings', 'main');
  const targets = activeTargets(settings, latestTargets(await ctx.db.getAll('targets')));
  const plan = (await ctx.db.get('planner', 'main')) ?? { enabled: false, days: defaultPlan(targets.kcal) };
  return { settings, targets, plan };
}

async function render() {
  const { settings, targets, plan } = await load();
  const total = weeklyTotal(plan.days), budget = targets.kcal * 7;
  root.innerHTML = `
  <div class="backbar"><button class="ghost" id="backdiary">‹ Diary</button><h2>Calorie planner</h2></div>
  <div class="card"><div class="spread"><span>Plan high and low days</span>
    <label style="margin:0"><input type="checkbox" id="en" ${plan.enabled ? 'checked' : ''}> On</label></div>
  <p class="muted">Shift calories between days — the weekly total stays ${budget} kcal. Lock days to pin them.</p></div>
  <div class="card" ${plan.enabled ? '' : 'style="opacity:.45;pointer-events:none"'}>
    ${plan.days.map((d, i) => {
      const m = dayMacros(d.kcal, targets);
      return `<div class="planday"><b>${DOW[i]}</b>
        <span class="muted">P ${m.proteinG} · C ${m.carbG} · F ${m.fatG}</span>
        <input type="number" value="${d.kcal}" data-day="${i}" ${d.locked ? 'disabled' : ''}>
        <button class="lock ${d.locked ? 'on' : ''}" data-lock="${i}">${d.locked ? '🔒' : '🔓'}</button></div>`;
    }).join('')}
    <div class="spread" style="margin-top:8px"><span class="muted">Weekly total</span>
      <b>${total} / ${budget} kcal ${total === budget ? '✓' : '⚠️'}</b></div>
    ${msg ? `<p class="msg">${msg}</p>` : ''}
    <button class="ghost" id="even" style="margin-top:8px">Even out week</button>
  </div>`;
  wire(plan, targets, settings);
}

function wire(plan, targets, settings) {
  const save = async () => { await ctx.db.put('planner', plan, 'main'); render(); };
  root.querySelector('#backdiary').onclick = () => ctx.navigate('diary');
  root.querySelector('#en').onchange = async (e) => {
    plan.enabled = e.target.checked;
    msg = '';
    await save();
  };
  root.querySelector('#even').onclick = async () => {
    plan.days = defaultPlan(targets.kcal);
    msg = '';
    await save();
  };
  root.querySelectorAll('[data-lock]').forEach((b) => (b.onclick = async () => {
    plan.days[+b.dataset.lock].locked = !plan.days[+b.dataset.lock].locked;
    msg = '';
    await save();
  }));
  root.querySelectorAll('[data-day]').forEach((inp) => (inp.onchange = async () => {
    const r = editDay(plan.days, +inp.dataset.day, +inp.value, kcalFloor(settings.sex));
    msg = r.message;
    if (r.applied) plan.days = r.days;
    await save();
  }));
}
