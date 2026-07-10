import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index registers service worker with explicit update handling', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /updateViaCache:\s*'none'/);
  assert.match(html, /controllerchange/);
  assert.match(html, /registration\.update/);
});

test('app wires pull-to-refresh with a visible indicator', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /setupPullToRefresh/);
  assert.match(app, /touchmove/);
  const css = await readFile(new URL('../css/app.css', import.meta.url), 'utf8');
  assert.match(css, /#ptr/);
  assert.match(css, /overscroll-behavior/);
});

test('layout is pinned against iOS keyboard viewport drift', async () => {
  const css = await readFile(new URL('../css/app.css', import.meta.url), 'utf8');
  assert.match(css, /body\s*\{\s*[^}]*position:\s*fixed/); // window can never stay scrolled
  assert.match(css, /var\(--kb, 0px\)/); // picker pads past the keyboard
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /visualViewport/);
  assert.match(app, /scrollTo\(0, 0\)/);
  assert.match(app, /picker-open/); // pull-to-refresh must not eject the picker
});

test('food search typing does not blur or remount on keystrokes', async () => {
  const diary = await readFile(new URL('../js/views/diary.js', import.meta.url), 'utf8');
  assert.match(diary, /<form class="searchbar"/);
  assert.match(diary, /type="search"/);
  assert.doesNotMatch(diary, /input\.blur\(\)/);
  assert.doesNotMatch(diary, /input\.onkeydown/);
});

test('food picker rechecks selected food after async local food load', async () => {
  const diary = await readFile(new URL('../js/views/diary.js', import.meta.url), 'utf8');
  assert.match(diary, /const localsData = await localFoods\(\);[\s\S]*if \(sheet\.picked\) return renderFoodPage\(\);/);
});

test('food picker invalidates stale renders after a food is picked', async () => {
  const diary = await readFile(new URL('../js/views/diary.js', import.meta.url), 'utf8');
  assert.match(diary, /let searchTimer = null, pickerRenderSeq = 0;/);
  assert.match(diary, /const renderSeq = \+\+pickerRenderSeq;/);
  assert.match(diary, /if \(renderSeq !== pickerRenderSeq\) return;/);
  assert.match(diary, /pickerRenderSeq \+= 1;[\s\S]*sheet\.picked =/);
});

test('service worker supports forced activation and network-first navigations', async () => {
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /message/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(sw, /e\.request\.mode === 'navigate'/);
});
