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
// polyline. What you choose is which stops are IN, and how long you linger;
// geography does the rest.
//
// WITH ONE EXCEPTION, and it is a real one rather than a hand-ordering escape
// hatch. When the bed is further along the road than a stop is, road order
// puts the stop before the night and you actually sleep first and drive back
// to it. `afters` says so per stop; see the block in build(). It is still not
// hand ordering, because you cannot use it to shuffle two stops on the same
// day — it only ever moves a stop across a night, and it charges you the road
// twice for doing it.
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

import { stopCost, driveMinutes, tzAtMile, project } from './route.js';
import * as winter from './winter.js';

const MIN_PER_DAY = 1440;
/// A night at a bed, when you have not said otherwise.
const DEFAULT_NIGHT = 8 * 60;
/// How far back down the road a `next morning` stop may sit from the bed it
/// waits for. Deliberately the same 45 miles as the bed reach in ui.js: both
/// answer "is this near enough to be the same night", and two numbers for one
/// question is how the planner ends up disagreeing with itself.
const BACK_REACH = 45;
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

  // Beds are IN the walk, not hung off it. A bed is projected onto the road by
  // buildRoute exactly like every other stop, so it has a mile of its own and
  // slots into road order on its own merits. An earlier version anchored a
  // night to a neighbouring stop, because a night began life as a duration with
  // no position; a bed has a position, and two successive rules for picking the
  // neighbour were both wrong before that was noticed.
  const sorted = route.stops
    .filter(s => chosen.has(s.id))
    .sort((a, b) => a.mile - b.mile);

  // ---- stops taken out of road order, inside one day --------------------
  //
  // Road order is right nearly always, and wrong where opening hours say so.
  // Buford Highway sits EIGHT MILES before the Georgia Aquarium, so the walk
  // reached it at 08:58 against an 11:00 opening, and then reached the
  // aquarium at 11:28 against a best window that shuts at 10:30. Two stops,
  // both missed by about two hours, for the sake of eight miles.
  //
  // `visitAfter` on a stop names the stop it should follow. It is lifted out
  // and dropped straight after its anchor, and the walk below charges the
  // drive back, the same way `afters` does, so doubling back is paid for
  // rather than wished away. Unlike `afters` no bed is involved: this is a
  // reorder within a day, not a night in the middle.
  //
  // Only ever moves a stop LATER. If the anchor is not chosen, or already
  // comes first, road order stands.
  for (let guard = 0; guard < 8; guard++) {
    const i = sorted.findIndex((s, ix) =>
      s.visitAfter && sorted.findIndex(x => x.id === s.visitAfter) > ix);
    if (i < 0) break;
    const moved = sorted.splice(i, 1)[0];
    const at = sorted.findIndex(x => x.id === moved.visitAfter);
    sorted.splice(at + 1, 0, moved);
  }

  // ---- stops you double back to ----------------------------------------
  //
  // Road order is right for almost everything, and wrong for the case where
  // the bed is FURTHER ALONG than the stop is. Cadillac Ranch sits sixteen
  // miles west of the Amarillo welcome center, so sorting by mile put it
  // before the night and the planner had you there at eleven at night. What
  // actually happens is you sleep, then drive back west to it in the morning,
  // then come forward again.
  //
  // An id in `afters` says so. The stop is HELD until the next bed and then
  // released, which puts it on the new day, with the road between charged
  // twice in the walk below because you drive it out and you drive it back.
  //
  // Held only if the next bed is WITHIN REACH. That bound is the whole
  // difference between a fix and a new bug: without it, pinning a stop with
  // no night nearby held it to whatever bed came next, and a stop 346 miles
  // before that bed produced a 346-mile "double back". Which is the same
  // mistake, in the same shape, as the bed anchoring in session 33 — so it
  // takes the same number, and "near" means one thing in this app.
  const afters = data.afters || {};
  const stops = [];
  const held = [];
  const orphans = [];
  // The pin is the user's (`store.afters`) or the plan's (`afterBy`, resolved
  // onto the stop by buildRoute). Either way it means the same thing: you
  // sleep first and double back to this in the morning.
  sorted.forEach((s, i) => {
    if ((afters[s.id] || s.after) && s.kind !== 'lodging') {
      const bed = sorted.slice(i + 1).find(x => x.kind === 'lodging');
      if (bed && bed.mile - s.mile <= BACK_REACH) { held.push(s); return; }
      orphans.push({ stop: s, bed });
    }
    stops.push(s);
    if (s.kind === 'lodging' && held.length) { stops.push(...held); held.length = 0; }
  });

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
  // Wheels turning vs actually stopped. A detour is driving. A drive-through
  // park is driving for every minute of it, and filing its traverse under
  // "stopped" is how the planner ended up saying you spend two hours parked at
  // a place whose whole point is that you do not park.
  let movingMin = 0, stoppedMin = 0, throughMin = 0;
  // Road covered twice because you doubled back to something. Kept apart from
  // the route's own mileage so "2,771 mi" stays the length of the road and
  // this stays the extra you chose to drive.
  let backMiles = 0;

  const first = dayFor(clock, route.waypoints[0].ll, tzStart);
  const days = [{ ...first, ix: 0, from: route.waypoints[0].name, startedAt: clock, startAt: hhmm(clock) }];
  // ================================================= WHERE THE PASSES ARE
  //
  // Kevin's rule: you cross a chain-control pass AFTER the plows and the salt
  // have been over it, not before and not in the dark.
  //
  // The data has always carried the rule -- every winter point has a
  // `plowedBy` -- but the walk only ever applied it to GETTING OUT OF BED.
  // Those are different questions. Leaving Georgia at 08:26 says nothing about
  // what time you reach Flagstaff eleven hours later, and the plan crossed five
  // of six risk points in the dark while every departure looked fine.
  //
  // So: find the risk points that actually lie on this road, in mile order.
  // The walk can then ask what is AHEAD of it rather than what is near it.
  const crossings = ((WINTER && WINTER.points) || [])
    .filter(p => p.ll && p.plowedBy)
    .map(p => { const q = project(p.ll, route.waypoints, route.cum);
                return { p, mile: q.mile, off: q.off }; })
    .filter(c => c.off <= 25)
    .sort((a, b) => a.mile - b.mile);

  /// Wall clock at a crossing for an absolute minute. The walk's clock is
  /// already expressed against the START timezone, so this goes through
  /// localOf like everything else rather than adding a raw offset twice.
  const crossLocal = (c, abs) => {
    const l = Math.round(localOf(abs, c.p.tz ?? tzAtMile(c.mile, route)));
    return ((l % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  };

  const rows = [], warnings = [], crossed = [];

  // A pin with no night after it cannot mean anything, so it was ignored
  // rather than quietly shunting the stop to the end of the trip.
  for (const { stop: s, bed } of orphans)
    warnings.push(bed
      ? `${s.name} is set for the next morning, but the nearest night after it is ${Math.round(bed.mile - s.mile)} mi on at ${bed.name}. That is not doubling back, that is a second trip, so it stays in road order.`
      : `${s.name} is set for the next morning, but you have placed no night after it, so it stays in road order.`);

  for (const s of stops) {
    // Everything is whole minutes. Floating point down a 6,000-mile chain
    // produced arrival times like "09:33.413", which is not a clock face.
    // Behind you on the road. `driveMinutes` returns 0 for a backwards span,
    // so without this a stop you double back to arrived instantly and free.
    // You drive the road to get to it and you drive it again to get back, so
    // it costs `backMin` twice, exactly the way a detour costs its minutes
    // twice. The second half is charged on departure, below.
    const backMin = s.mile < mile ? Math.round(drive(s.mile, mile, route)) : 0;
    const legMin = Math.round(drive(mile, s.mile, route)) + backMin
      + (s.kind === 'lodging' ? 0 : s.detour);
    movingMin += legMin;
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

    // ---- a bed: you arrive, you sleep, the day ends here ------------------
    if (s.kind === 'lodging') {
      // THE PLAN IS THE PLAN.
      //
      // A `sleep` written into the plan is what happens. Nothing cached on a
      // phone outranks it. A device value fills in only where the plan is
      // silent, and eight hours is the last resort.
      //
      // There used to be more here: a precedence that let a hand-set value on
      // one browser beat the plan, a hold to first light, and a rule that
      // rolled any wake past noon to the next morning. Those were mine, not
      // asked for, and they made the schedule depend on state nobody could
      // see. They are gone.
      let nap = Math.round(
        Number.isFinite(s.sleep) ? s.sleep
        : sleeps[s.id] != null ? Number(sleeps[s.id])
        : DEFAULT_NIGHT);
      let wake = arrive + nap;
      let next = dayFor(wake, s.ll, s.tz);

      // The one rule that stays, because it is Kevin's: you reach a pass with
      // chain control AFTER the plows and the salt, not before. Applied to any
      // night the plan has not pinned, bounded to six hours so a late window
      // cannot eat a day. Where the plan HAS pinned the night, his number
      // stands and the crossing report says what it costs.
      if (!Number.isFinite(s.sleep)) {
        const ahead = crossings.find(c => c.mile > s.mile);
        if (ahead) {
          const wait = toMin(ahead.p.plowedBy)
            - crossLocal(ahead, wake + driveMinutes(s.mile, ahead.mile, route));
          if (wait > 0 && wait <= 6 * 60) {
            nap += wait;
            wake = arrive + nap;
            next = dayFor(wake, s.ll, s.tz);
          }
        }
      }
      const downLocal = arriveLocal;
      const wakeLocal = next.local;
      const wakeAt = ((wakeLocal % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
      const sflags = [];

      if (wakeAt < next.open && wakeAt > next.open - 12 * 60)
        sflags.push({
          level: 'warn',
          text: next.why === 'plows'
            ? `Back on the road at ${hhmm(wakeLocal)}, but ${next.riskName} is not normally clear behind the plows until ${hhmm(next.open)}.`
            : `Back on the road at ${hhmm(wakeLocal)}, ${mins(next.open - wakeAt)} before there is light enough for it. First light is ${hhmm(next.rise)}.`,
        });
      if (nap < 5 * 60)
        sflags.push({ level: 'warn', text: `${mins(nap)} is a nap, not a night.` });

      rows.push({
        kind: 'bed', stop: s, dayIx, mile: s.mile,
        driveMin: legMin, arrive, depart: wake,
        arriveAt: hhmm(downLocal), departAt: hhmm(wakeLocal),
        tz: here.tz, tzShift: here.tz - tzStart,
        dwell: 0, cost: 0, hours: null, best: null, bestAt: null,
        flags: [], ok: true,
        sleep: {
          minutes: nap,
          downAt: hhmm(downLocal), wakeAt: hhmm(wakeLocal),
          at: s.name,
          where: [s.town, s.state].filter(Boolean).join(', '),
          dayIx, flags: sflags,
        },
      });

      sleepMin += nap;
      dayIx += 1;
      days.push({ ...next, ix: dayIx, from: s.name, startedAt: wake, startAt: hhmm(wakeLocal) });
      clock = wake;
      mile = s.mile;
      continue;
    }

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
      kind: 'stop', stop: s, dayIx, mile: s.mile,
      // A stop you slept past and came back to. `back` is the one-way road
      // between the bed and it, so the round trip is twice this.
      back: backMin ? { min: backMin, miles: Math.round(mile - s.mile) } : null,
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

    // A through stop comes out the far end, so there is no second detour to
    // pay: rejoining the interstate is the last part of the traverse.
    // Time driving through somewhere is its own thing: it is not standing
    // about, and it is not road transit either, so it inflates neither total.
    if (s.throughTime) throughMin += s.dwell; else stoppedMin += s.dwell;
    // Geometry, separately: a stop you come out the far end of has no drive
    // back to the road, because rejoining it is the end of the traverse.
    if (!s.through) movingMin += s.detour;
    // The return half of a double-back, and the road it re-covers.
    movingMin += backMin;
    backMiles += backMin ? mile - s.mile : 0;
    clock = depart + (s.through ? 0 : s.detour) + backMin;
    // You come out the far end of a through stop, so the road between the two
    // ends is road you have already covered. Resuming at s.mile would drive it
    // a second time and charge the traverse on top of it.
    //
    // A double-back leaves you where you started, not at the stop, because
    // coming back is the second half of it.
    if (!backMin) mile = s.throughTo != null ? s.throughTo : s.mile;

    // ---- a night with no bed: sleep where you stopped ---------------------
    // Just a duration, hung off this stop because there is no place naming a
    // position of its own. A night AT a bed is handled above, at the bed's
    // own mile, and needs none of this.
    const nap = Math.round(Number(sleeps[s.id]) || 0);
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

      row.sleep = {
        minutes: nap,
        downAt: hhmm(downLocal), wakeAt: hhmm(wakeLocal),
        at: s.town ? `${s.town}${s.state ? ', ' + s.state : ''}` : s.name,
        where: null,
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
  movingMin += tail;
  const endsAt = clock + tail;
  // The far end is three hours ahead of the near end, and arriving "at 19:40"
  // means the clock on the wall in Mooresville, not the one you left behind.
  const tzEnd = tzAtMile(route.miles, route);
  const endsLocal = localOf(endsAt, tzEnd);

  for (const d of days)
    if (d.risk && d.shut - d.open < 6 * 60)
      warnings.push(`Day ${d.ix + 1} is a short one: ${d.riskName} only opens up between ${hhmm(d.open)} and ${hhmm(d.shut)}.`);

  const driveMin = Math.round(drive(0, route.miles, route));
  // ============================== what time you actually reach each pass
  //
  // Reconstructed from the finished walk rather than guessed at: the leg start
  // plus every row is an anchor with a known mile and a known clock, so the
  // time at any mile between them is that anchor's departure plus the drive.
  // Every crossing on the road gets one of these, whether or not the schedule
  // could do anything about it, because the failure mode here was silence.
  {
    const anchors = [{ mile: 0, at: toMin(start.at) }]
      .concat(rows.map(r => ({ mile: r.mile, at: r.depart != null ? r.depart : r.arrive })));
    for (const c of crossings) {
      let prev = anchors[0];
      for (const a of anchors) if (a.mile <= c.mile + 0.5) prev = a;
      const abs = prev.at + driveMinutes(prev.mile, c.mile, route);
      const at = crossLocal(c, abs);
      const plowAt = toMin(c.p.plowedBy);
      const day = dayFor(abs, c.p.ll, c.p.tz);
      const rise = day.rise, set = day.set;
      const dark = at < rise || at > set;
      const early = at < plowAt;
      crossed.push({ name: c.p.name, elev: c.p.elev || null, mile: Math.round(c.mile),
                     at, atLabel: hhmm(at), plowedBy: c.p.plowedBy, dark, early });
      if (dark || early)
        warnings.push(`${c.p.name}${c.p.elev ? ', ' + c.p.elev.toLocaleString() + ' ft,' : ''} `
          + `is crossed at ${hhmm(at)}`
          + (dark ? ', in the dark' : '')
          + (early ? `, before it is normally clear behind the plows at ${c.p.plowedBy}` : '')
          + '.');
    }
  }

  return {
    rows, days, crossings: crossed,
    totalMin: Math.round(endsAt - toMin(start.at)),
    endsAt, endsAtLabel: hhmm(endsLocal),
    tzStart, tzEnd, tzShift: tzEnd - tzStart,
    dayCount: days.length,
    warnings,
    // driveMin is now the driving THIS PLAN does, detours and traverses
    // included, not the bare route at speed. avgMph stays keyed to the route
    // distance, so it still reads as a road speed rather than a trip average.
    driveMin: Math.round(movingMin),
    routeDriveMin: driveMin,
    avgMph: driveMin > 0 ? (route.miles / driveMin) * 60 : 0,
    stopMin: Math.round(stoppedMin),
    throughMin: Math.round(throughMin),
    // Extra road driven because you doubled back to something. Not part of
    // route.miles, which is the length of the road and should stay that.
    backMiles: Math.round(backMiles),
    stopCount: rows.filter(r => r.kind !== 'bed').length,
    bedCount: rows.filter(r => r.kind === 'bed').length,
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
