// Where the sky is dark enough to pull off and sleep.
//
// TWO EARLIER ATTEMPTS FAILED, so that nobody rebuilds them:
//   1. Bortle zones as filled polygons. On a map of a 5,900 mile trip, 45 of
//      60 rendered under 12 pixels wide. Specks over the routes and pins.
//   2. Darkness drawn along the route line instead. Readable, but it answers
//      the wrong question — you cannot sleep on the interstate, so a stripe on
//      the road tells you nothing about where to pull off.
//
// What Kevin actually asked for: a HEAT MAP, covering everywhere within 30
// minutes' drive of the route, so he can find somewhere dark to stop for the
// night. Brightness is a continuous field, and a 25-mile-wide band contoured
// into shapes is all slivers — so it ships as an image, `data/darksky.png`,
// drawn as one <image> under the roads. No geometry, no fragmentation, and it
// stays sharp because the map repaints its viewBox at every zoom.
//
// This file no longer validates polygons. It reads the sidecar: the image
// bounds, and each stop's brightness sampled straight from the source raster
// at its own coordinates — exact, rather than "which blob is it inside".

const WORDS = {
  1: 'No light pollution at all. The Milky Way casts a shadow.',
  2: 'Truly dark. The Milky Way is structured enough to see detail in it.',
  3: 'Rural. The Milky Way is obvious, with some glow on the horizon.',
  4: 'Rural edge. The Milky Way is there but washed out overhead.',
  5: 'Suburban. You will see the brightest constellations and little else.',
  6: 'Bright suburb. No Milky Way, and the sky glows grey.',
  7: 'Suburban to city. Only the brightest stars get through.',
  8: 'City. A few dozen stars on a good night.',
  9: 'Inner city. The Moon and the planets, and that is the lot.',
};
export const describe = b => WORDS[b] || '';

/// True when the sky is worth stopping for.
export const worthIt = b => b <= 3;

/// Reads data/darksky.json. Returns null when there is nothing to draw, which
/// keeps the Sky button off the map rather than showing an empty layer.
export function load(raw) {
  if (!raw || !raw.image || !Array.isArray(raw.bounds) || raw.bounds.length !== 4)
    return null;
  const [la0, la1, lo0, lo1] = raw.bounds.map(Number);
  if (![la0, la1, lo0, lo1].every(v => isFinite(v)) || la1 <= la0 || lo1 <= lo0) {
    console.warn('darksky.json: bounds look wrong', raw.bounds);
    return null;
  }
  return {
    // A bare filename is served from data/; the artifact bundler swaps in a
    // data: URI, which is passed through untouched.
    image: /^data:|^https?:\/\//.test(String(raw.image))
      ? String(raw.image)
      : 'data/' + String(raw.image).replace(/[^\w.-]/g, ''),
    bounds: [la0, la1, lo0, lo1],
    stops: (raw.stops && typeof raw.stops === 'object') ? raw.stops : {},
    source: raw.source || null,
  };
}

/// The reading for one stop, or null. Sampled at build time from the raster.
export function at(id, sky) {
  const hit = sky && sky.stops ? sky.stops[id] : null;
  return hit && typeof hit.bortle === 'number' ? hit : null;
}
