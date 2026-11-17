// Builds data/elnino.json: what the strongest El Niño winters were like at
// every place on the trip, against the ordinary 30-year normal.
//
//   node tools/elnino.mjs
//
// WHY THIS IS PRECOMPUTED. The app answers "what will the weather be where I
// am on that date" in three tiers: a real forecast inside 16 days, ECMWF's
// seasonal ensemble beyond that, and underneath both, this — the El Niño
// baseline. It is the one tier that says anything useful a month out, and it
// is far too many requests for a phone: 33 winters times every place on the
// trip. So it is fetched once, here, and shipped as data. It holds climate
// statistics for places that are already public. No dates of the trip.
//
// THE ANALOGS are every winter since 1950 whose El Niño peaked at an Oceanic
// Niño Index of +2.0 or more — "very strong" on NOAA's scale, which is what CPC
// says this one is likely to be: 1972-73, 1982-83, 1997-98, 2015-16 and
// 2023-24. Five winters is a small sample, so the app shows them as a tilt
// against the normal, never as a forecast.
//
// THE NORMAL is the WMO standard period, the winters of 1991-92 to 2020-21.
//
// THE WINDOW. Each statistic is a 15-day window centred on a calendar date,
// one centre a week from 11 December to 15 January, which covers the trip with
// room to move the departures. The app picks the centre nearest the day.
//
// Re-run it when a stop is added or moved. Responses are cached in
// .cache/elnino/ (gitignored) so a re-run with the same places fetches
// nothing. Open-Meteo's archive is rate-limited per minute, and this paces
// itself off the response headers. A full run costs about 4,000 of the
// archive's 10,000 free daily units.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = resolve(ROOT, '.cache/elnino');
const read = f => JSON.parse(readFileSync(resolve(ROOT, f), 'utf8'));

const ANALOGS = [1972, 1982, 1997, 2015, 2023];           // winter starting year
const NORMAL = Array.from({ length: 30 }, (_, i) => 1991 + i);
const CENTRES = ['12-11', '12-18', '12-25', '01-01', '01-08', '01-15'];
const HALF = 7;                                            // centre +/- 7 days
const GRID = 0.2;                                          // degrees; closer places share one series

// Thresholds, in the units requested below. One millimetre is the WMO wet
// day; a centimetre of snow is the first that sticks to a road.
const WET = 0.04, SNOW = 0.4, HEAVY = 0.5;                 // inches

// ---------------------------------------------------------------- places
const stops = read('data/stops.json').stops;
const winter = read('data/winter.json').points;
const route = read('data/route.json');

const named = [];
for (const s of stops) named.push({ key: s.id, ll: s.ll });
for (const p of winter) named.push({ key: 'w:' + p.id, ll: p.ll });
const ends = new Map();
for (const leg of route.legs)
  for (const rt of leg.routes) {
    const w = rt.waypoints;
    if (!w || !w.length) continue;
    for (const x of [w[0], w[w.length - 1]]) ends.set(x.name, x.ll);
  }
for (const [name, ll] of ends) named.push({ key: 'end:' + name, ll });

// Group onto a coarse grid. The reanalysis behind the archive is ten to
// twenty-five kilometres a cell, so three stops in one town are one series.
const groups = new Map();
for (const n of named) {
  const g = `${Math.round(n.ll[0] / GRID)},${Math.round(n.ll[1] / GRID)}`;
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(n);
}
const places = [...groups.values()].map(members => ({
  ll: [members.reduce((a, m) => a + m.ll[0], 0) / members.length,
       members.reduce((a, m) => a + m.ll[1], 0) / members.length].map(x => +x.toFixed(3)),
  keys: members.map(m => m.key),
}));
console.log(`${named.length} named points in ${places.length} places`);

// ---------------------------------------------------------------- fetch
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');
const shift = (y, md, days) => {
  const d = new Date(Date.UTC(y, Number(md.slice(0, 2)) - 1, Number(md.slice(3))) + days * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
// A December centre belongs to the winter's starting year, a January one to
// the year after.
const yearOf = (y, md) => (md.startsWith('01') ? y + 1 : y);
// One winter's window: a week before the first centre to a week after the last.
const span = y => [shift(yearOf(y, CENTRES[0]), CENTRES[0], -HALF),
                   shift(yearOf(y, CENTRES.at(-1)), CENTRES.at(-1), HALF)];

// The cache is only good for the same list of places.
const sig = places.map(p => p.ll.join(',')).join(';');

async function winterOf(y) {
  mkdirSync(CACHE, { recursive: true });
  const file = resolve(CACHE, `${y}.json`);
  if (existsSync(file)) {
    const c = JSON.parse(readFileSync(file, 'utf8'));
    if (c.sig === sig) return c.data;
  }
  const [a, b] = span(y);
  const url = 'https://archive-api.open-meteo.com/v1/archive'
    + `?latitude=${places.map(p => p.ll[0]).join(',')}`
    + `&longitude=${places.map(p => p.ll[1]).join(',')}`
    + `&start_date=${a}&end_date=${b}`
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum'
    + '&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto';
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url);
    if (r.status === 429 || r.status >= 500) {
      if (attempt > 8) throw new Error(`${y}: gave up after ${attempt} attempts`);
      const wait = Number(r.headers.get('retry-after')) || 30 * attempt;
      console.log(`  ${y}: ${r.status}, waiting ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }
    if (!r.ok) throw new Error(`${y}: http ${r.status} ${await r.text()}`);
    const body = await r.json();
    const data = (Array.isArray(body) ? body : [body]).map(x => x.daily);
    if (data.length !== places.length) throw new Error(`${y}: asked for ${places.length} places, got ${data.length}`);
    writeFileSync(file, JSON.stringify({ sig, data }));
    // If the next request would not fit in this minute's budget, wait for
    // the window to reset rather than collect a 429.
    const left = Number(r.headers.get('x-ratelimit-remaining'));
    const cost = Number(r.headers.get('x-ratelimit-cost'));
    const reset = Number(r.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(left) && Number.isFinite(cost) && left < cost * 1.1 && reset) {
      const ms = Math.max(1000, reset * 1000 - Date.now() + 1500);
      console.log(`  ${y}: pacing ${Math.round(ms / 1000)}s`);
      await sleep(ms);
    }
    return data;
  }
}

// ---------------------------------------------------------------- stats
const years = [...new Set([...NORMAL, ...ANALOGS])].sort((a, b) => a - b);
const byYear = new Map();
for (const y of years) {
  byYear.set(y, await winterOf(y));
  process.stdout.write(`${y} `);
}
console.log();

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const share = (a, f) => Math.round(100 * a.filter(f).length / a.length);

/// Every day inside one centre's window, over a set of winters, at one place.
function days(pi, ys, md) {
  const out = [];
  for (const y of ys) {
    const d = byYear.get(y)[pi];
    const cy = yearOf(y, md);
    const from = shift(cy, md, -HALF), to = shift(cy, md, HALF);
    d.time.forEach((t, i) => {
      if (t < from || t > to) return;
      const row = { hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i],
                    p: d.precipitation_sum[i], s: d.snowfall_sum[i] };
      if (row.hi != null && row.lo != null) out.push(row);
    });
  }
  return out;
}

// In order: mean high, mean low, the cold night (the low beaten on only one
// night in ten), then the share of days that were wet, snowy and heavy.
const FIELDS = ['hi', 'lo', 'cold', 'wet', 'snow', 'heavy'];
function stats(rows) {
  return [
    Math.round(mean(rows.map(r => r.hi))),
    Math.round(mean(rows.map(r => r.lo))),
    Math.round(pct(rows.map(r => r.lo), 0.1)),
    share(rows, r => (r.p || 0) >= WET),
    share(rows, r => (r.s || 0) >= SNOW),
    share(rows, r => (r.p || 0) >= HEAVY),
  ];
}

const out = places.map((p, pi) => ({
  ll: p.ll,
  n: CENTRES.map(md => stats(days(pi, NORMAL, md))),
  e: CENTRES.map(md => stats(days(pi, ANALOGS, md))),
}));
const index = {};
places.forEach((p, pi) => { for (const k of p.keys) index[k] = pi; });

// Written by hand so each place is one line. The default pretty-printer puts
// every number on a line of its own and turns this into thousands of lines.
const C = [
  'Generated by tools/elnino.mjs. Do not edit by hand; re-run the tool.',
  'What the very strong El Nino winters were like at each place on the trip,',
  'against the 1991-2020 normal, from the Open-Meteo historical archive.',
  'analogs: winters whose El Nino peaked at ONI +2.0 or more since 1950.',
  'centres: each statistic covers the 15 days around that calendar date.',
  'fields: hi, lo = mean daily high and low (F). cold = the low beaten one',
  'night in ten (F). wet, snow, heavy = percent of days with at least 0.04 in',
  'of precipitation, 0.4 in of snowfall, and 0.5 in of precipitation.',
  'places[i].n = normal, places[i].e = El Nino, one row per centre.',
  'index maps a stop id, w:<winter point id> or end:<route end> to a place.',
];
const L = ['{', '  "_comment": ['];
C.forEach((c, i) => L.push(`    ${JSON.stringify(c)}${i < C.length - 1 ? ',' : ''}`));
L.push('  ],');
L.push(`  "analogs": ${JSON.stringify(ANALOGS.map(y => `${y}-${String(y + 1).slice(2)}`))},`);
L.push('  "normal": "1991-92 to 2020-21",');
L.push(`  "centres": ${JSON.stringify(CENTRES)},`);
L.push(`  "fields": ${JSON.stringify(FIELDS)},`);
L.push('  "places": [');
out.forEach((p, i) => L.push(`    ${JSON.stringify(p)}${i < out.length - 1 ? ',' : ''}`));
L.push('  ],');
L.push(`  "index": ${JSON.stringify(index)}`);
L.push('}');
writeFileSync(resolve(ROOT, 'data/elnino.json'), L.join('\n') + '\n');
console.log(`wrote data/elnino.json: ${out.length} places, ${Object.keys(index).length} keys`);
