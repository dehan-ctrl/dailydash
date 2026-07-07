import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index registers service worker with explicit update handling', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /updateViaCache:\s*'none'/);
  assert.match(html, /controllerchange/);
  assert.match(html, /registration\.update/);
});

test('service worker supports forced activation and network-first navigations', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /message/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(sw, /e\.request\.mode === 'navigate'/);
});
