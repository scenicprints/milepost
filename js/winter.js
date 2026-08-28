// When it is safe to cross the high ground, by time of day.
//
// The rule, in Kevin's words: assume it snows. Do not plan around whether a
// storm arrives — plan around being BEHIND THE PLOWS AND IN DAYLIGHT. Crews
// work around the clock during a storm aiming to have priority routes clear
// for the morning commute, so the mistake is leaving at 4am to get a jump on
// the day. The road you want is the same road four hours later.
//
// So a crossing window is the later of:
//   * when that road is normally clear behind the plows (data/winter.json)
//   * first light, plus a margin, because a plowed road you cannot see is
//     still no good, and drifting undoes a clear road within the hour
// and it shuts at dusk, minus the same margin.
//
// Sunrise and sunset are COMPUTED, not stored, so the window is right for
// whatever departure date gets picked and wherever on the road you are. In
// late December that daylight is short — about nine and a half hours at
// Flagstaff — and it is usually the binding constraint, not the plows.

const DEG = Math.PI / 180;
const MARGIN_MIN = 45;        // no crossing in the first or last 45 min of light

// NOAA's low-precision solar position algorithm, in the standard Julian form.
// Written out rather than hand-simplified: the first attempt folded the
// longitude term in twice and skipped rounding the Julian cycle, which put
// sunrise out by seven hours in a way that grew with longitude — the kind of
// wrong that still looks like a time.
const J1970 = 2440588, J2000 = 2451545, OBLIQ = 23.4397 * DEG;
const toDays = date => date.valueOf() / 86400000 - 0.5 + J1970 - J2000;
const meanAnomaly = d => DEG * (357.5291 + 0.98560028 * d);
const eclipticLon = M =>
  M + DEG * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
    + DEG * 102.9372 + Math.PI;
const declination = L => Math.asin(Math.sin(OBLIQ) * Math.sin(L));
const transit = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

/// Sunrise and sunset in MINUTES AFTER UTC MIDNIGHT, or null in a polar
/// day/night. The caller applies the timezone: this trip crosses four of them
/// and Arizona does not keep DST, so guessing from longitude would be wrong.
export function daylight(date, lat, lon) {
  const lw = -lon * DEG, phi = lat * DEG;
  const d = toDays(date);
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = meanAnomaly(ds), L = eclipticLon(M), dec = declination(L);
  const noon = transit(ds, M, L);

  const cosH = (Math.sin(-0.833 * DEG) - Math.sin(phi) * Math.sin(dec)) /
               (Math.cos(phi) * Math.cos(dec));
  if (cosH >= 1 || cosH <= -1) return null;
  const w = Math.acos(cosH);
  const set = transit(0.0009 + (w + lw) / (2 * Math.PI) + n, M, L);
  const rise = noon - (set - noon);

  const utcMin = j => {
    const t = new Date((j + 0.5 - J1970) * 86400000);
    return t.getUTCHours() * 60 + t.getUTCMinutes();
  };
  return { rise: utcMin(rise), set: utcMin(set) };
}

const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const mins = t => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
};

/// Index winter.json by the waypoint name it belongs to.
export function load(raw) {
  const by = new Map();
  for (const p of (raw && raw.points) || []) by.set(p.name, p);
  return by;
}

/// The window for crossing one risk point on one date.
///
/// Returns { open, shut, why, tight } in minutes after local midnight, or null
/// when the day never opens at all. `why` names whichever constraint is doing
/// the work, because "wait for the plows" and "wait for the light" want
/// different reactions from you.
export function window(point, date, ll) {
  const d = daylight(date, ll[0], ll[1]);
  if (!d) return null;
  // UTC -> local standard time. December, so no DST anywhere on this trip.
  const tz = (point.tz || 0) * 60;
  const wrap = m => ((m + tz) % 1440 + 1440) % 1440;
  d.rise = wrap(d.rise); d.set = wrap(d.set);
  const light = d.rise + MARGIN_MIN;
  const plowed = point.plowedBy ? mins(point.plowedBy) : 0;
  const open = Math.max(light, plowed);
  const shut = d.set - MARGIN_MIN;
  if (shut <= open) return null;
  return {
    open, shut,
    openAt: hhmm(open), shutAt: hhmm(shut),
    rise: hhmm(d.rise), set: hhmm(d.set),
    why: plowed > light ? 'plows' : 'light',
    hours: +((shut - open) / 60).toFixed(1),
    tight: (shut - open) < 6 * 60,
  };
}

/// Does a crossing at `atMin` sit inside the window? Returns the reason it
/// does not, in plain words, because a boolean is no use on a planning screen.
export function verdict(point, date, ll, atMin) {
  const w = window(point, date, ll);
  if (!w) return { ok: false, text: 'No usable daylight here on this date.' };
  if (atMin < w.open) {
    return {
      ok: false, w,
      text: w.why === 'plows'
        ? `Too early. ${point.name} is normally clear behind the plows by ${w.openAt}; before that you are ahead of them.`
        : `Too early. First light is ${w.rise}, so ${w.openAt} is the earliest worth crossing ${point.name}.`,
    };
  }
  if (atMin > w.shut)
    return { ok: false, w, text: `Too late. Dark falls at ${w.set}, and ${point.name} is no place to be after it.` };
  return { ok: true, w, text: `Good. ${point.name} is inside its window, ${w.openAt} to ${w.shutAt}.` };
}
