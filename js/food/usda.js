// USDA FoodData Central client. A saved key is preferred; the bundled public
// app key keeps search working on a fresh install.
const NUTRIENT = { kcal: 1008, p: 1003, c: 1005, f: 1004 };
const DEFAULT_API_KEY = 'ZfG8R935gi2GI9b0n1C30bx90eJ4KS65iqRocf4m';

function portionLabel(p) {
  const amount = p?.amount != null ? `${p.amount}` : '';
  const mod = p?.modifier?.trim();
  const unit = p?.measureUnit?.abbreviation || p?.measureUnit?.name || '';
  const parts = [amount, mod || (unit && unit !== 'undetermined' ? unit : '')].filter(Boolean);
  return parts.join(' ').trim();
}

export function usdaServingsFromFood(f) {
  const servings = [];
  const grams = +f?.servingSize;
  const label = f?.householdServingFullText?.trim();
  if (label && grams > 0) servings.push({ label, grams });
  for (const p of f?.foodPortions || []) {
    const g = +p?.gramWeight;
    const plabel = portionLabel(p);
    if (g > 0 && plabel) servings.push({ label: plabel, grams: g });
  }
  return servings.filter((s, i, a) => s.grams > 0 && s.label && a.findIndex((x) => x.label === s.label && x.grams === s.grams) === i);
}

export function normalizeUsda(f) {
  const by = {};
  for (const n of f?.foodNutrients || []) by[n.nutrientId] = n.value;
  const kcal = by[NUTRIENT.kcal];
  if (!Number.isFinite(kcal)) return null;
  const servings = usdaServingsFromFood(f);
  return {
    id: 'usda:' + f.fdcId, source: 'usda',
    label: f.description || 'Unnamed food', brand: f.brandOwner || '',
    per100g: { kcal, p: by[NUTRIENT.p] || 0, c: by[NUTRIENT.c] || 0, f: by[NUTRIENT.f] || 0 },
    serving: servings[0] ?? null,
    servings,
  };
}

export function buildUsdaSearchUrl(q, apiKey) {
  const key = apiKey?.trim() || DEFAULT_API_KEY;
  return `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}` +
    `&query=${encodeURIComponent(q)}&pageSize=15&dataType=Foundation,SR%20Legacy,Branded`;
}

export async function searchUsda(q, apiKey) {
  const r = await fetch(buildUsdaSearchUrl(q, apiKey));
  if (!r.ok) throw new Error(`USDA error ${r.status}`);
  return ((await r.json()).foods || []).map(normalizeUsda).filter(Boolean);
}

export async function hydrateUsdaFood(food, apiKey) {
  if (!food?.id || !String(food.id).startsWith('usda:')) return food;
  if ((food.servings || []).length > 1) return food;
  const id = String(food.id).slice(5);
  const r = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(id)}?api_key=${encodeURIComponent((apiKey?.trim() || DEFAULT_API_KEY))}`);
  if (!r.ok) return food;
  const detail = await r.json();
  const servings = usdaServingsFromFood(detail);
  if (!servings.length) return food;
  const merged = [...(food.servings || []), ...servings].filter((s, i, a) => s.grams > 0 && s.label && a.findIndex((x) => x.label === s.label && x.grams === s.grams) === i);
  return { ...food, servings: merged, serving: merged[0] ?? food.serving ?? null };
}
