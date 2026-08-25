// Boot, routing between tabs, and every event the screens fire.

import { store } from './store.js';
import * as ui from './ui.js';
import { maybeShow } from './install.js';

const TABS = [
  { id: 'road',  ic: '🛣️', label: 'Road',  render: ui.renderRoad },
  { id: 'ahead', ic: '📍', label: 'Ahead', render: ui.renderAhead },
  { id: 'map',   ic: '🗺️', label: 'Map',   render: ui.renderMap },
  { id: 'days',  ic: '📅', label: 'Days',  render: ui.renderDays },
  { id: 'book',  ic: '📖', label: 'Book',  render: ui.renderBook },
];

let tab = 'road';
let sheetId = null;

const $app = document.getElementById('app');
const $tabs = document.getElementById('tabs');
const $sheet = document.getElementById('sheet');

async function boot() {
  const [route, stops, usa] = await Promise.all([
    fetch('data/route.json').then(r => r.json()),
    fetch('data/stops.json').then(r => r.json()),
    fetch('data/usa.json').then(r => r.json()),
  ]);
  ui.init({ route, stops: stops.stops, usa });

  // First run: start them off with a sensible plan rather than a blank app.
  if (!store.s.seeded) {
    for (const { route: r } of ui.selected()) store.choose(ui.suggestStops(r));
    store.s.seeded = true;
    store.save();
  }

  $tabs.innerHTML = TABS.map(t =>
    `<button data-tab="${t.id}" aria-selected="${t.id === tab}">
       <span class="ic">${t.ic}</span><span>${t.label}</span></button>`).join('');

  store.addEventListener('change', draw);
  draw();
  maybeShow();
}

function draw() {
  const t = TABS.find(t => t.id === tab);
  $app.innerHTML = t.render();
  for (const b of $tabs.querySelectorAll('button')) {
    b.setAttribute('aria-selected', b.dataset.tab === tab);
  }
  $sheet.innerHTML = sheetId ? ui.stopSheet(sheetId) : '';
  document.getElementById('sub').textContent = t.label === 'Road' ? 'Modesto → Carolina → Houston → home' : '';
}

// ---------------------------------------------------------------- events
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; sheetId = null; draw(); return; }

  const pick = e.target.closest('[data-pick-route]');
  if (pick) { store.setRoute(pick.dataset.leg, pick.dataset.pickRoute); return; }

  const ml = e.target.closest('[data-map-leg]');
  if (ml) { ui.setMapLeg(ml.dataset.mapLeg); draw(); return; }

  const seen = e.target.closest('[data-seen]');
  if (seen) { store.markSeen(seen.dataset.seen); return; }

  const tog = e.target.closest('[data-toggle]');
  if (tog) { store.toggle(tog.dataset.toggle); return; }

  const stop = e.target.closest('[data-stop]');
  if (stop) { sheetId = stop.dataset.stop; draw(); return; }

  if (e.target.closest('[data-close]') || e.target.matches('[data-close-scrim]')) {
    sheetId = null; draw(); return;
  }

  if (e.target.closest('[data-locate]')) {
    navigator.geolocation?.getCurrentPosition(
      p => { ui.setPosition([p.coords.latitude, p.coords.longitude]); draw(); },
      () => alert('Location unavailable. Ahead needs it to know what is coming up.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'depart') store.setDeparture(e.target.value);
});

document.addEventListener('input', e => {
  const n = e.target.closest('[data-note]');
  if (n) store.setNote(n.dataset.note, n.value);
});

// Android back closes the sheet instead of leaving the app.
addEventListener('popstate', () => { if (sheetId) { sheetId = null; draw(); } });

boot();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
