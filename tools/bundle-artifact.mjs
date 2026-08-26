// Bundles the REAL app into one self-contained HTML file, for publishing as a
// clickable artifact. Every tab works; it is the app, not a picture of it.
//
//   node tools/bundle-artifact.mjs [out.html]
//
// It reads js/, css/ and data/ straight off disk, so it cannot drift from the
// app the way prototype/ did. There is no second copy of anything here.
//
// Three things are different from the deployed app, and only three:
//
//   1. geolocation is stubbed to a fixed position, so the Next screen is alive
//      without standing on I-40. Set POSITION below.
//   2. fetch serves data/*.json from inside the file. Everything else — the
//      weather API, Nominatim, Firestore — is unreachable from an artifact, and
//      the app already degrades for exactly that case. That is the desert
//      behaviour, on purpose.
//   3. the install walkthrough is pre-dismissed. There is nothing to install.
//
// The ES modules are wrapped one-per-IIFE into a tiny registry rather than
// concatenated, so module scope is preserved and nothing collides. Exports are
// getters, so namespace imports (`import * as syncmod`) still see live values.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(ROOT, p), 'utf8');

// Somewhere worth looking at: I-40 eastbound between Winslow and Holbrook AZ,
// milepost ~752 of leg 1.
const POSITION = { lat: 35.025, lon: -110.56, accuracy: 12 };

// Dependency order. No cycles; each module only needs the ones above it.
const MODULES = [
  'version.js', 'route.js', 'plan.js', 'store.js', 'map.js',
  'firebase-config.js', 'sync.js', 'weather.js', 'geocode.js', 'install.js',
  'ui.js', 'app.js',
];

/// Rewrites one ES module into a registry entry: imports read from the
/// registry, exports become getters on the returned object.
function wrap(file) {
  let src = read('js/' + file);
  const names = new Set();

  // import { a, b } from './x.js'   ->   const { a, b } = __M['./x.js'];
  // import * as ns  from './x.js'   ->   const ns = __M['./x.js'];
  src = src.replace(/^import\s+([\s\S]+?)\s+from\s+'\.\/([\w.-]+)';/gm, (_, what, mod) => {
    what = what.trim();
    const ns = what.match(/^\*\s*as\s+(\w+)$/);
    return ns ? `const ${ns[1]} = __M['./${mod}'];`
              : `const ${what} = __M['./${mod}'];`;
  });

  src = src.replace(/^export\s+(async\s+)?function\s+(\w+)/gm,
    (_, a, n) => { names.add(n); return `${a || ''}function ${n}`; });
  src = src.replace(/^export\s+(const|let|var)\s+(\w+)/gm,
    (_, k, n) => { names.add(n); return `${k} ${n}`; });
  src = src.replace(/^export\s*\{([^}]*)\};?[ \t]*$/gm, (_, list) => {
    for (const part of list.split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop();
      if (n) names.add(n);
    }
    return '';
  });

  const left = src.match(/^\s*export\b/m);
  if (left) throw new Error(`${file}: an export form the bundler does not handle: ${left[0]}`);

  const getters = [...names].map(n =>
    `  Object.defineProperty(__e, ${JSON.stringify(n)}, { get: function () { return ${n}; }, enumerable: true });`
  ).join('\n');

  return `__M['./${file}'] = (function () {\n'use strict';\n${src}\n` +
         `  var __e = {};\n${getters}\n  return __e;\n})();`;
}

const bundle = MODULES.map(wrap).join('\n\n');

const DATA = {};
for (const f of ['route.json', 'stops.json', 'usa.json', 'extras.json'])
  DATA['data/' + f] = JSON.parse(read('data/' + f));

const css = read('css/app.css');

const preamble = `
// --- artifact shims. See tools/bundle-artifact.mjs for what and why. --------
var __DATA = ${JSON.stringify(DATA)};
var __POS = ${JSON.stringify(POSITION)};

var __fetch = window.fetch ? window.fetch.bind(window) : null;
window.fetch = function (u, o) {
  var k = String(u && u.url ? u.url : u).replace(/^\\.\\//, '');
  if (__DATA[k]) return Promise.resolve(new Response(JSON.stringify(__DATA[k]),
    { status: 200, headers: { 'Content-Type': 'application/json' } }));
  return __fetch ? __fetch(u, o) : Promise.reject(new Error('offline'));
};

// A fixed fix. watchPosition keeps its contract — it calls back and returns an
// id — so the app's own start/stop logic is untouched.
var __fix = function () {
  return { coords: { latitude: __POS.lat, longitude: __POS.lon, accuracy: __POS.accuracy,
    altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
};
Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
  getCurrentPosition: function (ok) { setTimeout(function () { ok(__fix()); }, 60); },
  watchPosition: function (ok) { setTimeout(function () { ok(__fix()); }, 60); return 1; },
  clearWatch: function () {},
} });

try {
  if (!localStorage.getItem('milepost.artifact')) {
    localStorage.setItem('milepost.artifact', '1');
    localStorage.setItem('milepost.installed-prompt', 'dismissed');  // nothing to install
    localStorage.setItem('milepost.watch', '1');                     // open on Next, live
  }
} catch (_) {}

var __M = {};
`;

const html = `<title>Milepost</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
${css}
</style>

<div id="shell">
  <div class="head" id="head"></div>
  <div class="scroll" id="scroll"></div>
  <nav class="tabs" id="tabs"></nav>
  <div class="sheet" id="sheet"></div>
  <div id="install"></div>
</div>

<script>
${preamble}
${bundle}
</` + `script>
`;

const out = process.argv[2] || resolve(ROOT, 'milepost-artifact.html');
writeFileSync(out, html, 'utf8');
console.log('wrote ' + out + '  (' + (html.length / 1024).toFixed(0) + ' KB)');
