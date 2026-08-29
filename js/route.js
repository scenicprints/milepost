// Road geometry. Everything the app knows about distance, order and
// "where are we" comes from here.
//
// The waypoint list for each route is dense enough that the polyline
// through it tracks the actual interstate closely; WIGGLE covers the
// difference between that and true pavement miles.

// Calibrated against known road distances: Modesto–Raleigh via I-40 (~2,750),
// Houston–Modesto via I-10 (~1,900). Raw polyline miles run about 9% short.
const WIGGLE = 1.09;
const R_MILES = 3958.8;

const rad = d => (d * Math.PI) / 180;

export function milesBetween(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return R_MILES * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/// Cumulative road-mile at each waypoint, plus the route total.
export function measure(waypoints) {
  const cum = [0];
  for (let i = 1; i < waypoints.length; i++) {
    cum.push(cum[i - 1] + milesBetween(waypoints[i - 1].ll, waypoints[i].ll) * WIGGLE);
  }
  return { cum, total: cum[cum.length - 1] };
}

// Nearest point on segment ab to p, in flat degrees scaled for longitude
// convergence. Good enough at these latitudes and far cheaper than the
// spherical version.
function nearestOnSegment(p, a, b) {
  const k = Math.cos(rad((a[0] + b[0]) / 2));
  const ax = a[1] * k, ay = a[0];
  const bx = b[1] * k, by = b[0];
  const px = p[1] * k, py = p[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { t, ll: [ay + dy * t, (ax + dx * t) / k] };
}

/// Where a point sits along a route: its road-mile, how far off-route it
/// is, and which segment it fell on. This is what orders the stops.
export function project(ll, waypoints, cum) {
  let best = { mile: 0, off: Infinity, index: 0 };
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1].ll, b = waypoints[i].ll;
    const { t, ll: foot } = nearestOnSegment(ll, a, b);
    const off = milesBetween(ll, foot);
    if (off < best.off) {
      const segLen = cum[i] - cum[i - 1];
      best = { mile: cum[i - 1] + segLen * t, off, index: i - 1 };
    }
  }
  return best;
}

/// The point on the route at a given road-mile — used to place the
/// "you are here" marker and to find the next town ahead.
export function pointAtMile(mile, waypoints, cum) {
  if (mile <= 0) return waypoints[0].ll;
  for (let i = 1; i < waypoints.length; i++) {
    if (mile <= cum[i]) {
      const span = cum[i] - cum[i - 1] || 1;
      const t = (mile - cum[i - 1]) / span;
      const a = waypoints[i - 1].ll, b = waypoints[i].ll;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return waypoints[waypoints.length - 1].ll;
}

// ===================================================== pace, per segment ====
//
// There is no single mph for this trip and there never was. I-40 across Arizona
// is posted 75; the crawl through Atlanta is not, and CA-99 out of Modesto sits
// between them. One number for 5,900 miles was wrong everywhere except by
// accident, so the speed now comes off the road itself: `limit` on each
// waypoint is the posted limit on the segment leading INTO it.
//
// REALISM is what separates the sign from the average. You do not hold the
// posted limit for a whole day: there is traffic you cannot pass, grades you
// lose on climbing, and the fuel and bathroom stops that are nobody's `dwell`
// because they are not places you chose to go.
//
// A metro is charged differently, as MINUTES rather than mph, because that is
// how a city actually costs you — Houston does not make the 400 miles either
// side of it slower, it takes twenty minutes out of your day as you cross it.
const REALISM = 0.94;
const METRO_MIN = 12;

/// One entry per waypoint pair: the span it covers, and what it costs.
export function segments(route) {
  const cum = route.cum || measure(route.waypoints).cum;
  const segs = [];
  for (let i = 1; i < route.waypoints.length; i++) {
    const w = route.waypoints[i];
    const limit = w.limit || 70;
    segs.push({
      from: cum[i - 1], to: cum[i], name: w.name, road: w.road || null,
      limit, mph: limit * REALISM, penalty: w.urban ? METRO_MIN : 0, tz: w.tz,
    });
  }
  return segs;
}

/// Minutes of driving between two road-miles, integrated across whatever
/// segments that span crosses. This is why choosing a custom handful of stops
/// still costs the right time: the road between two of them is priced by the
/// road, not by which stops happen to be ticked.
export function driveMinutes(fromMile, toMile, route) {
  if (!(toMile > fromMile)) return 0;
  const segs = route.segs || segments(route);
  let min = 0;
  for (const s of segs) {
    const a = Math.max(fromMile, s.from), b = Math.min(toMile, s.to);
    if (b <= a) continue;
    min += ((b - a) / s.mph) * 60;
    // The metro toll is paid on arrival, so only when the span actually
    // reaches the far end of the segment that enters it.
    if (s.penalty && toMile >= s.to) min += s.penalty;
  }
  return min;
}

/// The inverse: how far you get from `fromMile` in `minutes`. Needed because
/// the day-splitter asks "how much road is left in today", which with one mph
/// was a multiplication and with real segments is a walk down the road.
export function mileAfter(fromMile, minutes, route) {
  const segs = route.segs || segments(route);
  let left = minutes, mile = fromMile;
  for (const s of segs) {
    if (s.to <= fromMile) continue;
    const a = Math.max(fromMile, s.from);
    const cost = ((s.to - a) / s.mph) * 60 + (s.penalty || 0);
    // Ran out mid-segment: you never arrive, so no metro toll is charged.
    if (cost >= left) return Math.min(s.to, a + (left / 60) * s.mph);
    left -= cost;
    mile = s.to;
  }
  return mile;
}

/// What the whole route averages, door to door, once all of that is counted.
/// Shown in the planner so the number is inspectable rather than believed.
export function averageMph(route) {
  const min = driveMinutes(0, route.miles ?? measure(route.waypoints).total, route);
  return min > 0 ? ((route.miles ?? measure(route.waypoints).total) / min) * 60 : 0;
}

// ========================================================== timezones =======
//
// December, so no DST anywhere on this trip and standard time is the whole
// story. Arizona keeps no DST in any case. Tennessee is split down the
// Cumberland Plateau, which is why it cannot be a plain state lookup.
const TZ_STATE = {
  CA: -8, NV: -8, AZ: -7, NM: -7, UT: -7, CO: -7,
  TX: -6, OK: -6, AR: -6, LA: -6, MS: -6, AL: -6, MO: -6,
  GA: -5, SC: -5, NC: -5, FL: -5, VA: -5,
};

/// The standard-time offset for a place, from its state and, where the state
/// straddles a boundary, its longitude.
export function tzFor(state, lon) {
  if (state === 'TN') return lon != null && lon < -85.5 ? -6 : -5;
  return TZ_STATE[state] ?? -8;
}

/// The offset at a road-mile, for the ends of the route where there is no stop
/// to ask. Uses the waypoint the mile has reached.
export function tzAtMile(mile, route) {
  const w = route.waypoints;
  const cum = route.cum || measure(w).cum;
  for (let i = 0; i < w.length; i++)
    if (mile <= cum[i]) return w[i].tz ?? tzFor(w[i].state, w[i].ll[1]);
  const last = w[w.length - 1];
  return last.tz ?? tzFor(last.state, last.ll[1]);
}

/// Decorate a route with measurements and its stops, in road order.
/// A stop more than MAX_OFF miles from the pavement is dropped — that
/// means the route was swapped and this stop no longer belongs.
const MAX_OFF = 140;

/// A stop within this many miles of a junction counts as being AT it, for
/// deciding what you do before you turn off.
const TURN_TOWN = 5;

export function buildRoute(route, allStops, dwells) {
  const { cum, total } = measure(route.waypoints);
  const towns = route.waypoints.map((w, i) => ({ ...w, mile: cum[i] }));

  const projected = allStops
    .filter(s => s.routes.includes(route.id))
    .map(s => {
      const p = project(s.ll, route.waypoints, cum);
      // `detourBy` lets one stop cost different time on different roads. The
      // Grand Canyon is an hour off the interstate from Williams, but on the
      // canyon road the rim IS the road, so the same stop costs minutes. One
      // stop id either way, so crossing it off crosses it off everywhere.
      const detour = (s.detourBy && s.detourBy[route.id] != null)
        ? s.detourBy[route.id] : s.detour;
      // `dwells` is the user's own override of how long they will really be
      // somewhere. The seeded number is a research guess; this is the answer.
      // Zero is a legitimate answer, so only undefined falls back to the seed.
      const over = dwells && dwells[s.id];
      const dwell = Number.isFinite(over) ? over : s.dwell;
      return {
        ...s, detour, dwell, seedDwell: s.dwell,
        dwellSet: Number.isFinite(over) && over !== s.dwell,
        mile: p.mile, offRoute: p.off, tz: tzFor(s.state, s.ll[1]), turnoff: null,
      };
    })
    .filter(s => s.offRoute < MAX_OFF);

  // `turnoffBy` fixes where a far-off stop SITS IN THE ORDER.
  //
  // project() puts every stop at the nearest point on the road, which is wrong
  // for anything a long way off it. The South Rim is 56 miles north of I-40 and
  // its perpendicular happens to land six miles west of Williams, so it sorted
  // ahead of Bearizona, which is IN Williams. You do not drive to the nearest
  // point on the map; you leave the interstate at a junction.
  //
  // So a stop can name the waypoint its detour departs from, per route, exactly
  // as detourBy is per route: the canyon turns off at Williams on I-40 and does
  // not turn off at all on the canyon road, where the rim is the road.
  //
  // It lands just PAST whatever is on the road at that junction. A 56-mile
  // out-and-back returns you to the same point, so the order against things in
  // the town is free, and doing the town first is the only sane reading. This
  // also has to be past them rather than at the waypoint: Williams the waypoint
  // is mile 650 and Bearizona projects to 651, so snapping to the waypoint
  // alone would leave the canyon ahead by a mile and fix nothing.
  const stops = projected
    .map(s => {
      const turn = s.turnoffBy && s.turnoffBy[route.id];
      if (!turn) return s;
      const w = towns.find(t => t.name === turn);
      if (!w) {
        console.warn(`turnoffBy: ${route.id} has no waypoint named "${turn}" for ${s.name}`);
        return s;
      }
      const atJunction = projected.filter(x =>
        x.offRoute < TURN_TOWN && Math.abs(x.mile - w.mile) <= TURN_TOWN);
      return { ...s, mile: atJunction.reduce((m, x) => Math.max(m, x.mile), w.mile) + 0.1, turnoff: turn };
    })
    // Same point on the road: what is ON the road comes before what is off it.
    .sort((a, b) => a.mile - b.mile || a.offRoute - b.offRoute);

  const built = { ...route, cum, miles: total, towns, stops };
  built.segs = segments(built);
  built.avgMph = averageMph(built);
  return built;
}

/// What a stop actually costs you: out, back, and time on the ground.
export function stopCost(stop) {
  const driving = (stop.detour || 0) * 2;
  return { driving, dwell: stop.dwell || 60, total: driving + (stop.dwell || 60) };
}

export function fmtMiles(m) {
  return Math.round(m).toLocaleString() + ' mi';
}

export function fmtHours(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
