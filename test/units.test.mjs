import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kgToLb, lbToKg, cmToFtIn, ftInToCm, fmtWeight, fmtHeight } from '../js/units.js';
import { addDays, dowMon } from '../js/util.js';

test('kg to lb', () => { assert.ok(Math.abs(kgToLb(100) - 220.462) < 0.01); });
test('lb/kg roundtrip', () => { assert.ok(Math.abs(lbToKg(kgToLb(82.5)) - 82.5) < 1e-9); });
test('cm to ft/in', () => { assert.deepEqual(cmToFtIn(180), { ft: 5, in: 11 }); });
test('ft/in to cm', () => { assert.ok(Math.abs(ftInToCm(5, 11) - 180.34) < 0.01); });
test('inch rollover 12→next ft', () => { assert.deepEqual(cmToFtIn(182.88), { ft: 6, in: 0 }); });
test('format weight', () => {
  assert.equal(fmtWeight(82.55, 'imperial'), '182.0 lb');
  assert.equal(fmtWeight(82.55, 'metric'), '82.6 kg');
});
test('format height', () => {
  assert.equal(fmtHeight(180, 'imperial'), `5'11"`);
  assert.equal(fmtHeight(180, 'metric'), '180 cm');
});
test('addDays crosses months', () => { assert.equal(addDays('2026-01-31', 1), '2026-02-01'); });
test('dowMon monday is 0', () => { assert.equal(dowMon('2026-07-06'), 0); }); // a Monday
