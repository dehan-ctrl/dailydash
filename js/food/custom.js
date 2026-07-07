export function normalizeBarcode(code) {
  return String(code || '').replace(/\D/g, '');
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
