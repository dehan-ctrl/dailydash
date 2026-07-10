import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCameraEnhancementConstraints, scanErrorMessage } from '../js/food/barcode.js';

test('scanErrorMessage maps camera errors to helpful text', () => {
  assert.match(scanErrorMessage({ name: 'NotAllowedError' }), /permission/i);
  assert.match(scanErrorMessage({ name: 'NotFoundError' }), /no usable camera/i);
  assert.match(scanErrorMessage({ name: 'NotReadableError' }), /another app/i);
  assert.equal(scanErrorMessage({ message: 'boom' }), 'boom');
  assert.equal(scanErrorMessage(undefined), 'Camera unavailable.');
});

test('scanner uses facingMode constraints, not device enumeration', async () => {
  const src = await readFile(new URL('../js/food/barcode.js', import.meta.url), 'utf8');
  assert.match(src, /decodeFromConstraints/);
  assert.match(src, /facingMode/);
  assert.match(src, /TRY_HARDER/);
  assert.doesNotMatch(src, /listVideoInputDevices/);
});

test('camera enhancements request supported focus, zoom, and torch constraints', () => {
  const constraints = buildCameraEnhancementConstraints({
    focusMode: ['manual', 'continuous'],
    zoom: { min: 1, max: 4 },
    torch: true,
  }, { torch: true });

  assert.deepEqual(constraints, {
    advanced: [
      { focusMode: 'continuous' },
      { zoom: 2 },
      { torch: true },
    ],
  });
});

test('camera enhancements skip unsupported capabilities', () => {
  assert.equal(buildCameraEnhancementConstraints({}, { torch: true }), null);
});
