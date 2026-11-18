// The three screens, plus the two sheets. Everything reads from the store and
// the built routes; nothing here holds trip state of its own.
//
// Route · Map · Days, and all three are scoped to ONE leg. The trip is three
// trips, and the leg selector at the top drives all of it.

import { store } from './store.js';
import { buildRoute, stopCost, fmtHours, fmtMiles, project, driveMinutes, pointAtMile } from './route.js';
import { suggestStops } from './plan.js';
import { build } from './itinerary.js';
import * as mapview from './map.js';
import * as syncmod from './sync.js';
import { VERSION } from './version.js';
import * as wx from './weather.js';
import * as geo from './geocode.js';
import * as darksky from './darksky.js';

let DATA = null;              // { route, stops, usa }
const built = new Map();      // routeId -> built route
let position = null;          // [lat, lon] once geolocation is allowed

export function init(data) {
  DATA = data;
  SKY = darksky.load(data.darksky);
  wx.init({ elnino: data.elnino });
}
let SKY = null;
/// The overlay only exists once there is data behind it — no dead control.
export const hasSky = () => !!SKY;
export const skySource = () => SKY && SKY.source;
export function setPosition(ll) { position = ll; }
export function hasPosition() { return !!position; }

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/// Seed stops plus your own. A custom place lists every route on its leg and
/// lets the geometry decide — buildRoute drops anything too far off pavement.
function stopData() {
  return DATA.stops.concat(store.custom);
}

let builtFor = '';
export function routeById(id) {
  // The stamp has to cover everything buildRoute reads, or an edit lands in
  // the store and the cache serves the old answer. Dwell overrides are read
  // in there now, so they belong in here too.
  const stamp = store.custom.map(c => c.id + c.ll.join()).join('|')
    + '#' + Object.entries(store.dwells).map(([k, v]) => k + ':' + v).sort().join(',');
  if (stamp !== builtFor) { built.clear(); builtFor = stamp; }
  if (built.has(id)) return built.get(id);
  for (const leg of DATA.route.legs)
    for (const r of leg.routes)
      if (r.id === id) { const b = buildRoute(r, stopData(), store.dwells); built.set(id, b); return b; }
  return null;
}

export const legRouteIds = i => DATA.route.legs[i].routes.map(r => r.id);
export const legNames = () => DATA.route.legs.map(l => l.name);

export const legs = () => DATA.route.legs;
/// The stored choice can name a route that no longer exists — route options
/// get replaced as the plan matures, and the store (and its Firestore copy)
/// remembers the old id. Fall back to the leg's default rather than crashing.
function legChoice(l) {
  const r = routeById(store.routeFor(l.id));
  if (r) return r;
  const def = l.routes.find(o => o.default) || l.routes[0];
  store.setRoute(l.id, def.id);
  return routeById(def.id);
}
/// A leg carrying more than one `*-plan` route is a leg with a CHOICE of
/// trips, not just a choice of roads — leg 2 can be the Gulf Coast at
/// Christmas or the run up to New Jersey, and those are different departures
/// on different mornings. Where that is true the departure is keyed by route.
export const plansOf = leg => leg.routes.filter(r => /-plan$/.test(r.id));
export const depKey = route => {
  const leg = DATA.route.legs.find(l => l.id === legIdOf(route));
  return leg && plansOf(leg).length > 1 ? route.id : legIdOf(route);
};
export const depOf = route => store.depFor(legIdOf(route), depKey(route));
export const selected = () => DATA.route.legs.map(legChoice);
export const legRoute = i => legChoice(DATA.route.legs[i]);

// ============================================================ the real days
//
// Days, Next and the leg header used to come from `buildDays`, which throws the
// beds away and splits the road by a pace setting. That is a guess, and it
// showed: the Days tab named overnights in towns nobody sleeps in, and the
// header's day count moved when you changed hours-per-day.
//
// They now run `itinerary.build`, the same walk the desktop planner uses, which
// knows about placed nights, dwell overrides, through time and doubling back.
// This adapter reshapes its output into the day objects the three screens
// already render, so the change is one function rather than three rewrites.
//
// Per-day mileage and minutes are summed from the ROWS rather than asked of
// build(), because the rows already carry `driveMin` and `dwell` and a second
// source for the same number is a second thing to keep in step.
/// Which leg a road belongs to. Roads are unique to a leg, so this is a lookup
/// rather than a guess.
export function legIdOf(route) {
  for (const leg of DATA.route.legs)
    if (leg.routes.some(r => r.id === route.id)) return leg.id;
  return 'leg1';
}

// ============================================ nights belong to a leg, not a bed
//
// `sleeps` is keyed by stop id, and three beds -- Amarillo, Meteor Crater and
// Barstow -- are driven on BOTH leg 1 and leg 3. Leg 1's night at Amarillo is
// 8h24 because you get there at nine at night. Leg 3 reaches the same bed at
// 11:19 in the morning, and that same 8h24 had you setting off again at 19:43,
// which then wrecked every day after it.
//
// A night set for one leg therefore stays on that leg. Newly set nights are
// written under a `leg:stop` key; a bare key predates this and belongs to the
// FIRST leg the bed appears on, which is where it was set.
// stopId -> the first leg it appears on. Built once and rebuilt only when the
// stop list itself changes, because this is read on every draw.
let ownerCache = { key: null, map: null };
function legOwners() {
  const key = allStops().length + '#' + store.custom.length;
  if (ownerCache.key === key) return ownerCache.map;
  const map = new Map();
  for (const leg of DATA.route.legs)
    for (const r of leg.routes)
      for (const st of routeById(r.id).stops || [])
        if (!map.has(st.id)) map.set(st.id, leg.id);
  ownerCache = { key, map };
  return map;
}

/// The nights that apply to one leg, flattened to the plain
/// `{ stopId: minutes }` the builder wants.
export const sleepsFor = legId =>
  store.sleepsScoped(legId, id => legOwners().get(id));

const startOf = (route) => {
  const d = depOf(route);
  return {
    date: d.date ? new Date(d.date + 'T00:00:00Z')
                 : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'),
    at: d.at,
    set: !!d.date,
  };
};

let dayCache = { key: null, val: null };

export function realDays(route) {
  const legId = legIdOf(route);
  const sleeps = sleepsFor(legId);
  const dep = depOf(route);
  const key = [route.id, [...store.chosen].sort().join(','), JSON.stringify(sleeps),
               JSON.stringify(store.dwells), JSON.stringify(store.afters),
               dep.date, dep.at].join('|');
  if (dayCache.key === key) return dayCache.val;

  const it = build(route, store.chosen, startOf(route), {
    HOURS: DATA.hours, WINTER: DATA.winter,
    sleeps, afters: store.afters,
  });

  const out = [];
  let startMile = 0;
  // The run from the last stop into the destination is not a row -- there is
  // no stop there, only the end of the road -- so summing rows gave the last
  // day of every leg "0 min driving" for what is often two hundred miles.
  // build() counts it in the leg total, so the difference is exactly that run.
  const rowDrive = it.rows.reduce((a, r) => a + (r.driveMin || 0), 0);
  const runIn = Math.max(0, it.driveMin - rowDrive);
  it.days.forEach((d, i) => {
    const rows = it.rows.filter(r => r.dayIx === i);
    const endMile = rows.length ? rows[rows.length - 1].mile : (i ? out[i - 1].endMile : 0);
    const bedRow = rows.find(r => r.kind === 'bed') || rows.find(r => r.sleep);
    const last = i === it.days.length - 1;
    const term = route.waypoints[route.waypoints.length - 1];
    out.push({
      date: d.date,                       // the real calendar day, not a counter
      // The hour you actually pull out: the leg's departure on day one, the
      // hour you leave the bed on every day after it. build() already worked
      // this out, in the local time of wherever you woke up.
      startAt: d.startAt,
      // When you REACH the day's destination: the bed's arrival, or on the
      // leg's last day the terminus arrival build() already computed. Kevin:
      // the app told him when to leave Buc-ee's and never when he'd be in
      // Houston. This is that number.
      arriveAt: bedRow ? bedRow.arriveAt : (last ? it.endsAtLabel : null),
      from: { name: d.from },
      overnight: bedRow
        ? { name: bedRow.stop.name, mile: bedRow.mile }
        : { name: last ? term.name : (rows.length ? rows[rows.length - 1].stop.name : d.from),
            mile: last ? route.miles : endMile },
      startMile, endMile: last ? route.miles : endMile,
      miles: (last ? route.miles : endMile) - startMile,
      driveMins: rows.reduce((a, r) => a + (r.driveMin || 0), 0) + (last ? runIn : 0),
      stopMins: rows.reduce((a, r) => a + (r.dwell || 0), 0),
      stops: rows.filter(r => r.kind !== 'bed').map(r => r.stop),
      firsts: rows.filter(r => r.stop && r.stop.first).length,
      risks: [],                         // filled below, from the real crossings
      sameTown: false,
      rows,
    });
    startMile = last ? route.miles : endMile;
  });
  // WINTER WATCH: the passes this day actually drives over.
  //
  // It used to be `d.risk` — the winter point nearest to where you WOKE UP —
  // which named Tehachapi on the morning AFTER you crossed it at 21:11, never
  // named Flagstaff on the day you drive through it, and left the day that
  // matters most showing nothing at all. build() already walks every crossing
  // on this road with its mile, its clock time and whether it is dark or ahead
  // of the plows; the day is simply the one whose miles contain it.
  for (const c of it.crossings || []) {
    const day = out.find(d => c.mile <= d.endMile + 0.5) || out[out.length - 1];
    if (day) day.risks.push(c);
  }

  out.warnings = it.warnings;
  out.it = it;
  dayCache = { key, val: out };
  return out;
}

/// Totals for the header, straight off the same walk.
export function realTotals(route) {
  const d = realDays(route);
  return {
    days: d.length,
    miles: route.miles,
    driveMins: d.it.driveMin,
    stopMins: d.it.stopMin,
    stops: d.it.stopCount,
    firsts: d.reduce((a, x) => a + x.firsts, 0),
  };
}
export const allStops = () => selected().flatMap(r => r.stops);
export { suggestStops };

// ============================================================== head
export function renderHead(legIx, tab) {
  // Trip and Dates both describe the WHOLE trip, so they take the whole-trip
  // totals and drop the leg and road pickers. Anything else is one leg.
  const whole = tab === "trip" || tab === "cal" || tab === "wx";
  const rt = legRoute(legIx);
  const t = realTotals(rt);
  let wm = 0, wd = 0, ws = 0;
  for (const r of selected()) {
    const x = realTotals(r);
    wm += x.miles; wd += x.days; ws += x.stops;
  }

  return `<div class="top">
      <div class="wordmark">Milepost</div>
      <div class="whole">${Math.round(wm).toLocaleString()} mi · ${wd} days total</div>
    </div>
    <div class="legname">${whole ? "The whole trip"
      : tab === "next" ? esc(DATA.route.legs[whereNow().legIx].name)
      : esc(DATA.route.legs[legIx].name)}</div>
    <div class="totals">
      ${tab === "next" ? (() => {
        const h = whereNow();
        const pct = Math.min(100, Math.max(0, h.mile / h.route.miles * 100));
        return `<div><span class="tnum">${Math.round(h.mile).toLocaleString()}</span><span class="tlab">mi in</span></div>
          <div><span class="tnum">${Math.round(h.route.miles - h.mile).toLocaleString()}</span><span class="tlab">to go</span></div>
          <div><span class="tnum on">${Math.round(pct)}</span><span class="tlab">%</span></div>`;
      })() : `
      <div><span class="tnum">${Math.round(whole ? wm : t.miles).toLocaleString()}</span><span class="tlab">mi</span></div>
      <div><span class="tnum">${whole ? wd : t.days}</span><span class="tlab">${(whole ? wd : t.days) === 1 ? "day" : "days"}</span></div>
      <div><span class="tnum on">${whole ? ws : t.stops}</span><span class="tlab">stops</span></div>`}
    </div>
    ${whole || tab === "next" ? "" : `<div class="legs">${DATA.route.legs.map((l, i) =>
      `<button data-leg="${i}" aria-selected="${i === legIx}">${esc(l.short || SHORT[i])}</button>`).join("")}</div>
    <div class="ways">${DATA.route.legs[legIx].routes.map(o =>
      `<button data-route="${o.id}" data-rleg="${DATA.route.legs[legIx].id}"
        aria-pressed="${o.id === rt.id}">${esc(o.name)}</button>`).join("")}</div>`}`;
}

const SHORT = ["Carolina", "Houston", "Home"];

// ============================================================== route
/// Sights or eateries. Kevin asked for the two kept apart; 'all' shows the
/// line as it runs, with food rows tagged.
let kindFilter = 'all';
export const setKindFilter = k => { kindFilter = k; };

/// The time scale: total cost (detour both ways + dwell) bucketed for colour.
const timeBucket = mins =>
  mins < 45 ? 't0' : mins < 90 ? 't1' : mins < 180 ? 't2' : 't3';

export function renderRoute(legIx) {
  const rt = legRoute(legIx);
  let h = '<div class="routes">';
  // Choosing the route happens on the Map, where you can see the two lines
  // split. This tab is the stops.
  h += `<button class="rt addrow" data-add><span class="dot plus">+</span>
      <span class="rn">Add a place of your own</span></button>`;
  h += `</div><div class="kinds">
    <button data-kindfilter="all" aria-pressed="${kindFilter === 'all'}">All</button>
    <button data-kindfilter="sight" aria-pressed="${kindFilter === 'sight'}">Sights</button>
    <button data-kindfilter="food" aria-pressed="${kindFilter === 'food'}">Eateries</button>
    <span class="scale"><i style="background:var(--t0)"></i>quick
      <i style="background:var(--t1)"></i>1h
      <i style="background:var(--t2)"></i>2h
      <i style="background:var(--t3)"></i>3h+</span>
  </div><div class="line">`;

  // The nights you actually placed, not a pace guess.
  const nights = realDays(rt).slice(0, -1)
    .map(d => ({ m: d.overnight.mile, n: d.overnight.name }));
  let ni = 0;
  const night = () => {
    const bed = lodgingFor(rt, nights[ni].m);
    return `<div class="night"><span class="bar"></span>
      <span class="txt">Night — ${esc(nights[ni].n)}</span><span class="rule"></span>
      ${bed ? `<button class="bed" data-stop="${bed.id}">${esc(bed.name)}</button>` : ""}</div>`;
  };

  for (const s of rt.stops) {
    if (s.kind === 'lodging') continue;          // shown on the night it belongs to
    const isFood = s.kind === 'food';
    if (kindFilter === 'food' && !isFood) continue;
    if (kindFilter === 'sight' && isFood) continue;
    while (ni < nights.length && nights[ni].m < s.mile) { h += night(); ni++; }
    const on = store.isChosen(s.id), seen = store.isSeen(s.id);
    const c = stopCost(s);
    h += `<div class="st ${on ? "on " : ""}${s.big ? "big " : ""}${seen ? "seen " : ""}${timeBucket(c.total)}">
      <button class="mark" data-toggle="${s.id}" aria-label="Toggle ${esc(s.name)}"></button>
      <button class="body" data-stop="${s.id}">
        <div class="nm">${esc(s.name)}${isFood ? '<span class="eat">eat</span>' : ""}</div>
        <div class="sub">${esc(s.town)}, ${esc(s.state)} · ${s.detour} min off</div>
      </button>
      <div class="cost">${fmtHours(c.total)}</div></div>`;
  }
  while (ni < nights.length) { h += night(); ni++; }

  // THE TERMINUS. The diagram drew stops and nothing else, so every road just
  // ended on its last ticked stop. On the other leg 1 roads that happens to be
  // the Charlotte cluster at the destination's own mile, which hid it; on a
  // road that stops short it read as though the trip ended at a truck stop in
  // Knoxville with 201 miles unaccounted for.
  //
  // Not a stop and not togglable: it is where the leg goes. The distance is
  // from the last stop shown, because "how much further" is the question the
  // last line of a route should answer.
  const last = rt.waypoints[rt.waypoints.length - 1];
  // Measured from the last thing ON the diagram, and a bed is on it — it shows
  // as the night row rather than as a station, but you can see it. Excluding
  // lodging here measured Mooresville from Nashville and called it 381 miles
  // when the last place you actually stand is Knoxville, 201 short.
  const from = rt.stops.length ? rt.stops[rt.stops.length - 1].mile : 0;
  h += `<div class="dest">
    <span class="mark"></span>
    <div class="body">
      <div class="nm">${esc(last.name)}</div>
      <div class="sub">${fmtMiles(Math.max(0, rt.miles - from))} on</div>
    </div></div>`;

  return h + "</div>";
}

// ============================================================== map
// Pan/zoom lives in a CSS transform on .mapstage — see js/map.js for why.
// Two maps share the stage code: the Map tab and the Weather tab. Each keeps
// its own view, so zooming into a day's weather never moves the route map.
const tfs = { map: null, wx: null };
let mode = 'map';
export const setMapMode = m => { mode = m === 'wx' ? 'wx' : 'map'; };
export const getTf = () => tfs[mode];
export const setTf = t => { tfs[mode] = t; };
export const resetTf = () => { tfs[mode] = null; };

// kept for the old call sites
export const resetView = resetTf;

/// The drawer at the foot of the map. Survives redraws, like the map transform.
let drawer = false;
export const drawerOpen = () => drawer;
export const setDrawer = v => { drawer = !!v; };

/// The dark-sky overlay. Off by default: it is for the night you are choosing
/// where to sleep, not for every look at the map.
let sky = false;
export const skyOn = () => sky && hasSky();
export const setSky = v => { sky = !!v; };

/// One route option: the selector, then the case for taking it.
function routeOption(leg, opt, chosenId) {
  const b = routeById(opt.id);
  return `<div class="rtopt">
    <button class="rt" aria-pressed="${opt.id === chosenId}" data-route="${opt.id}" data-rleg="${leg.id}">
      <span class="dot"></span><span class="rn">${esc(opt.name)}</span>
      <span class="rm">${Math.round(b.miles).toLocaleString()} mi</span></button>
    ${opt.road ? `<div class="rroad">${esc(opt.road)}</div>` : ""}
    ${opt.character ? `<div class="rchar">${esc(opt.character)}</div>` : ""}
    ${opt.why ? `<div class="rwhy">${esc(opt.why)}</div>` : ""}
    ${opt.costs ? `<div class="rcost">${esc(opt.costs)}</div>` : ""}
  </div>`;
}

export function renderMap(legIx) {
  const rt = legRoute(legIx);
  return `<div class="mapbox" id="mapbox">
      <div class="mapstage" id="mstage" style="width:${mapview.MW}px;height:${mapview.MH}px">
        <svg class="mapsvg" id="msvg" width="${mapview.MW}" height="${mapview.MH}"
             viewBox="0 0 ${mapview.MW} ${mapview.MH}" role="img"
             aria-label="Map of the trip with the current leg emphasised"></svg>
      </div>
      <div class="zoom">
        <button data-zoom="in" aria-label="Zoom in">+</button>
        <button data-zoom="out" aria-label="Zoom out">−</button>
        <button class="fit" data-zoom="fit" aria-label="Fit to leg">FIT</button>
        ${hasSky() ? `<button class="fit sky" data-sky aria-pressed="${skyOn()}"
          aria-label="Show where the sky is dark">SKY</button>` : ""}
      </div>
      ${hasSky() ? `<div class="skykey" id="skykey"${skyOn() ? "" : " hidden"}>
        <span class="kt">Sky within 30 min of the road</span>
        <span class="ks">
          <i style="background:#12163a"></i><i style="background:#1a2350"></i><i style="background:#1a3a78"></i><i style="background:#206e60"></i><i style="background:#b0a838"></i><i style="background:#d67a28"></i><i style="background:#c63c2c"></i><i style="background:#e29696"></i><i style="background:#f6e8e8"></i>
        </span>
        <span class="kl"><b>dark</b><b>city</b></span>
      </div>` : ""}
      <div class="mways${drawer ? " up" : ""}" id="mways">
        <button class="mwbar" data-drawer aria-expanded="${drawer}">
          <span class="t">${esc(rt.name)}</span>
          <span class="m">${Math.round(rt.miles).toLocaleString()} mi</span>
          <span class="x">${drawer ? "Close" : "Why"}</span>
        </button>
        <div class="mwbody">${DATA.route.legs[legIx].routes
          .map(o => routeOption(DATA.route.legs[legIx], o, rt.id)).join("")}</div>
      </div>
    </div>`;
}

/// Which stops are marked seen, as a set the map can ask cheaply.
const seenSet = () => new Set(allStops().filter(s => store.isSeen(s.id)).map(s => s.id));

/// Paint the map for the scale it is currently shown at.
/// Two routes are the same road when either borrows the other, or both borrow
/// the same one. Session 21 predicted the map breaking once a leg had more
/// than two routes, because every alternative is drawn with the same dashed
/// line and you cannot tell which is which. This does not fix that; it stops
/// leg 1 making it worse by drawing a road twice.
const sameRoad = (a, b) =>
  a.sameRoadAs === b.id || b.sameRoadAs === a.id ||
  !!(a.sameRoadAs && a.sameRoadAs === b.sameRoadAs);

export function paintMap(legIx, scale, view) {
  const svg = document.getElementById("msvg");
  if (!svg) return;
  const leg = DATA.route.legs[legIx], cur = legRoute(legIx);
  svg.innerHTML = mapview.paint(DATA.usa, selected(), cur, {
    chosen: store.chosen, seen: seenSet(), pos: position, scale, view,
    // Not every other route is "the road not taken". `leg1-plan` runs the
    // canyon road exactly, so drawing one as the alternative to the other puts
    // an identical dashed line under a solid one and calls it a choice. Skip
    // any route sharing the road you are already on.
    alts: leg.routes
      .filter(o => o.id !== cur.id && !sameRoad(o, cur))
      .map(o => routeById(o.id)),
    sky: skyOn() ? SKY : null,
  });
}

// ============================================================== days
// Short and long forms of a day. The days are built in UTC so they must be
// read in UTC; getDay() on a local clock is a day out for anyone west of
// Greenwich, which is everywhere this trip goes.
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
             'August', 'September', 'October', 'November', 'December'];
const longDate = d => `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
const shortDate = d => `${WD[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MON[d.getUTCMonth()].slice(0, 3)}`;

// The Days tab is gone — Kevin's call: one leg of days was redundant once
// Dates carried the whole trip. Its two jobs moved, not died: the per-leg
// departure editors render at the top of the calendar now, and the full
// per-stop clock (arrive, leave, time there) is on every calendar day.

// ================================================================= calendar
//
// Days is scoped to one leg, which is right when you are driving it and wrong
// when the question is "what is happening on the 28th". This walks all three
// legs at once, fills the gaps between them -- Christmas at Mooresville, New
// Year in Houston -- and lays the whole thing out by date.
//
// A leg with no departure date set simply does not appear. There is no sane
// place to put it on a calendar.
export function renderCalendar() {
  const legs = DATA.route.legs;
  const byDate = new Map();
  const spans = [];

  legs.forEach((leg, li) => {
    const rt = legRoute(li);
    const dep = depOf(rt);
    if (!dep.date) { spans.push({ leg, li, unset: true }); return; }
    const D = realDays(rt);
    D.forEach((d, di) => {
      const key = d.date.toISOString().slice(0, 10);
      byDate.set(key, { kind: 'drive', d, di, n: D.length, leg, li, rt });
    });
    spans.push({
      leg, li,
      from: D[0].date, to: D[D.length - 1].date,
      endsAt: rt.waypoints[rt.waypoints.length - 1].name,
    });
  });

  // A leg with no date is invisible on a calendar, so its editor has to be
  // visible instead. Editors render for the legs that are still unset — a
  // fresh phone gets all three, a phone missing only leg 1 gets leg 1, and a
  // fully dated phone gets none: Kevin opens this tab to look ahead, not to be
  // asked questions he answered in September. Hiding them the moment ANY leg
  // was dated is what left leg 1 both undated and unsettable.
  const depRow = leg => {
    const rt = legChoice(leg);
    const dep = depOf(rt);
    return `<div class="dep${dep.date ? '' : ' unset'}">
      <div class="deplab">${esc(leg.name)} leaves</div>
      <div class="depval">${dep.date
        ? `${esc(longDate(new Date(dep.date + 'T00:00:00Z')))}, ${esc(dep.at)}`
        : 'Not set yet'}</div>
      <div class="depset">
        <input type="date" value="${esc(dep.date || '')}" data-depdate="${esc(depKey(rt))}"
               aria-label="Departure date">
        <input type="time" value="${esc(dep.at)}" data-depat="${esc(depKey(rt))}"
               aria-label="Departure time">
      </div>
    </div>`;
  };
  // Whether the weather branch happens is a DATES question as much as a route
  // question — it changes which mornings you leave and when you arrive — so
  // the switch lives here too. Only legs with a real choice of trips get one.
  const branchRow = leg => {
    const plans = plansOf(leg);
    if (plans.length < 2) return '';
    const cur = legChoice(leg).id;
    return `<div class="dep">
      <div class="deplab">${esc(leg.name)} — which trip</div>
      <div class="seg2">${plans.map(p =>
        `<button data-route="${esc(p.id)}" data-rleg="${esc(leg.id)}"
          aria-pressed="${p.id === cur}">${esc(p.name)}</button>`).join('')}</div>
    </div>`;
  };
  const branchBlock = legs.map(branchRow).join('');
  const depBlock = branchBlock + legs.map(depRow).join('');
  // A leg with a CHOICE of trips keeps its editor on screen even once dated,
  // because each scenario carries its own departure and you cannot set the
  // other one from a control that has hidden itself. Legs with a single plan
  // behave as before: visible only while unset.
  const unsetBlock = legs.filter(l => !depOf(legChoice(l)).date || plansOf(l).length > 1)
    .map(depRow).join('');

  const dated = spans.filter(x => !x.unset);
  if (!dated.length)
    return `<div class="cal">${depBlock}<div class="err">No departure dates set yet. Set them
      above and the whole trip lays itself out here.</div></div>`;

  // Fill the gaps between legs: you are parked wherever the last leg ended.
  for (let i = 0; i < dated.length - 1; i++) {
    const a = dated[i], b = dated[i + 1];
    for (let t = a.to.valueOf() + 86400000; t < b.from.valueOf(); t += 86400000)
      byDate.set(new Date(t).toISOString().slice(0, 10),
        { kind: 'stay', where: a.endsAt, nextLeg: b.leg });
  }

  const first = dated[0].from, last = dated[dated.length - 1].to;
  let h = '<div class="cal">' + branchBlock + unsetBlock;

  // ---- the header: how long, and the dates that cannot move --------------
  const nights = Math.round((last - first) / 86400000);
  h += `<div class="calsum">
    <div><b>${nights + 1}</b><span>days door to door</span></div>
    <div><b>${byDate.size - [...byDate.values()].filter(x => x.kind === 'stay').length}</b><span>driving</span></div>
    <div><b>${[...byDate.values()].filter(x => x.kind === 'stay').length}</b><span>parked up</span></div>
  </div>`;

  let month = '';
  for (let t = first.valueOf(); t <= last.valueOf(); t += 86400000) {
    const dt = new Date(t), key = dt.toISOString().slice(0, 10);
    const e = byDate.get(key);
    const mn = MON[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear();
    if (mn !== month) { month = mn; h += `<div class="calmon">${esc(month)}</div>`; }

    const wd = WD[dt.getUTCDay()], dnum = dt.getUTCDate();
    if (!e) { h += `<div class="cday empty"><div class="cdate"><b>${dnum}</b>
      <span>${esc(wd.slice(0, 3))}</span></div><div class="cbody"></div></div>`; continue; }

    if (e.kind === 'stay') {
      h += `<div class="cday stay"><div class="cdate"><b>${dnum}</b><span>${esc(wd.slice(0, 3))}</span></div>
        <div class="cbody"><div class="cwhere">${esc(e.where)}</div>
        <div class="cnote">Nothing to drive. Next leg starts here.</div></div></div>`;
      continue;
    }

    const { d, di, n, leg, rt } = e;
    const rows = d.rows.filter(r => r.kind !== 'bed');
    const bed = d.rows.find(r => r.kind === 'bed');
    h += `<div class="cday drive">
      <div class="cdate"><b>${dnum}</b><span>${esc(wd.slice(0, 3))}</span></div>
      <div class="cbody">
        <div class="ctag">${esc(leg.short || SHORT[e.li])} · day ${di + 1} of ${n}</div>
        <div class="cwhere">${esc(d.from.name)} → ${esc(d.overnight.name)}</div>
        <div class="cmeta">out ${esc(d.startAt || '')}${d.arriveAt ? ' · in ' + esc(d.arriveAt) : ''} · ${Math.round(d.miles).toLocaleString()} mi
          · ${fmtHours(d.driveMins)} driving${d.stopMins ? ' · ' + fmtHours(d.stopMins) + ' stopped' : ''}</div>
        ${d.risks.length ? `<div class="cwarn">Winter watch — ${d.risks.map(r =>
          esc(r.name + (r.atLabel ? ' ' + r.atLabel : '')
            + (r.dark && r.early ? ', in the dark and before the plows'
               : r.dark ? ', in the dark'
               : r.early ? `, before the plows clear it at ${r.plowedBy}` : ''))
        ).join(' · ')}</div>` : ''}
        ${wxBand(d, rt)}
        ${rows.length ? `<ol class="cstops">${rows.map(r =>
          `<li><span class="ct"><b>${esc(r.arriveAt)}</b>–${esc(r.departAt)}</span><span class="cn">${esc(r.stop.name)}</span>
           ${r.dwell ? `<span class="cd">${fmtHours(r.dwell)}</span>` : ''}</li>`).join('')}</ol>` : ''}
        ${bed ? `<div class="cbed"><span class="ct"><b>${esc(bed.arriveAt)}</b>–${esc(bed.departAt)}</span><span class="cn">${esc(bed.stop.name)}</span><span class="cd">sleep</span></div>`
              : `<div class="cbed"><span class="ct"><b>${esc(d.arriveAt || '')}</b></span><span class="cn">arrive ${esc(d.overnight.name)}</span><span class="cd">leg done</span></div>`}
      </div></div>`;
  }
  return h + '</div>';
}

// ============================================================== place sheet
export function placeSheet(id) {
  let s = null;
  for (const leg of DATA.route.legs)
    for (const r of leg.routes) { const f = routeById(r.id).stops.find(x => x.id === id); if (f) s = f; }
  if (!s) return "";

  const on = store.isChosen(s.id), seen = store.isSeen(s.id);
  const c = stopCost(s), hh = Math.floor(c.total / 60), mm = c.total % 60;
  const q = encodeURIComponent(`${s.name} ${s.town} ${s.state}`);
  const site = DATA.sites[s.id];
  const nrm = DATA.normals[s.town];
  const book = DATA.bookings[s.id];
  const dark = darksky.at(s.id, SKY);

  return `<div class="grab" data-grab><i></i></div>
    <div class="sh">
      <div><div class="sloc">${esc(s.town)}, ${esc(s.state)}</div>
        <div class="snm">${esc(s.name)}</div></div>
      <button class="sclose" data-close>Close</button>
    </div>
    <div class="sb">
      ${store.isMine(s.id) ? `<div class="links" style="margin-top:14px">
        <button data-edit="${esc(s.id)}">Edit this place<span>yours</span></button></div>` : ''}
      <div class="scost"><span class="n">${hh || mm}</span><span class="u">${hh ? "h" : "min"}</span>
        <span class="l">off your day</span></div>
      <div class="srow">${s.detour} min off the interstate, each way<br>${fmtHours(c.dwell)} on the ground${s.cost ? `<br>${esc(s.cost)}` : ""}</div>

      <div class="sdiv"></div>
      <div class="sbody">${esc(s.desc || s.why || "")}</div>

      <div class="sdiv"></div>
      <div class="slab">Late December</div>
      <div id="wx-${esc(s.id)}">${tempLine(nrm, null)}</div>
      ${s.winter ? `<div class="sbody">${esc(s.winter)}</div>` : ""}

      ${dark ? `<div class="sdiv"></div>
        <div class="slab">Night sky</div>
        <div class="srow">Bortle ${dark.bortle} · ${dark.sqm} mag/arcsec²</div>
        <div class="sbody">${esc(darksky.describe(dark.bortle))}</div>` : ""}

      ${book ? `<div class="sdiv"></div>
        <div class="slab">Booking</div>
        <div class="sbody">${esc(book.note)}</div>
        <div class="srow">${bookDeadline(book)}</div>
        <div class="links" style="margin-top:12px">
          <button data-book="${esc(s.id)}">${store.isBooked(s.id) ? "Booked" : "Mark as booked"}<span>${store.isBooked(s.id) ? esc(store.bookedOn(s.id)) : "not yet"}</span></button>
        </div>` : ""}

      <div class="sdiv"></div>
      <div class="slab">Notes</div>
      <textarea class="tinput" rows="3" data-note="${esc(s.id)}"
        placeholder="Anything worth remembering">${esc(store.note(s.id))}</textarea>

      ${s.first ? `<div class="sdiv"></div><div class="slab">A first</div>
        <div class="sbody">There is nothing in California like this.</div>` : ""}

      <div class="sdiv"></div>
      <div class="slab">Look it up</div>
      <div class="links">
        ${site ? `<a href="${site}" target="_blank" rel="noopener">Official site<span>${esc(site.replace(/^https?:\/\/(www\.)?/, "").split("/")[0])}</span></a>` : ""}
        <a href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">Search<span>Google</span></a>
        <a href="https://en.wikipedia.org/w/index.php?search=${q}" target="_blank" rel="noopener">Background<span>Wikipedia</span></a>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${s.ll[0]},${s.ll[1]}" target="_blank" rel="noopener">Directions<span>Maps</span></a>
        <button data-seen="${s.id}">${seen ? "Been there" : "Mark as seen"}<span>${seen ? esc(store.seenDate(s.id)) : "—"}</span></button>
      </div>
    </div>
    <div class="sact">
      <button class="${on ? "prim" : ""}" data-toggle="${s.id}">${on ? "In the plan" : "Add to plan"}</button>
      <a class="btn" style="flex:1;text-align:center;padding:13px 0"
         href="https://www.google.com/maps/dir/?api=1&destination=${s.ll[0]},${s.ll[1]}"
         target="_blank" rel="noopener">Navigate</a>
    </div>`;
}

// ============================================================== trip sheet
/// Fills in the offline line after the Trip tab is on screen. Asking the
/// service worker is async, and the tab must not wait on it.
export async function hydrateOffline() {
  const host = document.getElementById('offline-state');
  if (!host) return;
  const say = t => { const h = document.getElementById('offline-state'); if (h) h.textContent = t; };

  // getRegistration(), not ready. `ready` NEVER SETTLES when no worker is
  // registered — it does not reject, it just hangs — so awaiting it left this
  // line reading "Checking…" forever on exactly the phones that needed the
  // answer most.
  const reg = navigator.serviceWorker
    ? await navigator.serviceWorker.getRegistration().catch(() => null)
    : null;
  const worker = (reg && reg.active) || (navigator.serviceWorker && navigator.serviceWorker.controller);
  if (!worker) {
    say('Not saved for offline yet. Open the app once with signal and it stores itself.');
    return;
  }
  const answer = await new Promise(res => {
    const ch = new MessageChannel();
    const done = setTimeout(() => res(null), 3000);
    ch.port1.onmessage = e => { clearTimeout(done); res(e.data); };
    worker.postMessage({ type: 'CACHE_STATUS' }, [ch.port2]);
  });

  if (!answer) return say('Could not check. Try again in a moment.');
  if (answer.have >= answer.want)
    return say('Ready. Every part of the app is on this phone — the map, all ' +
      'the places, the roads and the type. It will work with no signal at all.');
  say(`${answer.have} of ${answer.want} parts saved. Stay on signal a moment longer, ` +
      `then check again.`);
}

export function renderTrip(upd = {}) {
  const st = { ...syncmod.state, ...upd };
  const dep = store.departure;
  const days = dep ? Math.ceil((new Date(dep + "T00:00:00") - new Date()) / 86400000) : null;
  const inPlay = allStops();
  const seen = inPlay.filter(s => store.isSeen(s.id));

  return `<div class="tripbody">
      ${dep
        ? `<div class="count"><b>${days > 0 ? days : 0}</b>
             <span>${days > 0 ? "days until you leave" : "you're out there"}</span></div>
           <div class="links"><button data-cleardep>Change the date<span>${esc(dep)}</span></button></div>`
        : `<div class="field"><div class="slab">When do you leave</div>
             <div class="sbody" style="font-size:13px;color:var(--ink2)">Stays on your phones. It never goes in the repo.</div>
             <input type="date" id="depart" class="tinput"></div>`}

      <div class="sdiv"></div>
      <div class="slab">Both phones</div>
      ${st.on
        ? `<div class="sbody" style="font-size:13px;color:var(--ink2)">Changes on either phone show up on the other.
             Anything you do with no signal queues and lands when you get bars.</div>
           <div class="codebox">${esc(st.code)}</div>
           <div class="links" style="margin-top:14px">
             <button data-copy-code="${esc(st.code)}">Copy the code<span>Share it</span></button>
             <button data-sync-off>Disconnect this phone<span>—</span></button>
           </div>`
        : `<div class="sbody" style="font-size:13px;color:var(--ink2)">Enter the trip code to share this plan.
             Everything works without it — it just won't be shared.</div>
           <input id="tripcode" class="tinput" placeholder="XXXX-XXXX-XXXX-XXXX"
                  autocapitalize="characters" autocomplete="off" spellcheck="false">
           <div class="actions"><button class="on" data-sync-connect>Connect</button></div>`}
      ${st.error ? `<div class="err">${esc(st.error)}</div>` : ""}

      ${seen.length ? `<div class="sdiv"></div><div class="slab">Everywhere you've been</div>
        <div class="links" style="margin-top:12px">
          ${seen.map(s => `<button data-stop="${s.id}">${esc(s.name)}<span>${esc(store.seenDate(s.id))}</span></button>`).join("")}
        </div>` : ""}

      <div class="sdiv"></div>
      <div class="slab">Bookings</div>
      ${bookingList()}

      <div class="sdiv"></div>
      <div class="slab">Winter watch</div>
      ${riskList()}

      <div class="sdiv"></div>
      <div class="slab">Road conditions</div>
      <div class="sbody" style="font-size:13px;color:var(--ink2)">Check these the night before, not the morning of.</div>
      <div class="links" style="margin-top:12px">${dotLinks()}</div>

      <div class="sdiv"></div>
      <div class="slab">Version</div>
      <div class="links" style="margin-top:12px">
        <button data-update>${st.updateReady ? "Restart to update" : "Check for updates"}<span>${esc(VERSION)}</span></button>
      </div>
      ${st.updateNote ? `<div class="sbody" style="font-size:13px;color:var(--ink2)">${esc(st.updateNote)}</div>` : ""}

      <div class="sdiv"></div>
      <div class="slab">Offline</div>
      <div class="sbody" style="font-size:13px;color:var(--ink2)" id="offline-state">Checking…</div>

      <div class="sdiv"></div>
      <div class="slab">Where are we</div>
      <div class="sbody" style="font-size:13px;color:var(--ink2)">
        ${position ? whereAreWe() : "Turn this on and the map shows your position along the route."}</div>
      ${position ? "" : `<div class="actions"><button data-locate>Use my location</button></div>`}
    </div>`;
}

function whereAreWe() {
  let best = null, off = Infinity, mile = 0;
  for (const r of selected()) {
    const p = project(position, r.waypoints, r.cum);
    if (p.off < off) { off = p.off; best = r; mile = p.mile; }
  }
  const next = best.towns.find(t => t.mile > mile);
  return `${Math.round(mile).toLocaleString()} of ${Math.round(best.miles).toLocaleString()} miles into ${esc(best.name)}.`
    + (next ? ` ${esc(next.name)} is ${Math.round(next.mile - mile)} miles ahead.` : "");
}

/// Every winter trouble spot across the three chosen routes, in road order.
function riskList() {
  const seen = new Set();
  let h = "";
  for (const r of selected())
    for (const t of r.towns) {
      if (!t.risk || seen.has(t.name)) continue;
      seen.add(t.name);
      h += `<div style="margin-top:16px">
        <div style="font-size:14px">${esc(t.name)}, ${esc(t.state)}${t.elev ? ` · ${t.elev.toLocaleString()} ft` : ""}</div>
        ${t.note ? `<div class="sbody" style="font-size:13px;color:var(--ink2);margin-top:5px">${esc(t.note)}</div>` : ""}
      </div>`;
    }
  return h || `<div class="sbody" style="font-size:13px;color:var(--ink2)">Nothing flagged on the routes you've picked.</div>`;
}

/// Each state you cross, once, in the order you cross it.
function dotLinks() {
  const seen = new Set();
  let h = "";
  for (const r of selected())
    for (const t of r.towns) {
      if (seen.has(t.state)) continue;
      seen.add(t.state);
      const d = DATA.route.dot.find(x => x.state === t.state);
      if (d) h += `<a href="${d.url}" target="_blank" rel="noopener">${esc(d.name)}<span>${esc(t.state)}</span></a>`;
    }
  return h;
}

// ============================================================== bookings
/// Deadline = departure minus the lead time. Without a departure date there is
/// no deadline to compute, which is the honest answer rather than a fake one.
export function bookDeadline(book) {
  const dep = store.departure;
  if (!dep) return `Book about ${book.lead} days before you leave — set a departure date and this becomes a real date.`;
  const d = new Date(dep + "T00:00:00");
  d.setDate(d.getDate() - book.lead);
  const iso = d.toISOString().slice(0, 10);
  const left = Math.ceil((d - new Date()) / 86400000);
  return left >= 0 ? `Book by ${iso} — ${left} days from now.` : `Book by ${iso} — that was ${-left} days ago.`;
}

function bookingList() {
  const chosen = allStops().filter(s => store.isChosen(s.id) && DATA.bookings[s.id]);
  if (!chosen.length)
    return `<div class="sbody" style="font-size:13px;color:var(--ink2)">Nothing in your plan needs booking ahead.</div>`;
  const dep = store.departure;
  const withDate = chosen.map(s => {
    const b = DATA.bookings[s.id];
    let due = null;
    if (dep) { const d = new Date(dep + "T00:00:00"); d.setDate(d.getDate() - b.lead); due = d; }
    return { s, b, due };
  }).sort((a, c) => (a.due && c.due ? a.due - c.due : c.b.lead - a.b.lead));

  const open = withDate.filter(x => !store.isBooked(x.s.id)).length;
  return `<div class="sbody" style="font-size:13px;color:var(--ink2)">
      ${open ? `${open} of ${withDate.length} still to book.` : `All ${withDate.length} booked.`}
      ${dep ? "" : " Set a departure date to turn the lead times into deadlines."}
    </div>
    <div class="links" style="margin-top:12px">
      ${withDate.map(x => `<button data-stop="${x.s.id}">${esc(x.s.name)}<span>${
        store.isBooked(x.s.id) ? "booked"
          : x.due ? x.due.toISOString().slice(0, 10)
          : x.b.lead + "d ahead"}</span></button>`).join("")}
    </div>`;
}

// ============================================================== weather
//
// Kevin: "I need a way to see the trip and see what the weather will look like
// at each spot on the date I will be there", and it has to update as the
// forecasting changes. js/weather.js does the fetching and picks the best tier
// for a place and a date; this lays it over the real days.
//
// Everything asked about is a place you are actually at on a known date: each
// stop, each bed (the overnight low is the next MORNING's, so a bed is asked
// about on its wake date), each pass the day crosses, and the far end of the
// leg. Only legs with a departure date appear — there is no date to ask about
// otherwise, and dates never leave the phone.

/// Every place on every dated leg, by day, in road order.
function wxTrip() {
  const out = [];
  DATA.route.legs.forEach((leg, li) => {
    const rt = legRoute(li);
    if (!depOf(rt).date) { out.push({ leg, li, unset: true }); return; }
    const D = realDays(rt);
    const term = rt.waypoints[rt.waypoints.length - 1];
    // Passes go on the day whose CLOCK they fall in, not the one whose miles
    // contain them: a stop pinned to the next morning doubles back, and
    // Amarillo crossed at 07:35 belongs to that morning, not to the evening
    // before it. Same for the order inside a day: by the clock.
    const starts = D.it.days.map(x => x.startedAt);
    const dayOfAbs = abs => { let i = 0; starts.forEach((s, j) => { if (s <= abs) i = j; }); return i; };
    const days = D.map((d, di) => {
      const items = [];
      for (const r of d.rows) {
        if (!r.stop || !r.date) continue;
        const night = r.kind === 'bed' ? r.wakeDate : (r.sleep && r.sleep.wakeDate) || null;
        items.push({
          kind: r.kind === 'bed' ? 'bed' : 'stop', abs: r.arrive,
          key: r.stop.id, ll: r.stop.ll, name: r.stop.name, town: r.stop.town, at: r.arriveAt,
          date: r.date, night,
        });
      }
      for (const c of D.it.crossings || [])
        if (c.ll && c.date && dayOfAbs(c.abs) === di)
          items.push({ kind: 'pass', abs: c.abs, key: 'w:' + c.id, ll: c.ll, name: c.name,
                       at: c.atLabel, date: c.date, cross: c });
      items.sort((a, b) => a.abs - b.abs);
      if (di === D.length - 1 && D.it.endsDate)
        items.push({ kind: 'end', abs: D.it.endsAt, key: 'end:' + term.name, ll: term.ll,
                     name: term.name, at: D.it.endsAtLabel, date: D.it.endsDate });
      return { d, di, n: D.length, items };
    });
    out.push({ leg, li, rt, days });
  });
  return out;
}

/// The places to keep fresh, each with which tiers its dates can use.
function wxPlaces(trip = wxTrip()) {
  const by = new Map();
  for (const L of trip) for (const day of L.days || []) for (const it of day.items)
    for (const date of [it.date, it.night].filter(Boolean)) {
      const k = wx.keyOf(it.ll);
      const need = wx.needFor(date);
      const p = by.get(k) || { ll: it.ll, need: { forecast: false, seasonal: false } };
      p.need.forecast ||= need.forecast;
      p.need.seasonal ||= need.seasonal;
      by.set(k, p);
    }
  return [...by.values()];
}

/// Fetch whatever is stale for the dated trip. Safe to call often: weather.js
/// only goes to the network for what has expired, and never throws.
export function refreshWeather(opts) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return Promise.resolve({ changed: 0, failed: 0 });
  const trip = wxTrip();
  // The zones' grid only needs the tiers the trip's dates can use.
  const dates = trip.flatMap(L => (L.days || []).map(d => d.d.date.toISOString().slice(0, 10)));
  const need = { forecast: dates.some(d => wx.needFor(d).forecast), seasonal: dates.some(d => wx.needFor(d).seasonal) };
  return wx.refresh(wxPlaces(trip), opts).then(a =>
    wx.refreshGrid(wxGrid(trip), need, opts).then(b => ({ changed: a.changed + b.changed, failed: a.failed + b.failed })));
}

const deg = n => (n < 0 ? '−' + Math.abs(n) : String(n));
const pctWords = n => (n == null ? '' : n >= 85 ? 'almost every' : n >= 60 ? 'most' : n >= 40 ? 'about half of'
  : n >= 25 ? '1 in 3' : n >= 15 ? '1 in 5' : n >= 8 ? '1 in 10' : n > 0 ? 'a few' : 'none of');
const ago = t => {
  if (!t) return null;
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
};

/// Worth flagging: the things that change what you do, not what you wear.
function wxHot(p, night) {
  if (!p) return false;
  if (p.tier === 'forecast')
    return (p.snowIn || 0) >= 0.4 || (p.rainIn || 0) >= 0.75 || (p.gust || 0) >= 45
      || /freezing/.test(p.words || '') || (night && p.lo <= 15);
  // 1 in 4 runs or days. Heavy rain in 1 in 5 is close to normal for the
  // Southeast in December, and at that bar a dozen places lit up and the
  // orange stopped meaning anything.
  return (p.snow || 0) >= 25 || (p.heavy || 0) >= 25 || (night && p.lo <= 15);
}

const tierName = p => (!p ? '' : p.tier === 'forecast' ? 'forecast'
  : p.tier === 'seasonal' ? `seasonal · ${p.runs} runs` : 'El Niño years');

/// The El Niño line under every place: the strongest El Niño winters at this
/// spot against the normal. It is the piece that is useful a month out.
function ninoLine(clim, night) {
  if (!clim) return '';
  const n = clim.normal, e = clim.nino;
  const diff = (a, b) => (a === b ? 'same' : `${a > b ? '+' : '−'}${Math.abs(a - b)}°`);
  const bits = [night
    ? `low ${e.lo}° (${diff(e.lo, n.lo)}), 1 night in 10 below ${e.cold}° vs ${n.cold}°`
    : `${e.hi}°/${e.lo}° (${diff(e.hi, n.hi)} / ${diff(e.lo, n.lo)})`];
  bits.push(`wet ${e.wet}% of days vs ${n.wet}%`);
  if (e.snow || n.snow) bits.push(`snow ${e.snow}% vs ${n.snow}%`);
  if (e.heavy >= 5 || n.heavy >= 5) bits.push(`heavy rain ${e.heavy}% vs ${n.heavy}%`);
  return `<div class="wxn">El Niño years vs normal: ${bits.join(' · ')}${clim.near ? '' : ' (nearest week in the table)'}</div>`;
}

function passVerdict(c) {
  if (!c) return '';
  return c.dark && c.early ? 'in the dark and before the plows'
    : c.dark ? 'in the dark' : c.early ? `before the plows clear it at ${esc(c.plowedBy)}` : 'in daylight, after the plows';
}

function ensoBlock() {
  const E = DATA.enso;
  if (!E) return '';
  const issued = new Date(E.issued + 'T00:00:00Z'), next = new Date(E.next + 'T00:00:00Z');
  const late = Date.now() > next.valueOf() + 3 * 86400000;
  return `<div class="dep wxenso">
    <div class="deplab">El Niño · NOAA, ${esc(longDate(issued).replace(/^\w+ /, ''))}</div>
    <div class="depval">${esc(E.status)}</div>
    <div class="sbody">${esc(E.synopsis)}</div>
    ${E.historic ? `<div class="sbody">${esc(E.historic)}</div>` : ''}
    <div class="cmeta">${late
      ? `A newer discussion was due ${esc(longDate(next).replace(/^\w+ /, ''))}. This is the older one until the app is updated.`
      : `Next update ${esc(longDate(next).replace(/^\w+ /, ''))}.`}
      <a href="${esc(E.url)}" target="_blank" rel="noopener">Source</a></div>
  </div>`;
}

function wxFreshText(fr, offline, trip) {
  const parts = [];
  if (fr.forecast) parts.push(`forecasts checked ${ago(fr.forecast)}`);
  if (fr.seasonal) parts.push(`seasonal checked ${ago(fr.seasonal)}`);
  // Say when the real forecasts start, so a screen of seasonal spreads is not
  // mistaken for something broken.
  const first = trip.flatMap(L => (L.days || []).flatMap(d => d.items.map(i => i.date))).sort()[0];
  if (!fr.forecast && first && wx.leadDays(first) >= 16)
    parts.push(`forecasts start ${wx.leadDays(first) - 15} days from now`);
  if (offline) parts.unshift('no signal, showing what was saved');
  const s = parts.join(' · ') || 'Not checked yet.';
  return esc(s.charAt(0).toUpperCase() + s.slice(1));
}

// ============================================================== weather map
//
// Kevin asked for a map: see the trip, and the weather at each spot on the
// date he is there. So the Weather tab is a map. Every place you are at on a
// known date is a dot, coloured by its weather that day: orange where it
// changes what you do (snow, ice, heavy rain, a hard frost in bed), blue
// where it freezes, green where it is fine. A row of days along the bottom
// zooms to one day's stretch of road. Tap a dot for the card.
//
// Stops in one town on one day are one dot: the two Houston restaurants are
// the same weather. Beds, passes and the end of a leg each keep their own.

let wxDay = 'all';            // 'all' or `${legIx}:${dayIx}`
let wxSpot = null;            // the tapped dot's id
let wxInfo = false;           // the "how to read" panel
let wxCache = null;           // { trip, spots } from the last render
export const wxDayNow = () => wxDay;
export const setWxDay = v => { wxDay = v || 'all'; wxSpot = null; };
export const setWxSpot = v => { wxSpot = !v || v === wxSpot ? null : v; };
export const wxInfoOpen = () => wxInfo;
export const setWxInfo = v => { wxInfo = !!v; };

const RANK = { bed: 2, pass: 2, end: 3, stop: 4 };

function wxSpotsOf(trip) {
  const out = [];
  for (const L of trip) for (const day of L.days || []) {
    const groups = [];
    const towns = new Map();
    for (const it of day.items) {
      if (it.kind === 'stop') {
        const town = it.town || it.name;
        let g = towns.get(town);
        if (!g) {
          g = { id: `${L.li}:${day.di}:t:${town}`, kind: 'stop', name: town, key: it.key, ll: it.ll,
                date: it.date, night: false, items: [] };
          towns.set(town, g); groups.push(g);
        }
        g.items.push(it);
      } else {
        const night = it.kind === 'bed';
        groups.push({ id: `${L.li}:${day.di}:${it.kind}:${it.key}:${groups.length}`, kind: it.kind,
                      name: it.name, key: it.key, ll: it.ll, date: (night && it.night) || it.date,
                      night, items: [it], cross: it.cross || null });
      }
    }
    for (const g of groups) {
      g.li = L.li; g.di = day.di; g.day = `${L.li}:${day.di}`;
      g.dayDate = day.d.date; g.n = day.n; g.leg = L.leg;
      g.p = wx.picture(g.key, g.ll, g.date);
      g.tone = wxTone(g.p, g);
      out.push(g);
    }
  }
  return out;
}

/// hot: changes what you do. cold: below freezing where it matters (the
/// night you sleep through, the ice on a pass, a day that never thaws).
function wxTone(p, g) {
  if (!p) return 'none';
  if (wxHot(p, g.night)) return 'hot';
  if (g.night || g.kind === 'pass' ? p.lo <= 32 : p.hi <= 34) return 'cold';
  return 'fine';
}

/// One glyph for the sky. The forecast says what it is; further out it is
/// what most of the runs, or most El Niño years, did.
function wxGlyph(p) {
  if (!p) return '';
  const T = '\uFE0E';                       // text, not emoji: it takes the colour
  if (p.tier === 'forecast') {
    const w = p.words || '';
    if (/snow|freezing/.test(w) || (p.snowIn || 0) >= 0.1) return '❄' + T;
    if (/thunder/.test(w)) return '⚡' + T;
    if (/rain|drizzle|shower/.test(w)) return '☂' + T;
    if (/fog|overcast/.test(w)) return '☁' + T;
    return '☀' + T;
  }
  if ((p.snow || 0) >= 25) return '❄' + T;
  if ((p.heavy || 0) >= 25 || (p.wet || 0) >= 50) return '☂' + T;
  if ((p.wet || 0) >= 30) return '☁' + T;
  return '☀' + T;
}


/// The stretch of road one day drives.
function daySeg(rt, a, b) {
  const pts = [pointAtMile(a, rt.waypoints, rt.cum)];
  rt.waypoints.forEach((w, i) => { if (rt.cum[i] > a && rt.cum[i] < b) pts.push(w.ll); });
  pts.push(pointAtMile(b, rt.waypoints, rt.cum));
  return pts;
}

function wxData() {
  if (!wxCache) { const trip = wxTrip(); wxCache = { trip, spots: wxSpotsOf(trip) }; }
  return wxCache;
}

// ------------------------------------------------------------------ zones
//
// Kevin: "I imagined a color coded zone for snow and rain. Dots don't do
// much." So the map shades where snow and rain are, like a weather map, from
// a 1-degree grid of points near the dated roads (weather.js fetches them).
//
//   a day      every grid point on that day's date: the weather map for the
//              day, with that day's road drawn over it.
//   All        each grid point on the date the trip goes past it, so the
//              road becomes a band coloured by the day you are actually
//              there. Where two legs pass the same ground (I-40 out and back)
//              the band shows the worse of the two; pick a day to split them.
//
// Drawn as one smooth image under the roads, the same way the dark-sky layer
// is: a grid of cells reads as squares, a raster blends them into zones.
const REACH = 110;                 // miles either side of the road
const isoOf = d => d.toISOString().slice(0, 10);
const hav = (a, b) => {
  const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(h));
};
const tripSig = trip => trip.map(L => (L.unset ? '-' : L.rt.id + '@' + L.days.map(d => isoOf(d.d.date)).join(','))).join(';');

/// The grid: whole degrees within REACH of any dated road.
let gridMemo = { key: null, cells: [] };
function wxGrid(trip) {
  const dated = trip.filter(L => !L.unset);
  const key = dated.map(L => L.rt.id).join(',');
  if (gridMemo.key === key) return gridMemo.cells;
  const pts = [];
  for (const L of dated) {
    const w = L.rt.waypoints;
    for (let i = 1; i < w.length; i++) {
      const a = w[i - 1].ll, b = w[i].ll, n = Math.max(1, Math.ceil(hav(a, b) / 15));
      for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    pts.push(w[w.length - 1].ll);
  }
  const cells = [];
  if (pts.length) {
    const la0 = Math.floor(Math.min(...pts.map(p => p[0]))) - 2, la1 = Math.ceil(Math.max(...pts.map(p => p[0]))) + 2;
    const lo0 = Math.floor(Math.min(...pts.map(p => p[1]))) - 3, lo1 = Math.ceil(Math.max(...pts.map(p => p[1]))) + 3;
    for (let la = la0; la <= la1; la++) for (let lo = lo0; lo <= lo1; lo++)
      if (pts.some(p => Math.abs(p[0] - la) < 2 && Math.abs(p[1] - lo) < 2.6 && hav(p, [la, lo]) < REACH))
        cells.push([la, lo]);
  }
  gridMemo = { key, cells };
  return cells;
}

/// For each grid point, every dated leg that passes within REACH: which day
/// it is passed on and how far off the road it sits.
let linkMemo = { key: null, links: null };
function wxLinks(trip) {
  const key = tripSig(trip);
  if (linkMemo.key === key) return linkMemo.links;
  const cells = wxGrid(trip);
  const links = cells.map(ll => {
    const out = [];
    for (const L of trip) {
      if (L.unset) continue;
      const pr = project(ll, L.rt.waypoints, L.rt.cum);
      if (pr.off > REACH) continue;
      const day = L.days.find(d => pr.mile <= d.d.endMile + 0.5) || L.days[L.days.length - 1];
      out.push({ li: L.li, di: day.di, date: isoOf(day.d.date), off: pr.off });
    }
    return out;
  });
  linkMemo = { key, links };
  return links;
}

/// Snow and rain strength at each grid point for the current view.
function zoneValues(trip) {
  const cells = wxGrid(trip);
  if (wxDay !== 'all') {
    const [li, di] = wxDay.split(':').map(Number);
    const day = trip[li] && trip[li].days && trip[li].days[di];
    if (!day) return cells.map(() => null);
    const date = isoOf(day.d.date);
    return cells.map(ll => wx.zoneAt(ll, date));
  }
  const links = wxLinks(trip);
  return cells.map((ll, i) => {
    let best = null;
    for (const k of links[i]) {
      const z = wx.zoneAt(ll, k.date);
      if (!z) continue;
      if (!best) { best = z; continue; }
      const tier = Math.max(z.snow, z.rain) > Math.max(best.snow, best.rain) ? z.tier : best.tier;
      best = { tier, snow: Math.max(best.snow, z.snow), rain: Math.max(best.rain, z.rain) };
    }
    return best;
  });
}

/// The worst of each day's road, for the dot on its button: snow or rain and
/// how bad (1 to 3), clear, or none when there is no weather for it yet.
function dayWorst(trip) {
  const cells = wxGrid(trip), links = wxLinks(trip);
  const out = new Map();
  cells.forEach((ll, i) => {
    for (const k of links[i]) {
      if (k.off > 50) continue;
      const z = wx.zoneAt(ll, k.date);
      if (!z) continue;
      const id = `${k.li}:${k.di}`, cur = out.get(id) || { snow: 0, rain: 0 };
      out.set(id, { snow: Math.max(cur.snow, z.snow), rain: Math.max(cur.rain, z.rain) });
    }
  });
  return id => {
    const v = out.get(id);
    if (!v) return 'none';
    const sn = wx.stepOf(v.snow), rn = wx.stepOf(v.rain);
    return sn && sn >= rn ? `snow l${sn}` : rn ? `rain l${rn}` : 'clear';
  };
}

const rgbOf = name => {
  const h = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace('#', '');
  return h.length === 6 ? [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) : [128, 128, 128];
};

let zoneMemo = { key: null, layer: null };
function zoneLayer(trip) {
  const cells = wxGrid(trip);
  if (!cells.length || typeof document === 'undefined') return null;
  const fr = wx.gridFreshness(cells);
  const SN = rgbOf('--wsnow'), RN = rgbOf('--wrain');
  const key = [wxDay, tripSig(trip), fr.forecast, fr.seasonal, SN, RN].join('|');
  if (zoneMemo.key === key) return zoneMemo.layer;

  const vals = zoneValues(trip);
  const at = new Map();
  cells.forEach((ll, i) => { if (vals[i]) at.set(ll[0] + ',' + ll[1], vals[i]); });
  if (!at.size) { zoneMemo = { key, layer: null }; return null; }

  // A raster in plain latitude and longitude, ten pixels a degree. The map is
  // drawn in the same plain projection, so it lays straight on. Each pixel is
  // a Gaussian blend of the grid points around it: a straight bilinear blend
  // of a one-degree grid shows the grid, as squares and diamonds.
  const PX = 10, SIG = 0.62, R = 2;
  const STEP = [0.3, 0.25, 0.27];      // opacity each step adds: light, moderate, heavy
  const FULL = (() => {                 // the weight a pixel gets with every neighbour present
    let t = 0;
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) t += Math.exp(-(i * i + j * j) / (2 * SIG * SIG));
    return t * 0.55;
  })();
  const la0 = Math.min(...cells.map(c => c[0])) - 1, la1 = Math.max(...cells.map(c => c[0])) + 1;
  const lo0 = Math.min(...cells.map(c => c[1])) - 1, lo1 = Math.max(...cells.map(c => c[1])) + 1;
  const W = (lo1 - lo0) * PX, H = (la1 - la0) * PX;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  // Where the shading is seasonal odds and not a forecast, the map stripes it.
  // This image marks where; map.js cuts the stripes through it.
  const hm = ctx.createImageData(W, H);
  let anySea = false;
  for (let y = 0; y < H; y++) {
    const lat = la1 - (y + 0.5) / PX, a = Math.round(lat);
    for (let x = 0; x < W; x++) {
      const lon = lo0 + (x + 0.5) / PX, b = Math.round(lon);
      let wsum = 0, sn = 0, rn = 0, sea = 0;
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
        const v = at.get((a + i) + ',' + (b + j));
        if (!v) continue;
        const dy = lat - (a + i), dx = lon - (b + j);
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * SIG * SIG));
        wsum += w; sn += w * v.snow; rn += w * v.rain;
        if (v.tier === 'seasonal') sea += w;
      }
      if (wsum < 0.02) continue;
      const s = sn / wsum, r = rn / wsum;
      const ks = wx.stepOf(s), kr = wx.stepOf(r);
      if (!ks && !kr) continue;
      // The worse of the two wins the pixel; snow on a tie, as it is the one
      // that closes roads.
      const snow = ks && ks >= kr, v = snow ? s : r, C = snow ? SN : RN;
      const o = (y * W + x) * 4;
      img.data[o] = C[0]; img.data[o + 1] = C[1]; img.data[o + 2] = C[2];
      // Steps, not a ramp: each band a flat shade, with just enough softness
      // at its edge not to look pixelled. And it fades at the edge of the
      // band, where the grid runs out.
      let al = 0;
      for (let t = 0; t < 3; t++) al += STEP[t] * Math.max(0, Math.min(1, 0.5 + (v - (t + 0.5)) / 0.16));
      const edge = Math.min(1, wsum / FULL);
      img.data[o + 3] = 255 * al * edge;
      if (sea / wsum > 0.5) {
        hm.data[o] = hm.data[o + 1] = hm.data[o + 2] = 255;
        hm.data[o + 3] = 255 * edge * Math.min(1, al / STEP[0]);
        anySea = true;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  let hatch = null;
  if (anySea) {
    const hv = document.createElement('canvas');
    hv.width = W; hv.height = H;
    hv.getContext('2d').putImageData(hm, 0, 0);
    hatch = hv.toDataURL('image/png');
  }
  const layer = { image: cv.toDataURL('image/png'), hatch, bounds: [la0, la1, lo0, lo1] };
  zoneMemo = { key, layer };
  return layer;
}

export function paintWx(scale, view) {
  const svg = document.getElementById('msvg');
  if (!svg) return;
  const { trip, spots } = wxData();
  const roads = DATA.route.legs.map((l, li) => ({
    ll: legRoute(li).waypoints.map(w => w.ll), on: !!(trip[li] && !trip[li].unset) }));
  const segs = [];
  if (wxDay !== 'all') {
    const [li, di] = wxDay.split(':').map(Number);
    const L = trip[li], day = L && L.days && L.days[di];
    if (day) segs.push(daySeg(L.rt, day.d.startMile, day.d.endMile));
  }
  svg.innerHTML = mapview.paintWeather(DATA.usa, roads, {
    scale, view, segs, zones: zoneLayer(trip),
    spots: spots.map(s => ({
      id: s.id, ll: s.ll, kind: s.kind, name: s.name, named: s.kind !== 'stop',
      dim: wxDay !== 'all' && s.day !== wxDay, sel: s.id === wxSpot,
      rank: s.id === wxSpot ? 0 : RANK[s.kind] || 4,
    })),
  });
}

/// Where FIT goes: the chosen day, or every dated leg, or the whole trip.
export function wxBounds() {
  const { trip, spots } = wxData();
  let lls = [];
  if (wxDay !== 'all') {
    const [li, di] = wxDay.split(':').map(Number);
    const L = trip[li], day = L && L.days && L.days[di];
    if (day) lls = daySeg(L.rt, day.d.startMile, day.d.endMile)
      .concat(spots.filter(s => s.day === wxDay).map(s => s.ll));
  }
  if (!lls.length) lls = spots.map(s => s.ll);
  if (!lls.length) lls = selected().flatMap(r => r.waypoints.map(w => w.ll));
  const q = lls.map(mapview.xy);
  const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  // Room for the labels on the right and the card at the foot.
  const minW = 70, minH = 50;
  if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
  if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
  const w = x1 - x0, h = y1 - y0;
  return { x: x0 - w * 0.06, y: y0 - h * 0.15, w: w * 1.42, h: h * 1.5 };
}

/// What the numbers mean for the day, in a sentence.
function wxPlain(p, night) {
  if (!p) return 'No weather for this place yet. It fills in once the phone has a signal.';
  const bits = [];
  if (p.tier === 'forecast') {
    if (p.words) bits.push(p.words.charAt(0).toUpperCase() + p.words.slice(1)
      + ((p.snowIn || 0) >= 0.1 ? `, about ${p.snowIn.toFixed(1)} in of snow`
        : (p.rainIn || 0) >= 0.1 ? `, about ${p.rainIn.toFixed(1)} in of rain` : '') + '.');
    if (p.wet != null) bits.push(`${p.wet}% chance of rain or snow.`);
    if ((p.gust || 0) >= 30) bits.push(`Gusts to ${p.gust} mph.`);
    return bits.join(' ');
  }
  if (p.tier === 'seasonal') {
    bits.push(`Rain or snow in ${pctWords(p.wet)} model runs.`);
    if (p.snow) bits.push(`Snow in ${pctWords(p.snow)}.`);
    if (p.heavy >= 8) bits.push(`Heavy rain in ${pctWords(p.heavy)}.`);
    bits.push('Too far out for a real forecast; that starts 16 days before.');
    return bits.join(' ');
  }
  bits.push(`No forecast reaches this date yet. In strong El Niño years it was wet on ${p.wet}% of days`
    + (p.snow ? `, snowy on ${p.snow}%` : '') + '.');
  return bits.join(' ');
}

/// How bad the snow and rain are, on the same three steps as the map.
const STEPS = ['', 'Light', 'Moderate', 'Heavy'];
function wxSev(p) {
  if (!p || !p.sev) return '';
  const out = [];
  for (const k of ['snow', 'rain']) {
    const n = wx.stepOf(p.sev[k]);
    if (!n) continue;
    let t;
    if (p.tier === 'forecast') {
      const inch = k === 'snow' ? p.snowIn : Math.max(0, (p.rainIn || 0) - (p.snowIn || 0) / 10);
      t = `${STEPS[n]} ${k}, about ${inch < 0.1 ? 'a trace' : inch.toFixed(1) + ' in'}`;
    } else {
      const big = k === 'snow' ? p.bigSnow : p.bigRain, line = k === 'snow' ? '4 in of snow' : '1 in of rain';
      t = n === 1 ? `${k === 'snow' ? 'Snow' : 'Rain'} possible`
        : `${n === 3 ? 'Good' : 'Some'} chance of ${line} or more, in ${pctWords(big)} runs`;
    }
    out.push(`<span><i class="z-${k} l${n}${p.tier === 'forecast' ? '' : ' odds'}"></i>${esc(t)}</span>`);
  }
  return out.length ? `<div class="wxsev">${out.join('')}</div>` : '';
}

function wxTempLine(p, night) {
  if (!p) return '';
  const r = (rg, mid) => (!rg || rg[0] === rg[1] ? `${deg(mid)}°`
    : `${deg(rg[0])}${rg[0] < 0 ? ' to ' : '–'}${deg(rg[1])}°`);
  if (p.tier === 'seasonal')
    return night ? `Low <b>${r(p.loR, p.lo)}</b> overnight`
      : `High <b>${r(p.hiR, p.hi)}</b> · low ${r(p.loR, p.lo)}`;
  return night ? `Low <b>${deg(p.lo)}°</b> overnight` : `High <b>${deg(p.hi)}°</b> · low ${deg(p.lo)}°`;
}

/// The El Niño years against the normal, as a sentence.
function wxNino(clim, night) {
  if (!clim) return '';
  const n = clim.normal, e = clim.nino;
  const dt = night ? e.lo - n.lo : e.hi - n.hi;
  const t = dt === 0 ? 'about normal temperatures' : `${Math.abs(dt)}° ${dt > 0 ? 'warmer' : 'colder'}`;
  const dw = e.wet - n.wet;
  const w = dw >= 5 ? 'wetter' : dw <= -5 ? 'drier' : 'about as wet';
  let s = `Strong El Niño years ran ${t} and ${w} here than normal`;
  if (e.snow || n.snow) s += `, snow on ${e.snow}% of days against ${n.snow}%`;
  if (night) s += `. One night in ten went below ${e.cold}°`;
  return s + '.';
}

function wxCard(s) {
  const tag = s.kind === 'bed' ? 'night' : s.kind === 'pass' ? 'pass' : s.kind === 'end' ? 'arrive' : '';
  // A bed is asked about on the MORNING's date (that is the night's low), but
  // you pull in the evening before. Show the evening you arrive.
  const first = s.items[0];
  const shown = s.night ? first.date : s.date;
  const when = s.items.length === 1 && first.at ? ` · ${s.night ? 'in at ' : ''}${esc(first.at)}` : '';
  const verdict = s.cross ? passVerdict(s.cross) : '';
  return `<div class="wxcard t-${s.tone}">
    <div class="wxch">
      <span class="g">${esc(wxGlyph(s.p))}</span>
      <div class="wxcn"><div class="n">${esc(s.name)}${tag ? ` <span class="wxk">${tag}</span>` : ''}</div>
        <div class="d">${esc(longDate(new Date(shown + 'T00:00:00Z')))}${when}</div></div>
      <button class="x" data-wxspot="" aria-label="Close">×</button>
    </div>
    <div class="wxct">${wxTempLine(s.p, s.night)}</div>
    ${wxSev(s.p)}
    <div class="wxcs">${esc(wxPlain(s.p, s.night))}</div>
    ${verdict ? `<div class="wxcv${verdict.startsWith('in daylight') ? '' : ' bad'}">You cross it ${verdict}.</div>` : ''}
    ${s.p && s.p.clim ? `<div class="wxce">${esc(wxNino(s.p.clim, s.night))}</div>` : ''}
    ${s.kind === 'stop' ? `<div class="wxcl">${s.items.map(i =>
      `<span><b>${esc(i.at || '')}</b> ${esc(i.name)}</span>`).join('')}</div>` : ''}
    ${s.p ? `<div class="wxcm">${esc(tierName(s.p))}</div>` : ''}
  </div>`;
}

/// The foot of the map: the card or the key, then the days.
export function wxFoot() {
  const { trip, spots } = wxData();
  const dated = trip.filter(L => !L.unset);
  if (!dated.length)
    return `<div class="wxhint">No departure dates yet. Set them on Dates and every place on the
      trip shows its weather for the day you are there.</div>`;
  const sel = spots.find(s => s.id === wxSpot);
  const worst = dayWorst(trip);
  const chips = [`<button class="wxchip" data-wxday="all" aria-pressed="${wxDay === 'all'}">All</button>`];
  for (const L of dated) for (const day of L.days) {
    const id = `${L.li}:${day.di}`;
    chips.push(`<button class="wxchip" data-wxday="${id}" aria-pressed="${wxDay === id}"><i class="z-${worst(id)}"></i>${esc(shortDate(day.d.date))}</button>`);
  }
  const sw = k => [1, 2, 3].map(n => `<i class="z-${k} l${n}"></i>`).join('');
  const zl = zoneLayer(trip);
  return (sel ? wxCard(sel) : `<div class="wxkey">
      <span class="wxsw">${sw('snow')}snow</span><span class="wxsw">${sw('rain')}rain</span>
      <span class="wxk2">light → heavy</span><em>tap a stop</em>
      <div class="wxk3">Heavy is 4 in of snow or 1 in of rain in a day.${zl && zl.hatch
        ? ' <i class="hatch"></i>Striped: over 16 days out, so the odds of it, not amounts.' : ''}</div></div>`)
    + `<div class="wxdays">${chips.join('')}</div>`;
}

/// Keep the chosen day's button in view after the row is redrawn.
export function wxSettle() {
  const c = document.querySelector('.wxchip[aria-pressed="true"]');
  if (!c) return;
  const row = c.parentElement;
  row.scrollLeft = Math.max(0, c.offsetLeft - row.clientWidth / 2 + c.offsetWidth / 2);
}

export function renderWeather() {
  wxCache = null;
  const { trip, spots } = wxData();
  if (wxSpot && !spots.some(s => s.id === wxSpot)) wxSpot = null;
  if (wxDay !== 'all' && !spots.some(s => s.day === wxDay)) wxDay = 'all';
  const dated = trip.filter(L => !L.unset);
  const fr = wx.freshness(wxPlaces(trip).map(p => p.ll));
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const E = DATA.enso;
  // The overlays sit beside the map box, not in it: inside, the map's drag
  // takes every touch and the row of days could never be scrolled.
  return `<div class="wxwrap"><div class="mapbox wxmap" id="mapbox">
      <div class="mapstage" id="mstage" style="width:${mapview.MW}px;height:${mapview.MH}px">
        <svg class="mapsvg" id="msvg" width="${mapview.MW}" height="${mapview.MH}"
             viewBox="0 0 ${mapview.MW} ${mapview.MH}" role="img"
             aria-label="Map of the trip with the weather at each place on the day you are there"></svg>
      </div>
      <div class="zoom">
        <button data-zoom="in" aria-label="Zoom in">+</button>
        <button data-zoom="out" aria-label="Zoom out">−</button>
        <button class="fit" data-zoom="fit" aria-label="Fit">FIT</button>
      </div>
    </div>
      <div class="wxtop">
        <button class="wxstat" data-wxinfo>${esc(E ? E.status : 'El Niño')}<span>How to read</span></button>
        ${dated.length ? `<div class="wxfresh"><span>${wx.busy() ? 'Checking…' : wxFreshText(fr, offline, trip)}</span>
          <button data-wxrefresh${wx.busy() || offline ? ' disabled' : ''}>Refresh</button></div>` : ''}
      </div>
      <div class="wxfoot" id="wxfoot">${wxFoot()}</div>
      <div class="wxinfo" id="wxinfo"${wxInfo ? '' : ' hidden'}>
        <div class="wxinfobar"><b>About this map</b><button data-wxinfo>Close</button></div>
        <div class="wxinfobody">${ensoBlock()}${wxExplain()}</div>
      </div>
    </div>`;
}

function wxExplain() {
  const A = wx.analogs();
  return `<div class="dep wxhow">
    <div class="deplab">How to read this</div>
    <div class="sbody"><b>Forecast</b> inside 16 days: the day itself. Checked every few hours.</div>
    <div class="sbody"><b>Seasonal</b> beyond that: 51 runs of ECMWF's seasonal model. Nobody
      knows the day this far out, so it shows the spread the runs give and how many of them put
      rain or snow down. Read it as a tilt, not a forecast. Rechecked daily.</div>
    <div class="sbody"><b>El Niño years</b> under every place: what the ${A.length || 'strongest'}
      strongest El Niño winters${A.length ? ` (${esc(A.join(', '))})` : ''} were like at that spot
      around that date, against the 1991–2020 normal. El Niño pushes the storm track south, over
      the roads this trip uses, and this is what it did there before.</div>
    <div class="sbody"><b>The shading</b> comes in three steps. Inside 16 days they are the
      forecast's amounts: snow light to 1 in, moderate to 4 in, heavy past that; rain light to
      ¼ in, moderate to 1 in, heavy past that. Further out nobody has amounts, so the map stripes
      the shading and the steps are odds instead: light where snow or rain shows up in a fair share
      of the runs, moderate where a heavy day shows up in 1 run in 10, heavy where it is 3 in 10.</div>
    <div class="sbody">In the card's words, snow means at least 0.4 in in a day, wet at least
      0.04 in, heavy rain half an inch. A bed shows the next morning's low, because that is the
      night you are parked in.</div>
    <div class="sbody"><b>Cold nights run colder than shown.</b> The history and the seasonal model
      both work on grid cells miles wide, and they miss how cold a clear, still night gets on the
      high desert. Gallup's weather-station normal low is about 13°; the model's is 21°. At the high
      beds, plan for several degrees below the number here. The El Niño difference is still good,
      because the same bias sits on both sides of it.</div>
  </div>`;
}

/// One line for a calendar day: the worst of what that day's places show, and
/// a tap through to the Weather tab.
function wxBand(d, rt) {
  const D = realDays(rt);
  const term = rt.waypoints[rt.waypoints.length - 1];
  const isLast = d === D[D.length - 1];
  const pts = [];
  for (const r of d.rows) if (r.stop && r.date)
    pts.push({ name: r.stop.name, p: wx.picture(r.stop.id, r.stop.ll, r.kind === 'bed' ? r.wakeDate : r.date), night: r.kind === 'bed' });
  for (const c of d.risks || []) if (c.ll && c.date) pts.push({ name: c.name, p: wx.picture('w:' + c.id, c.ll, c.date) });
  if (isLast && D.it.endsDate) pts.push({ name: term.name, p: wx.picture('end:' + term.name, term.ll, D.it.endsDate) });
  const have = pts.filter(x => x.p);
  if (!have.length) return '';
  // Highs across the places you are at by day; the low only where you sleep.
  // "Low 17° at Desert View" was a low at a place you pass at five in the
  // afternoon.
  const day = have.filter(x => !x.night);
  const his = (day.length ? day : have).map(x => x.p.hi);
  const bed = have.find(x => x.night);
  const snow = have.reduce((a, x) => ((x.p.snow || 0) > (a.p.snow || 0) ? x : a));
  const wet = have.reduce((a, x) => ((x.p.heavy || 0) > (a.p.heavy || 0) ? x : a));
  const tiers = [...new Set(have.map(x => x.p.tier))];
  const lo = Math.min(...his), hi = Math.max(...his);
  const bits = [lo === hi ? `high ${deg(hi)}°` : `highs ${deg(lo)}°–${deg(hi)}°`];
  if (bed) bits.push(`night ${deg(bed.p.lo)}° at ${esc(bed.name)}`);
  if ((snow.p.snow || 0) >= 15) bits.push(snow.p.tier === 'forecast'
    ? `snow at ${esc(snow.name)}` : `snow in ${snow.p.snow}% at ${esc(snow.name)}`);
  if ((wet.p.heavy || 0) >= 10) bits.push(wet.p.tier === 'forecast'
    ? `heavy rain at ${esc(wet.name)}` : `heavy rain ${wet.p.heavy}% at ${esc(wet.name)}`);
  const hot = have.some(x => wxHot(x.p, x.night));
  return `<div class="cwx${hot ? ' hot' : ''}" data-tab="wx">Weather — ${bits.join(' · ')}
    <em>${tiers.map(t => (t === 'climate' ? 'El Niño years' : t)).join(' + ')}</em></div>`;
}

// ============================================================== live weather
/// The place sheet's temperature line, from the same picture the Weather tab
/// uses, so the two can never disagree.
function tempLine(nrm, p) {
  if (p)
    return `<div class="temps"><b>${p.hi}°</b><s>${p.lo}°</s>
      <em>${esc(p.tier === 'forecast' ? `forecast for ${p.date}` : p.tier === 'seasonal'
        ? `seasonal median for ${p.date}` : `El Niño years, around ${p.date}`)}</em></div>
      ${p.clim ? ninoLine(p.clim, false) : ''}`;
  if (nrm)
    return `<div class="temps"><b>${nrm.hi ?? nrm[0]}°</b><s>${nrm.lo ?? nrm[1]}°</s>
      <em>${nrm.real ? `late-December average, last ${nrm.years} years` : "typical high / low"}</em></div>`;
  return `<div class="srow">No temperatures for this one yet.</div>`;
}

/// Called after the sheet is on screen. Replaces the estimate with the best
/// picture there is for the day you are there.
export async function hydrateWeather(id) {
  const st = allStops().find(x => x.id === id);
  const host = document.getElementById("wx-" + id);
  if (!st || !host) return;
  const day = plannedDate(id);
  if (!day) return;
  const p = wx.picture(st.id, st.ll, day);
  if (p) host.innerHTML = tempLine(null, { ...p, date: day });
}

/// Which calendar day this stop falls on, given a departure date.
export function plannedDate(id) {
  // The row carries its own local date now, so an arrival after midnight is
  // the next day's weather rather than the day row's.
  for (const r of selected()) {
    if (!depOf(r).date) continue;   // that leg has no date yet
    for (const d of realDays(r)) {
      const row = d.rows.find(x => x.stop && x.stop.id === id);
      if (row) return row.date || d.date.toISOString().slice(0, 10);
    }
  }
  return null;
}

/// The lodging place nearest a night, if you have added one.
export function lodgingFor(route, mile) {
  let best = null, gap = 45;
  for (const s of route.stops) {
    if (s.kind !== 'lodging') continue;
    const d = Math.abs(s.mile - mile);
    if (d < gap) { gap = d; best = s; }
  }
  return best;
}

// ============================================================== editor
let draft = null;
export const editing = () => draft;

export function openEditor(seed) {
  draft = Object.assign({
    name: '', town: '', state: '', ll: null, dwell: 60, detour: 5,
    kind: 'stop', leg: 0, why: '', query: '', results: null, busy: false,
  }, seed || {});
}
export function closeEditor() { draft = null; }
export function patchDraft(p) { if (draft) Object.assign(draft, p); }

export async function runSearch(q) {
  if (!draft) return;
  draft.busy = true;
  draft.query = q;
  draft.results = null;
  draft.failed = false;
  const r = await geo.search(q);
  if (!draft) return;
  draft.busy = false;
  if (r === null) draft.failed = true;
  else draft.results = r;
}

export function editorSheet() {
  const d = draft;
  if (!d) return '';
  const ready = !!d.ll && d.name.trim().length > 0;
  const bed = d.kind === 'lodging';
  return `<div class="grab" data-grab><i></i></div>
    <div class="sh">
      <div><div class="sloc">${d.id ? 'Editing' : 'Your own'}</div>
        <div class="snm">${bed ? 'Where you sleep' : 'A place'}</div></div>
      <button class="sclose" data-editor-close>Close</button>
    </div>
    <div class="sb">
      <div class="seg2">
        <button data-kind="stop" aria-pressed="${!bed}">A place to stop</button>
        <button data-kind="lodging" aria-pressed="${bed}">Where you sleep</button>
      </div>

      <div class="field"><div class="slab">Name</div>
        <input class="tinput" id="ed-name" value="${esc(d.name)}"
          placeholder="${bed ? 'Comfort Inn, Barstow' : "Ada's mom"}"></div>

      <div class="field"><div class="slab">Where</div>
        <input class="tinput" id="ed-find" value="${esc(d.query)}"
          placeholder="Address, or a town and state">
        <div class="actions">
          <button data-find>${d.busy ? 'Looking…' : 'Find it'}</button>
          <button data-here>Use my location</button>
        </div>
        ${d.ll ? `<div class="srow">${esc(d.town || 'located')}${d.state ? ', ' + esc(d.state) : ''}
            · ${d.ll[0].toFixed(3)}, ${d.ll[1].toFixed(3)}</div>` : ''}
        ${d.failed ? `<div class="err">Could not reach the lookup. Try again, or use your location while you are there.</div>` : ''}
        ${Array.isArray(d.results) && d.results.length === 0
          ? `<div class="srow">Nothing found. Try a town and state.</div>` : ''}
        ${Array.isArray(d.results) && d.results.length
          ? `<div class="links">${d.results.map((r, i) =>
              `<button data-pick="${i}">${esc(r.label)}<span>${esc(r.state)}</span></button>`).join('')}</div>` : ''}
      </div>

      <div class="field"><div class="slab">Which leg</div>
        <div class="seg2 ${legs().length === 3 ? 'three' : ''}">${legs().map((l, i) =>
          `<button data-leg-pick="${i}" aria-pressed="${d.leg === i}">${esc(l.short || SHORT[i])}</button>`).join('')}</div>
      </div>

      ${bed ? '' : `<div class="field"><div class="slab">Roughly how long</div>
        <div class="seg2 three">${[30, 60, 120, 240].map(m =>
          `<button data-dwell="${m}" aria-pressed="${d.dwell === m}">${m < 60 ? m + 'm' : (m / 60) + 'h'}</button>`).join('')}</div>
      </div>`}

      <div class="field"><div class="slab">Note</div>
        <textarea class="tinput" rows="2" id="ed-why"
          placeholder="${bed ? 'Confirmation number, check-in time' : 'Why it is worth stopping'}">${esc(d.why)}</textarea></div>
    </div>
    <div class="sact">
      <button class="${ready ? 'prim' : ''}" data-editor-save>${d.id ? 'Save' : 'Add it'}</button>
      ${d.id ? `<button data-editor-delete>Delete</button>` : ''}
    </div>`;
}

// ============================================================== what's next
//
// Keyed off WHERE YOU ARE, never off the date. A schedule view assumes the
// schedule held; one snow day at Flagstaff and every date after it is wrong.
// This asks the road, not the calendar.

/// Which leg and milepost you are actually on, by projecting your position
/// onto each selected route and taking the closest.
export function whereAmI() {
  if (!position) return null;
  let best = null;
  selected().forEach((route, legIx) => {
    const p = project(position, route.waypoints, route.cum);
    if (!best || p.off < best.off) best = { route, legIx, mile: p.mile, off: p.off };
  });
  if (!best) return null;
  best.onRoute = best.off < 60;
  return best;
}

/// Where the Next screen reckons you are. GPS if there is any, otherwise the
/// guess below.
///
/// **Both the header and the body must call this.** They used to differ — the
/// header fell back to mile 0 while the body fell back to the first unseen
/// stop — so with no GPS one screen showed "0 mi in / 0%" above "behind you
/// 241 mi / 8.7%". One function, one answer.
export function whereNow() { return whereAmI() || fallbackSpot(); }

/// Falls back to the first thing you have not marked seen, so the screen is
/// still useful parked in the driveway in August.
function fallbackSpot() {
  // Beds count. They used to be filtered out here and in the Next list, so
  // with nothing seen the screen skipped the Barstow night and named the Snow
  // Cap, six hundred miles on. The next thing on the road is the next thing
  // on the road, and sometimes that is where you sleep.
  const legs = selected();
  for (let i = 0; i < legs.length; i++) {
    const route = legs[i];
    for (const s of route.stops) {
      if (store.isChosen(s.id) && !store.isSeen(s.id))
        return { route, legIx: i, mile: Math.max(0, s.mile - 1), off: 0, onRoute: false, guessed: true };
    }
  }
  return { route: legs[0], legIx: 0, mile: 0, off: 0, onRoute: false, guessed: true };
}

export function renderNext() {
  const here = whereNow();
  const rt = here.route;
  const days = realDays(rt);
  const day = days.find(d => here.mile >= d.startMile - 1 && here.mile <= d.endMile + 1) || days[0];

  const ahead = rt.stops
    .filter(s => store.isChosen(s.id) && s.mile > here.mile - 2 && !store.isSeen(s.id))
    .sort((a, b) => a.mile - b.mile);
  const next = ahead[0];
  const after = ahead.slice(1, 4);

  const bed = day ? lodgingFor(rt, day.endMile) : null;
  const toNight = day ? Math.max(0, day.endMile - here.mile) : 0;
  const risks = rt.towns.filter(t => t.risk && t.mile > here.mile && t.mile < here.mile + 260);

  let h = '<div class="nextbody">';

  if (!position) {
    h += `<div class="nonav">
      <div class="sbody">This screen needs to know where you are. Everything below is a
        guess from the first place you haven't marked seen.</div>
      <div class="actions"><button class="on" data-watch>Turn on location</button></div>
    </div>`;
  }

  if (next) {
    const dist = Math.max(0, Math.round(next.mile - here.mile));
    const c = stopCost(next);
    h += `<button class="nextcard" data-stop="${next.id}">
      <div class="nlab">Next</div>
      <div class="nbig"><b>${dist.toLocaleString()}</b><span>mi</span></div>
      <div class="nname">${esc(next.name)}</div>
      <div class="nsub">${esc(next.town)}, ${esc(next.state)} · ${next.kind === 'lodging'
        ? "tonight's bed"
        : `${next.detour} min off the road · ${fmtHours(c.total)} all in`}</div>
    </button>
    <div class="actions" style="margin-top:2px">
      <a class="btn on" style="text-align:center;padding:13px 0"
         href="https://www.google.com/maps/dir/?api=1&destination=${next.ll[0]},${next.ll[1]}"
         target="_blank" rel="noopener">Navigate there</a>
      <button data-seen="${next.id}">Been there</button>
    </div>`;
  } else {
    h += `<div class="nextcard"><div class="nlab">Next</div>
      <div class="nname">Nothing left on this leg.</div>
      <div class="nsub">Everything you picked is marked seen.</div></div>`;
  }

  if (after.length) {
    h += `<div class="nblock"><div class="slab">Then</div><div class="stoplist2">${
      after.map(s => `<button class="nrow" data-stop="${s.id}">
        <span class="t">${esc(s.name)}</span>
        <span class="d">${Math.max(0, Math.round(s.mile - here.mile)).toLocaleString()} mi</span>
      </button>`).join('')}</div></div>`;
  }

  // When the next thing on the road IS tonight's bed, the Tonight block would
  // repeat the Next card word for word, with tomorrow's stops sandwiched
  // between the two copies — Kevin caught it reading backwards. Tonight earns
  // its place only while there are still stops between you and the bed.
  const nextIsTonight = next && next.kind === 'lodging' &&
    (bed ? bed.id === next.id : Math.abs(next.mile - (day ? day.endMile : -1)) < 2);
  if (day && !nextIsTonight) {
    h += `<div class="nblock"><div class="slab">Tonight</div>
      <div class="nrow big">
        <span class="t">${esc(day.overnight.name)}${day.overnight.state ? ', ' + esc(day.overnight.state) : ''}</span>
        <span class="d">${Math.round(toNight).toLocaleString()} mi · ${fmtHours(driveMinutes(here.mile, day ? day.endMile : here.mile, rt))}</span>
      </div>
      ${bed
        ? `<button class="nrow" data-stop="${bed.id}"><span class="t">${esc(bed.name)}</span>
             <span class="d">booked in</span></button>`
        : `<button class="nrow add" data-addbed="${here.legIx}" data-town="${esc(day.overnight.name)}"
             data-st="${esc(day.overnight.state || '')}"><span class="t">No bed set for tonight</span>
             <span class="d">add one</span></button>`}
    </div>`;
  }

  if (risks.length) {
    h += `<div class="nblock"><div class="slab">Watch out</div>${risks.map(t => `
      <div class="nrow"><span class="t">${esc(t.name)}${t.elev ? ` · ${t.elev.toLocaleString()} ft` : ''}</span>
        <span class="d">${Math.round(t.mile - here.mile).toLocaleString()} mi</span></div>
      ${t.note ? `<div class="nnote">${esc(t.note)}</div>` : ''}`).join('')}</div>`;
  }

  const done = here.mile, left = Math.max(0, rt.miles - here.mile);
  h += `<div class="nblock"><div class="slab">This leg</div>
    <div class="nrow"><span class="t">Behind you</span><span class="d">${Math.round(done).toLocaleString()} mi</span></div>
    <div class="nrow"><span class="t">Still to go</span><span class="d">${Math.round(left).toLocaleString()} mi</span></div>
    <div class="bar"><i style="width:${Math.min(100, Math.max(0, done / rt.miles * 100)).toFixed(1)}%"></i></div>
    ${here.onRoute === false && position ? `<div class="nnote">You're ${Math.round(here.off)} miles off the route — these numbers assume you rejoin it.</div>` : ''}
  </div>`;

  return h + '</div>';
}
