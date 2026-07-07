// USDA FoodData Central client. A saved key is preferred; DEMO_KEY is a
// rate-limited public fallback so search still works on a fresh install.
const NUTRIENT = { kcal: 1008, p: 1003, c: 1005, f: 1004 };
const DEFAULT_API_KEY = 'DEMO_KEY';

export function normalizeUsda(f) {
  const by = {};
  for (const n of f?.foodNutrients || []) by[n.nutrientId] = n.value;
  const kcal = by[NUTRIENT.kcal];
  if (!Number.isFinite(kcal)) return null;
  return {
    id: 'usda:' + f.fdcId, source: 'usda',
    label: f.description || 'Unnamed food', brand: f.brandOwner || '',
    per100g: { kcal, p: by[NUTRIENT.p] || 0, c: by[NUTRIENT.c] || 0, f: by[NUTRIENT.f] || 0 },
    serving: null, // FDC search results are per-100g
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
