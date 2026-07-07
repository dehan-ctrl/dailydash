const p2 = (n) => String(n).padStart(2, '0');
export function dstr(d = new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
export function addDays(s, n) {
  const d = new Date(s + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dstr(d);
}
export function dowMon(s) { return (new Date(s + 'T12:00:00').getDay() + 6) % 7; }
