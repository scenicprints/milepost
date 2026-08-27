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
  // The light pollution heat map. A raster, not shapes: a 25-mile band
  // contoured into polygons fragments into slivers, and twice that read as
  // noise. One image, drawn under the roads so they stay legible.
  if (sky && sky.image) {
    const [la0, la1, lo0, lo1] = sky.bounds;
    const tl = xy([la1, lo0]), br = xy([la0, lo1]);
    out.push('<image class="mheat" href="' + esc(sky.image) + '" x="' + tl[0].toFixed(2) +
      '" y="' + tl[1].toFixed(2) + '" width="' + (br[0] - tl[0]).toFixed(2) +
      '" height="' + (br[1] - tl[1]).toFixed(2) +
      '" preserveAspectRatio="none" image-rendering="optimizeQuality"/>');
  }

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
