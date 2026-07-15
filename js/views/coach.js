import { dstr, addDays, dowMon } from '../util.js';
import { computeTrend } from '../engine/trend.js';
import { runCheckin } from '../engine/checkin.js';
import { rescalePlan } from '../engine/planner.js';
import { latestTargets, activeTargets } from '../engine/targets.js';
import { fmtWeight, lbToKg, kgToLb } from '../units.js';
import { t, tExplain, locale, langChip, wireLangChip } from '../i18n.js';

let root, ctx, preview = null, includeToday = true;

export async function mount(el, c) { root = el; ctx = c; preview = null; render(); }

const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const GOAL_TITLES = { lose: 'Lose weight', gain: 'Gain weight', maintain: 'Maintain', reverse: 'Reverse diet' };

export function goalProgress({ type, startKg, currentKg, goalKg }) {
  if (!['lose', 'gain'].includes(type) || !(startKg > 0) || !(currentKg > 0) || !(goalKg > 0) || startKg === goalKg) return null;
  const totalKg = Math.abs(goalKg - startKg);
  const doneKg = type === 'lose' ? startKg - currentKg : currentKg - startKg;
  const remainingKg = type === 'lose' ? currentKg - goalKg : goalKg - currentKg;
  return {
    pct: Math.max(0, Math.min(100, Math.round((doneKg / totalKg) * 100))),
    remainingKg: +Math.max(0, remainingKg).toFixed(1),
    doneKg: +Math.max(0, doneKg).toFixed(1),
    totalKg: +totalKg.toFixed(1),
  };
}

async function gather() {
  const [settings, allTargets, weighins, logs, checkins] = await Promise.all([
    ctx.db.get('settings', 'main'), ctx.db.getAll('targets'),
    ctx.db.getAll('weighins'), ctx.db.getAll('logs'), ctx.db.getAll('checkins')]);
  checkins.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { settings, targets: latestTargets(allTargets), weighins, logs, checkins };
}

export function isDue(settings, checkins, today) {
  const last = checkins[0]?.date ?? settings.onboardedAt;
  const since = daysBetween(last, today);
  return since >= 8 || (dowMon(today) === settings.checkInDay && since >= 6);
}

// Check-ins unlock 4 days after the last one; "due" keeps its original meaning.
export function checkinAvailability(settings, checkins, today) {
  if (checkins[0]?.date === today) return { status: 'done', since: 0 };
  const last = checkins[0]?.date ?? settings.onboardedAt;
  const since = last ? daysBetween(last, today) : Infinity;
  if (since < 4) return { status: 'wait', since, daysLeft: 4 - since };
  return { status: isDue(settings, checkins, today) ? 'due' : 'early', since };
}

export function buildInputs({ settings, targets, weighins, logs, checkins }, today) {
  const lastCkDate = checkins[0]?.date ?? settings.onboardedAt;
  const periodDays = lastCkDate ? Math.min(Math.max(daysBetween(lastCkDate, today), 1), 14) : 7;
  const start = addDays(today, -(periodDays - 1));
  const trend = computeTrend(weighins);
  const inWin = (d) => d >= start && d <= today;
  const winTrend = trend.filter((t) => inWin(t.date));
  const before = trend.filter((t) => t.date < start);
  const trendStartKg = before.length ? before.at(-1).trendKg : winTrend[0]?.trendKg ?? 0;
  const trendEndKg = winTrend.at(-1)?.trendKg ?? trendStartKg;
  const dayKcal = (log) => log.meals.flatMap((m) => m.entries).reduce((s, e) => s + e.kcal, 0);
  const logged = logs.filter((l) => inWin(l.date) && dayKcal(l) > 0);
  const avgIntakeKcal = logged.length ? logged.reduce((s, l) => s + dayKcal(l), 0) / logged.length : 0;
  const last = checkins[0];
  return {
    goal: settings.goal, sex: settings.sex, targets,
    weightKg: trend.at(-1)?.weightKg ?? 0,
    trendStartKg, trendEndKg, avgIntakeKcal,
    loggedDays: logged.length, weighinCount: winTrend.length,
    prevTdee: last?.tdee ?? null, compliantStreak: last?.compliantStreak ?? 0,
    periodDays,
  };
}

// tracked averages for the running period (since the last check-in, max 7 days)
export function periodStats({ logs }, from, today) {
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
const niceDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
const fullDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(locale(), { month: 'short', day: 'numeric', year: 'numeric' });

export function complianceRange(lastCk, today, include) {
  const from = lastCk;
  const to = include ? today : addDays(today, -1);
  const safeTo = to < from ? from : to;
  const a = new Date(from + 'T12:00:00');
  const b = new Date(safeTo + 'T12:00:00');
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  const label = from === safeTo
    ? niceDate(from)
    : sameMonth ? `${niceDate(from)} - ${b.getDate()}` : `${niceDate(from)} - ${niceDate(safeTo)}`;
  return { from, to: safeTo, label };
}

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
  const rateTxt = settings.goal.type === 'maintain' ? t('hold steady')
    : settings.goal.type === 'reverse' ? t('calories up, weight steady')
    : `${sign}${imp ? (kgToLb(rate)).toFixed(1) : rate.toFixed(2)} <small>${t('{u}/week', { u: imp ? 'lb' : 'kg' })}</small>`;
  const progress = goalProgress({
    type: settings.goal.type,
    startKg: startW?.weightKg,
    currentKg: curW?.trendKg,
    goalKg: goalW,
  });

  const lastCk = checkins[0]?.date ?? settings.onboardedAt;
  const sinceCk = Math.min(Math.max(daysBetween(lastCk, today), 0), 7);
  const nextCk = addDays(lastCk, 7);
  const untilCk = Math.max(daysBetween(today, nextCk), 0);
  const active = activeTargets(settings, targets);
  const range = complianceRange(lastCk, today, includeToday);
  const stats = periodStats(data, range.from, range.to);
  const compliant = stats && stats.kcal >= active.kcal * 0.95 && stats.kcal <= active.kcal * 1.05;

  root.innerHTML = `
  <div class="hero"><div class="spread"><span style="flex:0 0 34px"></span><h2 style="flex:1">${t(GOAL_TITLES[settings.goal.type])}</h2>${langChip()}</div>
    <div class="bigval">${rateTxt}</div>
    <div class="triple">
      <div><b>${startW ? fmtWeight(startW.weightKg, settings.units) : '—'}</b><span>${t('Start')}</span></div>
      <div><b>${curW ? fmtWeight(curW.trendKg, settings.units) : '—'}</b><span>${t('Current (trend)')}</span></div>
      <div><b>${goalW ? fmtWeight(goalW, settings.units) : '—'}</b><span>${t('Goal')}</span></div>
    </div>
    ${progress ? `<div class="goalbar" aria-label="${t('Goal progress {pct}%', { pct: progress.pct })}">
      <div class="goalbar-top"><span>${t('{pct}% to goal', { pct: progress.pct })}</span><b>${t('{amount} left', { amount: fmtWeight(progress.remainingKg, settings.units) })}</b></div>
      <div class="goaltrack"><i style="width:${progress.pct}%"></i></div>
    </div>` : `<p class="goalnote">${goalW ? t('Progress appears for lose/gain goals once weigh-ins exist.') : t('Set a goal weight to track progress.')}</p>`}
    <div class="pillrow">
      <button class="pill" id="changegoal">${t('✏️ Change goal')}</button>
      <button class="pill" id="addwt">${t('＋ Add weight')}</button>
    </div>
    <div class="row" id="wtrow" hidden style="margin-top:10px">
      <input type="number" step="0.1" id="wt" placeholder="${t("Today's weight ({u})", { u: imp ? 'lb' : 'kg' })}">
      <button class="ghost" id="savewt">${t('Save')}</button>
    </div>
  </div>
  ${due ? `<div class="banner spread">${t('Check-in is due')}<button class="ghost" id="run">${t('Run check-in')}</button></div>` : ''}
  <h2 class="sectiontitle">${t('Current period')}</h2>
  <div class="card periodcard">
    <div class="spread"><span class="muted">${t('Last check in')}<br><b style="color:var(--text)">${fullDate(lastCk)}</b></span>
      <span class="muted" style="text-align:right">${t('Next check in')}<br><b style="color:var(--text)">${fullDate(nextCk)}</b></span></div>
    <div class="dots">${Array.from({ length: 7 }, (_, i) => `<i class="${i < sinceCk ? 'on' : ''}"></i>`).join('')}</div>
    <p class="muted" style="text-align:center">${untilCk === 0 ? t('Check-in available')
      : untilCk === 1 ? t('1 day until your next check-in') : t('{n} days until your next check-in', { n: untilCk })}</p>
  </div>
  <div class="sectionhead"><h2>${t('Compliance')}</h2>
    <label class="switchrow">${t('Include today')}<input type="checkbox" id="inctoday" ${includeToday ? 'checked' : ''}><span></span></label></div>
  <div class="card compliancecard">
    ${stats ? `
    <div class="comprow"><span class="muted">${range.label}</span><span class="tgt">${t('Targets')}</span><b>${t('Tracked (Avg)')}</b></div>
    <div class="comprow"><span>${t('Cal')}</span><span class="tgt">${band(active.kcal)}</span><b>${Math.round(stats.kcal)}</b></div>
    <div class="comprow"><span>${t('Protein')}</span><span class="tgt">${band(active.proteinG)}</span><b>${Math.round(stats.p)}g</b></div>
    <div class="comprow"><span>${t('Carbs')}</span><span class="tgt">${band(active.carbG)}</span><b>${Math.round(stats.c)}g</b></div>
    <div class="comprow"><span>${t('Fat')}</span><span class="tgt">${band(active.fatG)}</span><b>${Math.round(stats.f)}g</b></div>
    <p class="${compliant ? 'hint' : 'msg'} compliancestatus">${compliant ? t('✓ You are currently compliant.') : t('✕ You are currently not compliant.')}</p>`
    : `<p class="muted">${t('Log some food to see period compliance.')}</p>`}
  </div>
  <div class="card"><h2>${t('Prescription')}</h2>
    <div class="spread"><b style="font-size:1.4rem">${active.kcal} kcal</b>
      <span class="muted">${active.source === 'custom' ? t('custom targets') : t('coach · since {date}', { date: targets.effectiveDate })}</span></div>
    <p>P ${active.proteinG} g · C ${active.carbG} g · F ${active.fatG} g</p>
    <p class="muted">${t('Estimated TDEE: {n} kcal', { n: checkins[0]?.tdee ?? targets.tdee ?? '—' })}
      ${checkins[0] ? t('(learned from your data)') : t('(formula estimate)')}</p>
  </div>
  <div id="flow"></div>
  <div class="card"><h2>${t('Check-in history')}</h2>
    ${checkins.map((r) => `<div class="checkin-rec"><div class="spread"><b>${r.date}</b>
      <span class="muted">${t(r.change)}${r.newTargets ? ` → ${r.newTargets.kcal} kcal` : ''}</span></div>
      <p class="muted">${tExplain(r.explanation)}</p></div>`).join('') || `<p class="muted">${t('No check-ins yet.')}</p>`}
  </div>`;

  wireLangChip(root, () => ctx.refresh());
  root.querySelector('#changegoal').onclick = () => ctx.navigate('settings');
  root.querySelector('#addwt').onclick = () => { root.querySelector('#wtrow').hidden = false; root.querySelector('#wt').focus(); };
  root.querySelector('#inctoday').onchange = (e) => { includeToday = e.target.checked; render(); };
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

function renderFlow(data) {
  const el = root.querySelector('#flow');
  const { result } = preview;
  el.innerHTML = `<div class="card"><h2>${t("This week's check-in")}</h2>
    <p>${tExplain(result.explanation)}</p>
    ${result.newTargets ? `<p><b>${t('New targets:')}</b> ${result.newTargets.kcal} kcal ·
      P ${result.newTargets.proteinG} · C ${result.newTargets.carbG} · F ${result.newTargets.fatG}</p>` : ''}
    ${result.newTargets && data.settings.targetMode === 'custom'
      ? `<p class="hint">${t('Heads-up: you are on custom targets, so the coach update is recorded but your custom numbers stay in charge until you switch back in Settings.')}</p>` : ''}
    <button class="primary" id="accept">${result.change === 'adjust' ? t('Apply new targets') : t('Record check-in')}</button></div>`;
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
