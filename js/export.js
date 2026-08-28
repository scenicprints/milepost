// Turning a plan into text.
//
// WHAT THIS IS FOR, in Kevin's words: "To give to AI to help with and to send."
// Both of those want the same thing and it is not a spreadsheet. It is prose
// with a table in it: readable by a person on a phone, and complete enough that
// something with no other knowledge of this trip can reason about it.
//
// So the export carries the REASONS, not just the numbers. A row saying
// "Meteor Crater 08:19" is data. A row saying it shuts at 17:00, that you are
// there 90 minutes, and that Flagstaff at 6,909 ft has to be crossed in the
// middle of the day is a thing you can be helped with. Anything the planner
// knows and does not say here is knowledge the reader has to guess at.
//
// Markdown, because it survives being pasted anywhere — a chat box, a message,
// a text file — and still reads as a document rather than as a dump.

import { fmtMiles } from './route.js';

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
             'August', 'September', 'October', 'November', 'December'];
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const dur = m => {
  m = Math.round(m || 0);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
};

const dateLine = d => `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

// A pipe inside a cell ends the cell. Nothing in this data should contain one,
// but a stop name is user-editable and a broken table is a silent lie.
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();

/**
 * The whole plan as Markdown.
 *
 * @param route  a built route (buildRoute)
 * @param it     the itinerary over it (itinerary.build)
 * @param meta   { name, legName, routeName, departure: Date, at }
 */
export function toMarkdown(route, it, meta) {
  const L = [];
  const name = meta.name || 'Unsaved plan';

  L.push(`# ${name}`);
  L.push('');
  L.push(`**${meta.legName || 'Trip'}** via **${meta.routeName || route.name}**  `);
  L.push(`Leaving ${dateLine(meta.departure)} at ${meta.at}  `);
  L.push(`${fmtMiles(route.miles)} · ${dur(it.driveMin)} driving · ${dur(it.stopMin)} stopped`
    + `${it.sleepMin ? ` · ${dur(it.sleepMin)} asleep` : ''} · ${it.rows.length} stops`);
  L.push('');

  // The two things a reader cannot infer and will get wrong without being told.
  L.push('> **Times are local to each stop.** The road crosses '
    + `${Math.abs(it.tzShift)} time zone${Math.abs(it.tzShift) === 1 ? '' : 's'} `
    + `(${it.tzShift >= 0 ? '+' : ''}${it.tzShift}h end to end), so the clock `
    + 'jumps forward between some rows. December, so no daylight saving anywhere.  ');
  L.push(`> **Speed is not a single number.** ${Math.round(it.avgMph)} mph is the average `
    + 'that falls out of the posted limit on each stretch of road, plus a penalty for '
    + 'crossing each metro. It is not a setting.');
  L.push('');

  const problems = it.rows.filter(r => !r.ok);
  if (problems.length) {
    L.push(`## ${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`);
    L.push('');
    for (const r of problems)
      for (const f of r.flags.filter(x => x.level === 'bad'))
        L.push(`- **${cell(r.stop.name)}** — ${cell(f.text)}`);
    L.push('');
  }

  L.push('## The days');
  L.push('');

  // A markdown table has to be CONTIGUOUS. Interleaving each stop's warnings
  // between the rows split it into a run of one-row tables that render as
  // garbage, so the day is emitted as a whole table first and the notes are
  // collected underneath it, keyed back to the stop by name.
  const byDay = new Map();
  for (const r of it.rows) {
    if (!byDay.has(r.dayIx)) byDay.set(r.dayIx, []);
    byDay.get(r.dayIx).push(r);
  }

  for (const [ix, rows] of byDay) {
    const d = it.days.find(x => x.ix === ix) || it.days[0];
    L.push('');
    L.push(`### Day ${ix + 1} — ${dateLine(d.date)}`);
    L.push('');
    L.push(`Rolling at ${d.startAt} from ${cell(d.from)}. `
      + `First light ${hhmmOf(d.rise)}, dark at ${hhmmOf(d.set)}.`
      + (d.why === 'plows' && d.riskName
          ? ` **${cell(d.riskName)} is not normally clear behind the plows until ${hhmmOf(d.open)}.**`
          : ''));
    L.push('');
    L.push('| Arrive | Leave | Stop | Where | Drive | Stay | Open | Best |');
    L.push('|---|---|---|---|---|---|---|---|');

    for (const r of rows) {
      const h = r.hours;
      const hrs = !h ? 'not checked'
        : h.shut ? '**CLOSED**'
        : `${h.openAt ?? '—'}–${h.closeAt ?? '—'}`;
      L.push(`| ${r.arriveAt} | ${r.departAt} | ${cell(r.stop.name)}`
        + `${r.stop.kind === 'food' ? ' *(eat)*' : ''} | ${cell(r.stop.town)}, ${cell(r.stop.state)}`
        + ` | ${dur(r.driveMin)} | ${dur(r.dwell)}${r.dwellSet ? '*' : ''}`
        + ` | ${hrs} | ${r.bestAt || '—'} |`);
    }

    const noted = rows.filter(r => r.flags.some(f => f.level !== 'unknown'));
    if (noted.length) {
      L.push('');
      for (const r of noted) {
        for (const f of r.flags.filter(x => x.level !== 'unknown')) {
          const b = f.level === 'bad';
          L.push(`- ${b ? '**' : ''}${cell(r.stop.name)}: ${cell(f.text)}${b ? '**' : ''}`);
        }
      }
    }

    const slept = rows.find(r => r.sleep);
    if (slept) {
      L.push('');
      L.push(`**Sleep ${dur(slept.sleep.minutes)} at ${cell(slept.sleep.at)}** — `
        + `down ${slept.sleep.downAt}, up ${slept.sleep.wakeAt}.`);
      for (const f of slept.sleep.flags) L.push(`  - ${cell(f.text)}`);
    }
  }

  L.push('');
  L.push(`Ends at ${it.endsAtLabel} on the last day, ${it.dayCount} `
    + `${it.dayCount === 1 ? 'day' : 'days'} door to door.`);

  if (it.rows.some(r => r.dwellSet)) {
    L.push('');
    L.push('`*` next to a stay means the time was set by hand, not the researched default.');
  }

  if (it.warnings.length) {
    L.push('');
    L.push('## Worth knowing');
    L.push('');
    for (const w of it.warnings) L.push(`- ${cell(w)}`);
  }

  L.push('');
  L.push('---');
  L.push('');
  L.push('*Generated by Milepost. Arrival times assume the posted-limit pace above '
    + 'and do not include unplanned stops. Opening hours are as researched for late '
    + 'December and are the thing most likely to be out of date — ring ahead before '
    + 'building a day around one.*');

  return L.join('\n');
}

const hhmmOf = m => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
};

/// A filename that will not fight with Windows, a phone, or a shell.
export function fileNameFor(name) {
  const safe = String(name || 'milepost-plan').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'milepost-plan';
  return safe + '.md';
}
