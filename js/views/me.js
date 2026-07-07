import { dstr, addDays } from '../util.js';
import { computeTrend } from '../engine/trend.js';
import { leanMassKg } from '../engine/prescribe.js';
import { lineChart } from '../charts.js';
import { dayTargetFor } from './diary.js';
import { fmtWeight, lbToKg } from '../units.js';

let root, ctx;

export async function mount(el, c) { root = el; ctx = c; render(); }

const dayIdx = (d0, d) => Math.round((new Date(d + 'T12:00:00') - new Date(d0 + 'T12:00:00')) / 86400000);
const dayKcal = (log) => log.meals.flatMap((m) => m.entries).reduce((s, e) => s + e.kcal, 0);

async function render() {
  const [settings, weighins, logs, checkins] = await Promise.all([
    ctx.db.get('settings', 'main'), ctx.db.getAll('weighins'),
    ctx.db.getAll('logs'), ctx.db.getAll('checkins')]);
  const imp = settings.units === 'imperial';
  const trend = computeTrend(weighins);
  const latest = trend.at(-1);
  const latestBf = [...weighins].sort((a, b) => (a.date < b.date ? 1 : -1)).find((w) => w.bodyFatPct != null)?.bodyFatPct
    ?? settings.bodyFatPct;
  const lbm = latest && latestBf != null ? leanMassKg(latest.weightKg, latestBf) : null;
  const tdee = [...checkins].sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.tdee ?? null;
  const today = dstr();

  /* charts */
  let weightChart = '<p class="muted">Weigh in to see your trend.</p>';
  if (trend.length) {
    const d0 = trend[0].date;
    weightChart = lineChart({
      series: [
        { points: trend.map((t) => ({ x: dayIdx(d0, t.date), y: t.weightKg })), cls: 'dots-only', dots: true },
        { points: trend.map((t) => ({ x: dayIdx(d0, t.date), y: t.trendKg })), cls: 'chart-line' }],
      xTicks: [{ x: 0, label: d0.slice(5) }, { x: dayIdx(d0, trend.at(-1).date), label: trend.at(-1).date.slice(5) }],
      yFmt: (v) => (imp ? (v / 0.45359237).toFixed(0) : v.toFixed(1)),
    });
  }
  const bars = [], targetPts = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const log = logs.find((l) => l.date === d);
    const t = await dayTargetFor(ctx.db, d);
    targetPts.push({ x: 13 - i, y: t.kcal });
    if (log && dayKcal(log) > 0) bars.push({ x: 13 - i, y: dayKcal(log), cls: dayKcal(log) > t.kcal * 1.05 ? 'over' : '' });
  }
  const kcalChart = lineChart({ bars, series: [{ points: targetPts, cls: 'chart-line2' }],
    xTicks: [{ x: 0, label: addDays(today, -13).slice(5) }, { x: 13, label: 'today' }] });
  const cks = [...checkins].sort((a, b) => (a.date < b.date ? -1 : 1)).filter((c) => c.tdee);
  const tdeeChart = cks.length >= 2 ? lineChart({
    series: [{ points: cks.map((c, i) => ({ x: i, y: c.tdee })), cls: 'chart-line', dots: true }],
    xTicks: [{ x: 0, label: cks[0].date.slice(5) }, { x: cks.length - 1, label: cks.at(-1).date.slice(5) }],
  }) : '<p class="muted">Appears after two check-ins.</p>';

  const adh = [];
  for (let wk = 3; wk >= 0; wk--) {
    const end = addDays(today, -7 * wk), start = addDays(end, -6);
    const n = logs.filter((l) => l.date >= start && l.date <= end && l.complete).length;
    adh.push(`<div class="spread"><span class="muted">${start.slice(5)} – ${end.slice(5)}</span><b>${n}/7 days</b></div>`);
  }

  root.innerHTML = `
  <div class="hero"><div class="avatar">ME</div></div>
  <div class="card"><h2>Body values</h2>
    <div class="listrow"><span>Weight</span><b>${latest ? fmtWeight(latest.weightKg, settings.units) : '—'}</b></div>
    <div class="row" style="padding:4px 0 8px">
      <input type="number" step="0.1" id="wt" placeholder="Log today's weight (${imp ? 'lb' : 'kg'})">
      <button class="ghost" id="savewt">Save</button></div>
    <div class="listrow"><span>Body fat</span><b>${latestBf != null ? latestBf + ' %' : '—'}</b></div>
    <div class="row" style="padding:4px 0 8px">
      <input type="number" step="0.1" id="bf" placeholder="Log body fat %">
      <button class="ghost" id="savebf">Save</button></div>
    <div class="listrow"><span>Lean body mass</span><b>${lbm ? fmtWeight(lbm, settings.units) : 'add body fat %'}</b></div>
    <div class="listrow"><span>Maintenance calories</span><b>${tdee ? `${tdee} kcal` : 'learns after check-ins'}</b></div>
  </div>
  <div class="card"><h2>Weight trend</h2>${weightChart}</div>
  <div class="card"><h2>Calories vs target</h2>${kcalChart}</div>
  <div class="card"><h2>Logging adherence</h2>${adh.join('')}</div>
  <div class="card"><h2>Maintenance over time</h2>${tdeeChart}</div>`;

  root.querySelector('#savewt').onclick = async () => {
    const v = +root.querySelector('#wt').value;
    if (!v) return;
    const prev = await ctx.db.get('weighins', today);
    await ctx.db.put('weighins', { ...prev, date: today, weightKg: +(imp ? lbToKg(v) : v).toFixed(2) });
    render();
  };
  root.querySelector('#savebf').onclick = async () => {
    const v = +root.querySelector('#bf').value;
    if (!(v > 0 && v < 70)) return;
    const prev = await ctx.db.get('weighins', today);
    if (prev) await ctx.db.put('weighins', { ...prev, bodyFatPct: v });
    const s = await ctx.db.get('settings', 'main');
    s.bodyFatPct = v;
    await ctx.db.put('settings', s, 'main');
    render();
  };
}
