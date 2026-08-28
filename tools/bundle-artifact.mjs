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

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(ROOT, p), 'utf8');

// Somewhere worth looking at: I-40 eastbound between Winslow and Holbrook AZ,
// milepost ~752 of leg 1.
const POSITION = { lat: 35.025, lon: -110.56, accuracy: 12 };

// THE APP HAS TWO ENTRY POINTS, and only one of them is bundled.
//
// index.html is the phone app, and its graph is MODULES below, in dependency
// order — no cycles, each module only needs the ones above it. That is what
// this artifact is: the shell markup at the bottom of this file is index.html's
// markup, so index.html's graph is the only one that can run against it.
//
// desk.html is the desktop planner. Its modules are listed separately and are
// DELIBERATELY NOT BUNDLED: desk.js calls boot() at the bottom and immediately
// queries #leg, #road, #date, so dropping it into this artifact would run the
// planner against a DOM that has none of its elements and throw at load.
//
// They are still listed, because "I added a module and forgot the list" is the
// exact mistake the audit exists to catch, and an unlisted file must never be
// able to pass silently just because it happens to belong to the other view.
const MODULES = [
  'version.js', 'route.js', 'plan.js', 'store.js', 'map.js',
  'firebase-config.js', 'sync.js', 'weather.js', 'geocode.js', 'install.js',
  'darksky.js', 'ui.js', 'app.js',
];

const DESK_ONLY = ['winter.js', 'itinerary.js', 'export.js', 'desk.js'];

const importsOf = file =>
  [...readFileSync(resolve(ROOT, 'js', file), 'utf8')
    .matchAll(/^import\s+[\s\S]+?\s+from\s+'\.\/([\w.-]+)';/gm)].map(m => m[1]);

/// A module missing from MODULES produced a bundle that PARSED FINE and then
/// died at boot — its registry entry was simply never created, so the importer
/// got `undefined`. Adding a file to js/ and forgetting this list is the easy
/// mistake, and it is invisible until the page runs. So check, don't trust.
function auditGraph() {
  const bundled = new Set(MODULES);
  const desk = new Set(DESK_ONLY);
  const problems = [];

  // 0. Everything listed has to EXIST before anything can be read, or the
  //    reads below die with a raw ENOENT instead of saying what is wrong.
  const missing = [...MODULES, ...DESK_ONLY].filter(f => !existsSync(resolve(ROOT, 'js', f)));
  if (missing.length)
    throw new Error('bundle-artifact: listed but not on disk:\n  '
      + missing.map(f => 'js/' + f).join('\n  '));

  // 1. The bundled graph is complete and correctly ordered.
  MODULES.forEach((file, i) => {
    for (const d of importsOf(file)) {
      if (desk.has(d))
        // This is the dangerous one. It means a desk-only module has been
        // pulled into the phone app, so the artifact would be missing a
        // dependency it genuinely needs — exactly the boot death above.
        problems.push(file + ' imports ./' + d + ', which is desk-only. Either it belongs in MODULES now, or the import is a mistake.');
      else if (!bundled.has(d)) problems.push(file + ' imports ./' + d + ', which is not in MODULES');
      else if (MODULES.indexOf(d) > i) problems.push(file + ' imports ./' + d + ', which is listed AFTER it');
    }
  });

  // 2. The desk graph is internally accounted for, so a file it needs cannot
  //    quietly go missing just because this bundle does not build it.
  for (const file of DESK_ONLY)
    for (const d of importsOf(file))
      if (!bundled.has(d) && !desk.has(d))
        problems.push(file + ' imports ./' + d + ', which is in neither list');

  // 3. Nothing on disk is unaccounted for, in either direction.
  for (const f of readdirSync(resolve(ROOT, 'js')))
    if (f.endsWith('.js') && !bundled.has(f) && !desk.has(f))
      problems.push('js/' + f + ' exists but is in neither MODULES nor DESK_ONLY');

  if (problems.length)
    throw new Error('bundle-artifact: the module graph is wrong, the bundle would die at boot:\n  ' +
      problems.join('\n  '));
}
auditGraph();

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

// Read the directory rather than list it by hand. A hand-kept list here missed
// darksky.json, and the failure was invisible: the shim did not recognise the
// path, the real fetch went out, it failed inside the artifact, and the feature
// just silently did not exist. Every list in this file is now derived.
const DATA = {};
for (const f of readdirSync(resolve(ROOT, 'data')))
  if (f.endsWith('.json')) DATA['data/' + f] = JSON.parse(read('data/' + f));

// Images cannot come through the fetch shim: the heat map is an <image href>,
// which the browser resolves itself and which would 404 inside a single-file
// artifact. Inline it as a data URI and point the sidecar straight at it.
// darksky.js takes an image that already looks like a URI as-is.
for (const f of readdirSync(resolve(ROOT, 'data'))) {
  if (!f.endsWith('.png')) continue;
  const uri = 'data:image/png;base64,' + readFileSync(resolve(ROOT, 'data', f)).toString('base64');
  for (const doc of Object.values(DATA))
    if (doc && doc.image === f) doc.image = uri;
}

// The fonts are vendored now, so the bundle inlines them too rather than
// linking Google. An artifact that reaches out for its typefaces is the same
// bug as an app that does — it just fails on a plane instead of in the Mojave.
const fontCss = read('css/fonts.css').replace(
  /url\('\.\.\/fonts\/([\w.-]+)'\)/g,
  (_, file) => "url('data:font/woff2;base64," +
    readFileSync(resolve(ROOT, 'fonts', file)).toString('base64') + "')");

const css = fontCss + '\n' + read('css/app.css');

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

// The charset is NOT optional here. This file is opened from disk as often as
// over http, and with no declaration the browser guesses — which rendered every
// "·" in the app as "Â·". The deployed app declares it in index.html; a
// single-file artifact has to carry its own.
const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Milepost</title>
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
