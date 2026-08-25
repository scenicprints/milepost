// Boot, the three tabs, the leg selector, and every event the screens fire.

import { store } from './store.js';
import * as ui from './ui.js';
import * as mapview from './map.js';
import { maybeShow } from './install.js';
import * as syncmod from './sync.js';

const TABS = [
  { id: 'route', label: 'Route', render: ui.renderRoute },
  { id: 'map',   label: 'Map',   render: ui.renderMap },
  { id: 'days',  label: 'Days',  render: ui.renderDays },
];

let tab = 'route';
let legIx = 0;
let sheet = null;          // null | { kind: 'place', id } | { kind: 'trip' }

const $head = document.getElementById('head');
const $scroll = document.getElementById('scroll');
const $tabs = document.getElementById('tabs');
const $sheet = document.getElementById('sheet');

async function boot() {
  const [route, stops, usa, extras] = await Promise.all([
    fetch('data/route.json').then(r => r.json()),
    fetch('data/stops.json').then(r => r.json()),
    fetch('data/usa.json').then(r => r.json()),
    fetch('data/extras.json').then(r => r.json()),
  ]);
  ui.init({ route, stops: stops.stops, usa, sites: extras.sites, normals: extras.normals });

  // First run opens with a real plan rather than a blank app.
  if (!store.s.seeded) {
    for (const r of ui.selected()) store.choose(ui.suggestStops(r));
    store.s.seeded = true;
    store.save();
  }

  $tabs.innerHTML = TABS.map(t =>
    `<button data-tab="${t.id}" aria-selected="${t.id === tab}">${t.label}</button>`).join('');

  store.addEventListener('change', draw);
  syncmod.sync.addEventListener('change', draw);
  draw();
  maybeShow();
  syncmod.resume();
}

function draw() {
  $head.innerHTML = ui.renderHead(legIx);
  $scroll.className = 'scroll' + (tab === 'map' ? ' ismap' : '');
  $scroll.innerHTML = TABS.find(t => t.id === tab).render(legIx);
  for (const b of $tabs.querySelectorAll('[data-tab]'))
    b.setAttribute('aria-selected', String(b.dataset.tab === tab));

  if (sheet) {
    $sheet.innerHTML = sheet.kind === 'trip' ? ui.tripSheet() : ui.placeSheet(sheet.id);
    $sheet.className = 'sheet up';
  } else {
    $sheet.className = 'sheet';
  }

  if (tab === 'map') mountMap();
}

// ============================================================ map
//
// Pan and zoom write a CSS transform on the stage and nothing else. Geometry is
// never recomputed mid-gesture — that was the jitter — and no element is ever
// replaced mid-gesture — that was the jumping.
//
// The gesture model is the standard one (what Flutter's InteractiveViewer does,
// which is what Poppy uses): take a BASELINE when the number of fingers
// changes, then derive the transform from that baseline every move. Deriving it
// incrementally from the previous frame is what accumulates error and lets one
// bad delta throw the map across the country.

let paintTimer = null;

const stage = () => document.getElementById('mstage');
const mapbox = () => document.getElementById('mapbox');

function applyTf(t) {
  ui.setTf(t);
  const el = stage();
  if (el) el.style.transform = `translate(${t.x.toFixed(2)}px, ${t.y.toFixed(2)}px) scale(${t.s.toFixed(5)})`;
}

/// What part of the stage is on screen, in stage units.
function visible(t) {
  const box = mapbox();
  if (!box) return null;
  const r = box.getBoundingClientRect();
  return { x: -t.x / t.s, y: -t.y / t.s, w: r.width / t.s, h: r.height / t.s };
}

function repaint() {
  const t = ui.getTf();
  if (!t) return;
  ui.paintMap(legIx, t.s, visible(t));
}

function schedulePaint(ms = 140) {
  clearTimeout(paintTimer);
  paintTimer = setTimeout(repaint, ms);
}

function fitTf() {
  const box = mapbox();
  const r = box.getBoundingClientRect();
  return mapview.fitTransform(mapview.bounds(ui.legRoute(legIx)), r.width, r.height);
}

function mountMap() {
  const box = mapbox();
  if (!box) return;
  applyTf(ui.getTf() || fitTf());
  repaint();
  wireMap(box);
}

function wireMap(box) {
  if (box.__wired) return;
  box.__wired = true;

  const pts = new Map();
  let base = null;

  /// Centroid and average spread of the live pointers, in client pixels.
  function touchState() {
    const a = [...pts.values()];
    let cx = 0, cy = 0;
    for (const p of a) { cx += p.clientX; cy += p.clientY; }
    cx /= a.length; cy /= a.length;
    let spread = 0;
    if (a.length > 1) {
      for (const p of a) spread += Math.hypot(p.clientX - cx, p.clientY - cy);
      spread /= a.length;
    }
    return { n: a.length, cx, cy, spread };
  }

  /// Re-baseline. Called whenever a finger goes down or comes up, so adding or
  /// lifting a finger never makes the map jump.
  function rebase() {
    base = { t: { ...(ui.getTf() || fitTf()) }, st: touchState() };
  }

  function onMove() {
    if (!base || !pts.size) return;
    const st = touchState();
    if (st.n !== base.st.n) { rebase(); return; }

    const T = base.t;
    let s = T.s;
    if (st.n > 1 && base.st.spread > 1) s = mapview.clampScale(T.s * (st.spread / base.st.spread));

    // The stage point under the baseline centroid must end up under the
    // current centroid. Derived from the baseline, never from last frame.
    const wx = (base.st.cx - T.x) / T.s;
    const wy = (base.st.cy - T.y) / T.s;
    applyTf({ s, x: st.cx - wx * s, y: st.cy - wy * s });
  }

  box.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, e);
    rebase();
    box.classList.add('drag');
    try { box.setPointerCapture(e.pointerId); } catch (_) {}
  });

  box.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, e);
    onMove();
  });

  const lift = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size) { rebase(); return; }
    base = null;
    box.classList.remove('drag');
    schedulePaint(80);
  };
  box.addEventListener('pointerup', lift);
  box.addEventListener('pointercancel', lift);

  box.addEventListener('wheel', e => {
    e.preventDefault();
    const t = ui.getTf() || fitTf();
    const r = box.getBoundingClientRect();
    const s = mapview.clampScale(t.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    const wx = (e.clientX - r.left - t.x) / t.s;
    const wy = (e.clientY - r.top - t.y) / t.s;
    applyTf({ s, x: e.clientX - r.left - wx * s, y: e.clientY - r.top - wy * s });
    schedulePaint();
  }, { passive: false });

  // Safari fires these as well and will zoom the whole page if left alone.
  for (const g of ['gesturestart', 'gesturechange', 'gestureend'])
    box.addEventListener(g, e => e.preventDefault());

  new ResizeObserver(() => {
    if (tab !== 'map') return;
    if (!ui.getTf()) applyTf(fitTf());
    schedulePaint(120);
  }).observe(box);
}

/// Zoom a step about the middle of the panel.
function zoomStep(k) {
  const box = mapbox();
  if (!box) return;
  const r = box.getBoundingClientRect();
  const t = ui.getTf() || fitTf();
  const s = mapview.clampScale(t.s * k);
  const wx = (r.width / 2 - t.x) / t.s;
  const wy = (r.height / 2 - t.y) / t.s;
  applyTf({ s, x: r.width / 2 - wx * s, y: r.height / 2 - wy * s });
  schedulePaint(60);
}

// ============================================================ events
document.addEventListener('click', e => {
  if (e.target.closest('a')) return;              // let links be links

  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; sheet = null; draw(); return; }

  const z = e.target.closest('[data-zoom]');
  if (z) {
    const k = z.dataset.zoom;
    if (k === 'fit') { ui.resetTf(); applyTf(fitTf()); repaint(); }
    else zoomStep(k === 'in' ? 1.6 : 1 / 1.6);
    return;
  }

  const r = e.target.closest('[data-route]');
  if (r) { store.setRoute(r.dataset.rleg, r.dataset.route); ui.resetTf(); return; }

  const g = e.target.closest('[data-leg]');
  if (g) { legIx = Number(g.dataset.leg); sheet = null; ui.resetTf(); draw(); return; }

  if (e.target.closest('[data-trip]')) { sheet = { kind: 'trip' }; draw(); return; }

  const tg = e.target.closest('[data-toggle]');
  if (tg) { store.toggle(tg.dataset.toggle); return; }

  const sn = e.target.closest('[data-seen]');
  if (sn) { store.markSeen(sn.dataset.seen); return; }

  const st = e.target.closest('[data-stop]');
  if (st) { sheet = { kind: 'place', id: st.dataset.stop }; draw(); return; }

  if (e.target.closest('[data-close]')) { sheet = null; draw(); return; }

  const cp = e.target.closest('[data-copy-code]');
  if (cp) { copyCode(cp.dataset.copyCode, cp); return; }

  if (e.target.closest('[data-sync-connect]')) {
    syncmod.connect(document.getElementById('tripcode')?.value || '');
    return;
  }
  if (e.target.closest('[data-sync-off]')) { syncmod.disconnect(); return; }
  if (e.target.closest('[data-cleardep]')) { store.setDeparture(null); return; }

  if (e.target.closest('[data-locate]')) {
    navigator.geolocation?.getCurrentPosition(
      p => { ui.setPosition([p.coords.latitude, p.coords.longitude]); draw(); },
      () => alert('Location unavailable.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'depart' && e.target.value) store.setDeparture(e.target.value);
});

// Android back closes a sheet instead of leaving the app.
addEventListener('popstate', () => { if (sheet) { sheet = null; draw(); } });

/// Clipboard needs a secure context and can still be refused; the textarea
/// fallback is what actually works on older iOS Safari.
async function copyCode(code, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(code); ok = true; }
  catch (_) {
    try {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    } catch (_) {}
  }
  const span = btn.querySelector('span');
  if (span) {
    const was = span.textContent;
    span.textContent = ok ? 'Copied' : 'Select by hand';
    setTimeout(() => { span.textContent = was; }, 1600);
  }
}

boot();

// Cache-first for data means a deployed change would otherwise sit behind the
// old copy until a cold start. The new worker skips waiting, so when it takes
// control we reload once. Without this, a fix pushed mid-trip never arrives.
if ('serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
