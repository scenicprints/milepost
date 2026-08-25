// The poster map. Drawn entirely from lat/lon — no tiles, no network, no API
// key. That isn't an aesthetic choice: it's why the map still works between
// Needles and Flagstaff on one bar.
//
// Everything on it is sized in SCREEN pixels and converted to user units by
// u = viewBoxWidth / renderedWidth. Sizing by 1/sqrt(zoom), which this used to
// do, grows without limit as you zoom in — that's how a label once ended up
// wider than the entire viewport.

// Equirectangular over the lower 48. A degree of longitude is only
// cos(latitude) as wide as a degree of latitude, so the canvas height is
// derived rather than guessed.
const LON0 = -125.5, LON1 = -66.5, LAT0 = 24, LAT1 = 49.6;
const KX = Math.cos(((LAT0 + LAT1) / 2) * Math.PI / 180);

export const MW = 1000;
export const MH = Math.round((MW * (LAT1 - LAT0)) / ((LON1 - LON0) * KX));

/// Nominal rendered width in CSS pixels. Only used to convert screen sizes
/// into user units, so being a little off just nudges label size.
const PXW = 360;

export function xy(ll) {
  return [
    ((ll[1] - LON0) / (LON1 - LON0)) * MW,
    ((LAT1 - ll[0]) / (LAT1 - LAT0)) * MH,
  ];
}

const poly = pts => pts.map((p, i) => (i ? "L" : "M") + xy(p).map(n => n.toFixed(1)).join(" ")).join(" ");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export const ASPECT = 1.28;

/// The box that frames one route, padded, at the panel's aspect ratio.
export function fitView(route) {
  const xs = [], ys = [];
  for (const q of route.waypoints.map(w => xy(w.ll)).concat(route.stops.map(s => xy(s.ll)))) {
    xs.push(q[0]); ys.push(q[1]);
  }
  const pad = 34;
  let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  let y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  let w = x1 - x0, h = y1 - y0;
  if (w / h < ASPECT) { const nw = h * ASPECT; x0 -= (nw - w) / 2; w = nw; }
  else { const nh = w / ASPECT; y0 -= (nh - h) / 2; h = nh; }
  return { x: x0, y: y0, w, h };
}

const MIN_W = 24, MAX_W = MW * 1.6;

/// Zoom about a point, clamped so the map can't be lost.
export function zoomView(v, k, ax, ay) {
  const cx = ax == null ? v.x + v.w / 2 : ax;
  const cy = ay == null ? v.y + v.h / 2 : ay;
  let w = v.w / k, h = v.h / k;
  if (w < MIN_W) { w = MIN_W; h = w / ASPECT; }
  if (w > MAX_W) { w = MAX_W; h = w / ASPECT; }
  return { x: cx - (cx - v.x) * (w / v.w), y: cy - (cy - v.y) * (h / v.h), w, h };
}

/// `routes` are drawn faintly (the whole trip); `active` is drawn in ink with
/// its stops as pins.
export function render(usa, routes, active, opts = {}) {
  const { view, chosen = new Set(), pos = null } = opts;
  const v = view || fitView(active);
  const u = v.w / PXW;
  const s = n => (n * u).toFixed(2);
  const zoom = MW / v.w;
  const inView = q =>
    q[0] > v.x - v.w * 0.1 && q[0] < v.x + v.w * 1.1 &&
    q[1] > v.y - v.h * 0.1 && q[1] < v.y + v.h * 1.1;

  const out = [];
  out.push('<svg class="mapsvg" id="msvg" viewBox="' +
    [v.x, v.y, v.w, v.h].map(n => n.toFixed(1)).join(" ") +
    '" role="img" aria-label="Map of the trip with the current leg emphasised">');
  out.push('<path class="mland" d="' + poly(usa.outline) + ' Z" stroke-width="' + s(1) + '"/>');

  if (zoom < 2.6) for (const l of usa.labels) {
    const q = xy(l.ll);
    if (!inView(q)) continue;
    out.push('<text class="mstate" text-anchor="middle" x="' + q[0].toFixed(0) +
      '" y="' + q[1].toFixed(0) + '" font-size="' + s(9) + '">' + esc(l.t) + "</text>");
  }

  for (const r of routes)
    out.push('<path class="mroute" d="' + poly(r.waypoints.map(w => w.ll)) + '" stroke-width="' + s(2) + '"/>');
  out.push('<path class="mroute act" d="' + poly(active.waypoints.map(w => w.ll)) + '" stroke-width="' + s(2.6) + '"/>');

  for (const st of active.stops) {
    const q = xy(st.ll);
    if (!inView(q)) continue;
    const on = chosen.has(st.id);
    out.push('<circle class="mpin' + (on ? " on" : "") + '" data-stop="' + st.id +
      '" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) +
      '" r="' + s(on ? 6 : 4) + '" stroke-width="' + s(1.5) +
      '"><title>' + esc(st.name) + "</title></circle>");
  }

  // Names once there's room, biggest first, and never overlapping.
  if (zoom > 3.2) {
    const fs = 11 * u, placed = [];
    const order = active.stops.slice().sort((a, b) =>
      (b.big ? 1 : 0) - (a.big ? 1 : 0) ||
      (chosen.has(b.id) ? 1 : 0) - (chosen.has(a.id) ? 1 : 0));
    for (const st of order) {
      const q = xy(st.ll);
      if (!inView(q)) continue;
      const bx = q[0] + 9 * u, by = q[1] + 3.5 * u;
      const bw = st.name.length * fs * 0.5, bh = fs * 1.3;
      if (bw > v.w * 0.62) continue;
      let clash = false;
      for (const b of placed)
        if (bx < b.x + b.w && bx + bw > b.x && by - bh < b.y && by > b.y - b.h) { clash = true; break; }
      if (clash) continue;
      placed.push({ x: bx, y: by, w: bw, h: bh });
      const tail = ' text-anchor="start" x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) +
        '" font-size="' + fs.toFixed(2) + '">' + esc(st.name) + "</text>";
      out.push('<text class="mhalo" stroke-width="' + s(3) + '"' + tail);
      out.push('<text class="mlabel"' + tail);
    }
  }

  const hp = xy(routes[0].waypoints[0].ll), hs = 10 * u;
  out.push('<rect class="mhome" x="' + (hp[0] - hs / 2).toFixed(1) + '" y="' + (hp[1] - hs / 2).toFixed(1) +
    '" width="' + hs.toFixed(1) + '" height="' + hs.toFixed(1) + '"/>');

  if (pos) {
    const q = xy(pos);
    out.push('<circle class="mpos" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) +
      '" r="' + s(7) + '" stroke-width="' + s(2.5) + '"/>');
  }

  out.push("</svg>");
  return out.join("");
}
