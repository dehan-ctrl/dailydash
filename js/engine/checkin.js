// Weekly check-in decision logic. Pure. All inputs precomputed by the caller.
import { kcalFloor, clampRateKg } from './prescribe.js';

const KCAL_PER_KG = 7700;

export function targetRateKgPerWeek(goal, weightKg) {
  const r = clampRateKg(goal, weightKg);
  if (goal.type === 'lose') return -r;
  if (goal.type === 'gain') return r;
  return 0; // maintain, reverse
}

export function smoothTdee(prev, weekTdee, streakBefore) {
  if (prev == null || !Number.isFinite(prev)) return weekTdee;
  const alpha = streakBefore >= 3 ? 0.15 : 0.25; // long compliance → wider window
  return prev + alpha * (weekTdee - prev);
}

// Protein constant; carbs/fat scale pro-rata with the non-protein calories.
export function applyKcalChange(t, newKcal) {
  const restOld = t.kcal - t.proteinG * 4;
  const restNew = Math.max(0, newKcal - t.proteinG * 4);
  const s = restOld > 0 ? restNew / restOld : 0;
  return { kcal: newKcal, proteinG: t.proteinG, carbG: Math.round(t.carbG * s), fatG: Math.round(t.fatG * s) };
}

const fmtKg = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

export function runCheckin(i) {
  if (i.loggedDays < 4 || i.weighinCount < 3) {
    return {
      change: 'insufficient', newTargets: null, tdee: i.prevTdee ?? null, compliantStreak: 0,
      explanation: `Only ${i.loggedDays}/7 fully-logged days and ${i.weighinCount} weigh-ins (need 4 and 3). ` +
        `Not enough data to coach honestly — targets held; log more this week.`,
    };
  }
  const obs = i.trendEndKg - i.trendStartKg; // kg over the week
  const weekTdee = i.avgIntakeKcal - (obs * KCAL_PER_KG) / 7;
  const tdee = Math.round(smoothTdee(i.prevTdee, weekTdee, i.compliantStreak ?? 0));
  const streak = (i.compliantStreak ?? 0) + 1;
  const target = targetRateKgPerWeek(i.goal, i.weightKg);
  const nums = `Trend ${fmtKg(obs)} kg this week vs target ${fmtKg(target)}; ` +
    `average intake ${Math.round(i.avgIntakeKcal)} kcal/day; estimated TDEE ${tdee} kcal.`;

  const hold = (msg) =>
    ({ change: 'hold', newTargets: null, tdee, compliantStreak: streak, explanation: `${msg} ${nums}` });

  const adjust = (wantKcal, msg) => {
    const maxDelta = Math.min(150, 0.075 * i.targets.kcal);
    let k = Math.round(Math.min(Math.max(wantKcal, i.targets.kcal - maxDelta), i.targets.kcal + maxDelta));
    k = Math.max(k, kcalFloor(i.sex));
    if (k === i.targets.kcal) return hold(`${msg} The needed change rounds to zero — holding.`);
    return {
      change: 'adjust', newTargets: applyKcalChange(i.targets, k), tdee, compliantStreak: streak,
      explanation: `${msg} Calories ${k > i.targets.kcal ? 'up' : 'down'} ${Math.abs(k - i.targets.kcal)} ` +
        `to ${k} kcal/day (changes capped at ±${Math.round(maxDelta)}/week). ${nums}`,
    };
  };

  if (i.goal.type === 'reverse') {
    if (obs <= 0.001 * i.weightKg) return adjust(i.targets.kcal + 100, 'Reverse diet on track — nudging calories up.');
    return hold('Gaining faster than the reverse-diet tolerance — holding until the trend settles.');
  }
  if (i.goal.type === 'maintain') {
    const g = i.goal.goalWeightKg ?? i.weightKg;
    if (Math.abs(i.trendEndKg - g) <= 0.01 * g) return hold('Weight is inside the ±1% maintenance band.');
    const dir = g > i.trendEndKg ? 1 : -1; // 1 = need to gain back
    return adjust(tdee + (dir * 0.0025 * i.weightKg * KCAL_PER_KG) / 7,
      `Trend drifted ${dir > 0 ? 'below' : 'above'} the maintenance band — steering back.`);
  }
  // lose / gain
  const miss = obs - target;
  const inBand = (target !== 0 && Math.abs(miss) <= 0.2 * Math.abs(target)) || Math.abs(miss) < 0.001 * i.weightKg;
  if (inBand) return hold('On track — within the deadband.');
  return adjust(tdee + (target * KCAL_PER_KG) / 7, 'Off the target rate — adjusting toward it.');
}
