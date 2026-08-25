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
  if (tab === 'map') {
    // The panel is tall on a phone and wide on a desktop. Measure it once and
    // refit, or the map is letterboxed into a landscape box on a portrait
    // screen and most of the zoom range is wasted on empty ground.
    const box = document.querySelector('.mapbox');
    if (box) {
      const r = box.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && ui.setAspect(r.width / r.height)) {
        ui.resetView();
        $scroll.innerHTML = ui.renderMap(legIx);
      }
    }
    wireMap();
  }
}

// ------------------------------------------------------------------ map
// Drag to pan, wheel or pinch to zoom. A pointer that barely moved counts as a
// tap, so pins stay selectable.
function wireMap() {
  const svg = document.getElementById('msvg');
  if (!svg) return;
  const pts = new Map();
  let start = null, moved = 0, pinch = null;

  const at = e => {
    const r = svg.getBoundingClientRect();
    const v = ui.getView() || mapview.fitView(ui.legRoute(legIx), ui.getAspect());
    return {
      x: v.x + (e.clientX - r.left) / r.width * v.w,
      y: v.y + (e.clientY - r.top) / r.height * v.h,
    };
  };
  const zoom = (k, ax, ay) => {
    const v = ui.getView() || mapview.fitView(ui.legRoute(legIx), ui.getAspect());
    ui.setView(mapview.zoomView(v, k, ax, ay, ui.getAspect()));
    draw();
  };

  svg.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, e);
    moved = 0;
    if (pts.size === 1) {
      start = { e, v: ui.getView() || mapview.fitView(ui.legRoute(legIx), ui.getAspect()), r: svg.getBoundingClientRect() };
      svg.classList.add('drag');
    }
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, e);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinch) { const g = d / pinch; if (Math.abs(g - 1) > 0.012) zoom(g); }
      pinch = d; moved = 99;
      return;
    }
    if (!start) return;
    moved += Math.abs(e.clientX - prev.clientX) + Math.abs(e.clientY - prev.clientY);
    const v = start.v, r = start.r;
    const nv = {
      x: v.x - (e.clientX - start.e.clientX) / r.width * v.w,
      y: v.y - (e.clientY - start.e.clientY) / r.height * v.h,
      w: v.w, h: v.h,
    };
    ui.setView(nv);
    svg.setAttribute('viewBox', [nv.x, nv.y, nv.w, nv.h].map(n => n.toFixed(1)).join(' '));
  });

  const up = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) { start = null; svg.classList.remove('drag'); if (moved > 6) draw(); }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  let lastTap = 0;
  svg.addEventListener('pointerup', e => {
    if (moved > 6) return;
    const now = e.timeStamp;
    if (now - lastTap < 320) { const q = at(e); zoom(2.2, q.x, q.y); lastTap = 0; }
    else lastTap = now;
  });

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const q = at(e);
    zoom(e.deltaY < 0 ? 1.22 : 1 / 1.22, q.x, q.y);
  }, { passive: false });

  svg.__zoom = zoom;
}

// ------------------------------------------------------------------ events
document.addEventListener('click', e => {
  if (e.target.closest('a')) return;              // let links be links

  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; sheet = null; draw(); return; }

  const z = e.target.closest('[data-zoom]');
  if (z) {
    const k = z.dataset.zoom;
    if (k === 'fit') ui.resetView();
    else {
      const v = ui.getView() || mapview.fitView(ui.legRoute(legIx), ui.getAspect());
      ui.setView(mapview.zoomView(v, k === 'in' ? 2 : 0.5, null, null, ui.getAspect()));
    }
    draw();
    return;
  }

  const r = e.target.closest('[data-route]');
  if (r) { store.setRoute(r.dataset.rleg, r.dataset.route); ui.resetView(); return; }

  const g = e.target.closest('[data-leg]');
  if (g) { legIx = Number(g.dataset.leg); sheet = null; ui.resetView(); draw(); return; }

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

let resizeT = null;
addEventListener('resize', () => {
  if (tab !== 'map') return;
  clearTimeout(resizeT);
  resizeT = setTimeout(draw, 150);
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
