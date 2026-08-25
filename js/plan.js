// Turns a route plus a set of chosen stops into actual days: how far you
// drive, what you see, and what town you sleep in.
//
// The day ends where you sleep, so every break gets snapped to a real town
// on the route rather than a mile marker in the dark.

import { stopCost } from './route.js';

const SNAP_MILES = 75;   // how far we'll shift a day's end to reach a town
const MIN_ADVANCE = 20;  // a day has to actually go somewhere
const MAX_DAYS = 40;     // runaway guard

export const DEFAULT_PACE = {
  mph: 62,               // interstate average once gas and food are counted
  hoursPerDay: 8,        // driving PLUS time spent at stops
};

/// The town to sleep in. Only ever looks FORWARD of where the day started —
/// snapping backward used to end a day where it began, which stalls the
/// whole plan instead of failing loudly.
function sleepTown(mile, towns, startMile) {
  let best = null, bestGap = Infinity;
  for (const t of towns) {
    if (t.mile <= startMile + MIN_ADVANCE) continue;
    const gap = Math.abs(t.mile - mile);
    if (gap < bestGap) { bestGap = gap; best = t; }
  }
  return bestGap <= SNAP_MILES ? best : null;
}

function townAt(mile, towns) {
  let best = towns[0], bestGap = Infinity;
  for (const t of towns) {
    const gap = Math.abs(t.mile - mile);
    if (gap < bestGap) { bestGap = gap; best = t; }
  }
  return best;
}

/// Anything worth warning about between two mileposts.
function risksBetween(a, b, towns) {
  return towns.filter(t => t.risk && t.mile >= a - 5 && t.mile <= b + 5);
}

export function buildDays(route, chosenIds, pace = DEFAULT_PACE) {
  const budget = pace.hoursPerDay * 60;
  const chosen = route.stops.filter(s => chosenIds.has(s.id));
  const pending = [...chosen];
  const days = [];

  let cur = 0;
  let day = { stops: [], driveMins: 0, stopMins: 0, startMile: 0 };

  const closeDay = (atMile, isLast = false) => {
    const startMile = day.startMile;
    const town = isLast ? null : sleepTown(atMile, route.towns, startMile);
    // No town far enough ahead? If the day was spent at stops, that's a
    // second night in the same town — a real thing to do, not a stall.
    // Only force the day forward when it would otherwise go nowhere at all.
    const stayPut = !town && !isLast && day.stops.length > 0;
    const endMile = isLast
      ? route.miles
      : town ? town.mile
      : stayPut ? Math.max(atMile, startMile)
      : Math.max(atMile, startMile + MIN_ADVANCE);
    // Recompute driving from the final span so the numbers stay honest.
    day.driveMins = Math.max(0, (endMile - startMile) / pace.mph * 60);
    day.endMile = endMile;
    day.miles = endMile - startMile;
    day.from = townAt(startMile, route.towns);
    day.overnight = isLast
      ? route.towns[route.towns.length - 1]
      : town || day.from;
    day.sameTown = stayPut;
    day.risks = risksBetween(startMile, endMile, route.towns);
    day.firsts = day.stops.filter(s => s.first).length;
    day.over = day.driveMins + day.stopMins > budget;
    days.push(day);
    day = { stops: [], driveMins: 0, stopMins: 0, startMile: endMile };
    return endMile;
  };

  let guard = 0;
  let truncated = false;
  while (true) {
    if (days.length >= MAX_DAYS) { truncated = true; break; }
    if (guard++ > MAX_DAYS * 6) { truncated = true; break; }

    const spent = day.driveMins + day.stopMins;
    const left = budget - spent;
    const next = pending[0];
    const targetMile = next ? next.mile : route.miles;
    const driveTo = Math.max(0, (targetMile - cur) / pace.mph * 60);
    const cost = next ? stopCost(next).total : 0;
    const canReach = driveTo <= left;

    if (!next) {
      if (driveTo <= left) { closeDay(route.miles, true); break; }
      const reach = cur + (left / 60) * pace.mph;
      cur = closeDay(Math.min(reach, route.miles));
      if (cur >= route.miles - 1) { break; }
      continue;
    }

    // A stop that costs more than a whole day (Carlsbad, at 7h40 all-in)
    // can never "fit". If today is still empty, it gets the day to itself —
    // otherwise it would be silently dropped forever.
    const dayEmpty = day.stops.length === 0 && day.driveMins < 1;
    const oversized = driveTo + cost > budget;

    if (canReach && (driveTo + cost <= left || (dayEmpty && oversized))) {
      day.driveMins += driveTo;
      cur = targetMile;
      day.stops.push(next);
      day.stopMins += cost;
      pending.shift();
    } else if (canReach) {
      // Reachable, but no day left to do it. Sleep nearby, do it tomorrow.
      cur = closeDay(targetMile);
    } else {
      const reach = cur + (left / 60) * pace.mph;
      cur = closeDay(Math.min(reach, route.miles));
    }

    if (day.driveMins + day.stopMins >= budget * 0.98) cur = closeDay(cur);
  }

  // Trim a zero-length trailing day the loop can leave behind.
  while (days.length > 1 && days[days.length - 1].miles < 1 && !days[days.length - 1].stops.length) {
    days.pop();
  }
  days.forEach((d, i) => { d.n = i + 1; });
  days.truncated = truncated;
  days.unplaced = pending;      // never silently drop a stop
  return days;
}

export function planTotals(days) {
  return {
    days: days.length,
    miles: days.reduce((a, d) => a + d.miles, 0),
    driveMins: days.reduce((a, d) => a + d.driveMins, 0),
    stopMins: days.reduce((a, d) => a + d.stopMins, 0),
    stops: days.reduce((a, d) => a + d.stops.length, 0),
    firsts: days.reduce((a, d) => a + d.firsts, 0),
  };
}

/// A sensible opening suggestion. The big ones are why you're driving, the
/// cheap ones are free real estate, and a first she has no California
/// equivalent for earns more patience than an ordinary stop.
export function suggestStops(route) {
  const picked = new Set();
  for (const s of route.stops) {
    const c = stopCost(s);
    if (s.big || c.total <= 70 || (s.first && c.total <= 150)) picked.add(s.id);
  }
  return picked;
}
