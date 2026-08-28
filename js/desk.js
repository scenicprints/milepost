// The desktop planner.
//
// Answers, in order: which stops are in, when do I reach each one, is it open
// when I get there, when should I really be there, and how long is the whole
// thing. See desk.html for why this is a second view rather than a wider phone.
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
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    store.toggle(t.dataset.toggle);
    draw();
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
    { mph: +$('mph').value || 62, hoursPerDay: 8 },
    { HOURS: DATA.HOURS, WINTER: DATA.WINTER });
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

  // ---- the itinerary, grouped by day ------------------------------------
  let html = '', lastDay = -1;
  if (!it.rows.length) html = `<p class="empty">Nothing chosen yet. Pick stops on the left and the clock fills in.</p>`;

  for (const r of it.rows) {
    if (r.dayIx !== lastDay) {
      lastDay = r.dayIx;
      const d = it.days.find(x => x.ix === r.dayIx) || it.days[0];
      const date = d.date;
      html += `<div class="day">
        <h3>Day ${r.dayIx + 1} <span>${WD[date.getUTCDay()]} ${date.getUTCDate()} Dec</span></h3>
        <div class="window">Road opens <b>${hhmm(d.open)}</b> ${d.why === 'plows'
          ? `— ${esc(d.riskName)} is normally clear behind the plows by then`
          : `— first light is ${hhmm(d.rise)}`}, dark at <b>${hhmm(d.set)}</b></div>
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
  }
  $('itin').innerHTML = html;
}

boot();
