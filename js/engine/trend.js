// Hacker's Diet exponentially-smoothed trend. Pure.
export function computeTrend(weighins, alpha = 0.1) {
  const sorted = [...weighins].sort((a, b) => (a.date < b.date ? -1 : 1));
  let trend = null;
  return sorted.map((w) => {
    trend = trend === null ? w.weightKg : trend + alpha * (w.weightKg - trend);
    return { ...w, trendKg: trend };
  });
}
