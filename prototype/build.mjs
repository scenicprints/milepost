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

// Official sites and December normals live in data/extras.json so the app and
// this prototype cannot drift apart. See that file for the caveats on both.
const X = D('extras.json');
const SITE = X.sites, WX = X.normals;



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
