// Serving definitions and portion math. Pure.
// Every food carries per-100g macros plus a list of servings [{label, grams}].
// A logged portion = qty × one serving (qty may be fractional, e.g. 0.5).

export function normalizeServings(food) {
  const list = Array.isArray(food.servings) ? [...food.servings] : [];
  if (!list.length && food.serving?.grams > 0) {
    list.push({
      label: food.serving.label || `${food.serving.grams} g`,
      grams: +food.serving.grams,
      ...(food.serving.macros ? { macros: { ...food.serving.macros } } : {}),
    });
  }
  if (!list.some((s) => s.grams === 100)) list.unshift({ label: '100 g', grams: 100 });
  return list.filter((s) => (s.grams > 0 || s.macros) && s.label);
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

export function servingMacros(food, serving) {
  if (serving?.macros) return serving.macros;
  if (serving?.grams > 0) return portionMacros(food.per100g, serving.grams);
  return { kcal: 0, p: 0, c: 0, f: 0 };
}

export function scaleMacros(macros, qty) {
  return {
    kcal: Math.round(macros.kcal * qty),
    p: +(macros.p * qty).toFixed(1),
    c: +(macros.c * qty).toFixed(1),
    f: +(macros.f * qty).toFixed(1),
  };
}

export function entryFromPortion(food, serving, qty) {
  const grams = serving.grams > 0 ? serving.grams * qty : 0;
  const macros = scaleMacros(servingMacros(food, serving), qty);
  return {
    label: food.label, brand: food.brand || '', foodId: food.id ?? null,
    qty, unit: 'serving', servingLabel: serving.label, grams: +grams.toFixed(1),
    ...macros,
  };
}
