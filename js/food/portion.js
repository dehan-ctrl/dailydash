// Serving definitions and portion math. Pure.
// Every food carries per-100g macros plus a list of servings [{label, grams}].
// A logged portion = qty × one serving (qty may be fractional, e.g. 0.5).

export function normalizeServings(food) {
  const list = Array.isArray(food.servings) ? [...food.servings] : [];
  if (!list.length && food.serving?.grams > 0) {
    list.push({ label: food.serving.label || `${food.serving.grams} g`, grams: +food.serving.grams });
  }
  if (!list.some((s) => s.grams === 100)) list.unshift({ label: '100 g', grams: 100 });
  return list.filter((s) => s.grams > 0 && s.label);
}

export function portionMacros(per100g, grams) {
  const s = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * s),
    p: +(per100g.p * s).toFixed(1),
    c: +(per100g.c * s).toFixed(1),
    f: +(per100g.f * s).toFixed(1),
  };
}

export function entryFromPortion(food, serving, qty) {
  const grams = serving.grams * qty;
  return {
    label: food.label, brand: food.brand || '', foodId: food.id ?? null,
    qty, unit: 'serving', servingLabel: serving.label, grams: +grams.toFixed(1),
    ...portionMacros(food.per100g, grams),
  };
}
