import { dstr, addDays, dowMon } from '../util.js';
import { computeTrend } from '../engine/trend.js';
import { runCheckin } from '../engine/checkin.js';
import { rescalePlan } from '../engine/planner.js';
import { latestTargets, activeTargets } from '../engine/targets.js';
import { fmtWeight, lbToKg, kgToLb } from '../units.js';

let root, ctx, preview = null;

export async function mount(el, c) { root = el; ctx = c; preview = null; render(); }

const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const GOAL_TITLES = { lose: 'Lose weight', gain: 'Gain weight', maintain: 'Maintain', reverse: 'Reverse diet' };

async function gather() {
  const [settings, allTargets, weighins, logs, checkins] = await Promise.all([
    ctx.db.get('settings', 'main'), ctx.db.getAll('targets'),
    ctx.db.getAll('weighins'), ctx.db.getAll('logs'), ctx.db.getAll('checkins')]);
  checkins.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { settings, targets: latestTargets(allTargets), weighins, logs, checkins };
}

function isDue(settings, checkins, today) {
  const last = checkins[0]?.date ?? settings.onboardedAt;
  const since = daysBetween(last, today);
  return since >= 8 || (dowMon(today) === settings.checkInDay && since >= 6);
}

function buildInputs({ settings, targets, weighins, logs, checkins }, today) {
  const start = addDays(today, -6);
  const trend = computeTrend(weighins);
  const inWin = (d) => d >= start && d <= today;
  const winTrend = trend.filter((t) => inWin(t.date));
  const before = trend.filter((t) => t.date < start);
  const trendStartKg = before.length ? before.at(-1).trendKg : winTrend[0]?.trendKg ?? 0;
  const trendEndKg = winTrend.at(-1)?.trendKg ?? trendStartKg;
  const dayKcal = (log) => log.meals.flatMap((m) => m.entries).reduce((s, e) => s + e.kcal, 0);
  const complete = logs.filter((l) => inWin(l.date) && l.complete && dayKcal(l) > 0);
  const avgIntakeKcal = complete.length ? complete.reduce((s, l) => s + dayKcal(l), 0) / complete.length : 0;
  const last = checkins[0];
  return {
    goal: settings.goal, sex: settings.sex, targets,
    weightKg: trend.at(-1)?.weightKg ?? 0,
    trendStartKg, trendEndKg, avgIntakeKcal,
    loggedDays: complete.length, weighinCount: winTrend.length,
    prevTdee: last?.tdee ?? null, compliantStreak: last?.compliantStreak ?? 0,
  };
}

// tracked averages for the running period (since the last check-in, max 7 days)
function periodStats({ logs }, from, today) {
  const dayS = (log) => log.meals.flatMap((m) => m.entries)
    .reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f }),
      { kcal: 0, p: 0, c: 0, f: 0 });
  const days = logs.filter((l) => l.date >= from && l.date <= today).map(dayS).filter((d) => d.kcal > 0);
  if (!days.length) return null;
  const avg = days.reduce((a, d) => ({ kcal: a.kcal + d.kcal, p: a.p + d.p, c: a.c + d.c, f: a.f + d.f }),
    { kcal: 0, p: 0, c: 0, f: 0 });
  return { n: days.length, kcal: avg.kcal / days.length, p: avg.p / days.length, c: avg.c / days.length, f: avg.f / days.length };
}

const band = (v, frac = 0.03) => `${Math.round(v * (1 - frac))}–${Math.round(v * (1 + frac))}`;

async function render() {
  const data = await gather();
  const { settings, targets, checkins, weighins } = data;
  const today = dstr();
  const imp = settings.units === 'imperial';
  const due = isDue(settings, checkins, today) && checkins[0]?.date !== today;
  const trend = computeTrend(weighins);
  const startW = trend[0], curW = trend.at(-1);
  const goalW = settings.goal.goalWeightKg;
  const rate = settings.goal.rateKgPerWeek ?? 0;
  const sign = settings.goal.type === 'lose' ? '-' : settings.goal.type === 'gain' ? '+' : '';
  const rateTxt = settings.goal.type === 'maintain' ? 'hold steady'
    : settings.goal.type === 'reverse' ? 'calories up, weight steady'
    : `${sign}${imp ? (kgToLb(rate)).toFixed(1) : rate.toFixed(2)} <small>${imp ? 'lb' : 'kg'}/week</small>`;

  const lastCk = checkins[0]?.date ?? settings.onboardedAt;
  const sinceCk = Math.min(Math.max(daysBetween(lastCk, today), 0), 7);
  const nextCk = addDays(lastCk, 7);
  const untilCk = Math.max(daysBetween(today, nextCk), 0);
  const active = activeTargets(settings, targets);
  const stats = periodStats(data, addDays(lastCk, 1), today);
  const compliant = stats && stats.kcal >= active.kcal * 0.95 && stats.kcal <= active.kcal * 1.05;

  root.innerHTML = `
  <div class="hero"><h2>${GOAL_TITLES[settings.goal.type]}</h2>
    <div class="bigval">${rateTxt}</div>
    <div class="triple">
      <div><b>${startW ? fmtWeight(startW.weightKg, settings.units) : '—'}</b><span>Start</span></div>
      <div><b>${curW ? fmtWeight(curW.trendKg, settings.units) : '—'}</b><span>Current (trend)</span></div>
      <div><b>${goalW ? fmtWeight(goalW, settings.units) : '—'}</b><span>Goal</span></div>
    </div>
    <div class="pillrow">
      <button class="pill" id="changegoal">✏️ Change goal</button>
      <button class="pill" id="addwt">＋ Add weight</button>
    </div>
    <div class="row" id="wtrow" hidden style="margin-top:10px">
      <input type="number" step="0.1" id="wt" placeholder="Today's weight (${imp ? 'lb' : 'kg'})">
      <button class="ghost" id="savewt">Save</button>
    </div>
  </div>
  ${due ? `<div class="banner spread">Check-in is due<button class="ghost" id="run">Run check-in</button></div>` : ''}
  <div class="card"><h2>Current period</h2>
    <div class="spread"><span class="muted">Last check-in<br><b style="color:var(--text)">${niceDate(lastCk)}</b></span>
      <span class="muted" style="text-align:right">Next check-in<br><b style="color:var(--text)">${niceDate(nextCk)}</b></span></div>
    <div class="dots">${Array.from({ length: 7 }, (_, i) => `<i class="${i < sinceCk ? 'on' : ''}"></i>`).join('')}</div>
    <p class="muted" style="text-align:center">${untilCk === 0 ? 'Check-in available' : `${untilCk} day${untilCk === 1 ? '' : 's'} until your next check-in`}</p>
  </div>
  <div class="card"><h2>Compliance</h2>
    ${stats ? `
    <div class="comprow"><span class="muted">since ${niceDate(lastCk)}</span><span class="tgt">Targets</span><b>Tracked (avg)</b></div>
    <div class="comprow"><span>Cal</span><span class="tgt">${band(active.kcal)}</span><b>${Math.round(stats.kcal)}</b></div>
    <div class="comprow"><span>Protein</span><span class="tgt">${band(active.proteinG)}</span><b>${Math.round(stats.p)}g</b></div>
    <div class="comprow"><span>Carbs</span><span class="tgt">${band(active.carbG)}</span><b>${Math.round(stats.c)}g</b></div>
    <div class="comprow"><span>Fat</span><span class="tgt">${band(active.fatG)}</span><b>${Math.round(stats.f)}g</b></div>
    <p class="${compliant ? 'hint' : 'msg'}" style="text-align:center">${compliant ? '✓ You are on track this period.' : 'Averages are outside the target band.'}</p>`
    : '<p class="muted">Log some food to see period compliance.</p>'}
  </div>
  <div class="card"><h2>Prescription</h2>
    <div class="spread"><b style="font-size:1.4rem">${active.kcal} kcal</b>
      <span class="muted">${active.source === 'custom' ? 'custom targets' : `coach · since ${targets.effectiveDate}`}</span></div>
    <p>P ${active.proteinG} g · C ${active.carbG} g · F ${active.fatG} g</p>
    <p class="muted">Estimated TDEE: ${checkins[0]?.tdee ?? targets.tdee ?? '—'} kcal
      ${checkins[0] ? '(learned from your data)' : '(formula estimate)'}</p>
  </div>
  <div id="flow"></div>
  <div class="card"><h2>Check-in history</h2>
    ${checkins.map((r) => `<div class="checkin-rec"><div class="spread"><b>${r.date}</b>
      <span class="muted">${r.change}${r.newTargets ? ` → ${r.newTargets.kcal} kcal` : ''}</span></div>
      <p class="muted">${r.explanation}</p></div>`).join('') || '<p class="muted">No check-ins yet.</p>'}
  </div>`;

  root.querySelector('#changegoal').onclick = () => ctx.navigate('settings');
  root.querySelector('#addwt').onclick = () => { root.querySelector('#wtrow').hidden = false; root.querySelector('#wt').focus(); };
  root.querySelector('#savewt').onclick = async () => {
    const v = +root.querySelector('#wt').value;
    if (!v) return;
    const prev = await ctx.db.get('weighins', today);
    await ctx.db.put('weighins', { ...prev, date: today, weightKg: +(imp ? lbToKg(v) : v).toFixed(2) });
    render();
  };
  const run = root.querySelector('#run');
  if (run) run.onclick = () => {
    const inputs = buildInputs(data, today);
    preview = { date: today, inputs, result: runCheckin(inputs) };
    renderFlow(data);
  };
  if (preview) renderFlow(data);
}

const niceDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function renderFlow(data) {
  const el = root.querySelector('#flow');
  const { result } = preview;
  el.innerHTML = `<div class="card"><h2>This week's check-in</h2>
    <p>${result.explanation}</p>
    ${result.newTargets ? `<p><b>New targets:</b> ${result.newTargets.kcal} kcal ·
      P ${result.newTargets.proteinG} · C ${result.newTargets.carbG} · F ${result.newTargets.fatG}</p>` : ''}
    ${result.newTargets && data.settings.targetMode === 'custom'
      ? '<p class="hint">Heads-up: you are on custom targets, so the coach update is recorded but your custom numbers stay in charge until you switch back in Settings.</p>' : ''}
    <button class="primary" id="accept">${result.change === 'adjust' ? 'Apply new targets' : 'Record check-in'}</button></div>`;
  el.querySelector('#accept').onclick = async () => {
    const { date, inputs, result } = preview;
    await ctx.db.put('checkins', {
      date, inputs, change: result.change, explanation: result.explanation,
      tdee: result.tdee, compliantStreak: result.compliantStreak,
      oldTargets: data.targets, newTargets: result.newTargets,
    });
    if (result.newTargets) {
      await ctx.db.put('targets', { ...result.newTargets, tdee: result.tdee, effectiveDate: date, reason: 'Weekly check-in' });
      const plan = await ctx.db.get('planner', 'main');
      if (plan) await ctx.db.put('planner', { ...plan, days: rescalePlan(plan.days, result.newTargets.kcal) }, 'main');
    }
    preview = null;
    render();
  };
}
