// The desktop planner: one road, in the order you drive it, tick what you want.
//
// See desk.html for why this is one column instead of two panes. Short version:
// the two-pane version listed every stop twice and made "add" unfindable.
//
// Everything here is presentation. The arithmetic is js/itinerary.js and
// js/winter.js; the plan lives in js/store.js, shared and synced with the phone.
// This file holds no trip state of its own.

import { store } from './store.js';
import { buildRoute } from './route.js';
import { build, hhmm } from './itinerary.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dur = m => {
  m = Math.round(m);
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m} min`;
};

let DATA = null, legIx = 0, find = '', onlyIn = false;

async function boot() {
  const [route, stops, hours, winter] = await Promise.all([
    fetch('data/route.json').then(r => r.json()),
    fetch('data/stops.json').then(r => r.json()),
    fetch('data/hours.json').then(r => r.json()),
    fetch('data/winter.json').then(r => r.json()),
  ]);
  DATA = { route, stops: stops.stops, HOURS: hours, WINTER: winter };

  $('leg').innerHTML = route.legs.map((l, i) =>
    `<option value="${i}">${esc(l.name)}</option>`).join('');

  $('leg').addEventListener('change', () => { legIx = +$('leg').value; fillRoads(); draw(); });
  for (const id of ['road', 'date', 'at', 'mph']) $(id).addEventListener('change', draw);
  $('find').addEventListener('input', () => { find = $('find').value.toLowerCase(); draw(); });
  $('onlyIn').addEventListener('change', () => { onlyIn = $('onlyIn').checked; draw(); });

  $('clear').addEventListener('click', () => {
    for (const s of current().route.stops) store.chosen.delete(s.id);
    store.save(); draw();
  });
  $('addBig').addEventListener('click', () => {
    for (const s of current().route.stops) if (s.big) store.chosen.add(s.id);
    store.save(); draw();
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
  $('road').innerHTML = leg.routes.map(r =>
    `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  const saved = store.routeFor(leg.id);
  if (leg.routes.some(r => r.id === saved)) $('road').value = saved;
}

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
  const byId = new Map(it.rows.map(r => [r.stop.id, r]));
  const chosen = route.stops.filter(s => store.chosen.has(s.id) && s.kind !== 'lodging');

  $('totals').innerHTML = `
    <div><b>${it.dayCount}</b><span>${it.dayCount === 1 ? 'day' : 'days'}</span></div>
    <div><b>${Math.round(route.miles).toLocaleString()}</b><span>miles</span></div>
    <div><b>${dur(it.driveMin)}</b><span>driving</span></div>
    <div><b>${dur(it.stopMin)}</b><span>at stops</span></div>`;

  const bad = it.rows.filter(r => !r.ok).length;
  $('counts').innerHTML =
    `<b>${chosen.length}</b> picked of ${route.stops.filter(s => s.kind !== 'lodging').length} on this road` +
    (bad ? ` <span class="pill bad">${bad} won't work</span>`
         : chosen.length ? ` <span class="pill ok">all of them work</span>` : '');

  // One pass down the road. Chosen stops carry a clock and open out; the rest
  // stay as a single quiet line you can tick.
  const list = route.stops
    .filter(s => s.kind !== 'lodging')
    .filter(s => !onlyIn || store.chosen.has(s.id))
    .filter(s => !find || (s.name + ' ' + s.town + ' ' + s.state).toLowerCase().includes(find));

  let html = '', lastDay = -1;
  if (!list.length) html = `<p class="empty">Nothing matches “${esc(find)}”.</p>`;
  if (!chosen.length && !find)
    html += `<p class="empty lead">Tick a place to put it in the plan. Start with
      <button class="link" id="addBig2">the highlights</button> if you want a first pass.</p>`;

  for (const s of list) {
    const r = byId.get(s.id);

    if (r && r.dayIx !== lastDay) {
      lastDay = r.dayIx;
      const d = it.days.find(x => x.ix === r.dayIx) || it.days[0];
      html += `<section class="dayhead">
        <h2>Day ${r.dayIx + 1}</h2>
        <div class="date">${WD[d.date.getUTCDay()]} ${d.date.getUTCDate()} ${MON[d.date.getUTCMonth()]}</div>
        <div class="win">Drive from <b>${hhmm(d.open)}</b> to <b>${hhmm(d.shut)}</b>
          <em>${d.why === 'plows'
            ? `${esc(d.riskName)} is clear behind the plows by ${hhmm(d.open)}`
            : `first light ${hhmm(d.rise)}, dark ${hhmm(d.set)}`}</em></div>
      </section>`;
    }

    if (!r) {
      html += `<button class="pick out" data-toggle="${esc(s.id)}">
        <span class="box"></span>
        <span class="nm">${esc(s.name)}${s.kind === 'food' ? '<i>eat</i>' : ''}</span>
        <span class="tw">${esc(s.town)}, ${esc(s.state)}</span>
        <span class="ct">${dur(s.detour * 2 + s.dwell)}</span>
      </button>`;
      continue;
    }

    const h = r.hours;
    html += `<div class="pick in${r.ok ? '' : ' bad'}">
      <button class="box on" data-toggle="${esc(s.id)}" aria-label="Remove"></button>
      <div class="time"><b>${r.arriveAt}</b><span>until ${r.departAt}</span></div>
      <div class="body">
        <div class="nm">${esc(s.name)}${s.kind === 'food' ? '<i>eat</i>' : ''}</div>
        <div class="tw">${esc(s.town)}, ${esc(s.state)} · ${dur(r.driveMin)} drive · ${dur(r.dwell)} here</div>
        ${r.flags.map(f => `<div class="flag ${f.level}">${esc(f.text)}</div>`).join('')}
      </div>
      <div class="hrs">
        ${!h ? `<span class="none">hours not checked</span>`
             : h.shut ? `<span class="closed">Closed today</span>`
             : `<span class="oc">${h.openAt} – ${h.closeAt}</span>`}
        ${r.bestAt ? `<span class="best">best ${r.bestAt}</span>` : ''}
      </div>
    </div>`;
  }

  $('road').innerHTML = html;
  const b2 = $('addBig2');
  if (b2) b2.addEventListener('click', () => $('addBig').click());
}

boot();
