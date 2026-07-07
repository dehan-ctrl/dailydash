import { dstr, addDays, dowMon } from '../util.js';
import { computeTrend } from '../engine/trend.js';
import { runCheckin } from '../engine/checkin.js';
import { rescalePlan } from '../engine/planner.js';
import { latestTargets } from './log.js';

let root, ctx, preview = null;

export async function mount(el, c) {
  root = el;
  ctx = c;
  preview = null;
  render();
}

const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

async function gather() {
  const [settings, allTargets, weighins, logs, checkins] = await Promise.all([
    ctx.db.get('settings', 'main'),
    ctx.db.getAll('targets'),
    ctx.db.getAll('weighins'),
    ctx.db.getAll('logs'),
    ctx.db.getAll('checkins'),
  ]);
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
    goal: settings.goal,
    sex: settings.sex,
    targets,
    weightKg: trend.at(-1)?.weightKg ?? 0,
    trendStartKg,
    trendEndKg,
    avgIntakeKcal,
    loggedDays: complete.length,
    weighinCount: winTrend.length,
    prevTdee: last?.tdee ?? null,
    compliantStreak: last?.compliantStreak ?? 0,
  };
}

async function render() {
  const data = await gather();
  const { settings, targets, checkins } = data;
  const today = dstr();
  const due = isDue(settings, checkins, today) && checkins[0]?.date !== today;
  root.innerHTML = `
  ${due ? `<div class="banner spread">Check-in is due<button class="ghost" id="run">Run check-in</button></div>` : ''}
  <div class="card"><h2>Current prescription</h2>
    <div class="spread"><b style="font-size:1.6rem">${targets.kcal} kcal</b>
      <span class="muted">since ${targets.effectiveDate}</span></div>
    <p>P ${targets.proteinG} g · C ${targets.carbG} g · F ${targets.fatG} g</p>
    <p class="muted">${targets.reason ?? ''}</p>
    <p class="muted">Estimated TDEE: ${checkins[0]?.tdee ?? targets.tdee ?? '-'} kcal
      ${checkins[0] ? '(learned from your data)' : '(formula estimate)'}</p>
  </div>
  <div id="flow"></div>
  <div class="card"><h2>Check-in history</h2>
    ${checkins.map((r) => `<div class="checkin-rec"><div class="spread"><b>${r.date}</b>
      <span class="muted">${r.change}${r.newTargets ? ` -> ${r.newTargets.kcal} kcal` : ''}</span></div>
      <p class="muted">${r.explanation}</p></div>`).join('') || '<p class="muted">No check-ins yet.</p>'}
  </div>`;
  const run = root.querySelector('#run');
  if (run) run.onclick = async () => {
    const inputs = buildInputs(data, today);
    preview = { date: today, inputs, result: runCheckin(inputs) };
    renderFlow(data);
  };
  if (preview) renderFlow(data);
}

function renderFlow(data) {
  const el = root.querySelector('#flow');
  const { result } = preview;
  el.innerHTML = `<div class="card"><h2>This week's check-in</h2>
    <p>${result.explanation}</p>
    ${result.newTargets ? `<p><b>New targets:</b> ${result.newTargets.kcal} kcal ·
      P ${result.newTargets.proteinG} · C ${result.newTargets.carbG} · F ${result.newTargets.fatG}</p>` : ''}
    <button class="primary" id="accept">${result.change === 'adjust' ? 'Apply new targets' : 'Record check-in'}</button></div>`;
  el.querySelector('#accept').onclick = async () => {
    const { date, inputs, result } = preview;
    await ctx.db.put('checkins', {
      date,
      inputs,
      change: result.change,
      explanation: result.explanation,
      tdee: result.tdee,
      compliantStreak: result.compliantStreak,
      oldTargets: data.targets,
      newTargets: result.newTargets,
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
