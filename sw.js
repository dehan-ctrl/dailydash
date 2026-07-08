const CACHE = 'macrocoach-v21'; // bump on every deploy that changes shipped files
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/backup.js', 'js/db.js', 'js/units.js', 'js/util.js', 'js/charts.js', 'js/i18n.js',
  'js/engine/prescribe.js', 'js/engine/trend.js', 'js/engine/checkin.js', 'js/engine/planner.js',
  'js/engine/targets.js',
  'js/food/off.js', 'js/food/usda.js', 'js/food/barcode.js', 'js/food/portion.js', 'js/food/custom.js',
  'js/food/tr-foods.js', 'js/food/translate.js',
  'js/views/onboarding.js', 'js/views/diary.js', 'js/views/coach.js',
  'js/views/me.js', 'js/views/plan.js', 'js/views/settings.js',
  'vendor/zxing.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== CACHE + '-api').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./')));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
  } else {
    e.respondWith(fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE + '-api').then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request)));
  }
});
