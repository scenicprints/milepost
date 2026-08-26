// Regenerates STOPS-HANDOFF.md from the live data files.
//
//   node tools/stops-handoff.mjs [out.md]
//
// The whole point is that the mileposts in the doc are the ones the app shows,
// so it imports the real `buildRoute` rather than re-deriving geometry. Re-run
// it whenever stops.json, route.json or extras.json changes; a handoff with
// stale numbers is worse than none.

import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { buildRoute } = await import(pathToFileURL(resolve(ROOT, 'js/route.js')).href);
const read = f => JSON.parse(readFileSync(resolve(ROOT, f), 'utf8'));

const S = read('data/stops.json').stops;
const R = read('data/route.json');
const E = read('data/extras.json');

// Every route, its stops placed by the app's own projection.
const list = [];
for (const l of R.legs)
  for (const rt of l.routes) {
    const b = buildRoute(rt, S);
    list.push({
      rt: { id: rt.id, name: rt.name, miles: Math.round(b.miles) },
      stops: b.stops.map(s => ({ ...s, mile: Math.round(s.mile) })),
    });
  }

const esc = s => String(s === null || s === undefined ? '' : s).replace(/\|/g, '\|');
const L = [];
const p = s => L.push(s === undefined ? '' : s);

p('# Milepost — the stop list as it stands, and what a replacement has to fit');
p();
p('This is a handoff. Two halves: **what is in the app today**, which Kevin never');
p('approved and treats as a placeholder, and **the contract a replacement list has');
p('to satisfy** so it drops straight in without touching code.');
p();
p('---');
p();
p('## The trip');
p();
p('Modesto CA -> North Carolina (Christmas) -> Houston TX (New Year) -> home.');
p('About 5,890 miles over 21 driving days, in late December.');
p('Two people: Kevin, and Ada, who has never been outside California.');
p();
p('| | |');
p('|---|---|');
p('| Car | 2023 Honda Accord Hybrid EX-L, **FWD**, all-season touring tires (not 3PMSF), low clearance |');
p('| Season | Late December. Chain control in California, I-40 closures at Flagstaff, ice from Amarillo east |');
p('| Phones | Kevin Android, Ada iPhone — it is a web app for that reason |');
p('| Offline | Non-negotiable. Long dead stretches in the Mojave, AZ/NM and West Texas |');
p('| Repo | **Public.** Dates, overnight towns, personal notes and the sync code must never appear in the data |');
p();
p('**Three legs, two route options each.** A stop names the route ids it sits on,');
p('so swapping a route swaps its stops.');
p();
p('| Leg | Route id | Name | Miles | Waypoints |');
p('|---|---|---|---:|---:|');
for (const l of R.legs)
  for (const rt of l.routes)
    p('| ' + l.id + ' — ' + esc(l.name) + ' | `' + rt.id + '` | ' + esc(rt.name) + ' | ' +
      (list.find(o => o.rt.id === rt.id) || { rt: {} }).rt.miles.toLocaleString() + ' | ' + rt.waypoints.length + ' |');
p();
p('---');
p();
p('## Half one — the 68 stops in the app today');
p();
p('Ordered by where they fall along each route. `Detour` is minutes **one way**');
p('off the interstate; the app doubles it and adds `dwell`, and `Costs you` is');
p('that total. A stop can appear under more than one route.');
p();

for (const o of list) {
  p('### `' + o.rt.id + '` — ' + o.rt.name + ' · ' + o.rt.miles.toLocaleString() + ' mi · ' + o.stops.length + ' stops');
  p();
  p('| Mi | Stop | Town | Detour | Dwell | Costs you | Money | Flags | Tags |');
  p('|---:|---|---|---:|---:|---:|---|---|---|');
  for (const s of o.stops) {
    const total = (s.detour || 0) * 2 + (s.dwell || 60);
    const hh = Math.floor(total / 60), mm = total % 60;
    const cost = hh ? (hh + 'h' + (mm ? ' ' + mm + 'm' : '')) : (mm + 'm');
    const flags = [s.first ? 'first' : '', s.big ? 'big' : '', s.winter ? 'winter' : ''].filter(Boolean).join(', ');
    p('| ' + s.mile.toLocaleString() + ' | ' + esc(s.name) + ' | ' + esc(s.town) + ', ' + esc(s.state) +
      ' | ' + s.detour + ' | ' + s.dwell + ' | ' + cost + ' | ' + esc(s.cost) +
      ' | ' + (flags || '—') + ' | ' + (s.tags || []).join(' ') + ' |');
  }
  p();
}

p('### What the flags mean');
p();
p('- **first** — there is no California version of this. Ada has never left the');
p('  state, and the app counts these separately on the Trip tab. Use it sparingly');
p('  or it stops meaning anything.');
p('- **big** — a headline stop. Affects exactly two things: it wins the space when');
p('  map labels collide, and it is picked first when the app seeds a fresh plan.');
p('- **winter** — a caveat that only applies in the cold half of the year.');
p();
p('### Every stop, with its reasoning');
p();
p('The `why` text is what shows in the place sheet. It is the part worth rewriting');
p('hardest — it is the only argument for spending the time.');
p();
for (const s of S) {
  p('**' + s.name + '** — ' + s.town + ', ' + s.state + ' · `' + s.id + '` · on ' +
    s.routes.map(r => '`' + r + '`').join(', '));
  p();
  p('> ' + s.why);
  p();
  if (s.winter) { p('> *Winter:* ' + s.winter); p(); }
}

p('---');
p();
p('## Half two — the contract a replacement list must satisfy');
p();
p('### `data/stops.json`');
p();
p('```json');
p('{ "stops": [ {');
p('  "id":     "wigwam-motel",        // kebab-case, unique, permanent — notes,');
p('                                   //   seen-marks and bookings are keyed to it');
p('  "name":   "Wigwam Motel",');
p('  "town":   "Holbrook",            // must match a key in extras.json normals');
p('  "state":  "AZ",');
p('  "ll":     [34.9, -110.156],      // real lat/lon. Everything positional is');
p('                                   //   derived from this — never hand-set a mile');
p('  "detour": 5,                     // minutes ONE WAY off the interstate');
p('  "dwell":  15,                    // minutes on the ground');
p('  "cost":   "Free to look",        // free text, shown as-is');
p('  "tags":   ["route66", "motel"],');
p('  "why":    "Fifteen concrete teepees you can actually sleep in...",');
p('  "winter": null,                  // string or null');
p('  "routes": ["leg1-i40"],          // which route ids it sits on');
p('  "first":  true,                  // optional');
p('  "big":    true                   // optional');
p('} ] }');
p('```');
p();
p('**Rules that will bite:**');
p();
p('1. **`mile` is computed, never authored.** The app projects `ll` onto the route');
p('   polyline. Give it good coordinates and position takes care of itself.');
p('2. **Anything more than 140 miles off the route is silently dropped**');
p('   (`MAX_OFF` in `js/route.js`). A stop that never appears is usually this.');
p('3. **`routes` must name real route ids** from the table above. Listing a stop on');
p('   both options for a leg is fine and normal.');
p('4. **`detour` is one way.** A 20-minute detour costs 40 minutes of driving plus');
p('   the dwell. Getting this wrong is the easiest way to make the planner lie.');
p('5. **`dwell` defaults to 60** if omitted. Be explicit.');
p('6. **A stop costing more than a full driving day still places** — that was a');
p('   fixed bug — but it eats the day. Check the Days tab after adding one.');
p('7. **No dates, no overnight towns, no personal notes, no confirmation numbers.**');
p('   The repo is public and should not advertise an empty house.');
p();
p('### Lodging is not a separate thing');
p();
p('A hotel is an ordinary stop with `"kind": "lodging"`. The difference is that it');
p('**anchors the end of a day** instead of costing detour time: `buildDays` skips');
p('lodging entirely, and each night is matched to the nearest lodging place within');
p('45 miles. Kevin adds these in the app himself; they do not belong in a seeded');
p('list.');
p();
p('### `data/route.json` — waypoints, and the winter warnings');
p();
p('Waypoints are the road. They are dense enough that the polyline approximates the');
p('interstate, and **all mileage and every day split is measured off them**.');
p();
p('```json');
p('{ "name": "Flagstaff", "state": "AZ", "ll": [35.198, -111.651],');
p('  "elev": 6909, "risk": "snow",');
p('  "note": "The most likely place on this trip to find the interstate closed." }');
p('```');
p();
p('`risk` is one of `chains` · `snow` · `ice`. A waypoint carrying one shows up in');
p('**Watch out** on the Next screen within 260 miles, and as a winter warning on any');
p('day that crosses it. The ones that exist today:');
p();
p('| Point | Elev | Risk |');
p('|---|---:|---|');
const seenPt = new Set();
for (const l of R.legs) for (const rt of l.routes) for (const w of rt.waypoints) {
  if (!w.risk || seenPt.has(w.name)) continue;
  seenPt.add(w.name);
  p('| ' + esc(w.name) + ', ' + w.state + ' | ' + (w.elev ? w.elev.toLocaleString() + ' ft' : '—') + ' | ' + w.risk + ' |');
}
p();
p('`WIGGLE = 1.09` in `js/route.js` turns straight-line polyline miles into road');
p('miles. Calibrated against Modesto–Raleigh (~2,750 real vs 2,771 computed) and');
p('Houston–Modesto (~1,900 vs 1,898). **Leg 2 runs about 4% light** because it has');
p('fewer waypoints — add waypoints there rather than touching WIGGLE.');
p();
p('### `data/extras.json` — three side tables, all keyed off the stop list');
p();
p('| Key | Keyed by | Holds | Today |');
p('|---|---|---|---|');
p('| `sites` | stop id | official URL | ' + Object.keys(E.sites).length +
  ' entries, **best-effort and unverified** — the nps.gov ones follow a documented pattern, the commercial ones are not confirmed |');
p('| `normals` | **town name** | `{ hi, lo }` December estimate | ' + Object.keys(E.normals).length +
  ' towns. A fallback only: the app fetches real 5-year archive normals from Open-Meteo and replaces these when it has signal |');
p('| `bookings` | stop id | `{ lead: days }` | ' + Object.keys(E.bookings || {}).length +
  ' entries. Deadline = departure minus lead. With no departure date the app says so rather than inventing one |');
p();
p('**A new town name means a new `normals` entry**, or that stop shows no');
p('temperatures at all until it is online.');
p();
p('Current bookings and their lead times:');
p();
p('| Stop | Book this many days ahead |');
p('|---|---:|');
for (const k of Object.keys(E.bookings || {})) {
  const st = S.find(x => x.id === k);
  p('| ' + esc(st ? st.name : k) + ' | ' + E.bookings[k].lead + ' |');
}
p();
p('---');
p();
p('## What actually makes a good list here');
p();
p('Not opinion — this is what the app rewards, because of how it computes.');
p();
p('1. **Time is the currency, not distance.** The day planner budgets');
p('   `detour × 2 + dwell` against a driving day. A 3-hour stop is a third of a day.');
p('   Twelve honest 30-minute stops beat four aspirational 3-hour ones.');
p('2. **Stops on the road beat stops near the road.** Petrified Forest works');
p('   because its park road runs parallel to I-40 and rejoins it, so the detour is');
p('   nearly free. That property is worth hunting for.');
p('3. **Ada has never left California.** A `first` is worth more than a better');
p('   version of something she can see at home.');
p('4. **Late December closes things.** Anything seasonal needs a `winter` note or it');
p('   should not be on the list. Verified so far: Grand Canyon South Rim open all');
p('   winter (North closed Dec–May), Carlsbad and White Sands open and good, Blue');
p('   Ridge Parkway closes for ice, San Antonio River Walk lit into January.');
p('5. **Both route options need covering.** A leg with 36 stops on one option and 7');
p('   on the other makes the alternative feel like a punishment.');
p('6. **The `why` is the feature.** One or two sentences that make the case, in plain');
p('   sentence case. It is the only thing on the place sheet arguing for the time.');
p();
p('## Still unanswered, and it blocks real planning');
p();
p('- **Which city in North Carolina.** Only the last ~300 miles change, but the');
p('  final overnight and the last day split depend on it.');
p('- **Departure date.** Drives the countdown, every booking deadline, and whether');
p('  weather shows a forecast or a normal.');
p('- **Hotels or camping.** Changes what an overnight town has to have.');
p('- **How many spare days.** This is the actual winter plan — a closed I-40 at');
p('  Flagstaff is absorbed by slack or by nothing.');
p();
p('---');
p();
p('*Generated from `data/stops.json`, `data/route.json` and `data/extras.json` at');
p('Milepost 1.3.1. Repo: `scenicprints/milepost` (public).*');


const out = process.argv[2] || resolve(ROOT, 'STOPS-HANDOFF.md');
writeFileSync(out, L.join('\n') + '\n', 'utf8');
console.log('wrote ' + out + '  (' + L.length + ' lines, ' + S.length + ' stops)');
