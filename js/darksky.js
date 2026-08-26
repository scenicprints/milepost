// Where the sky is dark enough to sleep under.
//
// The framework only. `data/darksky.json` ships empty and the Sky button does
// not appear until it has zones — see the comment in that file for the schema
// and for why it is empty.
//
// ON COLOUR, because it is the one real design decision here. Every light
// pollution map in the world is a rainbow: black, blue, green, yellow, red,
// white. This app has exactly one colour and it means "this is in your plan".
// So darkness is drawn as darkness — a single wash, denser where the sky is
// darker — and the thing you are hunting for is the dark patch. No legend to
// decode, no colour that means something new, and it reads the same way in
// both themes because it is painted with a token that flips.

/// Bortle classes worth drawing. 5 and up is suburban sky; you will not see
/// the Milky Way, so painting it would only add noise.
export const DARKEST = 1;
export const FAINTEST = 4;

const num = v => (typeof v === 'number' && isFinite(v) ? v : null);

/// Reads whatever is in darksky.json and returns only the zones that are
/// actually drawable. Anything malformed is dropped and reported rather than
/// half-drawn, because a silently wrong polygon is a lie about where it is
/// safe to sleep.
export function load(raw) {
  const zones = [], problems = [];
  const list = (raw && Array.isArray(raw.zones)) ? raw.zones : [];

  list.forEach((z, i) => {
    const where = `zone ${i}${z && z.name ? ` (${z.name})` : ''}`;
    const bortle = num(z && z.bortle);
    if (bortle === null || bortle < DARKEST || bortle > FAINTEST)
      return problems.push(`${where}: bortle must be ${DARKEST}-${FAINTEST}, got ${z && z.bortle}`);
    if (!Array.isArray(z.ring) || z.ring.length < 3)
      return problems.push(`${where}: ring needs at least 3 points`);

    const ring = [];
    for (const p of z.ring) {
      const lat = num(p && p[0]), lon = num(p && p[1]);
      // [lat, lon], not GeoJSON's [lon, lat]. A swapped pair is the mistake to
      // expect when converting, and it is worth catching loudly here: no part
      // of this trip is outside these bounds.
      if (lat === null || lon === null || lat < 20 || lat > 55 || lon < -130 || lon > -60) {
        problems.push(`${where}: point out of range ${JSON.stringify(p)} — are lat and lon swapped?`);
        return;
      }
      ring.push([lat, lon]);
    }
    if (ring.length < 3) return;

    zones.push({ bortle: Math.round(bortle), name: String(z.name || ''), ring,
                 sqm: num(z && z.sqm), note: z && z.note ? String(z.note) : '' });
  });

  if (problems.length) console.warn('darksky.json:\n  ' + problems.join('\n  '));
  return { zones, source: (raw && raw.source) || null, problems };
}

/// Even-odd ray cast. Rings are small and there are few of them, so this is
/// cheap enough to call per stop or per overnight town.
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

/// The darkest zone covering a point, or null. Darkest wins where they overlap,
/// which is the honest answer: if two sources disagree you want the claim you
/// can check by looking up.
export function at(ll, zones) {
  let best = null;
  for (const z of zones)
    if (inRing(ll, z.ring) && (!best || z.bortle < best.bortle)) best = z;
  return best;
}
