// Everything countable about the trip.
//
// All of it is derived — nothing here is stored. Change a stop or swap a route
// and every number moves, which is the point.

import { stopCost } from './route.js';
import { buildDays, planTotals } from './plan.js';

/// "$35/vehicle" -> 35. "Free" -> 0. Anything vague -> null, and vague entries
/// are counted separately rather than silently treated as free.
export function money(s) {
  if (!s) return null;
  if (/free/i.test(s)) return 0;
  const m = String(s).match(/\$\s?([\d,]+(?:\.\d+)?)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

/// MPG between full fill-ups, the way FuelWise computes it: a partial fill
/// doesn't close an interval, it just adds gallons to the running total.
export function fuelStats(fills) {
  const f = [...fills].sort((a, b) => a.odometer - b.odometer);
  let lastFullOdo = null, acc = 0;
  const series = [];
  let gallons = 0, spend = 0;
  for (const x of f) {
    gallons += x.gallons;
    spend += x.gallons * x.pricePerGallon;
    acc += x.gallons;
    if (!x.partial) {
      if (lastFullOdo != null) {
        const miles = x.odometer - lastFullOdo;
        if (miles > 0 && acc > 0) series.push({ mpg: miles / acc, miles, gallons: acc, at: x.odometer });
      }
      lastFullOdo = x.odometer;
      acc = 0;
    }
  }
  const measuredMiles = series.reduce((a, s) => a + s.miles, 0);
  const measuredGal = series.reduce((a, s) => a + s.gallons, 0);
  return {
    count: f.length,
    gallons, spend,
    series,
    avgMpg: measuredGal > 0 ? measuredMiles / measuredGal : null,
    lastMpg: series.length ? series[series.length - 1].mpg : null,
    bestMpg: series.length ? Math.max(...series.map(s => s.mpg)) : null,
    worstMpg: series.length ? Math.min(...series.map(s => s.mpg)) : null,
    avgPrice: gallons > 0 ? spend / gallons : null,
    costPerMile: measuredMiles > 0 ? series.reduce((a, s) => a + s.gallons, 0) === 0 ? null
      : (spend / (gallons || 1)) * (measuredGal / measuredMiles) : null,
  };
}

export function tripStats(routes, chosen, store) {
  const legs = routes.map(r => {
    const days = buildDays(r, chosen, store.pace);
    return { route: r, days, totals: planTotals(days) };
  });

  const allDays = legs.flatMap(l => l.days);
  const stops = legs.flatMap(l => l.days.flatMap(d => d.stops));
  const available = routes.flatMap(r => r.stops);

  const miles = legs.reduce((a, l) => a + l.totals.miles, 0);
  const driveMins = legs.reduce((a, l) => a + l.totals.driveMins, 0);
  const stopMins = legs.reduce((a, l) => a + l.totals.stopMins, 0);

  // states, in the order you cross them, counted once
  const states = [];
  for (const r of routes) for (const t of r.towns) if (!states.includes(t.state)) states.push(t.state);

  const elevs = routes.flatMap(r => r.towns.filter(t => t.elev).map(t => ({ ...t })));
  const high = elevs.length ? elevs.reduce((a, b) => (b.elev > a.elev ? b : a)) : null;

  const detourMins = stops.reduce((a, s) => a + s.detour * 2, 0);
  const dwellMins = stops.reduce((a, s) => a + (s.dwell || 60), 0);

  const priced = stops.map(s => money(s.cost));
  const admission = priced.filter(v => v != null).reduce((a, v) => a + v, 0);
  const unpriced = priced.filter(v => v == null).length;

  const longest = allDays.length ? allDays.reduce((a, b) => (b.miles > a.miles ? b : a)) : null;
  const shortest = allDays.length ? allDays.reduce((a, b) => (b.miles < a.miles ? b : a)) : null;

  const riskDays = allDays.filter(d => d.risks.length).length;
  const secondNights = allDays.filter(d => d.sameTown).length;

  const firstsAll = available.filter(s => s.first);
  const firstsIn = stops.filter(s => s.first);
  const seen = available.filter(s => store.isSeen(s.id));

  const fuel = fuelStats(store.fills);
  const mpg = fuel.avgMpg || store.s.mpg || 45;
  const gallons = miles / mpg;

  const tags = {};
  for (const s of stops) for (const t of (s.tags || [])) tags[t] = (tags[t] || 0) + 1;

  return {
    legs, miles, driveMins, stopMins,
    days: allDays.length,
    stops: stops.length,
    available: new Set(available.map(s => s.id)).size,
    states, high,
    detourMins, dwellMins,
    admission, unpriced,
    longest, shortest,
    riskDays, secondNights,
    firstsAll: firstsAll.length, firstsIn: firstsIn.length,
    seen: seen.length,
    milesPerDay: allDays.length ? miles / allDays.length : 0,
    hoursPerDay: allDays.length ? driveMins / 60 / allDays.length : 0,
    fuel, mpg, gallons,
    fuelCost: gallons * (fuel.avgPrice || store.s.gas || 3.6),
    tags: Object.entries(tags).sort((a, b) => b[1] - a[1]),
  };
}
