/* Service worker: alt forhåndslagres, så appen virker uten nett etter første lasting.
   Endre VERSION ved hver utgivelse, så gamle filer byttes ut. */
const VERSION = 'k0.6.8';
const CACHE = 'kjorerapport-kamera-' + VERSION;
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/app.js', './js/analysis.js', './js/recorder.js', './js/db.js', './js/report.js', './js/format.js', './js/sensors.js', './js/enrich.js', './js/ui.js', './js/log.js', './js/insights.js', './js/camera.js', './js/facecam.js', './js/situations.js', './js/road.js', './js/plan.js', './js/lanes.js', './js/livelimit.js',
  './fonts/overpass-latin.woff2', './fonts/overpass-latin-ext.woff2',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('kjorerapport-kamera-k') && k !== CACHE)  /* hovedappen deler opprinnelse og har egne cacher */.map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

/* Kartbiter fra Kartverket mellomlagres (sist brukte først), så rapporter du har sett virker uten nett. */
const TILE_CACHE = 'kjorerapport-kamera-kart';
const TILE_MAX = 1500;
const ML_CACHE = 'kjorerapport-kamera-ml';
async function trimTiles() {
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - TILE_MAX; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && url.hostname === 'cache.kartverket.no') {
    e.respondWith(caches.open(TILE_CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { c.put(e.request, res.clone()); trimTiles(); }
      return res;
    }))));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  /* Ansiktsgjenkjenningen (rundt 13 MB) lastes først når kameraet brukes, og lagres da for bruk uten nett */
  if (url.pathname.includes('/vendor/mediapipe/')) {
    e.respondWith(caches.open(ML_CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
