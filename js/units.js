export const KG_PER_LB = 0.45359237;
export const kgToLb = (kg) => kg / KG_PER_LB;
export const lbToKg = (lb) => lb * KG_PER_LB;

export function cmToFtIn(cm) {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return { ft, in: inch };
}
export const ftInToCm = (ft, inch) => (ft * 12 + inch) * 2.54;

export function fmtWeight(kg, units) {
  if (units === 'imperial') {
    return `${kgToLb(kg).toFixed(1)} lb`;
  } else {
    return `${(Math.round(kg * 10) / 10).toFixed(1)} kg`;
  }
}
export function fmtHeight(cm, units) {
  if (units === 'imperial') { const { ft, in: i } = cmToFtIn(cm); return `${ft}'${i}"`; }
  return `${Math.round(cm)} cm`;
}
