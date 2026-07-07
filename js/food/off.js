// Open Food Facts client. normalizeProduct is pure; fetchers are browser-only.
const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';

export function normalizeProduct(p) {
  const n = p?.nutriments || {};
  const kcal = +n['energy-kcal_100g'];
  if (!Number.isFinite(kcal)) return null;
  return {
    id: 'off:' + p.code, source: 'off',
    label: p.product_name || 'Unnamed product', brand: p.brands || '', barcode: p.code,
    per100g: { kcal, p: +n.proteins_100g || 0, c: +n.carbohydrates_100g || 0, f: +n.fat_100g || 0 },
    serving: +p.serving_quantity > 0
      ? { grams: +p.serving_quantity, label: p.serving_size || `${p.serving_quantity} g` } : null,
  };
}

export async function searchFoods(q) {
  const u = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Open Food Facts error ${r.status}`);
  return ((await r.json()).products || []).map(normalizeProduct).filter(Boolean);
}

export async function lookupBarcode(code) {
  const r = await fetch(`${BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.status === 1 ? normalizeProduct(d.product) : null;
}
