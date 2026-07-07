// Pure prescription math. Weights kg, heights cm, energy kcal.
export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.9 };
export const ACTIVITY_LABELS = {
  sedentary: 'Sedentary — desk job, little exercise',
  light: 'Lightly active — 1–3 workouts/week',
  moderate: 'Moderately active — 3–5 workouts/week',
  very: 'Very active — 6–7 workouts/week',
  extra: 'Extremely active — physical job + training',
};
export const PROTEIN_RANGE = [1.4, 2.6]; // g/kg
const KCAL_PER_KG = 7700;
// Safety rails on weekly rate, as a fraction of body weight.
export const MAX_LOSS_FRAC = 0.0125, MAX_GAIN_FRAC = 0.005;

export const kcalFloor = (sex) => (sex === 'm' ? 1500 : 1200);

export function rmrMifflin({ sex, weightKg, heightCm, age }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'm' ? 5 : -161);
}

// Katch-McArdle — used when body fat % is known; based on lean body mass.
export function leanMassKg(weightKg, bodyFatPct) {
  return weightKg * (1 - bodyFatPct / 100);
}
export function rmrKatch(weightKg, bodyFatPct) {
  return 370 + 21.6 * leanMassKg(weightKg, bodyFatPct);
}
export function rmr(p) {
  return p.bodyFatPct != null && p.bodyFatPct > 0
    ? rmrKatch(p.weightKg, p.bodyFatPct) : rmrMifflin(p);
}

export function ageFromBirthdate(birth, on) {
  const b = new Date(birth + 'T12:00:00'), o = new Date(on + 'T12:00:00');
  let a = o.getFullYear() - b.getFullYear();
  if (o.getMonth() < b.getMonth() ||
      (o.getMonth() === b.getMonth() && o.getDate() < b.getDate())) a -= 1;
  return a;
}

export function fatFloorG(weightKg, kcal) {
  return Math.max(0.6 * weightKg, 0.20 * kcal / 9);
}

function splitCarbFat(kcal, proteinG, weightKg, dietStyle) {
  const floor = fatFloorG(weightKg, kcal);
  const rest = kcal - proteinG * 4; // kcal left for carbs + fat
  let fatG, carbG;
  if (dietStyle === 'keto') { carbG = 25; fatG = (rest - carbG * 4) / 9; }
  else if (dietStyle === 'lowfat') { fatG = floor; carbG = (rest - fatG * 9) / 4; }
  else if (dietStyle === 'lowcarb') { carbG = 0.25 * kcal / 4; fatG = (rest - carbG * 4) / 9; }
  else { fatG = Math.max(0.30 * kcal / 9, floor); carbG = (rest - fatG * 9) / 4; }
  if (fatG < floor) { fatG = floor; carbG = (rest - fatG * 9) / 4; }
  return { carbG: Math.max(0, Math.round(carbG)), fatG: Math.round(fatG) };
}

// Weekly rate is stored as kg/week (positive; direction comes from goal.type),
// clamped to the safety rails above.
export function clampRateKg(goal, weightKg) {
  const max = goal.type === 'lose' ? MAX_LOSS_FRAC * weightKg
    : goal.type === 'gain' ? MAX_GAIN_FRAC * weightKg : 0;
  return Math.min(Math.abs(goal.rateKgPerWeek ?? 0), max);
}

export function prescribe(p) {
  const tdee = Math.round(p.tdeeOverride ??
    rmr(p) * ACTIVITY[p.activity]);
  const sign = p.goal.type === 'lose' ? -1 : p.goal.type === 'gain' ? 1 : 0;
  const rateKgWk = sign * clampRateKg(p.goal, p.weightKg);
  let kcal = Math.round(tdee + rateKgWk * KCAL_PER_KG / 7);
  kcal = Math.max(kcal, kcalFloor(p.sex));
  const perKg = p.proteinPerKg ?? (p.plantBased ? 1.8 : 2.0);
  const proteinG = Math.round(perKg * p.weightKg);
  const { carbG, fatG } = splitCarbFat(kcal, proteinG, p.weightKg, p.dietStyle);
  return { kcal, proteinG, carbG, fatG, tdee };
}

// User hand-edits one macro; the flexible remainder rebalances so kcal is constant.
export function editMacro(t, macro, grams, { weightKg }) {
  const kcal = t.kcal;
  let { proteinG, carbG, fatG } = t;
  let clamped = false;
  const floor = fatFloorG(weightKg, kcal);
  const clamp = (v, lo, hi) => { const c = Math.min(Math.max(v, lo), hi ?? Infinity); if (c !== v) clamped = true; return c; };
  if (macro === 'proteinG') {
    proteinG = Math.round(clamp(grams, PROTEIN_RANGE[0] * weightKg, PROTEIN_RANGE[1] * weightKg));
    carbG = (kcal - proteinG * 4 - fatG * 9) / 4;
  } else if (macro === 'fatG') {
    fatG = Math.round(clamp(grams, floor));
    carbG = (kcal - proteinG * 4 - fatG * 9) / 4;
  } else {
    carbG = clamp(grams, 0);
    fatG = (kcal - proteinG * 4 - carbG * 4) / 9;
    if (fatG < floor) { fatG = floor; carbG = (kcal - proteinG * 4 - fatG * 9) / 4; clamped = true; }
  }
  if (carbG < 0) { carbG = 0; clamped = true; }
  return {
    targets: { kcal, proteinG: Math.round(proteinG), carbG: Math.round(carbG), fatG: Math.round(fatG) },
    clamped,
  };
}
