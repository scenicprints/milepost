// Offline is the whole point. Between Needles and Flagstaff, and again
// across West Texas, there is no signal — so everything the app needs is
// cached on first run and served from cache first, always.
const CACHE = 'milepost-v3';
const SHELL = [
  'index.html', 'manifest.webmanifest',
  'css/app.css',
  'js/app.js', 'js/ui.js', 'js/store.js', 'js/route.js', 'js/plan.js', 'js/map.js',
  'js/install.js', 'js/sync.js', 'js/firebase-config.js',
  // Vendored so the app boots with no signal. A CDN import would fail in
  // exactly the places this trip goes.
  'vendor/firebase-app.js', 'vendor/firebase-auth.js', 'vendor/firebase-firestore.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'data/route.json', 'data/stops.json', 'data/usa.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      // Cache first, then quietly refresh for next time.
      const net = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
