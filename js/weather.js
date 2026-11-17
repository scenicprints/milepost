// What the weather will be where you are, on the day you are there.
//
// WHY THIS EXISTS. A very strong El Niño is running this winter, and it pushes
// the storm track south — over I-40, the Gulf and the canyon country, which is
// the trip. Kevin's ask: see the trip and see what the weather will look like
// at each spot on the date he will be there, and have it UPDATE as the
// forecasting changes.
//
// The hard part is lead time. A forecast only exists 16 days out, so a plain
// forecast tab would be blank until December. So there are three tiers, the
// best one available is used, and the screen always says which:
//
//   forecast   Open-Meteo's forecast, inside 16 days. A real number for the day.
//   seasonal   ECMWF's seasonal ensemble (SEAS5): 51 runs of the model out
//              about three months. Beyond two weeks no model knows the day, so
//              this is a SPREAD — the range the runs give, and how many of
//              them put rain or snow down. It is the tilt, not the day.
//   climate    No live data at all: the El Niño composite from
//              data/elnino.json, shipped with the app.
//
// Underneath every tier, always: what the five strongest El Niño winters were
// like at that exact place, against the normal. That is precomputed by
// tools/elnino.mjs because it is 33 winters of history per place.
//
// UPDATING. Forecasts go stale after 3 hours and the seasonal run after a day.
// refresh() fetches only what is stale, batched — Open-Meteo takes many places
// in one request — and the results are kept in localStorage as compact
// per-day summaries, not raw model output: 51 runs times 90 days times every
// place would not fit. Everything is served from that cache first, so this
// works with no signal and never blocks a screen. Requests carry coordinates
// of public stops and nothing else; no trip dates leave the phone.

const KEY = 'milepost.wx2';
const OLD_KEY = 'milepost.wx';                  // the shape before session 73
const TTL_FORECAST = 1000 * 60 * 60 * 3;
const TTL_SEASONAL = 1000 * 60 * 60 * 24;
const DROP_AFTER = 1000 * 60 * 60 * 24 * 21;   // forget places not asked about in three weeks
const FORECAST_DAYS = 16;
const SEASONAL_DAYS = 92;
const BATCH = 25;                              // places per request

// The same thresholds as tools/elnino.mjs, so a seasonal "wet" and an El Niño
// "wet" mean the same thing. Inches.
const WET = 0.04, SNOW = 0.4, HEAVY = 0.5;

const UNITS = '&temperature_unit=fahrenheit&precipitation_unit=inch&wind_speed_unit=mph&timezone=auto';

let ELNINO = null;
let cache = null;
let inflight = null;

/// Hand the module the shipped El Niño table, and clear the old cache shape.
export function init({ elnino } = {}) {
  ELNINO = elnino && elnino.places ? elnino : null;
  try { localStorage.removeItem(OLD_KEY); } catch (_) {}
}

// ------------------------------------------------------------------ cache
function load() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { cache = {}; }
  cache.f = cache.f || {};
  cache.s = cache.s || {};
  return cache;
}
function save() {
  const c = load();
  const now = Date.now();
  for (const tier of ['f', 's'])
    for (const [k, v] of Object.entries(c[tier]))
      if (now - (v.seen || v.at) > DROP_AFTER) delete c[tier][k];
  try { localStorage.setItem(KEY, JSON.stringify(c)); }
  catch (_) {
    // Out of room. The seasonal summaries are the big ones and the cheapest
    // to fetch again, so they go first.
    c.s = {};
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (__) {}
  }
}

/// Two decimal places is about a kilometre, which is finer than any model here.
export const keyOf = ll => `${(+ll[0]).toFixed(2)},${(+ll[1]).toFixed(2)}`;

async function json(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
const chunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
const coords = lls => `?latitude=${lls.map(l => (+l[0]).toFixed(3)).join(',')}`
  + `&longitude=${lls.map(l => (+l[1]).toFixed(3)).join(',')}`;
const many = body => (Array.isArray(body) ? body : [body]);

// ------------------------------------------------------------------ fetch
async function fetchForecast(lls) {
  const body = await json('https://api.open-meteo.com/v1/forecast' + coords(lls)
    + '&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,'
    + 'snowfall_sum,precipitation_probability_max,wind_gusts_10m_max'
    + `&forecast_days=${FORECAST_DAYS}` + UNITS);
  return many(body).map(x => {
    const d = x.daily || {};
    const r1 = a => (a || []).map(v => (v == null ? null : Math.round(v * 10) / 10));
    return {
      t0: d.time && d.time[0], n: (d.time || []).length,
      hi: r1(d.temperature_2m_max), lo: r1(d.temperature_2m_min),
      code: d.weather_code || [], p: r1(d.precipitation_sum), s: r1(d.snowfall_sum),
      pp: d.precipitation_probability_max || [], g: r1(d.wind_gusts_10m_max),
    };
  });
}

/// The 51 runs boiled down to what a person can use, per day: the 10th, 50th
/// and 90th percentile of the high and the low, and the share of runs that
/// were wet, snowy and heavy.
async function fetchSeasonal(lls) {
  const body = await json('https://seasonal-api.open-meteo.com/v1/seasonal' + coords(lls)
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum'
    + `&forecast_days=${SEASONAL_DAYS}` + UNITS);
  return many(body).map(x => {
    const d = x.daily || {};
    const members = base => Object.keys(d).filter(k => k === base || k.startsWith(base + '_member'));
    const M = {
      hi: members('temperature_2m_max'), lo: members('temperature_2m_min'),
      p: members('precipitation_sum'), s: members('snowfall_sum'),
    };
    const at = (keys, i) => keys.map(k => d[k][i]).filter(v => v != null);
    const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(f * s.length))]) : null; };
    const share = (a, f) => (a.length ? Math.round(100 * a.filter(f).length / a.length) : null);
    const days = (d.time || []).map((_, i) => {
      const hi = at(M.hi, i), lo = at(M.lo, i), p = at(M.p, i), s = at(M.s, i);
      return [q(hi, .1), q(hi, .5), q(hi, .9), q(lo, .1), q(lo, .5), q(lo, .9),
              share(p, v => v >= WET), share(s, v => v >= SNOW), share(p, v => v >= HEAVY)];
    });
    return { t0: d.time && d.time[0], n: days.length, runs: M.hi.length, d: days };
  });
}

/// Bring every place up to date, fetching only what is stale. `places` is a
/// list of { ll, need: { forecast, seasonal } }. Resolves to { changed, failed }
/// and never throws: no signal is the normal case in the desert.
export function refresh(places, { force = false } = {}) {
  if (inflight) return inflight;
  inflight = (async () => {
    const c = load();
    const now = Date.now();
    const want = { f: new Map(), s: new Map() };
    for (const p of places) {
      const k = keyOf(p.ll);
      for (const [tier, ttl, needed] of [['f', TTL_FORECAST, p.need?.forecast], ['s', TTL_SEASONAL, p.need?.seasonal]]) {
        if (!needed) continue;
        const hit = c[tier][k];
        if (hit) hit.seen = now;
        if (force || !hit || now - hit.at > ttl) want[tier].set(k, p.ll);
      }
    }
    let changed = 0, failed = 0;
    for (const [tier, fn] of [['f', fetchForecast], ['s', fetchSeasonal]]) {
      for (const part of chunks([...want[tier].entries()], BATCH)) {
        try {
          const got = await fn(part.map(([, ll]) => ll));
          part.forEach(([k], i) => { if (got[i] && got[i].t0) { c[tier][k] = { at: now, seen: now, v: got[i] }; changed++; } });
        } catch (_) { failed += part.length; }
      }
    }
    save();
    return { changed, failed };
  })().finally(() => { inflight = null; });
  return inflight;
}
export const busy = () => !!inflight;

/// When the cached answers were fetched: the oldest across the places asked
/// about, per tier, or null when nothing is cached.
export function freshness(lls) {
  const c = load();
  const oldest = tier => {
    let t = null;
    for (const ll of lls) { const h = c[tier][keyOf(ll)]; if (h && (t == null || h.at < t)) t = h.at; }
    return t;
  };
  return { forecast: oldest('f'), seasonal: oldest('s') };
}

// ------------------------------------------------------------------ dates
const DAY = 86400000;
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayIndex = (t0, iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(t0 + 'T00:00:00Z')) / DAY);
/// Days from today until `iso`, in the phone's own calendar.
export const leadDays = iso => dayIndex(isoToday(), iso);
/// Which tiers a date can use at all, so refresh() only asks for those.
export const needFor = iso => {
  const lead = leadDays(iso);
  return { forecast: lead >= 0 && lead < FORECAST_DAYS, seasonal: lead >= 0 && lead < SEASONAL_DAYS - 2 };
};

// ------------------------------------------------------------------ El Niño
/// The shipped El Niño rows for a place, keyed by stop id where there is one
/// and otherwise the nearest place within about 40 miles.
function placeFor(key, ll) {
  if (!ELNINO) return null;
  if (key && ELNINO.index[key] != null) return ELNINO.places[ELNINO.index[key]];
  if (!ll) return null;
  let best = null, bd = 40 / 69;
  for (const p of ELNINO.places) {
    const d = Math.hypot(p.ll[0] - ll[0], (p.ll[1] - ll[1]) * 0.82);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
// December and January laid end to end, so the nearest centre is a
// subtraction. Any other month is far from every centre, on purpose.
const seasonDay = md => {
  const m = md.slice(0, 2), d = Number(md.slice(3));
  return m === '12' ? d : m === '01' ? 31 + d : 1000;
};

/// Normal and El Niño statistics for the 15 days around `iso`, as objects.
/// `near` is false when the date is more than four days from every centre,
/// which means the trip moved outside the window the table was built for.
export function climate(key, ll, iso) {
  const p = placeFor(key, ll);
  if (!p || !iso) return null;
  const sd = seasonDay(iso.slice(5));
  let ci = 0, bd = Infinity;
  ELNINO.centres.forEach((c, i) => { const d = Math.abs(seasonDay(c) - sd); if (d < bd) { bd = d; ci = i; } });
  const obj = row => Object.fromEntries(ELNINO.fields.map((f, i) => [f, row[i]]));
  return { normal: obj(p.n[ci]), nino: obj(p.e[ci]), centre: ELNINO.centres[ci], near: bd <= 4, analogs: ELNINO.analogs };
}
export const analogs = () => (ELNINO ? ELNINO.analogs : []);

// ------------------------------------------------------------------ picture
/// The best answer for one place on one date, and which tier it came from.
///
/// Every tier fills the same shape so a screen can draw any of them:
///   hi, lo        a single number (forecast), the median (seasonal), or the
///                 El Niño mean (climate)
///   hiR, loR      the 10th-90th percentile spread, seasonal only
///   wet, snow, heavy   percent: chance of precipitation (forecast), share of
///                 runs (seasonal), share of days in El Niño years (climate)
///   snowIn, rainIn, gust, words   forecast only
///   at            when it was fetched
///   clim          climate(), whenever the place is in the table
export function picture(key, ll, iso) {
  if (!iso || !ll) return null;
  const c = load();
  const k = keyOf(ll);
  const lead = leadDays(iso);
  const clim = climate(key, ll, iso);

  const f = c.f[k];
  if (f && lead >= 0 && lead < FORECAST_DAYS) {
    const i = dayIndex(f.v.t0, iso);
    if (i >= 0 && i < f.v.n && f.v.hi[i] != null) {
      const s = f.v.s[i] || 0, p = f.v.p[i] || 0;
      return {
        tier: 'forecast', lead, at: f.at, clim,
        hi: Math.round(f.v.hi[i]), lo: Math.round(f.v.lo[i]),
        wet: f.v.pp[i] ?? (p >= WET ? 100 : 0),
        snow: s >= SNOW ? 100 : 0, heavy: p >= HEAVY ? 100 : 0,
        snowIn: s, rainIn: p, gust: f.v.g[i] != null ? Math.round(f.v.g[i]) : null,
        words: describe(f.v.code[i]),
      };
    }
  }

  const s = c.s[k];
  if (s) {
    const i = dayIndex(s.v.t0, iso);
    if (i >= 0 && i < s.v.n && s.v.d[i] && s.v.d[i][1] != null) {
      const [h1, h5, h9, l1, l5, l9, wet, snow, heavy] = s.v.d[i];
      return {
        tier: 'seasonal', lead, at: s.at, clim, runs: s.v.runs,
        hi: h5, lo: l5, hiR: [h1, h9], loR: [l1, l9], wet, snow, heavy,
      };
    }
  }

  if (clim) {
    const e = clim.nino;
    return { tier: 'climate', lead, at: null, clim, hi: e.hi, lo: e.lo, wet: e.wet, snow: e.snow, heavy: e.heavy };
  }
  return null;
}

/// Plain words, because a pictogram of sleet helps nobody pack.
export function describe(code) {
  if (code == null) return '';
  if (code === 0) return 'clear';
  if (code <= 2) return 'mostly clear';
  if (code === 3) return 'overcast';
  if (code >= 45 && code <= 48) return 'fog';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code >= 56 && code <= 57) return 'freezing drizzle';
  if (code >= 61 && code <= 65) return 'rain';
  if (code >= 66 && code <= 67) return 'freezing rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'showers';
  if (code >= 85 && code <= 86) return 'snow showers';
  if (code >= 95) return 'thunderstorms';
  return '';
}
