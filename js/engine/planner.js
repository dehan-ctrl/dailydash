// High/low-day planner. Weekly total is invariant under edits. Pure.
export function defaultPlan(dailyKcal) {
  return Array.from({ length: 7 }, (_, dow) => ({ dow, kcal: dailyKcal, locked: false }));
}

export const weeklyTotal = (days) => days.reduce((s, d) => s + d.kcal, 0);

export function editDay(days, idx, wantKcal, floorKcal) {
  if (days[idx].locked) return { days, applied: false, message: 'That day is locked. Unlock it to edit.' };
  const out = days.map((d) => ({ ...d }));
  const receivers = out.filter((d, i) => i !== idx && !d.locked);
  if (!receivers.length) {
    return { days, applied: false, message: 'Every other day is locked — nowhere to redistribute.' };
  }
  const total = weeklyTotal(out);
  const target = Math.max(Math.round(wantKcal), floorKcal);
  let delta = target - out[idx].kcal; // receivers absorb -delta
  if (delta > 0) {
    const capacity = receivers.reduce((s, d) => s + Math.max(0, d.kcal - floorKcal), 0);
    if (delta > capacity) delta = capacity;
  }
  let rem = -delta;
  let pool = [...receivers];
  while (pool.length && Math.abs(rem) > 1e-9) {
    const share = rem / pool.length;
    const next = [];
    rem = 0;
    for (const d of pool) {
      const v = d.kcal + share;
      if (v < floorKcal) { rem += v - floorKcal; d.kcal = floorKcal; }
      else { d.kcal = v; next.push(d); }
    }
    pool = next;
  }
  for (const d of out) d.kcal = Math.round(d.kcal);
  out[idx].kcal = total - out.filter((_, i) => i !== idx).reduce((s, d) => s + d.kcal, 0);
  // Repair rounding drift: ensure edited day doesn't fall below floor
  let short = floorKcal - out[idx].kcal;
  if (short > 0) {
    out[idx].kcal = floorKcal;
    for (const d of out.filter((x, i) => i !== idx && !x.locked)) {
      if (short <= 0) break;
      const give = Math.min(short, d.kcal - floorKcal);
      d.kcal -= give; short -= give;
    }
  }
  const message = out[idx].kcal === Math.round(wantKcal) ? '' :
    `Clamped to ${out[idx].kcal} kcal — no other day can go below ${floorKcal} kcal.`;
  return { days: out, applied: true, message };
}

// After a check-in changes the daily target: proportional rescale, locks preserved.
export function rescalePlan(days, newDailyKcal) {
  const out = days.map((d) => ({ ...d }));
  const unlocked = out.filter((d) => !d.locked);
  if (!unlocked.length) return out;
  const lockedTotal = out.filter((d) => d.locked).reduce((s, d) => s + d.kcal, 0);
  const unlockedTotal = unlocked.reduce((s, d) => s + d.kcal, 0);
  const targetUnlockedTotal = newDailyKcal * 7 - lockedTotal;
  const f = unlockedTotal > 0 ? targetUnlockedTotal / unlockedTotal : 0;
  for (const d of unlocked) d.kcal = Math.round(d.kcal * f);
  const drift = newDailyKcal * 7 - weeklyTotal(out);
  const target = unlocked[0];
  target.kcal += drift; // absorb rounding drift on an unlocked day
  return out;
}

// Protein constant every day; carbs/fat flex with the day's calories.
export function dayMacros(dayKcal, t) {
  const restT = t.kcal - t.proteinG * 4;
  const restD = dayKcal - t.proteinG * 4;
  const s = restT > 0 ? Math.max(0, restD) / restT : 0;
  return {
    kcal: dayKcal, proteinG: t.proteinG,
    carbG: Math.round(t.carbG * s), fatG: Math.round(t.fatG * s),
  };
}
