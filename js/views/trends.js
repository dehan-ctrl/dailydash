import { dstr, addDays } from '../util.js';
import { computeTrend } from '../engine/trend.js';
import { lineChart } from '../charts.js';
import { dayTargetFor } from './log.js';

let root, ctx;

export async function mount(el, c) {
  root = el;
  ctx = c;
  render();
}

const dayIdx = (d0, d) => Math.round((new Date(d + 'T12:00:00') - new Date(d0 + 'T12:00:00')) / 86400000);
const dayKcal = (log) => log.meals.flatMap((m) => m.entries).reduce((s, e) => s + e.kcal, 0);

async function render() {
  const [weighins, logs, checkins] = await Promise.all([
    ctx.db.getAll('weighins'),
    ctx.db.getAll('logs'),
    ctx.db.getAll('checkins'),
  ]);
  const trend = computeTrend(weighins);
  const today = dstr();

  let weight = '<p class="muted">Weigh in to see your trend.</p>';
  if (trend.length) {
    const d0 = trend[0].date;
    weight = lineChart({
      series: [
        { points: trend.map((t) => ({ x: dayIdx(d0, t.date), y: t.weightKg })), cls: 'dots-only', dots: true },
        { points: trend.map((t) => ({ x: dayIdx(d0, t.date), y: t.trendKg })), cls: 'chart-line' },
      ],
      xTicks: [{ x: 0, label: d0.slice(5) }, { x: dayIdx(d0, trend.at(-1).date), label: trend.at(-1).date.slice(5) }],
      yFmt: (v) => v.toFixed(1),
    });
  }

  const bars = [], targetPts = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const log = logs.find((l) => l.date === d);
    const t = await dayTargetFor(ctx.db, d);
    targetPts.push({ x: 13 - i, y: t.kcal });
    if (log && dayKcal(log) > 0) {
      bars.push({ x: 13 - i, y: dayKcal(log), cls: dayKcal(log) > t.kcal * 1.05 ? 'over' : '' });
    }
  }
  const kcalChart = lineChart({
    bars,
    series: [{ points: targetPts, cls: 'chart-line2' }],
    xTicks: [{ x: 0, label: addDays(today, -13).slice(5) }, { x: 13, label: 'today' }],
  });

  const adh = [];
  for (let wk = 3; wk >= 0; wk--) {
    const end = addDays(today, -7 * wk), start = addDays(end, -6);
    const n = logs.filter((l) => l.date >= start && l.date <= end && l.complete).length;
    adh.push(`<div class="spread"><span class="muted">${start.slice(5)} - ${end.slice(5)}</span><b>${n}/7 days</b></div>`);
  }

  const cks = [...checkins].sort((a, b) => (a.date < b.date ? -1 : 1)).filter((c) => c.tdee);
  const tdeeChart = cks.length >= 2 ? lineChart({
    series: [{ points: cks.map((c, i) => ({ x: i, y: c.tdee })), cls: 'chart-line', dots: true }],
    xTicks: [{ x: 0, label: cks[0].date.slice(5) }, { x: cks.length - 1, label: cks.at(-1).date.slice(5) }],
  }) : '<p class="muted">Appears after two check-ins.</p>';

  root.innerHTML = `
    <div class="card"><h2>Weight</h2>${weight}</div>
    <div class="card"><h2>Calories vs target</h2>${kcalChart}</div>
    <div class="card"><h2>Logging adherence</h2>${adh.join('')}</div>
    <div class="card"><h2>Estimated TDEE</h2>${tdeeChart}</div>`;
}
