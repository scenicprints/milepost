// Official warnings from the National Weather Service, on the road you are
// about to drive.
//
// The snow and rain map is a model; this is the forecaster's call. A Winter
// Storm Warning is the answer to "how bad is it" that a highway patrol will
// also be acting on. api.weather.gov is free, needs no key and allows browser
// requests. Warnings exist only a day or two ahead, so ui.js asks only about
// the days starting in the next three, at points along each day's road.
//
// Only what changes a drive is kept: winter storms, ice, blizzards, wind,
// dust, fog, floods and extreme cold. Marine, fire-weather and air-quality
// alerts are dropped.
const KEY = 'milepost.nws';
const TTL = 20 * 60 * 1000;
const KEEP = /^(Blizzard|Winter Storm|Ice Storm|Winter Weather|Snow Squall|Lake Effect Snow|Extreme Cold|Wind Chill|Cold Weather Advisory|High Wind|Wind Advisory|Dust Storm|Blowing Dust|Dense Fog|Freezing Fog|Freezing Rain|Flash Flood|Flood Warning)/;

let cache = null;
let inflight = null;
const load = () => {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { cache = {}; }
  return cache;
};
const save = () => {
  const c = load(), now = Date.now();
  for (const k of Object.keys(c)) if (now - c[k].at > 2 * 86400000) delete c[k];
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (_) {}
};
const keyOf = ll => `${(+ll[0]).toFixed(2)},${(+ll[1]).toFixed(2)}`;

async function fetchPoint(ll) {
  const r = await fetch(`https://api.weather.gov/alerts/active?point=${(+ll[0]).toFixed(4)},${(+ll[1]).toFixed(4)}`,
    { headers: { Accept: 'application/geo+json' } });
  if (!r.ok) throw new Error('nws ' + r.status);
  const j = await r.json();
  return (j.features || []).map(f => f.properties).filter(p => p && KEEP.test(p.event || '')).map(p => ({
    id: p.id, event: p.event,
    level: /Warning/.test(p.event) ? 'warning' : /Watch/.test(p.event) ? 'watch' : 'advisory',
    from: p.onset || p.effective, to: p.ends || p.expires, head: p.headline || '',
  }));
}

/// Bring these points up to date. Never throws.
export function refresh(points, { force = false } = {}) {
  if (inflight) return inflight;
  inflight = (async () => {
    const c = load(), now = Date.now();
    const want = [], seen = new Set();
    for (const ll of points) {
      const k = keyOf(ll);
      if (seen.has(k)) continue;
      seen.add(k);
      if (force || !c[k] || now - c[k].at > TTL) want.push([k, ll]);
    }
    let changed = 0, failed = 0;
    for (let i = 0; i < want.length; i += 4) {
      await Promise.all(want.slice(i, i + 4).map(async ([k, ll]) => {
        try {
          const a = await fetchPoint(ll);
          if (JSON.stringify(a) !== JSON.stringify((c[k] || {}).a)) changed++;
          c[k] = { at: now, a };
        } catch (_) { failed++; }
      }));
    }
    save();
    return { changed, failed };
  })().finally(() => { inflight = null; });
  return inflight;
}

/// The alerts at a point that are in force at some time on this date. The
/// window runs from early morning to past midnight in US time, in UTC.
export function at(ll, iso) {
  const hit = load()[keyOf(ll)];
  if (!hit) return [];
  const d0 = Date.parse(iso + 'T05:00:00Z'), d1 = d0 + 31 * 3600000;
  return hit.a.filter(a => {
    const f = Date.parse(a.from), t = Date.parse(a.to);
    return (isNaN(f) || f <= d1) && (isNaN(t) || t >= d0);
  });
}

const RANK = { warning: 0, watch: 1, advisory: 2 };
export const worstFirst = list => list.slice().sort((a, b) => RANK[a.level] - RANK[b.level]);
