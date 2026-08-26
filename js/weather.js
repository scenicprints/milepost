// Open-Meteo. Free, no key, CORS-friendly.
//
// Two different questions, two different endpoints:
//
//   Close to the trip — a real forecast. Only exists inside ~16 days, which
//   means it does nothing until December. Used when the planned date is in
//   range.
//
//   Right now — what late December is actually like there. The archive
//   endpoint gives real recorded weather, so we average the same calendar
//   window across recent years and get honest normals. That replaces the
//   hand-assigned numbers in data/extras.json, which were my estimates.
//
// Everything is cached in localStorage with a timestamp and served from cache
// first, so this never blocks and never fails the app when there's no signal.
// The service worker deliberately ignores cross-origin requests, so these do
// not touch it either way.

const KEY = 'milepost.wx';
const YEARS = 5;
const TTL_NORMALS = 1000 * 60 * 60 * 24 * 120;   // normals barely move
const TTL_FORECAST = 1000 * 60 * 60 * 3;

let cache = null;
function load() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch (_) { cache = {}; }
  return cache;
}
function put(k, v) {
  const c = load();
  c[k] = { at: Date.now(), v };
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (_) {}
}
function get(k, ttl) {
  const hit = load()[k];
  if (!hit) return null;
  return { stale: Date.now() - hit.at > ttl, ...hit };
}

const key = (kind, ll) => `${kind}:${ll[0].toFixed(2)},${ll[1].toFixed(2)}`;
const F = c => c * 9 / 5 + 32;

async function json(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}

/// True recorded normals for the trip window, averaged over recent years.
/// Returns { hi, lo, years } in Fahrenheit, or null.
export async function normals(ll, { from = '12-18', to = '01-06' } = {}) {
  const k = key('n', ll);
  const hit = get(k, TTL_NORMALS);
  if (hit && !hit.stale) return hit.v;

  const nowY = new Date().getFullYear();
  const ranges = [];
  for (let i = 1; i <= YEARS; i++) {
    // The window straddles New Year, so each sample starts in the prior year.
    ranges.push([`${nowY - i}-${from}`, `${nowY - i + 1}-${to}`]);
  }
  try {
    const results = await Promise.all(ranges.map(([a, b]) => json(
      'https://archive-api.open-meteo.com/v1/archive' +
      `?latitude=${ll[0]}&longitude=${ll[1]}&start_date=${a}&end_date=${b}` +
      '&daily=temperature_2m_max,temperature_2m_min&timezone=auto')));
    let his = [], los = [];
    for (const r of results) {
      his = his.concat((r.daily?.temperature_2m_max || []).filter(x => x != null));
      los = los.concat((r.daily?.temperature_2m_min || []).filter(x => x != null));
    }
    if (!his.length) throw new Error('no data');
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const v = { hi: Math.round(F(avg(his))), lo: Math.round(F(avg(los))), years: YEARS, real: true };
    put(k, v);
    return v;
  } catch (_) {
    return hit ? hit.v : null;      // stale beats nothing
  }
}

/// The forecast for one date, if it is close enough to exist.
/// Returns { hi, lo, code, date } or null.
export async function forecast(ll, isoDate) {
  if (!isoDate) return null;
  const days = Math.ceil((new Date(isoDate + 'T12:00:00') - Date.now()) / 86400000);
  if (days < 0 || days > 15) return null;

  const k = key('f', ll);
  const hit = get(k, TTL_FORECAST);
  let daily = hit && !hit.stale ? hit.v : null;

  if (!daily) {
    try {
      const r = await json(
        'https://api.open-meteo.com/v1/forecast' +
        `?latitude=${ll[0]}&longitude=${ll[1]}` +
        '&daily=temperature_2m_max,temperature_2m_min,weather_code' +
        '&temperature_unit=fahrenheit&forecast_days=16&timezone=auto');
      daily = r.daily;
      put(k, daily);
    } catch (_) {
      daily = hit ? hit.v : null;
    }
  }
  if (!daily || !daily.time) return null;

  const i = daily.time.indexOf(isoDate);
  if (i < 0) return null;
  return {
    date: isoDate,
    hi: Math.round(daily.temperature_2m_max[i]),
    lo: Math.round(daily.temperature_2m_min[i]),
    code: daily.weather_code ? daily.weather_code[i] : null,
  };
}

/// Plain words, because a pictogram of sleet helps nobody pack.
export function describe(code) {
  if (code == null) return '';
  if (code === 0) return 'clear';
  if (code <= 2) return 'mostly clear';
  if (code === 3) return 'overcast';
  if (code >= 45 && code <= 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'showers';
  if (code >= 85 && code <= 86) return 'snow showers';
  if (code >= 95) return 'thunderstorms';
  return '';
}
