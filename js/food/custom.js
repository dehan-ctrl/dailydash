import { reconcileCustomFood } from './portion.js';

export function normalizeBarcode(code) {
  return String(code || '').replace(/\D/g, '');
}

// Build a custom food from form fields. When a serving is given, the entered
// macros belong to that serving and per-100g is derived from its grams;
// otherwise the macros are taken as per 100 g.
export function buildCustomFood({ label, barcode = '', macros, servingLabel = '', servingGrams = 0 }) {
  const grams = +servingGrams;
  const servings = [{ label: '100 g', grams: 100 }];
  if (grams > 0) {
    servings.push({ label: String(servingLabel).trim() || `${grams} g`, grams, macros: { ...macros } });
  }
  return reconcileCustomFood({
    source: 'custom', label, brand: '',
    barcode: normalizeBarcode(barcode),
    per100g: { ...macros },
    servings,
  });
}

function barcodeMatches(a, b) {
  const left = normalizeBarcode(a);
  const right = normalizeBarcode(b);
  if (!left || !right) return false;
  return left === right || left.replace(/^0+/, '') === right.replace(/^0+/, '');
}

export function customFoodId(food) {
  return String(food?.id).startsWith('custom:') ? food.id : `custom:${food.id}`;
}

export function customFoodForBarcode(foods, code) {
  const food = foods.find((f) => barcodeMatches(f.barcode, code));
  return food ? { ...food, id: customFoodId(food), source: 'custom' } : null;
}
