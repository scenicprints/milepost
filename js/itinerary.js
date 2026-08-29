// The itinerary: an ordered list of stops with a clock running down it.
//
// WHAT THIS ANSWERS, in Kevin's words: "I want to place the order of places and
// it calculates how long it will take to get there and how long I am expected
// to be there. And there is an overall trip time, and then each spot says when
// I should arrive to it. And it gives me information of opening time, closing
// time, and optimal time to be there."
//
// So: give it a route, the chosen stop ids, and a departure date and time. It
// walks the road in order and returns one row per stop carrying the arrival
// clock, the departure clock, what the place's hours are on THAT weekday, and
// whether the arrival actually works.
//
// HOW THE ORDER IS DECIDED. Not by hand. The stops sit on a road, and a road
// has one direction, so the order is the order they occur along it — `mile`,
// which buildRoute already computed by projecting each stop onto the route
// polyline. Dragging stops into a different sequence would only describe
// driving backwards. What you choose is which stops are IN, and how long you
// linger; geography does the rest.
//
// THE DAY MODEL. **A day ends where you put a sleep, and nowhere else.** An
// earlier version broke the day by itself whenever the clock ran past dusk and
// resumed at the next morning's crossing window. That was tidy and it was
// wrong: it invented a bedtime nobody chose, in a town nobody picked, and the
// schedule it printed was not the trip. Now the clock runs straight through
// until it reaches a sleep placed after a stop, so if you drive to 02:00 it
// says 02:00 and flags the dark rather than quietly hiding it in a day break.
//
// A sleep is a DURATION, not a place. It hangs off the stop it follows, and it
// is the one thing here that moves the calendar. Everything js/winter.js knows
// about plows and first light is still computed and still shown, but as advice
// on either side of your night rather than as a rule that overrides it: wake
// before the road opens and you are told so, in the terms that made you care
// about it in the first place.
//
// TIME IS KEPT IN MINUTES from the trip's first midnight, one integer per
// event. Dates and clock faces are formatting concerns, applied at the edge.

import { stopCost, driveMinutes, tzAtMile } from './route.js';
import * as winter from './winter.js';

const MIN_PER_DAY = 1440;
const hhmm = m => {
  const t = ((m % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
};
const toMin = t => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
};
const mmdd = d => String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');

/// The hours for one stop on one weekday, or null when nobody has checked.
/// A missing entry is UNCHECKED, never "open all hours" — the difference
/// matters, because one is a fact and the other is a guess.
export function hoursFor(HOURS, id, date) {
  const h = HOURS && HOURS.stops ? HOURS.stops[id] : null;
  if (!h) return null;
  const day = date.getUTCDay();
  const closedToday = Array.isArray(h.closed) && h.closed.includes(day);
  const shutToday = Array.isArray(h.shut) && h.shut.includes(mmdd(date));
  return {
    open: h.open ? toMin(h.open) : null,
    close: h.close ? toMin(h.close) : null,
    openAt: h.open || null,
    closeAt: h.close || null,
    best: h.best || null,
    why: h.why || '',
    closedToday, shutToday,
    shut: closedToday || shutToday,
  };
}

/// The window a stop is actually worth being in, narrower than its opening
/// hours. `best` is a word, and turning it into a clock needs the date and the
/// place, because "after dark" is 17:16 at the Grand Canyon in December and a
/// different hour in Houston.
export function bestWindow(h, sun) {
  if (!h || !h.best || !sun) return null;
  const dusk = sun.set, dawn = sun.rise;
  switch (h.best) {
    case 'dark':    return { from: dusk, to: Math.min(h.close ?? 1439, dusk + 240) };
    case 'golden':  return { from: Math.max(h.open ?? 0, dusk - 90), to: Math.min(h.close ?? 1439, dusk + 20) };
    case 'morning': return { from: Math.max(h.open ?? 0, dawn), to: Math.min(h.close ?? 1439, 12 * 60) };
    case 'early':   return { from: h.open ?? dawn, to: (h.open ?? dawn) + 90 };
    case 'lunch':   return { from: Math.max(h.open ?? 0, 11 * 60), to: Math.min(h.close ?? 1439, 14 * 60) };
    case 'evening': return { from: Math.max(h.open ?? 0, dusk - 60), to: h.close ?? 1439 };
    default:        return null;
  }
}

/// Minutes of driving between two points on the road. The pace is the road's
/// own — posted limits per segment — so there is nothing to pass in.
const drive = (fromMile, toMile, route) => driveMinutes(fromMile, toMile, route);

/**
 * Build the itinerary.
 *
 * @param route   a built route (from buildRoute) — stops carry `mile`
 * @param chosen  Set of stop ids that are in the plan
 * @param start   { date: Date (UTC midnight of day one), at: 'HH:MM' }
 * @param data    { HOURS, WINTER, sleeps }  the two side tables, plus the
 *                nights: minutes asleep keyed by the stop you sleep AFTER.
 *                Unlike the tables, sleeps are the user's own — store.sleeps.
 *
 * @returns { rows, days, totalMin, endsAt, warnings }
 *   rows      one per stop, in road order, with arrive/depart/hours/verdict,
 *             and `sleep` set on the stop a night was placed after
 *   days      the stretches between sleeps, each with its own crossing window
 *   totalMin  door to door, including nights
 */
export function build(route, chosen, start, data) {
  const { HOURS, WINTER } = data;
  const sleeps = data.sleeps || {};

  const stops = route.stops
    .filter(s => chosen.has(s.id) && s.kind !== 'lodging')
    .sort((a, b) => a.mile - b.mile);

  // ---- the two clocks --------------------------------------------------
  //
  // `clock` is the ABSOLUTE axis: minutes since the trip's first midnight,
  // measured in the timezone you left from. It only ever goes forward, which
  // is what makes durations — a leg, a dwell, a night — mean anything.
  //
  // Nothing you READ is in that frame. Every clock face, every comparison
  // against opening hours, and every sunrise is LOCAL to where you are
  // standing, and the road crosses three boundaries between here and
  // Mooresville. Before this existed the two were compared directly, which
  // quietly claimed you reached Charlotte at 13:09 when it is 16:09 there and
  // the museum has shut.
  const tzStart = tzAtMile(0, route);
  const localOf = (abs, tz) => abs + ((tz ?? tzStart) - tzStart) * 60;

  // The sun, and the crossing window, at a position on whatever calendar day
  // the absolute clock has reached.
  //
  // The date comes from the CLOCK and not from a day counter. That matters in
  // both directions now that nights are placed by hand: a two hour nap must
  // not advance the calendar, and an eight hour night that starts at 22:00
  // must.
  // `tzHint` is the timezone of the thing you are standing at — a stop carries
  // its own, computed from its state. Only fall back to the winter table or to
  // longitude when there is nothing better, and never let longitude decide
  // alone: round(lon/15) puts Amarillo and Asheville in the wrong hour.
  const dayFor = (clock, ll, tzHint) => {
    const risk = nearestRisk(WINTER, ll);
    const tz = tzHint ?? (risk && risk.tz) ?? guessTz(ll[1]);
    const local = localOf(clock, tz);
    const date = new Date(start.date.valueOf() + Math.floor(local / MIN_PER_DAY) * 86400000);
    const sun = winter.daylight(date, ll[0], ll[1]);
    const wrap = m => ((m + tz * 60) % MIN_PER_DAY + MIN_PER_DAY) % MIN_PER_DAY;
    const rise = sun ? wrap(sun.rise) : 7 * 60;
    const set = sun ? wrap(sun.set) : 17 * 60;
    const plowed = risk && risk.plowedBy ? toMin(risk.plowedBy) : 0;
    const open = Math.max(rise + 45, plowed);
    return {
      date, tz, local, rise, set, open, shut: set - 45, risk,
      why: plowed > rise + 45 ? 'plows' : 'light',
      riskName: risk ? risk.name : null,
    };
  };

  let clock = toMin(start.at);
  let mile = 0;
  let dayIx = 0;
  let sleepMin = 0;

  const first = dayFor(clock, route.waypoints[0].ll, tzStart);
  const days = [{ ...first, ix: 0, from: route.waypoints[0].name, startedAt: clock, startAt: hhmm(clock) }];
  const rows = [], warnings = [];

  for (const s of stops) {
    // Everything is whole minutes. Floating point down a 6,000-mile chain
    // produced arrival times like "09:33.413", which is not a clock face.
    const legMin = Math.round(drive(mile, s.mile, route) + s.detour);
    const arrive = clock + legMin;
    const depart = arrive + s.dwell;

    // The sun where the stop actually IS, on the day the clock has reached.
    // Reading it off the day's starting position instead put "after dark" at
    // the Grand Canyon and in Houston at the same minute, which is the exact
    // thing bestWindow exists to avoid.
    const here = dayFor(arrive, s.ll, s.tz);
    const h = hoursFor(HOURS, s.id, here.date);
    const best = bestWindow(h, { rise: here.rise, set: here.set });
    // Local at the stop. Everything below compares against this, never the
    // absolute clock — that was the three-hour lie at the Carolina end.
    const arriveLocal = here.local;
    const departLocal = arriveLocal + s.dwell;
    const at = ((arriveLocal % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;

    const flags = [];
    if (!h) flags.push({ level: 'unknown', text: 'Hours not checked for this one.' });
    else if (h.shut) flags.push({
      level: 'bad',
      text: h.shutToday ? 'Closed on this date.' : 'Closed on ' + weekday(here.date) + 's.',
    });
    else {
      if (h.open != null && at < h.open)
        flags.push({ level: 'bad', text: `You would arrive at ${hhmm(at)}, ${mins(h.open - at)} before it opens at ${h.openAt}.` });
      if (h.close != null && at > h.close)
        flags.push({ level: 'bad', text: `You would arrive at ${hhmm(at)}, after it shuts at ${h.closeAt}.` });
      else if (h.close != null && departLocal % MIN_PER_DAY > h.close)
        flags.push({ level: 'warn', text: `You would still be there at closing (${h.closeAt}).` });
      if (best && (at < best.from || at > best.to))
        flags.push({ level: 'warn', text: `Best between ${hhmm(best.from)} and ${hhmm(best.to)}. ${h.why}` });
    }

    // Nothing breaks the day now except a sleep you placed, so the clock will
    // happily run to 02:00 and say so. It should say more than the number.
    if (at > here.set || at < here.rise)
      flags.push({
        level: 'warn',
        text: `You would be driving in the dark. Sun goes down at ${hhmm(here.set)} and is not up again until ${hhmm(here.rise)}.`,
      });

    const row = {
      stop: s, dayIx, mile: s.mile,
      driveMin: legMin, arrive, depart,
      arriveAt: hhmm(arriveLocal), departAt: hhmm(departLocal),
      tz: here.tz, tzShift: here.tz - tzStart,
      dwell: s.dwell, seedDwell: s.seedDwell, dwellSet: !!s.dwellSet,
      cost: stopCost(s).total,
      hours: h, best,
      bestAt: best ? hhmm(best.from) + '-' + hhmm(best.to) : null,
      flags,
      ok: !flags.some(f => f.level === 'bad'),
      sleep: null,
    };
    rows.push(row);

    clock = depart + s.detour;      // back out to the road
    mile = s.mile;

    // ---- the night, if one was placed after this stop --------------------
    // A night is either a plain number of minutes or { m, at }, where `at`
    // names a lodging stop. store.js is the only other place that knows this.
    const entry = sleeps[s.id];
    const nap = Math.round((typeof entry === 'number' ? entry : entry && entry.m) || 0);
    const atId = entry && typeof entry === 'object' ? entry.at : null;
    const bed = atId ? route.stops.find(x => x.id === atId) : null;
    if (nap > 0) {
      const wake = clock + nap;
      const next = dayFor(wake, s.ll, s.tz);
      // You sleep where you stopped, so the night is read on that stop's
      // clock at both ends — down and up in the same local hours.
      const downLocal = localOf(clock, s.tz);
      const wakeLocal = next.local;
      const wakeAt = ((wakeLocal % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
      const sflags = [];

      // Waking up and the road being worth driving are two different times,
      // and this whole app exists because of the gap between them.
      if (wakeAt < next.open && wakeAt > next.open - 12 * 60)
        sflags.push({
          level: 'warn',
          text: next.why === 'plows'
            ? `Back on the road at ${hhmm(wakeLocal)}, but ${next.riskName} is not normally clear behind the plows until ${hhmm(next.open)}.`
            : `Back on the road at ${hhmm(wakeLocal)}, ${mins(next.open - wakeAt)} before there is light enough for it. First light is ${hhmm(next.rise)}.`,
        });
      if (nap < 5 * 60)
        sflags.push({ level: 'warn', text: `${mins(nap)} is a nap, not a night.` });

      // Where the night is spent: the bed if one was named, otherwise just the
      // town you happened to stop in.
      row.sleep = {
        minutes: nap,
        downAt: hhmm(downLocal), wakeAt: hhmm(wakeLocal),
        at: bed ? bed.name : (s.town ? `${s.town}${s.state ? ', ' + s.state : ''}` : s.name),
        placeId: bed ? bed.id : null,
        where: bed ? [bed.town, bed.state].filter(Boolean).join(', ') : null,
        dayIx, flags: sflags,
      };

      sleepMin += nap;
      dayIx += 1;
      days.push({ ...next, ix: dayIx, from: s.town || s.name, startedAt: wake, startAt: hhmm(wakeLocal) });
      clock = wake;
    }
  }

  // The run home from the last stop to the end of the route.
  const tail = Math.round(drive(mile, route.miles, route));
  const endsAt = clock + tail;
  // The far end is three hours ahead of the near end, and arriving "at 19:40"
  // means the clock on the wall in Mooresville, not the one you left behind.
  const tzEnd = tzAtMile(route.miles, route);
  const endsLocal = localOf(endsAt, tzEnd);

  for (const d of days)
    if (d.risk && d.shut - d.open < 6 * 60)
      warnings.push(`Day ${d.ix + 1} is a short one: ${d.riskName} only opens up between ${hhmm(d.open)} and ${hhmm(d.shut)}.`);

  const driveMin = Math.round(drive(0, route.miles, route));
  return {
    rows, days,
    totalMin: Math.round(endsAt - toMin(start.at)),
    endsAt, endsAtLabel: hhmm(endsLocal),
    tzStart, tzEnd, tzShift: tzEnd - tzStart,
    dayCount: days.length,
    warnings,
    driveMin,
    avgMph: driveMin > 0 ? (route.miles / driveMin) * 60 : 0,
    stopMin: rows.reduce((a, r) => a + r.cost, 0),
    sleepMin,
  };
}


const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = d => WD[d.getUTCDay()];
// "2h 0m is a nap, not a night" and "1h 0m before it opens" both read like a
// machine talking. A round hour is just an hour.
const mins = m => {
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
};

/// Rough standard-time offset from longitude, for places with no winter entry.
/// Only used where nothing better exists; winter.json carries real values for
/// the points that matter, because Arizona keeps no DST and Monteagle is
/// Central despite being in Tennessee.
const guessTz = lon => Math.round(lon / 15);

/// The winter risk point governing a position: the nearest one within 150
/// miles, since that is roughly how far ahead the road you are committing to.
function nearestRisk(WINTER, ll) {
  if (!WINTER) return null;
  let best = null, bd = 150 / 69;
  for (const p of WINTER.points || []) {
    if (!p.ll) continue;
    const d = Math.hypot(p.ll[0] - ll[0], (p.ll[1] - ll[1]) * 0.82);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export { hhmm, toMin, weekday };
