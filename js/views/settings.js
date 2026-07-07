import { prescribe, ageFromBirthdate, ACTIVITY, ACTIVITY_LABELS, editMacro } from '../engine/prescribe.js';
import { rescalePlan } from '../engine/planner.js';
import { latestTargets, activeTargets } from '../engine/targets.js';
import { ftInToCm, cmToFtIn, lbToKg, kgToLb } from '../units.js';
import { dstr } from '../util.js';

let root, ctx;

export async function mount(el, c) { root = el; ctx = c; render(); }

async function render() {
  const s = await ctx.db.get('settings', 'main');
  const coach = latestTargets(await ctx.db.getAll('targets'));
  const imp = s.units === 'imperial';
  const { ft, in: inch } = cmToFtIn(s.heightCm);
  const rate = s.goal.rateKgPerWeek ?? 0;
  const custom = s.customTargets ?? { ...coachOnly(coach) };
  root.innerHTML = `
  <div class="card"><h2>Coach settings</h2>
    <label>Goal</label><select id="gtype">${[
      ['lose', 'Lose weight'], ['maintain', 'Maintain'], ['gain', 'Gain weight'], ['reverse', 'Reverse diet'],
    ].map(([v, l]) => `<option value="${v}" ${v === s.goal.type ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label>Rate (${imp ? 'lb' : 'kg'} per week — how fast to lose/gain)</label>
    <input id="grate" type="number" step="${imp ? 0.25 : 0.1}" min="0"
      value="${imp ? +kgToLb(rate).toFixed(2) : rate}">
    <label>Goal weight (${imp ? 'lb' : 'kg'}, optional)</label>
    <input id="gw" type="number" step="0.1"
      value="${s.goal.goalWeightKg ? (imp ? +kgToLb(s.goal.goalWeightKg).toFixed(1) : s.goal.goalWeightKg) : ''}">
    <label>Check-in day</label><select id="ciday">${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
      .map((d, i) => `<option value="${i}" ${i === s.checkInDay ? 'selected' : ''}>${d}</option>`).join('')}</select>
  </div>

  <div class="card"><h2>Macro targets</h2>
    <div class="optrow"><div><b>From Coach</b><br>
      <span class="muted">${coach.kcal} Cal · ${coach.proteinG}p · ${coach.carbG}c · ${coach.fatG}f</span></div>
      <input type="radio" name="tmode" value="coach" ${s.targetMode !== 'custom' ? 'checked' : ''}></div>
    <div class="optrow"><div style="flex:1"><b>Custom</b><br>
      <div class="row" style="margin-top:6px">
        <input id="mk" type="number" placeholder="Cal" value="${custom.kcal}">
        <input id="mp" type="number" placeholder="P" value="${custom.proteinG}">
        <input id="mc" type="number" placeholder="C" value="${custom.carbG}">
        <input id="mf" type="number" placeholder="F" value="${custom.fatG}"></div></div>
      <input type="radio" name="tmode" value="custom" ${s.targetMode === 'custom' ? 'checked' : ''}></div>
    <p class="hint">The coach keeps adjusting its numbers weekly. Custom stays exactly what you type until you change it.</p>
    <button class="ghost" id="savetargets" style="width:100%">Save macro targets</button>
  </div>

  <div class="card"><h2>Diet preferences</h2>
    <label>Diet type</label><select id="dstyle">${[
      ['balanced', 'Balanced'], ['lowfat', 'Low-fat'], ['lowcarb', 'Low-carb'], ['keto', 'Keto'],
    ].map(([v, l]) => `<option value="${v}" ${v === s.dietStyle ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label><input id="plant" type="checkbox" ${s.plantBased ? 'checked' : ''}> Plant-based (protein set to 1.8 g/kg)</label>
  </div>

  <div class="card"><h2>Profile</h2>
    <label>Units</label><select id="units">
      <option value="imperial" ${imp ? 'selected' : ''}>lb + ft/in</option>
      <option value="metric" ${imp ? '' : 'selected'}>kg + cm</option></select>
    <label>Height</label>${imp
      ? `<div class="row"><input id="hft" type="number" value="${ft}" aria-label="feet"><input id="hin" type="number" value="${inch}" aria-label="inches"></div>`
      : `<input id="hcm" type="number" value="${Math.round(s.heightCm)}">`}
    <label>Body fat % (optional — makes calorie math more accurate)</label>
    <input id="bf" type="number" step="0.1" value="${s.bodyFatPct ?? ''}" placeholder="e.g. 18">
    <label>Activity level (outside workouts)</label>
    <select id="act">${Object.keys(ACTIVITY).map((k) =>
      `<option value="${k}" ${k === s.activityLevel ? 'selected' : ''}>${ACTIVITY_LABELS[k]}</option>`).join('')}</select>
    <button class="primary" id="saveprofile">Save & update coach targets</button>
    <p class="hint">Saving recalculates the coach's numbers — using your learned TDEE once check-ins exist.</p>
  </div>

  <div class="card"><h2>Food database</h2>
    <label>USDA FoodData Central API key (optional)</label>
    <input id="usda" value="${s.usdaApiKey || ''}" placeholder="free key from fdc.nal.usda.gov">
    <button class="ghost" id="savekey" style="margin-top:8px">Save key</button>
  </div>

  <div class="card"><h2>Data</h2>
    <p class="muted">Everything lives on this device. Export a backup regularly.</p>
    <div class="row"><button class="ghost" id="exp">Export backup</button>
      <button class="ghost" id="impbtn">Import backup</button></div>
    <input type="file" id="impfile" accept=".json" hidden>
    <button class="ghost danger" id="wipe" style="margin-top:12px;width:100%">Erase all data</button>
  </div>`;
  wire(s, coach);
}

const coachOnly = (t) => ({ kcal: t.kcal, proteinG: t.proteinG, carbG: t.carbG, fatG: t.fatG });

function wire(s, coach) {
  const q = (sel) => root.querySelector(sel);
  q('#units').onchange = async () => {
    s.units = q('#units').value;
    await ctx.db.put('settings', s, 'main');
    render();
  };
  q('#savetargets').onclick = async () => {
    s.targetMode = root.querySelector('input[name="tmode"]:checked').value;
    s.customTargets = {
      kcal: +q('#mk').value || coach.kcal, proteinG: +q('#mp').value || coach.proteinG,
      carbG: +q('#mc').value || coach.carbG, fatG: +q('#mf').value || coach.fatG,
    };
    await ctx.db.put('settings', s, 'main');
    const plan = await ctx.db.get('planner', 'main');
    if (plan?.enabled) {
      const active = activeTargets(s, coach);
      await ctx.db.put('planner', { ...plan, days: rescalePlan(plan.days, active.kcal) }, 'main');
    }
    ctx.navigate('diary');
  };
  q('#saveprofile').onclick = async () => {
    const imp = s.units === 'imperial';
    if (imp) s.heightCm = ftInToCm(+q('#hft').value || 5, +q('#hin').value || 8);
    else s.heightCm = +q('#hcm').value || s.heightCm;
    const bf = +q('#bf').value;
    s.bodyFatPct = bf > 0 && bf < 70 ? bf : null;
    s.activityLevel = q('#act').value;
    const rate = Math.abs(+q('#grate').value || 0);
    const gw = +q('#gw').value;
    s.goal = {
      type: q('#gtype').value,
      rateKgPerWeek: +(imp ? lbToKg(rate) : rate).toFixed(3),
      goalWeightKg: gw > 0 ? +(imp ? lbToKg(gw) : gw).toFixed(1) : null,
    };
    s.dietStyle = q('#dstyle').value;
    s.plantBased = q('#plant').checked;
    s.checkInDay = +q('#ciday').value;
    await ctx.db.put('settings', s, 'main');
    const weighins = await ctx.db.getAll('weighins');
    const weightKg = weighins.sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.weightKg ?? 80;
    const checkins = (await ctx.db.getAll('checkins')).sort((a, b) => (a.date < b.date ? 1 : -1));
    const t = prescribe({
      sex: s.sex, weightKg, heightCm: s.heightCm, bodyFatPct: s.bodyFatPct,
      age: ageFromBirthdate(s.birthdate, dstr()),
      activity: s.activityLevel, goal: s.goal, dietStyle: s.dietStyle, plantBased: s.plantBased,
      tdeeOverride: checkins[0]?.tdee ?? undefined,
    });
    await ctx.db.put('targets', { ...t, effectiveDate: dstr(), reason: 'Settings change' });
    const plan = await ctx.db.get('planner', 'main');
    if (plan) {
      const active = activeTargets(s, t);
      await ctx.db.put('planner', { ...plan, days: rescalePlan(plan.days, active.kcal) }, 'main');
    }
    ctx.navigate('coach');
  };
  q('#savekey').onclick = async () => {
    s.usdaApiKey = q('#usda').value.trim();
    await ctx.db.put('settings', s, 'main');
  };
  q('#exp').onclick = async () => {
    const data = await ctx.db.exportAll();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = `macrocoach-backup-${dstr()}.json`;
    a.click();
    s.lastBackupAt = dstr();
    await ctx.db.put('settings', s, 'main');
  };
  q('#impbtn').onclick = () => q('#impfile').click();
  q('#impfile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await ctx.db.importAll(JSON.parse(await file.text()));
    } catch (err) {
      alert(`Import failed: ${err.message}`);
      return;
    }
    location.reload();
  };
  q('#wipe').onclick = async () => {
    if (!confirm('Erase ALL MacroCoach data on this device? This cannot be undone.')) return;
    await ctx.db.wipe();
    location.reload();
  };
}
