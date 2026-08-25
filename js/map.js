// The poster map. Drawn entirely from lat/lon — no tiles, no network, no
// API key. That's not an aesthetic choice: it's why the map still works
// between Needles and Flagstaff with one bar of signal.

// Equirectangular over the lower 48. A degree of longitude is only
// cos(latitude) as wide as a degree of latitude, so the canvas height is
// derived from that rather than guessed — otherwise the country comes out
// stretched and the viewBox carries dead space.
const LON0 = -125.5, LON1 = -66.5, LAT0 = 24.0, LAT1 = 49.6;
const KX = Math.cos((((LAT0 + LAT1) / 2) * Math.PI) / 180);

const W = 1000;
const H = Math.round((W * (LAT1 - LAT0)) / ((LON1 - LON0) * KX));

export { W, H };

export function xy(ll) {
  const [lat, lon] = ll;
  return [
    ((lon - LON0) / (LON1 - LON0)) * W,
    ((LAT1 - lat) / (LAT1 - LAT0)) * H,
  ];
}

const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + xy(p).map(n => n.toFixed(1)).join(' ')).join(' ');

/// Draws the whole country with one route on it.
/// `pos` is an optional [lat, lon] for the you-are-here marker.
export function render(usa, route, opts = {}) {
  const { chosen = new Set(), pos = null, focusStopId = null } = opts;
  const stops = route.stops;

  const towns = route.towns.filter((t, i) =>
    i === 0 || i === route.towns.length - 1 || t.risk || t.elev >= 3500 || i % 3 === 0);

  const svg = [];
  svg.push(`<svg viewBox="0 0 ${W} ${H}" class="map-svg" xmlns="http://www.w3.org/2000/svg">`);

  // land
  svg.push(`<path d="${path(usa.outline)} Z" class="m-land"/>`);

  // state labels
  for (const l of usa.labels) {
    const [x, y] = xy(l.ll);
    svg.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="m-state">${l.t}</text>`);
  }

  // the road — a casing under a bright line, the way a real map draws it
  const rp = path(route.waypoints.map(w => w.ll));
  svg.push(`<path d="${rp}" class="m-road-case"/>`);
  svg.push(`<path d="${rp}" class="m-road"/>`);

  // risk markers sit on the road itself
  for (const t of route.towns.filter(t => t.risk)) {
    const [x, y] = xy(t.ll);
    svg.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" class="m-risk m-risk-${t.risk}"/>`);
  }

  // towns
  for (const t of towns) {
    const [x, y] = xy(t.ll);
    svg.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" class="m-town"/>`);
    svg.push(`<text x="${(x + 5).toFixed(1)}" y="${(y - 5).toFixed(1)}" class="m-townlabel">${t.name}</text>`);
  }

  // stops — chosen ones filled and larger, the rest hollow
  for (const s of stops) {
    const [x, y] = xy(s.ll);
    const on = chosen.has(s.id);
    const cls = ['m-stop', on ? 'on' : 'off', s.first ? 'first' : '', s.id === focusStopId ? 'focus' : ''].join(' ');
    svg.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 5.5 : 3.4}" class="${cls}" data-stop="${s.id}"><title>${esc(s.name)}</title></circle>`
    );
  }

  // home star
  const [hx, hy] = xy(route.waypoints[0].ll);
  svg.push(`<path d="${star(hx, hy, 9)}" class="m-home"><title>Modesto</title></path>`);

  if (pos) {
    const [px, py] = xy(pos);
    svg.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9" class="m-pos-halo"/>`);
    svg.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" class="m-pos"/>`);
  }

  svg.push('</svg>');
  return svg.join('');
}

function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.42 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
