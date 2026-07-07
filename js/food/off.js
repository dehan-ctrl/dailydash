// Open Food Facts client. Normalizers are pure; fetchers are browser-only.
const BASE = 'https://world.openfoodfacts.org';
const SEARCH_BASE = 'https://search.openfoodfacts.org';
const FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';
const SEARCH_FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';
const SEARCH_PAGE_SIZE = 50;

const brandText = (brands) => Array.isArray(brands) ? brands.join(', ') : brands || '';
const nval = (n, key) => +n?.[key] || 0;

export function normalizeProduct(p) {
  const n = p?.nutriments || {};
  const kcal = +n['energy-kcal_100g'];
  if (!Number.isFinite(kcal)) return null;
  return {
    id: 'off:' + p.code, source: 'off',
    label: p.product_name || 'Unnamed product', brand: brandText(p.brands), barcode: p.code,
    per100g: { kcal, p: nval(n, 'proteins_100g'), c: nval(n, 'carbohydrates_100g'), f: nval(n, 'fat_100g') },
    serving: +p.serving_quantity > 0
      ? { grams: +p.serving_quantity, label: p.serving_size || `${p.serving_quantity} g` } : null,
  };
}

export function normalizeSearchHit(hit) {
  return normalizeProduct(hit);
}

export function buildOffSearchUrl(q, page = 1) {
  return `${SEARCH_BASE}/search?q=${encodeURIComponent(q)}&page_size=${SEARCH_PAGE_SIZE}&page=${page}&fields=${SEARCH_FIELDS}`;
}

export function hasMoreOffPages(data) {
  return (+data?.page || 1) < (+data?.page_count || 1);
}

export async function searchFoodsPage(q, page = 1) {
  const r = await fetch(buildOffSearchUrl(q, page));
  if (!r.ok) throw new Error(`Open Food Facts error ${r.status}`);
  const data = await r.json();
  return {
    foods: (data.hits || []).map(normalizeSearchHit).filter(Boolean),
    hasMore: hasMoreOffPages(data),
  };
}

export async function searchFoods(q, page = 1) {
  return (await searchFoodsPage(q, page)).foods;
}

export async function lookupBarcode(code) {
  const r = await fetch(`${BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.status === 1 ? normalizeProduct(d.product) : null;
}
