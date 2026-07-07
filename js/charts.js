// Hand-rolled SVG charts; colors come from CSS classes so they theme automatically.
export function lineChart(cfg) {
  const { w = 340, h = 170, pad = 34, series = [], bars = [], xTicks = [], yFmt = (v) => Math.round(v) } = cfg;
  const ys = [...series.flatMap((s) => s.points.map((p) => p.y)), ...bars.map((b) => b.y)];
  const xs = [...series.flatMap((s) => s.points.map((p) => p.x)), ...bars.map((b) => b.x)];
  if (ys.length < 2) return '<p class="muted">Not enough data yet - keep logging.</p>';
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const s0 = yMax - yMin;
  yMin -= s0 * 0.08;
  yMax += s0 * 0.08;
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const X = (x) => pad + ((x - xMin) / (xMax - xMin || 1)) * (w - pad - 8);
  const Y = (y) => (h - 18) - ((y - yMin) / (yMax - yMin)) * (h - 18 - 8);
  let out = '';
  for (let i = 0; i < 4; i++) {
    const v = yMin + ((yMax - yMin) * i) / 3;
    out += `<line class="chart-grid" x1="${pad}" x2="${w}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>` +
      `<text class="chart-lbl" x="2" y="${(Y(v) + 3).toFixed(1)}">${yFmt(v)}</text>`;
  }
  const bw = Math.max(3, (w - pad) / ((xMax - xMin + 1) || 1) - 3);
  for (const b of bars) {
    out += `<rect class="chart-bar ${b.cls || ''}" x="${(X(b.x) - bw / 2).toFixed(1)}" width="${bw.toFixed(1)}"` +
      ` y="${Y(b.y).toFixed(1)}" height="${(h - 18 - Y(b.y)).toFixed(1)}"/>`;
  }
  for (const s of series) {
    if (s.points.length > 1 && s.cls !== 'dots-only') {
      out += `<polyline class="${s.cls || 'chart-line'}" points="${s.points.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}"/>`;
    }
    if (s.dots) {
      out += s.points.map((p) => `<circle class="chart-dot" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.5"/>`).join('');
    }
  }
  for (const t of xTicks) {
    out += `<text class="chart-lbl" x="${X(t.x).toFixed(1)}" y="${h - 4}" text-anchor="middle">${t.label}</text>`;
  }
  return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img">${out}</svg></div>`;
}
