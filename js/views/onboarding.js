import { prescribe, editMacro, ageFromBirthdate, ACTIVITY, ACTIVITY_LABELS } from '../engine/prescribe.js';
import { lbToKg, kgToLb, ftInToCm, cmToFtIn } from '../units.js';
import { dstr } from '../util.js';
import { t, langChip, wireLangChip } from '../i18n.js';

const s = {
  units: 'imperial', sex: 'm', birthdate: '1990-01-01', activity: 'moderate',
  heightCm: 175, weightKg: 80, bodyFatPct: null,
  goalType: 'lose', rateKgPerWeek: 0.45, goalWeightKg: null,
  dietStyle: 'balanced', plantBased: false,
  targets: null,
};
// display-unit slider bounds per goal type: [min, max, step]
const RATE_BOUNDS = {
  imperial: { lose: [0.25, 2, 0.25], gain: [0.25, 1, 0.25] },
  metric: { lose: [0.1, 0.9, 0.05], gain: [0.1, 0.45, 0.05] },
};
let step = 0, root, ctx;

export function mount(el, c) { root = el; ctx = c; render(); }

const seg = (name, opts, cur) =>
  `<div class="seg" data-seg="${name}">` +
  opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('') +
  `</div>`;

function render() {
  const steps = [profile, goal, style, review];
  root.innerHTML = `<div class="wizard">
    <div class="spread"><p class="stepnum" style="margin:0">${t('Step {n} of 4', { n: step + 1 })}</p>${langChip()}</div>
    ${steps[step]()}</div>`;
  wire();
}

function profile() {
  const imp = s.units === 'imperial';
  const { ft, in: inch } = cmToFtIn(s.heightCm);
  return `<div class="card"><h1>${t('Welcome to MacroCoach')}</h1>
  <label>${t('Units')}</label>${seg('units', [['imperial', 'lb + ft/in'], ['metric', 'kg + cm']], s.units)}
  <label>${t('Sex')}</label>${seg('sex', [['m', t('Male')], ['f', t('Female')]], s.sex)}
  <label>${t('Birthdate')}</label><input type="date" id="birth" value="${s.birthdate}">
  <label>${t('Height')}</label>${imp
    ? `<div class="row"><input type="number" id="hft" value="${ft}" min="3" max="7"> <input type="number" id="hin" value="${inch}" min="0" max="11"></div><p class="hint">${t('feet / inches')}</p>`
    : `<input type="number" id="hcm" value="${Math.round(s.heightCm)}" min="120" max="230"><p class="hint">cm</p>`}
  <label>${t('Current weight ({u})', { u: imp ? 'lb' : 'kg' })}</label>
  <input type="number" id="wt" step="0.1" value="${imp ? +kgToLb(s.weightKg).toFixed(1) : s.weightKg}">
  <label>${t('Body fat % (optional — improves the calorie estimate)')}</label>
  <input type="number" id="bf" step="0.5" value="${s.bodyFatPct ?? ''}" placeholder="${t('skip if unsure')}">
  <label>${t('Activity level (outside workouts)')}</label>
  <select id="act">${Object.keys(ACTIVITY).map((k) =>
    `<option value="${k}" ${k === s.activity ? 'selected' : ''}>${t(ACTIVITY_LABELS[k])}</option>`).join('')}</select>
  <button class="primary" data-next>${t('Next')}</button></div>`;
}

function goal() {
  const imp = s.units === 'imperial';
  const unit = imp ? 'lb' : 'kg';
  const b = RATE_BOUNDS[s.units][s.goalType];
  const rateDisp = imp ? +kgToLb(s.rateKgPerWeek).toFixed(2) : s.rateKgPerWeek;
  return `<div class="card"><h2>${t('Your goal')}</h2>
  ${seg('goalType', [['lose', t('Lose')], ['maintain', t('Maintain')], ['gain', t('Gain')], ['reverse', t('Reverse')]], s.goalType)}
  ${b ? `<label>${t('Rate:')} <span id="ratev">${clampDisp(rateDisp, b)}</span> ${t('{u}/week', { u: unit })}</label>
    <input type="range" id="rate" min="${b[0]}" max="${b[1]}" step="${b[2]}" value="${clampDisp(rateDisp, b)}">` : ''}
  <label>${s.goalType === 'reverse' ? t('Goal weight ({u})', { u: unit }) : t('Goal weight ({u}, optional)', { u: unit })}</label>
  <input type="number" id="gw" step="0.1" value="${s.goalWeightKg ? (imp ? +kgToLb(s.goalWeightKg).toFixed(1) : s.goalWeightKg) : ''}">
  ${s.goalType === 'reverse' ? `<p class="hint">${t('Start at estimated maintenance; calories climb week by week while weight stays stable.')}</p>` : ''}
  <button class="primary" data-next>${t('Next')}</button></div>`;
}
const clampDisp = (v, b) => Math.min(Math.max(v, b[0]), b[1]);

function style() {
  return `<div class="card"><h2>${t('Diet style')}</h2>
  ${seg('dietStyle', [['balanced', t('Balanced')], ['lowfat', t('Low-fat')], ['lowcarb', t('Low-carb')], ['keto', t('Keto')]], s.dietStyle)}
  <label><input type="checkbox" id="plant" ${s.plantBased ? 'checked' : ''}> ${t('Plant-based (protein 1.8 g/kg)')}</label>
  <button class="primary" data-next>${t('Next')}</button></div>`;
}

function review() {
  s.targets ??= computeTargets();
  const tg = s.targets;
  return `<div class="card"><h2>${t('Your daily targets')}</h2>
  <p class="muted">${t('Tweak grams if you like — calories stay fixed; the other macros rebalance.')}</p>
  <div class="spread"><b>${tg.kcal} kcal</b><span class="muted">${t('est. TDEE {n}', { n: tg.tdee })}</span></div>
  <label>${t('Protein (g)')}</label><input type="number" id="mp" data-macro="proteinG" value="${tg.proteinG}">
  <label>${t('Carbs (g)')}</label><input type="number" id="mc" data-macro="carbG" value="${tg.carbG}">
  <label>${t('Fat (g)')}</label><input type="number" id="mf" data-macro="fatG" value="${tg.fatG}">
  <label>${t('Weekly check-in day')}</label>
  <select id="ciday">${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    .map((d, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>${t(d)}</option>`).join('')}</select>
  <p class="msg" id="clampmsg" hidden>${t('Adjusted to stay within safe ranges.')}</p>
  <button class="primary" data-finish>${t('Start coaching')}</button></div>`;
}

function computeTargets() {
  return prescribe({
    sex: s.sex, weightKg: s.weightKg, heightCm: s.heightCm, bodyFatPct: s.bodyFatPct,
    age: ageFromBirthdate(s.birthdate, dstr()), activity: s.activity,
    goal: { type: s.goalType, rateKgPerWeek: s.goalType === 'lose' || s.goalType === 'gain' ? s.rateKgPerWeek : 0 },
    dietStyle: s.dietStyle, plantBased: s.plantBased,
  });
}

function collect() {
  const v = (id) => root.querySelector('#' + id)?.value;
  if (step === 0) {
    s.birthdate = v('birth') || s.birthdate;
    s.activity = v('act');
    const bf = +v('bf');
    s.bodyFatPct = bf > 0 && bf < 70 ? bf : null;
    if (s.units === 'imperial') {
      s.heightCm = ftInToCm(+v('hft') || 5, +v('hin') || 8);
      s.weightKg = lbToKg(+v('wt') || 170);
    } else { s.heightCm = +v('hcm') || 175; s.weightKg = +v('wt') || 80; }
  }
  if (step === 1) {
    if (root.querySelector('#rate')) {
      const disp = +v('rate');
      s.rateKgPerWeek = +(s.units === 'imperial' ? lbToKg(disp) : disp).toFixed(3);
    }
    const gw = v('gw');
    s.goalWeightKg = gw ? +(s.units === 'imperial' ? lbToKg(+gw) : +gw).toFixed(1) : null;
  }
  s.targets = null; // recompute on review
}

function wire() {
  wireLangChip(root, () => { collectSafe(); render(); });
  root.querySelectorAll('[data-seg]').forEach((el) => {
    el.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      collectSafe();
      s[el.dataset.seg] = b.dataset.v;
      s.targets = null;
      render();
    };
  });
  const rate = root.querySelector('#rate');
  if (rate) rate.oninput = () => { root.querySelector('#ratev').textContent = rate.value; };
  const plant = root.querySelector('#plant');
  if (plant) plant.onchange = () => { s.plantBased = plant.checked; s.targets = null; };
  root.querySelectorAll('[data-macro]').forEach((inp) => {
    inp.onchange = () => {
      const r = editMacro(s.targets, inp.dataset.macro, +inp.value, { weightKg: s.weightKg });
      s.targets = { ...r.targets, tdee: s.targets.tdee };
      root.querySelector('#clampmsg').hidden = !r.clamped;
      root.querySelector('#mp').value = s.targets.proteinG;
      root.querySelector('#mc').value = s.targets.carbG;
      root.querySelector('#mf').value = s.targets.fatG;
    };
  });
  const next = root.querySelector('[data-next]');
  if (next) next.onclick = () => { collect(); step += 1; render(); };
  const fin = root.querySelector('[data-finish]');
  if (fin) fin.onclick = finish;
}
function collectSafe() { try { collect(); } catch { /* mid-step segment click */ } }

async function finish() {
  const today = dstr();
  const ciday = +root.querySelector('#ciday').value;
  await ctx.db.put('settings', {
    sex: s.sex, birthdate: s.birthdate, heightCm: s.heightCm, bodyFatPct: s.bodyFatPct,
    activityLevel: s.activity,
    goal: {
      type: s.goalType,
      rateKgPerWeek: s.goalType === 'lose' || s.goalType === 'gain' ? s.rateKgPerWeek : 0,
      goalWeightKg: s.goalWeightKg,
    },
    dietStyle: s.dietStyle, plantBased: s.plantBased, units: s.units,
    checkInDay: ciday, usdaApiKey: '', targetMode: 'coach', customTargets: null,
    onboardedAt: today,
  }, 'main');
  await ctx.db.put('targets', { ...s.targets, effectiveDate: today, reason: 'Initial prescription' });
  await ctx.db.put('weighins', { date: today, weightKg: s.weightKg, ...(s.bodyFatPct ? { bodyFatPct: s.bodyFatPct } : {}) });
  location.reload();
}
