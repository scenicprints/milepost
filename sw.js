// Offline is the whole point. Between Needles and Flagstaff, and again across
// West Texas, there is no signal — so everything the app needs is cached on
// first run.
//
// But pure cache-first was wrong, and testing proved it: the app kept serving
// old code after a deploy. Two things compounded — the cache was consulted
// first, AND the background refresh went through the browser's HTTP cache,
// which GitHub Pages lets sit for minutes. A fix pushed mid-trip could take
// many reloads to arrive, or never.
//
// So: code is network-first with a short timeout and a cache fallback, which
// stays fully offline (a failed fetch falls back instantly) while always
// preferring fresh. Data, icons and the vendored SDK stay cache-first — they
// are large, they rarely change, and a stale copy of them is harmless.

const CACHE = 'milepost-v82';

const SHELL = [
  'index.html', 'desk.html', 'manifest.webmanifest',
  'css/app.css', 'css/fonts.css', 'css/desk.css',
  'fonts/archivo-400.woff2', 'fonts/archivo-500.woff2',
  'fonts/ibm-plex-mono-400.woff2', 'fonts/ibm-plex-mono-500.woff2',
  'js/app.js', 'js/ui.js', 'js/store.js', 'js/route.js', 'js/plan.js', 'js/map.js',
  'js/install.js', 'js/sync.js', 'js/firebase-config.js', 'js/version.js',
  'js/weather.js', 'js/geocode.js', 'js/darksky.js',
  'js/winter.js', 'js/itinerary.js', 'js/desk.js', 'js/export.js',
  'data/route.json', 'data/stops.json', 'data/usa.json', 'data/extras.json', 'data/darksky.json', 'data/darksky.png', 'data/hours.json', 'data/winter.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'vendor/firebase-app.js', 'vendor/firebase-firestore.js',
];

// Big and stable — always serve from cache when we have it.
const CACHE_FIRST = /\/(data|vendor|icons|fonts)\/|\.(png|json|webmanifest|woff2)$/;

const NET_TIMEOUT = 2500;

// Code is all-or-nothing. Everything below is served network-first with a
// timeout that falls back to the cache, and every asset runs that race on its
// own — so a slow but working connection could hand you a FRESH desk.js and a
// STALE desk.css from the previous deploy at the same time. That is the worst
// possible split: the new code runs and produces markup that nothing styles,
// and the page looks broken rather than looking old.
//
// So code gets a much longer leash. Not an infinite one: waiting forever would
// hang the app dead on a weak or captive-portal connection, which is exactly
// where it has to work. Fifteen seconds is long enough that two code assets
// straddling it is vanishingly unlikely, and the failure is still a graceful
// fall back to the cache rather than a spinner.
//
// Data and images keep the short timeout: a stale JSON is a stale fact, not a
// broken page, and that is a fair trade for speed in the Mojave.
const CODE = /\.(html|js|css)$|\/$/;
const CODE_TIMEOUT = 15000;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // Bypass the HTTP cache when priming, or we'd cache what we're replacing.
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
  );
  // Deliberately NOT skipWaiting(). A new worker used to take over by itself,
  // which swapped the code under a running session. Updates are now a button
  // in Trip, and that button sends SKIP_WAITING.
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();

  // "Am I actually going to work with no signal?" is a real question before a
  // trip through the Mojave, and until now nothing could answer it. Count what
  // is genuinely in the cache against what the app needs.
  if (e.data && e.data.type === 'CACHE_STATUS' && e.ports && e.ports[0]) {
    const port = e.ports[0];
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.match(u).then(Boolean))))
      .then(hits => port.postMessage({
        have: hits.filter(Boolean).length,
        want: SHELL.length,
        missing: SHELL.filter((_, i) => !hits[i]),
      }))
      .catch(() => port.postMessage({ have: 0, want: SHELL.length, missing: SHELL }));
  }
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(req, timeout) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeout);
    fetch(req).then(res => { clearTimeout(t); resolve(res); },
                    err => { clearTimeout(t); reject(err); });
  });
}

async function networkFirst(req, timeout) {
  try {
    const res = await fromNetwork(req, timeout || NET_TIMEOUT);
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch (_) {
    const hit = await caches.match(req);
    if (hit) return hit;
    // A navigation with nothing cached still needs to render something.
    if (req.mode === 'navigate') {
      const shell = await caches.match('index.html');
      if (shell) return shell;
    }
    throw new Error('offline and uncached');
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never intercept Firestore — it does its own offline queueing, and caching
  // its responses would corrupt that.
  if (url.origin !== location.origin) return;

  if (CACHE_FIRST.test(url.pathname)) return e.respondWith(cacheFirst(req));

  // No timeout for code, so a slow network cannot mix versions. A navigation
  // counts as code: it is the document the rest of the shell hangs off.
  const isCode = req.mode === 'navigate' || CODE.test(url.pathname);
  e.respondWith(networkFirst(req, isCode ? CODE_TIMEOUT : NET_TIMEOUT));
});
