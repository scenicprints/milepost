#!/usr/bin/env node
// Builds prototype/index.html from template.html plus live data pulled out of
// ../data. Run it after ANY change to route.json or stops.json, or the
// prototype will drift from the real trip.
//
//   node prototype/build.mjs
//
// Then publish prototype/index.html as the artifact (see PLAN.md for the URL —
// republish to the SAME url or you create a second, orphaned artifact).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildRoute } from '../js/route.js';
import { suggestStops } from '../js/plan.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const D = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

const R = D('route.json'), S = D('stops.json'), U = D('usa.json');

// Official sites. Best effort — NOT all verified. The Search link in the sheet
// is always the reliable path. Worth a verification pass before the trip.
const SITE = {
  'grand-canyon': 'https://www.nps.gov/grca', 'petrified-forest': 'https://www.nps.gov/pefo',
  'white-sands': 'https://www.nps.gov/whsa', 'carlsbad': 'https://www.nps.gov/cave',
  'saguaro': 'https://www.nps.gov/sagu', 'joshua-tree': 'https://www.nps.gov/jotr',
  'smokies': 'https://www.nps.gov/grsm', 'hot-springs': 'https://www.nps.gov/hosp',
  'sunset-crater': 'https://www.nps.gov/sucr', 'el-morro': 'https://www.nps.gov/elmo',
  'central-high': 'https://www.nps.gov/chsc', 'mlk-park': 'https://www.nps.gov/malu',
  'vicksburg': 'https://www.nps.gov/vick', 'hoover-dam': 'https://www.usbr.gov/lc/hooverdam',
  'biltmore': 'https://www.biltmore.com', 'graceland': 'https://www.graceland.com',
  'meteor-crater': 'https://meteorcrater.com', 'civil-rights-museum': 'https://www.civilrightsmuseum.org',
  'ryman': 'https://www.ryman.com', 'dollywood': 'https://www.dollywood.com',
  'space-center': 'https://spacecenter.org', 'alamo': 'https://www.thealamo.org',
  'bearizona': 'https://bearizona.com', 'lowell': 'https://lowell.edu',
  'palm-springs-tram': 'https://pstramway.com', 'sandia-tram': 'https://sandiapeak.com',
  'pima-air': 'https://pimaair.org', 'desert-botanical': 'https://dbg.org',
  'georgia-aquarium': 'https://www.georgiaaquarium.org', 'legacy-museum': 'https://legacysites.eji.org',
  'uss-alabama': 'https://www.ussalabama.com', 'natural-bridge-caverns': 'https://naturalbridgecaverns.com',
  'oak-alley': 'https://www.oakalleyplantation.org', 'seven-magic-mountains': 'https://sevenmagicmountains.com',
  'okc-memorial': 'https://memorialmuseum.com', 'sixth-floor': 'https://www.jfk.org',
  'birmingham-civil-rights': 'https://www.bcri.org', 'griffith': 'https://griffithobservatory.org',
  'palo-duro': 'https://tpwd.texas.gov/state-parks/palo-duro-canyon',
  'balmorhea': 'https://tpwd.texas.gov/state-parks/balmorhea',
  'mount-mitchell': 'https://www.ncparks.gov/state-parks/mount-mitchell-state-park',
  'calico': 'https://cms.sbcounty.gov/parks/parks/calico-ghost-town',
};

// Typical late-December high/low, degrees F. APPROXIMATE — hand-assigned from
// regional knowledge, not pulled from NOAA. Good enough to pack by. The real
// app should replace these with Open-Meteo's historical normals endpoint, and
// with a live forecast once inside 16 days.
const WX = {
  Keene: [52, 32], Barstow: [61, 36], Kingman: [55, 32], Oatman: [58, 36], Seligman: [49, 22],
  Williams: [45, 19], 'Grand Canyon Village': [43, 18], Flagstaff: [44, 19], Winslow: [50, 22],
  Holbrook: [51, 22], Ramah: [47, 18], Albuquerque: [49, 27], Tucumcari: [52, 25], Amarillo: [51, 25],
  Canyon: [52, 25], Arcadia: [51, 30], 'Oklahoma City': [51, 30], 'Hot Springs': [52, 32],
  'Little Rock': [52, 33], Memphis: [51, 34], Nashville: [49, 32], Gatlinburg: [50, 29],
  'Pigeon Forge': [50, 29], Asheville: [49, 29], Burnsville: [46, 26], Charlotte: [54, 34],
  Atlanta: [55, 38], Montgomery: [60, 38], Mobile: [62, 42], 'Gulf Shores': [62, 45],
  'New Orleans': [64, 47], Vacherie: [64, 44], Houston: [65, 46], 'San Antonio': [64, 42],
  Toyahvale: [60, 32], Marfa: [58, 30], Carlsbad: [58, 29], Alamogordo: [56, 29], 'El Paso': [58, 34],
  Tombstone: [60, 33], Tucson: [65, 40], Phoenix: [67, 45], Cottonwood: [63, 38],
  'Palm Springs': [70, 45], 'Los Angeles': [68, 48], Niland: [70, 44], 'Boulder City': [57, 38],
  'Las Vegas': [57, 38], Jean: [57, 36], Kelso: [58, 33], Dallas: [58, 39], 'Fort Worth': [58, 38],
  Birmingham: [55, 36], Vicksburg: [57, 38], Jackson: [57, 37],
};

const out = { legs: [], suggested: [], usa: U.outline, labels: U.labels };
for (const leg of R.legs) {
  const L = { id: leg.id, name: leg.name, routes: [] };
  for (const r of leg.routes) {
    const b = buildRoute(r, S.stops);
    if (r.default) out.suggested.push(...suggestStops(b));
    L.routes.push({
      id: r.id, name: r.name, road: r.road, miles: Math.round(b.miles),
      default: !!r.default, character: r.character,
      path: r.waypoints.map(w => [+w.ll[0].toFixed(3), +w.ll[1].toFixed(3)]),
      towns: b.towns.map(t => ({
        n: t.name, s: t.state, m: Math.round(t.mile),
        ll: [+t.ll[0].toFixed(3), +t.ll[1].toFixed(3)],
        ...(t.risk ? { risk: t.risk } : {}), ...(t.elev ? { elev: t.elev } : {}),
      })),
      stops: b.stops.map(s => ({
        id: s.id, n: s.name, t: s.town, s: s.state, m: Math.round(s.mile),
        ll: [+s.ll[0].toFixed(3), +s.ll[1].toFixed(3)],
        d: s.detour, w: s.dwell || 60, why: s.why,
        ...(s.winter ? { winter: s.winter } : {}),
        ...(s.first ? { first: 1 } : {}), ...(s.big ? { big: 1 } : {}),
        ...(s.cost ? { cost: s.cost } : {}),
        ...(SITE[s.id] ? { site: SITE[s.id] } : {}),
        ...(WX[s.town] ? { wx: WX[s.town] } : {}),
      })),
    });
  }
  out.legs.push(L);
}

const tpl = fs.readFileSync(path.join(HERE, 'template.html'), 'utf8');
if (!tpl.includes('__DATA__')) throw new Error('template.html has lost its __DATA__ placeholder');
fs.writeFileSync(path.join(HERE, 'index.html'), tpl.replace('__DATA__', JSON.stringify(out)));

const all = out.legs.flatMap(l => l.routes.flatMap(r => r.stops));
const uniq = new Set(all.map(s => s.id));
console.log('prototype/index.html written,',
  fs.statSync(path.join(HERE, 'index.html')).size, 'bytes');
console.log(uniq.size, 'unique stops |',
  new Set(all.filter(s => s.site).map(s => s.id)).size, 'with an official site |',
  new Set(all.filter(s => s.wx).map(s => s.id)).size, 'with December normals');
for (const l of out.legs) for (const r of l.routes)
  console.log('  ' + r.id.padEnd(14) + String(r.miles).padStart(5) + ' mi  '
    + String(r.stops.length).padStart(2) + ' stops');
const noWx = [...new Set(all.filter(s => !s.wx).map(s => s.town))];
if (noWx.length) console.warn('WARN no December normals for:', noWx.join(', '));
