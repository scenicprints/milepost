// The desktop planner.
//
// Answers, in order: which stops are in, when do I reach each one, is it open
// when I get there, when should I really be there, where do I sleep and for how
// long, and how long is the whole thing. See desk.html for why this is a second
// view rather than a wider phone.
//
// SLEEP IS PLACED, NEVER GUESSED. Every stop has a "+ sleep" under it and a
// night is a duration you set in hours and minutes. Nothing else ends a day.
//
// Everything below is presentation. The arithmetic lives in js/itinerary.js and
// js/winter.js, and the plan itself lives in js/store.js, which is shared with
// the phone app and synced. This file must not invent state of its own.

import { store } from './store.js';
import { buildRoute } from './route.js';
import { build, hhmm } from './itinerary.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let DATA = null, legIx = 0, kind = 'all';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Spelled out because the trip leaves in late December and comes home in
// January. The first version hardcoded "Dec" and would have printed day 19 of
// the trip as 6 Dec.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The input the caret should go back into after a redraw. Editing a night
// changes every time after it, so the list has to be rebuilt on each keystroke
// and the field you are typing in is destroyed underneath you. Each input
// carries a stable data-k, and draw() puts the focus back on it.
let refocus = null;
const dur = m => {
  m = Math.round(m);
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m}m`;
};

async function boot() {
  const [route, stops, hours, winter] = await Promise.all([
    fetch('data/route.json').then(r => r.json()),
    fetch('data/stops.json').then(r => r.json()),
    fetch('data/hours.json').then(r => r.json()),
    fetch('data/winter.json').then(r => r.json()),
  ]);
  DATA = { route, stops: stops.stops, HOURS: hours, WINTER: winter };

  $('leg').innerHTML = route.legs
    .map((l, i) => `<option value="${i}">${esc(l.name)}</option>`).join('');

  for (const el of ['leg', 'road', 'date', 'at', 'mph'])
    $(el).addEventListener('change', () => { if (el === 'leg') { legIx = +$('leg').value; fillRoads(); } draw(); });

  for (const b of document.querySelectorAll('[data-kind]'))
    b.addEventListener('click', () => {
      kind = b.dataset.kind;
      for (const o of document.querySelectorAll('[data-kind]')) o.classList.toggle('on', o === b);
      draw();
    });

  document.addEventListener('click', e => {
    const add = e.target.closest('[data-addsleep]');
    if (add) { refocus = 'sh-' + add.dataset.addsleep; return store.setSleep(add.dataset.addsleep, 8 * 60); }

    const drop = e.target.closest('[data-dropsleep]');
    if (drop) return store.clearSleep(drop.dataset.dropsleep);

    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    store.toggle(t.dataset.toggle);
  });

  // 'change', not 'input': a number stepper fires on every click and the redraw
  // would fight the caret the whole way up from 0 to 8.
  document.addEventListener('change', e => {
    const f = e.target.closest('[data-sleep]');
    if (!f) return;
    const id = f.dataset.sleep;
    const val = k => {
      const el = document.querySelector(`[data-sleep="${CSS.escape(id)}"][data-p="${k}"]`);
      return Math.max(0, Number(el && el.value) || 0);
    };
    refocus = f.dataset.k;
    store.setSleep(id, Math.min(val('h'), 47) * 60 + Math.min(val('m'), 59));
  });

  store.addEventListener('change', draw);
  fillRoads();
  draw();
}

function fillRoads() {
  const leg = DATA.route.legs[legIx];
  $('road').innerHTML = leg.routes
    .map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  const saved = store.routeFor(leg.id);
  if (leg.routes.some(r => r.id === saved)) $('road').value = saved;
}

/// The current built route, and the itinerary over it.
function current() {
  const leg = DATA.route.legs[legIx];
  const opt = leg.routes.find(r => r.id === $('road').value) || leg.routes[0];
  const route = buildRoute(opt, DATA.stops.concat(store.custom));
  const it = build(
    route, store.chosen,
    { date: new Date($('date').value + 'T00:00:00Z'), at: $('at').value || '06:00' },
    { mph: +$('mph').value || 62 },
    { HOURS: DATA.HOURS, WINTER: DATA.WINTER, sleeps: store.sleeps });
  return { route, it };
}

function draw() {
  const { route, it } = current();

  // ---- totals -----------------------------------------------------------
  const days = it.dayCount;
  $('totals').innerHTML = `
    <div><b>${Math.round(route.miles).toLocaleString()}</b><span>miles</span></div>
    <div><b>${it.rows.length}</b><span>stops</span></div>
    <div><b>${dur(it.driveMin)}</b><span>driving</span></div>
    <div><b>${dur(it.stopMin)}</b><span>stopped</span></div>
    <div><b>${it.sleepMin ? dur(it.sleepMin) : '—'}</b><span>asleep</span></div>
    <div class="big"><b>${days}</b><span>${days === 1 ? 'day' : 'days'}</span></div>`;

  // ---- the pool: everything on this road, in or out ----------------------
  const inPlan = new Set(it.rows.map(r => r.stop.id));
  $('pool').innerHTML = route.stops
    .filter(s => s.kind !== 'lodging')
    .filter(s => kind === 'all' || (kind === 'food') === (s.kind === 'food'))
    .map(s => `<button class="poolrow${inPlan.has(s.id) ? ' on' : ''}" data-toggle="${esc(s.id)}">
        <span class="tick"></span>
        <span class="nm">${esc(s.name)}${s.kind === 'food' ? '<i>eat</i>' : ''}</span>
        <span class="tw">${esc(s.town)}, ${esc(s.state)}</span>
        <span class="ct">${dur(s.detour * 2 + s.dwell)}</span>
      </button>`).join('');

  // ---- warnings ---------------------------------------------------------
  const bad = it.rows.filter(r => !r.ok).length;
  $('warn').innerHTML = bad
    ? `<span class="pill bad">${bad} ${bad === 1 ? 'problem' : 'problems'}</span>`
    : `<span class="pill ok">every stop works</span>`;

  // ---- the itinerary, one running clock broken only where you sleep -----
  let html = '', lastDay = -1;
  if (!it.rows.length) html = `<p class="empty">Nothing chosen yet. Pick stops on the left and the clock fills in.</p>`;

  for (const r of it.rows) {
    if (r.dayIx !== lastDay) {
      lastDay = r.dayIx;
      const d = it.days.find(x => x.ix === r.dayIx) || it.days[0];
      const date = d.date;
      html += `<div class="day">
        <h3>Day ${r.dayIx + 1} <span>${WD[date.getUTCDay()]} ${date.getUTCDate()} ${MON[date.getUTCMonth()]}</span></h3>
        <div class="window">Rolling at <b>${esc(d.startAt)}</b> · first light ${hhmm(d.rise)}, dark at <b>${hhmm(d.set)}</b>${
          d.why === 'plows' ? ` · ${esc(d.riskName)} is normally clear behind the plows by ${hhmm(d.open)}` : ''}</div>
      </div>`;
    }

    const h = r.hours;
    html += `<div class="row${r.ok ? '' : ' bad'}">
      <div class="when"><b>${r.arriveAt}</b><span>leave ${r.departAt}</span></div>
      <div class="what">
        <div class="nm">${esc(r.stop.name)}${r.stop.kind === 'food' ? '<i>eat</i>' : ''}</div>
        <div class="sub">${esc(r.stop.town)}, ${esc(r.stop.state)}
          · ${dur(r.driveMin)} to get here · ${dur(r.dwell)} there</div>
        ${r.flags.map(f => `<div class="flag ${f.level}">${esc(f.text)}</div>`).join('')}
      </div>
      <div class="hrs">
        ${h && !h.shut ? `<div class="oc">${h.openAt ?? '—'} – ${h.closeAt ?? '—'}</div>` : ''}
        ${h && h.shut ? `<div class="oc closed">closed</div>` : ''}
        ${!h ? `<div class="oc none">hours unchecked</div>` : ''}
        ${r.bestAt ? `<div class="best">best ${r.bestAt}</div>` : ''}
      </div>
    </div>`;

    html += r.sleep ? sleepBlock(r) : `<div class="gap">
      <button data-addsleep="${esc(r.stop.id)}">sleep here</button>
    </div>`;
  }

  $('itin').innerHTML = html;

  // Put the caret back where it was before the list was rebuilt under it.
  if (refocus) {
    const el = document.querySelector(`[data-k="${CSS.escape(refocus)}"]`);
    if (el) { el.focus(); if (el.select) el.select(); }
    refocus = null;
  }
}

/// A night. Same three columns as a stop row so the clock stays in one line
/// down the page, but it reads as a break rather than as another place.
function sleepBlock(r) {
  const sl = r.sleep;
  const id = esc(r.stop.id);
  const h = Math.floor(sl.minutes / 60), m = sl.minutes % 60;
  return `<div class="sleepblk">
    <div class="when"><b>${sl.downAt}</b><span>up ${sl.wakeAt}</span></div>
    <div class="what">
      <div class="nm">Sleep <i>${dur(sl.minutes)}</i></div>
      <div class="sub">${esc(sl.at)}</div>
      ${sl.flags.map(f => `<div class="flag ${f.level}">${esc(f.text)}</div>`).join('')}
    </div>
    <div class="hrs setter">
      <input type="number" min="0" max="47" step="1" value="${h}"
             data-sleep="${id}" data-p="h" data-k="sh-${id}" aria-label="hours asleep"><span>h</span>
      <input type="number" min="0" max="59" step="5" value="${m}"
             data-sleep="${id}" data-p="m" data-k="sm-${id}" aria-label="minutes asleep"><span>m</span>
      <button data-dropsleep="${id}" title="Remove this night">×</button>
    </div>
  </div>`;
}

boot();
