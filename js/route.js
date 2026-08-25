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

/// Decorate a route with measurements and its stops, in road order.
/// A stop more than MAX_OFF miles from the pavement is dropped — that
/// means the route was swapped and this stop no longer belongs.
const MAX_OFF = 140;

export function buildRoute(route, allStops) {
  const { cum, total } = measure(route.waypoints);
  const towns = route.waypoints.map((w, i) => ({ ...w, mile: cum[i] }));

  const stops = allStops
    .filter(s => s.routes.includes(route.id))
    .map(s => {
      const p = project(s.ll, route.waypoints, cum);
      return { ...s, mile: p.mile, offRoute: p.off };
    })
    .filter(s => s.offRoute < MAX_OFF)
    .sort((a, b) => a.mile - b.mile);

  return { ...route, cum, miles: total, towns, stops };
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
