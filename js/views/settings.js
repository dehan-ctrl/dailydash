import { prescribe, ageFromBirthdate, ACTIVITY, ACTIVITY_LABELS, editMacro } from '../engine/prescribe.js';
import { rescalePlan } from '../engine/planner.js';
import { latestTargets, activeTargets } from '../engine/targets.js';
import { ftInToCm, cmToFtIn, lbToKg, kgToLb } from '../units.js';
import { dstr } from '../util.js';
import { DEFAULT_BACKUP_REMINDER_DAYS, downloadBackup } from '../backup.js';
import { t, langChip, wireLangChip } from '../i18n.js';

let root, ctx;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export async function mount(el, c) { root = el; ctx = c; render(); }

async function render() {
  const s = await ctx.db.get('settings', 'main');
  const profiles = await ctx.db.listProfiles();
  const activeProfile = await ctx.db.getActiveProfile();
  const coach = latestTargets(await ctx.db.getAll('targets'));
  const imp = s.units === 'imperial';
  const { ft, in: inch } = cmToFtIn(s.heightCm);
  const rate = s.goal.rateKgPerWeek ?? 0;
  const custom = s.customTargets ?? { ...coachOnly(coach) };
  const reminderDays = s.backupReminderDays ?? DEFAULT_BACKUP_REMINDER_DAYS;
  root.innerHTML = `
  <div class="spread" style="margin-bottom:10px"><h1 style="margin:0">${t('Settings')}</h1>${langChip()}</div>
  <div class="card"><h2>${t('Users')}</h2>
    <label>${t('Current user')}</label>
    <select id="profilepick">${profiles.map((p) =>
      `<option value="${p.id}" ${p.id === activeProfile.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
    <div class="row" style="margin-top:8px">
      <button class="ghost" id="addprofile">${t('Add user')}</button>
      <button class="ghost" id="renameprofile">${t('Rename')}</button>
      <button class="ghost danger" id="deleteprofile">${t('Delete')}</button>
    </div>
    <p class="hint">${t('Each user has separate logs, targets, foods, recipes, recents, and favorites on this device.')}</p>
  </div>

  <div class="card"><h2>${t('Coach settings')}</h2>
    <label>${t('Goal')}</label><select id="gtype">${[
      ['lose', 'Lose weight'], ['maintain', 'Maintain'], ['gain', 'Gain weight'], ['reverse', 'Reverse diet'],
    ].map(([v, l]) => `<option value="${v}" ${v === s.goal.type ? 'selected' : ''}>${t(l)}</option>`).join('')}</select>
    <label>${t('Rate ({u} per week — how fast to lose/gain)', { u: imp ? 'lb' : 'kg' })}</label>
    <input id="grate" type="number" step="${imp ? 0.25 : 0.1}" min="0"
      value="${imp ? +kgToLb(rate).toFixed(2) : rate}">
    <label>${t('Goal weight ({u}, optional)', { u: imp ? 'lb' : 'kg' })}</label>
    <input id="gw" type="number" step="0.1"
      value="${s.goal.goalWeightKg ? (imp ? +kgToLb(s.goal.goalWeightKg).toFixed(1) : s.goal.goalWeightKg) : ''}">
    <label>${t('Check-in day')}</label><select id="ciday">${WEEKDAYS
      .map((d, i) => `<option value="${i}" ${i === s.checkInDay ? 'selected' : ''}>${t(d)}</option>`).join('')}</select>
  </div>

  <div class="card"><h2>${t('Macro targets')}</h2>
    <div class="optrow"><div><b>${t('From Coach')}</b><br>
      <span class="muted">${t('{kcal} Cal, {p}p, {c}c, {f}f', { kcal: coach.kcal, p: coach.proteinG, c: coach.carbG, f: coach.fatG })}</span></div>
      <input type="radio" name="tmode" value="coach" ${s.targetMode !== 'custom' ? 'checked' : ''}></div>
    <div class="optrow"><div style="flex:1"><b>${t('Custom')}</b><br>
      <div class="row" style="margin-top:6px">
        <input id="mk" type="number" placeholder="${t('Cal')}" value="${custom.kcal}">
        <input id="mp" type="number" placeholder="P" value="${custom.proteinG}">
        <input id="mc" type="number" placeholder="C" value="${custom.carbG}">
        <input id="mf" type="number" placeholder="F" value="${custom.fatG}"></div></div>
      <input type="radio" name="tmode" value="custom" ${s.targetMode === 'custom' ? 'checked' : ''}></div>
    <p class="hint">${t('The coach keeps adjusting its numbers weekly. Custom stays exactly what you type until you change it.')}</p>
    <button class="ghost" id="savetargets" style="width:100%">${t('Save macro targets')}</button>
  </div>

  <div class="card"><h2>${t('Diet preferences')}</h2>
    <label>${t('Diet type')}</label><select id="dstyle">${[
      ['balanced', 'Balanced'], ['lowfat', 'Low-fat'], ['lowcarb', 'Low-carb'], ['keto', 'Keto'],
    ].map(([v, l]) => `<option value="${v}" ${v === s.dietStyle ? 'selected' : ''}>${t(l)}</option>`).join('')}</select>
    <label><input id="plant" type="checkbox" ${s.plantBased ? 'checked' : ''}> ${t('Plant-based (protein set to 1.8 g/kg)')}</label>
  </div>

  <div class="card"><h2>${t('Profile')}</h2>
    <label>${t('Units')}</label><select id="units">
      <option value="imperial" ${imp ? 'selected' : ''}>lb + ft/in</option>
      <option value="metric" ${imp ? '' : 'selected'}>kg + cm</option></select>
    <label>${t('Height')}</label>${imp
      ? `<div class="row"><input id="hft" type="number" value="${ft}" aria-label="feet"><input id="hin" type="number" value="${inch}" aria-label="inches"></div>`
      : `<input id="hcm" type="number" value="${Math.round(s.heightCm)}">`}
    <label>${t('Body fat % (optional — makes calorie math more accurate)')}</label>
    <input id="bf" type="number" step="0.1" value="${s.bodyFatPct ?? ''}" placeholder="${t('e.g. 18')}">
    <label>${t('Activity level (outside workouts)')}</label>
    <select id="act">${Object.keys(ACTIVITY).map((k) =>
      `<option value="${k}" ${k === s.activityLevel ? 'selected' : ''}>${t(ACTIVITY_LABELS[k])}</option>`).join('')}</select>
    <button class="primary" id="saveprofile">${t('Save & update coach targets')}</button>
    <p class="hint">${t("Saving recalculates the coach's numbers — using your learned TDEE once check-ins exist.")}</p>
  </div>

  <div class="card"><h2>${t('Food database')}</h2>
    <label>${t('USDA FoodData Central API key (optional)')}</label>
    <input id="usda" value="${s.usdaApiKey || ''}" placeholder="${t('free key from fdc.nal.usda.gov')}">
    <button class="ghost" id="savekey" style="margin-top:8px">${t('Save key')}</button>
  </div>

  <div class="card"><h2>${t('Data')}</h2>
    <p class="muted">${t('Everything lives on this device. Export a backup regularly.')}</p>
    <label>${t('Backup reminder')}</label>
    <select id="backupdays">
      <option value="14" ${reminderDays === 14 ? 'selected' : ''}>${t('Every 2 weeks')}</option>
      <option value="30" ${reminderDays === 30 ? 'selected' : ''}>${t('Monthly')}</option>
      <option value="0" ${reminderDays === 0 ? 'selected' : ''}>${t('Off')}</option>
    </select>
    <div class="row"><button class="ghost" id="exp">${t('Export backup')}</button>
      <button class="ghost" id="impbtn">${t('Import backup')}</button></div>
    <input type="file" id="impfile" accept=".json" hidden>
    <button class="ghost danger" id="wipe" style="margin-top:12px;width:100%">${t('Erase all data')}</button>
  </div>`;
  wireLangChip(root, () => ctx.refresh());
  wire(s, coach, profiles);
}

const coachOnly = (t) => ({ kcal: t.kcal, proteinG: t.proteinG, carbG: t.carbG, fatG: t.fatG });

function wire(s, coach, profiles) {
  const q = (sel) => root.querySelector(sel);
  q('#profilepick').onchange = async () => {
    await ctx.db.setActiveProfile(q('#profilepick').value);
    location.reload();
  };
  q('#addprofile').onclick = async () => {
    const name = prompt(t('Name for the new user?'));
    if (name == null) return;
    const p = await ctx.db.createProfile(name);
    await ctx.db.setActiveProfile(p.id);
    location.reload();
  };
  q('#renameprofile').onclick = async () => {
    const id = q('#profilepick').value;
    const p = profiles.find((x) => x.id === id);
    const name = prompt(t('New name for this user?'), p?.name || '');
    if (name == null) return;
    await ctx.db.renameProfile(id, name);
    render();
  };
  q('#deleteprofile').onclick = async () => {
    const id = q('#profilepick').value;
    const p = profiles.find((x) => x.id === id);
    if (!confirm(t('Delete {name} and all of their data on this device? This cannot be undone.', { name: p?.name || t('this user') }))) return;
    try {
      await ctx.db.deleteProfile(id);
    } catch (err) {
      alert(err.message);
      return;
    }
    location.reload();
  };
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
  q('#backupdays').onchange = async () => {
    s.backupReminderDays = +q('#backupdays').value;
    await ctx.db.put('settings', s, 'main');
  };
  q('#exp').onclick = async () => { await downloadBackup(ctx.db); };
  q('#impbtn').onclick = () => q('#impfile').click();
  q('#impfile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await ctx.db.importAll(JSON.parse(await file.text()));
    } catch (err) {
      alert(t('Import failed: {message}', { message: err.message }));
      return;
    }
    location.reload();
  };
  q('#wipe').onclick = async () => {
    if (!confirm(t('Erase ALL MacroCoach data on this device? This cannot be undone.'))) return;
    await ctx.db.wipe();
    location.reload();
  };
}
