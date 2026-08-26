// Turning a typed place into coordinates.
//
// Nominatim (OpenStreetMap): free, no key, CORS-open, and it handles street
// addresses — which matters, because most of what gets added here is a motel
// with an address rather than a town with a name.
//
// It is rate-limited to about one request a second and can be slow or refuse
// outright, so every call has a timeout and every failure is survivable: the
// editor always accepts a manual latitude and longitude, and "use my location"
// needs no network at all.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const TIMEOUT = 8000;

const cache = new Map();

export async function search(q) {
  const query = String(q || '').trim();
  if (query.length < 3) return [];
  if (cache.has(query)) return cache.get(query);

  const url = ENDPOINT + '?format=jsonv2&limit=5&countrycodes=us&addressdetails=1' +
    '&q=' + encodeURIComponent(query);

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    const out = j.map(x => ({
      label: shorten(x.display_name),
      full: x.display_name,
      ll: [parseFloat(x.lat), parseFloat(x.lon)],
      town: x.address?.city || x.address?.town || x.address?.village ||
            x.address?.hamlet || x.address?.county || '',
      state: STATES[x.address?.state] || '',
    }));
    cache.set(query, out);
    return out;
  } catch (_) {
    return null;                 // null means "couldn't ask", not "nothing found"
  } finally {
    clearTimeout(t);
  }
}

/// Nominatim returns the whole postal hierarchy; the first few parts are the
/// only ones anybody reads.
function shorten(s) {
  const parts = String(s).split(',').map(x => x.trim());
  return parts.slice(0, 3).join(', ');
}

const STATES = {
  Alabama: 'AL', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO',
  Florida: 'FL', Georgia: 'GA', Illinois: 'IL', Indiana: 'IN', Kansas: 'KS',
  Kentucky: 'KY', Louisiana: 'LA', Maryland: 'MD', Mississippi: 'MS', Missouri: 'MO',
  Nevada: 'NV', 'New Mexico': 'NM', 'North Carolina': 'NC', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'South Carolina': 'SC', Tennessee: 'TN', Texas: 'TX',
  Utah: 'UT', Virginia: 'VA', 'West Virginia': 'WV',
};
