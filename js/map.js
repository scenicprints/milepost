// The poster map. Drawn from lat/lon — no tiles, no network, no API key. That
// isn't an aesthetic choice: it's why the map still works between Needles and
// Flagstaff on one bar.
//
// ARCHITECTURE, and why it is this way:
//
// Poppy zooms correctly because it does not recompute anything while you zoom.
// It paints the map once and lets Flutter's InteractiveViewer apply a transform
// matrix on top. Three earlier attempts here recomputed the SVG viewBox on
// every pointer move, re-deriving label sizes and pin radii each frame — that
// is what made it jitter, and re-rendering mid-gesture destroyed the element
// holding pointer capture, which is what made it jump.
//
// So: the SVG is painted ONCE at a fixed viewBox, into a stage element. Pan and
// zoom only ever write a CSS transform on that stage. One string assignment,
// composited on the GPU, nothing recalculated. After a gesture settles we
// repaint once so label density and pin sizes are right for the new scale.

const LON0 = -125.5, LON1 = -66.5, LAT0 = 24, LAT1 = 49.6;
const KX = Math.cos(((LAT0 + LAT1) / 2) * Math.PI / 180);

export const MW = 1000;
export const MH = Math.round((MW * (LAT1 - LAT0)) / ((LON1 - LON0) * KX));

export function xy(ll) {
  return [
    ((ll[1] - LON0) / (LON1 - LON0)) * MW,
    ((LAT1 - ll[0]) / (LAT1 - LAT0)) * MH,
  ];
}

const poly = pts => pts.map((p, i) => (i ? "L" : "M") + xy(p).map(n => n.toFixed(3)).join(" ")).join(" ");

// ---------------------------------------------------------------- dark sky
//
// First attempt drew the Bortle zones as filled areas. On a map of a 5,900
// mile trip that is 45 grey specks under 12px wide plus three blobs — noise
// laid over the routes and pins, and Kevin called it unreadable, correctly.
//
// The question is not two-dimensional. It is "where along MY ROAD is the sky
// dark", which is a property of the line. So the road wears it: a dark casing
// under the route, heavier where the sky is darker. No legend to decode, and
// it cannot be confused with the signal colour, which still only ever means
// "in your plan".
const darkRuns = new Map();          // route id -> [{ bortle, pts }]

function bbox(ring) {
  let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
  for (const [y, x] of ring) {
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
  }
  return [y0, y1, x0, x1];
}

function inRing(ll, ring) {
  const [y, x] = ll;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/// Walk the road, find the darkest zone over each step, and return the runs.
/// Cached per route: it depends on the road and the data, never on the zoom.
function runsFor(route, zones) {
  const hit = darkRuns.get(route.id);
  if (hit) return hit;
  const boxed = zones.map(z => ({ z, b: bbox(z.ring) }));
  const pts = [];
  const w = route.waypoints;
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i].ll, b = w[i + 1].ll;
    const steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.08));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  pts.push(w[w.length - 1].ll);

  const cls = pts.map(p => {
    let best = null;
    for (const { z, b } of boxed) {
      if (p[0] < b[0] || p[0] > b[1] || p[1] < b[2] || p[1] > b[3]) continue;
      if ((best === null || z.bortle < best) && inRing(p, z.ring)) best = z.bortle;
    }
    return best;
  });

  // Samples are ~5.5 miles apart. Without this the road flickers in and out of
  // darkness every time it clips a zone edge, which draws as a row of dashes
  // and reads as noise. A stretch has to be long enough to actually drive
  // through before it earns a mark; anything shorter joins what came before.
  const MIN = 6;                                   // ~33 miles
  for (let i = 0; i < cls.length;) {
    let j = i;
    while (j < cls.length && cls[j] === cls[i]) j++;
    if (j - i < MIN && i > 0) {
      const fill = cls[i - 1];
      for (let k = i; k < j; k++) cls[k] = fill;
      i = j;
    } else i = j;
  }

  const runs = [];
  let cur = null, run = [];
  for (let i = 0; i < pts.length; i++) {
    if (cls[i] !== cur) {
      if (cur !== null && run.length > 1) { run.push(pts[i]); runs.push({ bortle: cur, pts: run }); }
      cur = cls[i]; run = [pts[i]];
    } else run.push(pts[i]);
  }
  if (cur !== null && run.length > 1) runs.push({ bortle: cur, pts: run });
  darkRuns.set(route.id, runs);
  return runs;
}

export const forgetDark = () => darkRuns.clear();
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/// Bounding box of a route and its stops, in stage units.
export function bounds(route) {
  const xs = [], ys = [];
  for (const q of route.waypoints.map(w => xy(w.ll)).concat(route.stops.map(s => xy(s.ll)))) {
    xs.push(q[0]); ys.push(q[1]);
  }
  const pad = 30;
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 60;
export const clampScale = s => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/// The transform that frames a box inside a panel of w x h screen pixels.
export function fitTransform(box, w, h) {
  const s = clampScale(Math.min(w / box.w, h / box.h));
  return {
    s,
    x: w / 2 - (box.x + box.w / 2) * s,
    y: h / 2 - (box.y + box.h / 2) * s,
  };
}

/// Everything is drawn at `px / scale` so it renders at `px` on screen for the
/// scale we are painting for. Repaint after a zoom and sizes are right again.
export function paint(usa, routes, active, opts = {}) {
  const { chosen = new Set(), seen = new Set(), alts = [], sky = [], pos = null, scale = 1, view = null } = opts;
  const u = 1 / scale;
  const n = k => (k * u).toFixed(2);

  // Only draw what can be seen, when we know what that is.
  const vis = view
    ? q => q[0] > view.x - 40 * u && q[0] < view.x + view.w + 40 * u &&
           q[1] > view.y - 40 * u && q[1] < view.y + view.h + 40 * u
    : () => true;

  const out = [];
  out.push('<path class="mland" d="' + poly(usa.outline) + ' Z" stroke-width="' + n(1) + '"/>');

  // Dark sky, painted straight onto the land and under everything else, so the
  // routes and pins stay readable on top of it. Darkness is drawn as darkness —
  // see js/darksky.js for why it is not the usual rainbow.
  // Darkness rides the road, drawn under everything so the route stays legible.
  for (const r of sky.length ? runsFor(active, sky) : [])
    out.push('<path class="mdark b' + r.bortle + '" d="' + poly(r.pts) +
      '" stroke-width="' + n(r.bortle === 2 ? 9 : 6) + '"><title>Bortle ' +
      r.bortle + (r.bortle === 2 ? " — the Milky Way has structure here"
                                 : " — Milky Way visible, some glow") + "</title></path>");

  if (scale < 2.2) for (const l of usa.labels) {
    const q = xy(l.ll);
    if (!vis(q)) continue;
    out.push('<text class="mstate" text-anchor="middle" x="' + q[0].toFixed(0) +
      '" y="' + q[1].toFixed(0) + '" font-size="' + n(9) + '">' + esc(l.t) + "</text>");
  }

  for (const r of routes)
    out.push('<path class="mroute" d="' + poly(r.waypoints.map(w => w.ll)) + '" stroke-width="' + n(2) + '"/>');

  // The road not taken. Dashed, and darker than the other legs' lines, because
  // it is the thing you are deciding about — you should be able to see where it
  // splits off and where it rejoins. Solid ink is always the way you are going.
  for (const r of alts)
    out.push('<path class="mroute alt" d="' + poly(r.waypoints.map(w => w.ll)) +
      '" stroke-width="' + n(1.8) + '" stroke-dasharray="' + n(7) + ' ' + n(5) + '"/>');

  out.push('<path class="mroute act" d="' + poly(active.waypoints.map(w => w.ll)) + '" stroke-width="' + n(2.6) + '"/>');

  // Stops that share a doorstep (Beale and Dyer's, Seligman and the Snow Cap)
  // would land on the same pixel and read as one pin. Anything closer than a
  // pin's width at this zoom is spread into a small ring around the shared
  // point — in screen units, so the ring stays the same size at every depth
  // and dissolves once real distance separates them.
  const spot = new Map();                       // stop id -> drawn position
  {
    const near = 14 * u, clusters = [];
    for (const st of active.stops) {
      const q = xy(st.ll);
      let home = null;
      for (const c of clusters)
        if (Math.hypot(q[0] - c.cx, q[1] - c.cy) < near) { home = c; break; }
      if (home) { home.m.push([st, q]); }
      else clusters.push({ cx: q[0], cy: q[1], m: [[st, q]] });
    }
    for (const c of clusters) {
      if (c.m.length === 1) { spot.set(c.m[0][0].id, c.m[0][1]); continue; }
      const rad = (c.m.length > 2 ? 9 : 6) * u;
      c.m.forEach(([st], i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / c.m.length;
        spot.set(st.id, [c.cx + rad * Math.cos(a), c.cy + rad * Math.sin(a)]);
      });
    }
  }

  for (const st of active.stops) {
    const q = spot.get(st.id);
    if (!vis(q)) continue;
    const on = chosen.has(st.id);
    out.push('<circle class="mpin' + (on ? " on" : "") + '" data-stop="' + st.id +
      '" cx="' + q[0].toFixed(3) + '" cy="' + q[1].toFixed(3) +
      '" r="' + n(on ? 6 : 4) + '" stroke-width="' + n(1.5) +
      '"><title>' + esc(st.name) + "</title></circle>");
  }

  // Names once there is room. Biggest stops win the space; nothing overlaps.
  const fs = 11 * u, placed = [];
  const order = active.stops.slice().sort((a, b) =>
    (b.big ? 1 : 0) - (a.big ? 1 : 0) ||
    (chosen.has(b.id) ? 1 : 0) - (chosen.has(a.id) ? 1 : 0));
  for (const st of order) {
    const q = spot.get(st.id) || xy(st.ll);
    if (!vis(q)) continue;
    const bx = q[0] + 9 * u, by = q[1] + 3.5 * u;
    const bw = st.name.length * fs * 0.5, bh = fs * 1.3;
    let clash = false;
    for (const b of placed)
      if (bx < b.x + b.w && bx + bw > b.x && by - bh < b.y && by > b.y - b.h) { clash = true; break; }
    if (clash) continue;
    placed.push({ x: bx, y: by, w: bw, h: bh });
    const tail = ' text-anchor="start" x="' + bx.toFixed(3) + '" y="' + by.toFixed(3) +
      '" font-size="' + fs.toFixed(2) + '">' + esc(st.name) + "</text>";
    out.push('<text class="mhalo" stroke-width="' + n(3) + '"' + tail);
    // Been there: struck through, the same mark Route and Days use. Not a
    // colour — the signal colour only ever means "this is in your plan".
    out.push('<text class="mlabel' + (seen.has(st.id) ? " seen" : "") + '"' + tail);
  }

  const hp = xy(routes[0].waypoints[0].ll), hs = 10 * u;
  out.push('<rect class="mhome" x="' + (hp[0] - hs / 2).toFixed(3) + '" y="' + (hp[1] - hs / 2).toFixed(3) +
    '" width="' + hs.toFixed(3) + '" height="' + hs.toFixed(3) + '"/>');

  if (pos) {
    const q = xy(pos);
    out.push('<circle class="mpos" cx="' + q[0].toFixed(3) + '" cy="' + q[1].toFixed(3) +
      '" r="' + n(7) + '" stroke-width="' + n(2.5) + '"/>');
  }

  return out.join("");
}
