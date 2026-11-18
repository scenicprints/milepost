// Who drives which stretch.
//
// The second driver is the less experienced one, so every stretch of road is
// judged for the co-driver, and the rest is the main driver's:
//
//   daylight     the whole stretch between first light and dusk, with twenty
//                minutes' margin each side
//   no pass      no winter crossing and no flagged high point on it
//   no city      no metro segment (the road data marks them `urban`)
//   dry          no rain or snow forecast on it that day
//
// Weather has two strengths. Inside 16 days a forecast of rain or snow takes
// the stretch away from the co-driver outright. Further out the seasonal model can only
// say "possible", so the stretch is the co-driver's IF it is dry, and says so; it firms
// up on its own once the forecast reaches the date.
//
// Which means Kevin's real hours at the wheel are known, and a long day is
// judged by his hours, not by the day's.
import { tzAtMile, segments, pointAtMile, fmtHours, driveMinutes } from './route.js';
import * as winter from './winter.js';
import * as wx from './weather.js';

const MARGIN = 20;                 // minutes after sunrise / before sunset
export const LONG_YOU = 8 * 60;    // Kevin's hours that make a day long
export const LONG_DAY = 10 * 60;   // total driving that makes a day long
const SHORT_NIGHT = 6 * 60;
const PIECE = 20;                  // miles: how finely the road is judged
const CITY = 15;                   // miles either side of a metro's point
const MIN_SWAP = 30;               // minutes: shorter than this is not worth a swap

const isoOf = d => d.toISOString().slice(0, 10);

/// One day's stretches and what they add up to. `days` is ui.realDays(rt).
export function driverPlan(rt, days) {
  const it = days.it;
  if (!it) return [];
  const tz0 = it.tzStart;
  const base = days[0].date.valueOf();
  const segs = rt.segs || segments(rt);

  const localOf = (abs, mile) => {
    const tz = tzAtMile(mile, rt);
    return { tz, local: abs + (tz - tz0) * 60 };
  };
  const light = (abs, mile) => {
    const { tz, local } = localOf(abs, mile);
    const date = new Date(base + Math.floor(local / 1440) * 86400000);
    const ll = pointAtMile(mile, rt.waypoints, rt.cum);
    const sun = winter.daylight(date, ll[0], ll[1]);
    if (!sun) return true;
    const wrap = m => ((m + tz * 60) % 1440 + 1440) % 1440;
    const lm = ((local % 1440) + 1440) % 1440;
    return lm >= wrap(sun.rise) + MARGIN && lm <= wrap(sun.set) - MARGIN;
  };
  const townAt = mile => {
    let b = null;
    for (const t of rt.towns || []) if (!b || Math.abs(t.mile - mile) < Math.abs(b.mile - mile)) b = t;
    return b ? b.name.replace(/ \(returning\)$/, '') : 'the road';
  };
  const dateAt = (abs, mile) => isoOf(new Date(base + Math.floor(localOf(abs, mile).local / 1440) * 86400000));

  return days.map((d, i) => {
    const start = it.days[i];
    if (!start) return null;
    const stretches = [];
    let prev = { mile: d.startMile, abs: start.startedAt, name: d.from.name };
    const legs = d.rows.map(r => ({ r, mile: r.mile, arr: r.arrive, dep: r.depart, name: r.stop.name, min: r.driveMin }));
    if (i === days.length - 1)
      legs.push({ mile: rt.miles, arr: it.endsAt, dep: null, name: rt.waypoints[rt.waypoints.length - 1].name,
                  min: it.endsAt - (prev.abs ?? it.endsAt) });
    for (const L of legs) {
      const depAbs = prev.abs;
      const min = L.r ? (L.min || 0) : Math.max(0, L.arr - depAbs);
      if (min >= 3 && depAbs != null) {
        const back = L.mile < prev.mile;            // a double-back: one piece, judged whole
        const lo = Math.min(prev.mile, L.mile), hi = Math.max(prev.mile, L.mile);
        // Judge the road in short pieces, not stop to stop: a twelve-hour run
        // with no stops in it still has daylight interstate in the middle that
        // the co-driver can take. Pieces of the same verdict are merged afterwards.
        const cuts = [lo];
        if (!back) for (let m = lo + PIECE; m < hi - 5; m += PIECE) cuts.push(m);
        cuts.push(hi);
        const atMile = m => depAbs + (back ? (m === hi ? min : 0) : driveMinutes(lo, m, rt) * (min / Math.max(1, driveMinutes(lo, hi, rt))));
        const pieces = [];
        for (let k = 1; k < cuts.length; k++) {
          const pa = cuts[k - 1], pb = cuts[k], ta = atMile(pa), tb = atMile(pb);
          const hard = [], soft = [];
          if (!light(ta, pa) || !light(tb, pb)) hard.push('dark');
          for (const c of it.crossings || []) if (c.mile > pa - 0.5 && c.mile <= pb + 0.5) hard.push(c.name);
          for (const t of rt.towns || []) if (t.risk && t.mile > pa && t.mile <= pb) hard.push(t.name);
          // A metro costs time where its segment ends; treat the miles either
          // side of that point as the city.
          for (const sg of segs) if (sg.penalty && sg.to >= pa - CITY && sg.to <= pb + CITY)
            hard.push(sg.name.replace(/ \(returning\)$/, '') + ' traffic');
          const ll = pointAtMile((pa + pb) / 2, rt.waypoints, rt.cum);
          const z = wx.zoneAt([Math.round(ll[0]), Math.round(ll[1])], dateAt(ta, pa));
          const kind = z && (wx.stepOf(z.snow) ? 'snow' : wx.stepOf(z.rain) ? 'rain' : null);
          if (kind && z.tier === 'forecast') hard.push(kind + ' forecast');
          else if (kind) soft.push(kind + ' possible');
          pieces.push({ a: pa, b: pb, min: tb - ta, who: hard.length ? 'you' : soft.length ? 'maybe' : 'co', why: hard.length ? hard : soft });
        }
        // Too short to be worth pulling over and swapping: give it to Kevin.
        const merge = list => {
          const out = [];
          for (const x of list) {
            const last = out[out.length - 1];
            if (last && last.who === x.who) { last.b = x.b; last.min += x.min; last.why.push(...x.why); }
            else out.push({ ...x, why: [...x.why] });
          }
          return out;
        };
        let run = merge(pieces);
        run.forEach(x => { if (x.who !== 'you' && x.min < MIN_SWAP) { x.who = 'you'; x.why = ['short stretch']; } });
        run = merge(run);
        // Passes and weather first: they are the reasons that matter most.
        const rank = r => (r === 'short stretch' ? 4 : r === 'dark' ? 3 : / traffic$/.test(r) ? 2 : /forecast|possible/.test(r) ? 1 : 0);
        run.forEach((x, k) => {
          if (x.min < 3) return;
          const from = k === 0 ? prev.name : 'near ' + townAt(back ? x.a : x.a);
          const to = k === run.length - 1 ? L.name : 'near ' + townAt(x.b);
          stretches.push({ from, to, min: Math.round(x.min), miles: Math.round(x.b - x.a),
            who: x.who, why: [...new Set(x.why)].sort((p, q) => rank(p) - rank(q)).slice(0, 3) });
        });
      }
      prev = { mile: L.mile, abs: L.dep, name: L.name };
    }
    const sum = w => stretches.filter(s => s.who === w).reduce((a, s) => a + s.min, 0);
    const co = sum('co'), maybe = sum('maybe'), you = sum('you');
    const total = co + maybe + you;
    const prevBed = i ? days[i - 1].rows.find(r => r.kind === 'bed') : null;
    const night = prevBed && prevBed.sleep ? prevBed.sleep.minutes : null;
    const late = d.arriveAt ? Number(d.arriveAt.slice(0, 2)) < 5 : false;
    const reasons = [];
    if (you + maybe >= LONG_YOU) reasons.push(`${fmtHours(you + maybe)} at the wheel for you`);
    else if (total >= LONG_DAY) reasons.push(`${fmtHours(total)} of driving`);
    if (late) reasons.push(`in at ${d.arriveAt}`);
    if (night != null && night < SHORT_NIGHT && you + maybe >= 3 * 60) reasons.push(`after ${fmtHours(night)} of sleep`);
    return { stretches, co, maybe, you, total, night, long: reasons.length > 0, reasons };
  });
}

/// One line for a day: how the wheel splits.
export function splitLine(p) {
  if (!p || !p.total) return '';
  const co = p.co + p.maybe;
  if (!co) return `You drive all of it: ${fmtHours(p.you)}.`;
  return `You ${fmtHours(p.you + p.maybe)}, co-driver ${fmtHours(p.co)}`
    + (p.maybe ? ` (${fmtHours(co)} if it stays dry)` : '') + '.';
}
