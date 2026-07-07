import { prescribe, ageFromBirthdate, ACTIVITY } from '../engine/prescribe.js';
import { rescalePlan } from '../engine/planner.js';
import { ftInToCm, cmToFtIn } from '../units.js';
import { dstr } from '../util.js';

let root, ctx;

export async function mount(el, c) {
  root = el;
  ctx = c;
  render();
}

async function render() {
  const s = await ctx.db.get('settings', 'main');
  const imp = s.units === 'imperial';
  const { ft, in: inch } = cmToFtIn(s.heightCm);
  root.innerHTML = `
  <div class="card"><h2>Profile & goal</h2>
    <label>Units</label><select id="units">
      <option value="imperial" ${imp ? 'selected' : ''}>lb + ft/in</option>
      <option value="metric" ${imp ? '' : 'selected'}>kg + cm</option></select>
    <label>Height</label>${imp
      ? `<div class="row"><input id="hft" type="number" value="${ft}"><input id="hin" type="number" value="${inch}"></div>`
      : `<input id="hcm" type="number" value="${Math.round(s.heightCm)}">`}
    <label>Activity</label><select id="act">${Object.keys(ACTIVITY).map((k) =>
      `<option ${k === s.activityLevel ? 'selected' : ''}>${k}</option>`).join('')}</select>
    <label>Goal</label><select id="gtype">${['lose', 'maintain', 'gain', 'reverse'].map((g) =>
      `<option ${g === s.goal.type ? 'selected' : ''}>${g}</option>`).join('')}</select>
    <label>Rate (% body weight / week; ignored for maintain/reverse)</label>
    <input id="grate" type="number" step="0.125" value="${s.goal.ratePctPerWeek}">
    <label>Diet style</label><select id="dstyle">${['balanced', 'lowfat', 'lowcarb', 'keto'].map((d) =>
      `<option ${d === s.dietStyle ? 'selected' : ''}>${d}</option>`).join('')}</select>
    <label><input id="plant" type="checkbox" ${s.plantBased ? 'checked' : ''} style="width:auto"> Plant-based</label>
    <label>Check-in day</label><select id="ciday">${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
      .map((d, i) => `<option value="${i}" ${i === s.checkInDay ? 'selected' : ''}>${d}</option>`).join('')}</select>
    <button class="primary" id="saveprofile">Save & re-prescribe</button>
    <p class="hint">Saving recalculates your targets using your learned TDEE once check-ins exist.</p>
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
  wire(s);
}

function wire(s) {
  const q = (sel) => root.querySelector(sel);
  q('#units').onchange = async () => {
    s.units = q('#units').value;
    await ctx.db.put('settings', s, 'main');
    render();
  };
  q('#saveprofile').onclick = async () => {
    if (s.units === 'imperial') s.heightCm = ftInToCm(+q('#hft').value || 5, +q('#hin').value || 8);
    else s.heightCm = +q('#hcm').value || s.heightCm;
    s.activityLevel = q('#act').value;
    s.goal = { type: q('#gtype').value, ratePctPerWeek: +q('#grate').value || 0, goalWeightKg: s.goal.goalWeightKg };
    s.dietStyle = q('#dstyle').value;
    s.plantBased = q('#plant').checked;
    s.checkInDay = +q('#ciday').value;
    await ctx.db.put('settings', s, 'main');
    const weighins = await ctx.db.getAll('weighins');
    const weightKg = weighins.sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.weightKg ?? 80;
    const checkins = (await ctx.db.getAll('checkins')).sort((a, b) => (a.date < b.date ? 1 : -1));
    const t = prescribe({
      sex: s.sex,
      weightKg,
      heightCm: s.heightCm,
      age: ageFromBirthdate(s.birthdate, dstr()),
      activity: s.activityLevel,
      goal: s.goal,
      dietStyle: s.dietStyle,
      plantBased: s.plantBased,
      tdeeOverride: checkins[0]?.tdee ?? undefined,
    });
    await ctx.db.put('targets', { ...t, effectiveDate: dstr(), reason: 'Settings change' });
    const plan = await ctx.db.get('planner', 'main');
    if (plan) await ctx.db.put('planner', { ...plan, days: rescalePlan(plan.days, t.kcal) }, 'main');
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
    await ctx.db.importAll(JSON.parse(await file.text()));
    location.reload();
  };
  q('#wipe').onclick = async () => {
    if (!confirm('Erase ALL MacroCoach data on this device? This cannot be undone.')) return;
    await ctx.db.wipe();
    location.reload();
  };
}
