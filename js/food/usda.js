// USDA FoodData Central client — only used when the user supplies an API key.
const NUTRIENT = { kcal: 1008, p: 1003, c: 1005, f: 1004 };

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

export async function searchUsda(q, apiKey) {
  if (!apiKey) return [];
  const u = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}` +
    `&query=${encodeURIComponent(q)}&pageSize=15&dataType=Foundation,SR%20Legacy,Branded`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`USDA error ${r.status}`);
  return ((await r.json()).foods || []).map(normalizeUsda).filter(Boolean);
}
