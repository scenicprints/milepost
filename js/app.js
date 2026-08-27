// Boot, the three tabs, the leg selector, and every event the screens fire.

import { store } from './store.js';
import * as ui from './ui.js';
import * as mapview from './map.js';
import { maybeShow } from './install.js';
import * as syncmod from './sync.js';
import { VERSION } from './version.js';

const TABS = [
  { id: 'next',  label: 'Next',  render: () => ui.renderNext() },
  { id: 'route', label: 'Route', render: ui.renderRoute },
  { id: 'map',   label: 'Map',   render: ui.renderMap },
  { id: 'days',  label: 'Days',  render: ui.renderDays },
  { id: 'trip',  label: 'Trip',  render: () => ui.renderTrip(upd) },
];

let tab = 'route';
let legIx = 0;
let sheet = null;          // null | { kind: 'place', id } | { kind: 'trip' }

const $head = document.getElementById('head');
const $scroll = document.getElementById('scroll');
const $tabs = document.getElementById('tabs');
const $sheet = document.getElementById('sheet');

async function boot() {
  const [route, stops, usa, extras, darksky] = await Promise.all([
    fetch('data/route.json').then(r => r.json()),
    fetch('data/stops.json').then(r => r.json()),
    fetch('data/usa.json').then(r => r.json()),
    fetch('data/extras.json').then(r => r.json()),
    // Optional: the app works without it, and the Sky button simply never shows.
    fetch('data/darksky.json').then(r => r.json()).catch(() => null),
  ]);
  ui.init({ route, stops: stops.stops, usa, darksky,
    sites: extras.sites, normals: extras.normals, bookings: extras.bookings || {} });

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
  // If location was on last session, pick it back up — you're probably still
  // driving. Opens on Next in that case, which is the screen you want.
  if (localStorage.getItem('milepost.watch') === '1') {
    tab = 'next';
    startWatch();
  }
}

function draw() {
  $head.innerHTML = ui.renderHead(legIx, tab);
  $scroll.className = 'scroll' + (tab === 'map' ? ' ismap' : '');
  $scroll.innerHTML = TABS.find(t => t.id === tab).render(legIx);
  for (const b of $tabs.querySelectorAll('[data-tab]'))
    b.setAttribute('aria-selected', String(b.dataset.tab === tab));

  if (ui.editing()) {
    $sheet.innerHTML = ui.editorSheet();
    $sheet.style.transform = '';
    $sheet.className = 'sheet up';
    wireSheetDrag();
  } else if (sheet) {
    $sheet.innerHTML = ui.placeSheet(sheet.id);
    $sheet.style.transform = '';
    $sheet.className = 'sheet up';
    wireSheetDrag();
    ui.hydrateWeather(sheet.id);
  } else {
    $sheet.className = 'sheet';
    $sheet.style.transform = '';
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

/// The editor redraws on every choice, so pull the typed fields into the draft
/// first or they would be wiped by the re-render.
function readDraft() {
  if (!ui.editing()) return;
  const v = id => (document.getElementById(id) || {}).value;
  const patch = {};
  if (v('ed-name') != null) patch.name = v('ed-name');
  if (v('ed-find') != null) patch.query = v('ed-find');
  if (v('ed-why') != null) patch.why = v('ed-why');
  ui.patchDraft(patch);
}

// ============================================================ sheet gestures
//
// Swipe the sheet down to put it away. Only starts when the sheet's own scroll
// is already at the top, or when the drag begins on the grab handle — otherwise
// it would steal scrolling from the content.

function wireSheetDrag() {
  if ($sheet.__wired) return;
  $sheet.__wired = true;

  let y0 = 0, dy = 0, live = false, id = null, t0 = 0;

  const body = () => $sheet.querySelector('.sb');

  $sheet.addEventListener('pointerdown', e => {
    if (e.target.closest('a, button:not([data-grab])')) return;
    const b = body();
    const onHandle = !!e.target.closest('[data-grab]');
    if (!onHandle && b && b.scrollTop > 0) return;
    id = e.pointerId; y0 = e.clientY; dy = 0; live = true; t0 = e.timeStamp;
    $sheet.classList.add('dragging');
  });

  $sheet.addEventListener('pointermove', e => {
    if (!live || e.pointerId !== id) return;
    dy = e.clientY - y0;
    if (dy <= 0) { $sheet.style.transform = ''; return; }
    const b = body();
    if (b && b.scrollTop > 0) { live = false; $sheet.classList.remove('dragging'); return; }
    e.preventDefault();
    $sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: false });

  const end = e => {
    if (!live || e.pointerId !== id) return;
    live = false;
    $sheet.classList.remove('dragging');
    $sheet.style.transform = '';
    // A short flick counts as much as a long drag.
    const quick = dy > 45 && (e.timeStamp - t0) < 260;
    if (dy > 110 || quick) { sheet = null; ui.closeEditor(); draw(); }
    dy = 0;
  };
  $sheet.addEventListener('pointerup', end);
  $sheet.addEventListener('pointercancel', end);
}

// ============================================================ updates
//
// The service worker no longer takes over by itself — it used to swap the code
// under a running session. Updates are a button in Trip now.

let upd = { updateReady: false, updateNote: '' };
let reg = null;

function setUpd(patch) { upd = { ...upd, ...patch }; if (tab === 'trip') draw(); }

async function checkUpdate() {
  if (!reg) { setUpd({ updateNote: 'Updates need the app installed or reloaded once.' }); return; }
  if (reg.waiting) { setUpd({ updateReady: true, updateNote: 'An update is downloaded and ready.' }); return; }
  setUpd({ updateNote: 'Checking…' });
  try {
    await reg.update();
    if (reg.installing) {
      setUpd({ updateNote: 'Downloading…' });
      reg.installing.addEventListener('statechange', function () {
        if (this.state === 'installed' && navigator.serviceWorker.controller)
          setUpd({ updateReady: true, updateNote: 'An update is downloaded and ready.' });
        else if (this.state === 'activated')
          setUpd({ updateNote: `You're on the latest version.` });
      });
    } else if (reg.waiting) {
      setUpd({ updateReady: true, updateNote: 'An update is downloaded and ready.' });
    } else {
      setUpd({ updateNote: `You're on the latest version.` });
    }
  } catch (_) {
    setUpd({ updateNote: 'Could not reach the server. Try again with signal.' });
  }
}

function applyUpdate() {
  if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  else location.reload();
}

// ============================================================ location
//
// watchPosition, not a one-shot: this is a screen you glance at while moving.
// Started only when asked, because a continuous GPS lock costs battery and
// there is no reason to hold one in August.

let watchId = null;

function startWatch() {
  if (!navigator.geolocation) return;
  if (watchId != null) return;
  watchId = navigator.geolocation.watchPosition(
    p => { ui.setPosition([p.coords.latitude, p.coords.longitude]); draw(); },
    () => { stopWatch(); },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  );
  try { localStorage.setItem('milepost.watch', '1'); } catch (_) {}
  draw();
}

function stopWatch() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  try { localStorage.removeItem('milepost.watch'); } catch (_) {}
}

export function watching() { return watchId != null; }

// ============================================================ events
document.addEventListener('click', e => {
  if (e.target.closest('a')) return;              // let links be links

  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; sheet = null; draw(); return; }

  const kf = e.target.closest('[data-kindfilter]');
  if (kf) { ui.setKindFilter(kf.dataset.kindfilter); draw(); return; }

  const z = e.target.closest('[data-zoom]');
  if (z) {
    const k = z.dataset.zoom;
    if (k === 'fit') { ui.resetTf(); applyTf(fitTf()); repaint(); }
    else zoomStep(k === 'in' ? 1.6 : 1 / 1.6);
    return;
  }

  const sk = e.target.closest('[data-sky]');
  if (sk) {
    // Same as the drawer: repaint the layer, do not rebuild the tab, so the
    // overlay never yanks the map out from under you.
    ui.setSky(!ui.skyOn());
    sk.setAttribute('aria-pressed', String(ui.skyOn()));
    repaint();
    return;
  }

  const dr = e.target.closest('[data-drawer]');
  if (dr) {
    // Toggled on the element rather than through draw(), so opening the drawer
    // never repaints the map underneath it.
    ui.setDrawer(!ui.drawerOpen());
    const el = document.getElementById('mways');
    if (el) {
      el.classList.toggle('up', ui.drawerOpen());
      el.querySelector('.mwbar').setAttribute('aria-expanded', String(ui.drawerOpen()));
      el.querySelector('.x').textContent = ui.drawerOpen() ? 'Close' : 'Why';
    }
    return;
  }

  // The view is NOT reset. You swap routes to watch the line move, and refitting
  // would throw away the zoom you did to see where they split — the same mistake
  // resetView() made on every aspect change in session 8.
  const r = e.target.closest('[data-route]');
  if (r) { store.setRoute(r.dataset.rleg, r.dataset.route); return; }

  const g = e.target.closest('[data-leg]');
  if (g) { legIx = Number(g.dataset.leg); sheet = null; ui.resetTf(); draw(); return; }

  const tg = e.target.closest('[data-toggle]');
  if (tg) { store.toggle(tg.dataset.toggle); return; }

  const sn = e.target.closest('[data-seen]');
  if (sn) { store.markSeen(sn.dataset.seen); return; }

  const bk = e.target.closest('[data-book]');
  if (bk) { store.toggleBooked(bk.dataset.book); return; }

  // ---- the editor ----
  if (e.target.closest('[data-add]')) { ui.openEditor({ leg: legIx }); draw(); return; }

  const ab = e.target.closest('[data-addbed]');
  if (ab) {
    ui.openEditor({ leg: Number(ab.dataset.addbed), kind: 'lodging',
                    query: [ab.dataset.town, ab.dataset.st].filter(Boolean).join(', ') });
    draw();
    return;
  }

  const ed = e.target.closest('[data-edit]');
  if (ed) {
    const c = store.custom.find(x => x.id === ed.dataset.edit);
    if (c) { ui.openEditor({ ...c, query: [c.town, c.state].filter(Boolean).join(', ') }); sheet = null; draw(); }
    return;
  }

  if (e.target.closest('[data-editor-close]')) { ui.closeEditor(); draw(); return; }

  const kd = e.target.closest('[data-kind]');
  if (kd) { readDraft(); ui.patchDraft({ kind: kd.dataset.kind }); draw(); return; }

  const lp = e.target.closest('[data-leg-pick]');
  if (lp) { readDraft(); ui.patchDraft({ leg: Number(lp.dataset.legPick) }); draw(); return; }

  const dw = e.target.closest('[data-dwell]');
  if (dw) { readDraft(); ui.patchDraft({ dwell: Number(dw.dataset.dwell) }); draw(); return; }

  if (e.target.closest('[data-find]')) {
    readDraft();
    const q = (document.getElementById('ed-find') || {}).value || '';
    ui.patchDraft({ query: q, busy: true });
    draw();
    ui.runSearch(q).then(draw);
    return;
  }

  if (e.target.closest('[data-here]')) {
    readDraft();
    navigator.geolocation?.getCurrentPosition(
      pos => { ui.patchDraft({ ll: [pos.coords.latitude, pos.coords.longitude], results: null, failed: false }); draw(); },
      () => { ui.patchDraft({ failed: true }); draw(); },
      { enableHighAccuracy: true, timeout: 12000 });
    return;
  }

  const pk = e.target.closest('[data-pick]');
  if (pk) {
    readDraft();
    const d = ui.editing();
    const r = d && d.results && d.results[Number(pk.dataset.pick)];
    if (r) ui.patchDraft({ ll: r.ll, town: r.town, state: r.state, results: null,
                           name: d.name || r.label.split(',')[0] });
    draw();
    return;
  }

  if (e.target.closest('[data-editor-save]')) {
    readDraft();
    const d = ui.editing();
    if (!d) return;
    if (!d.ll || !d.name.trim()) {
      const el = document.getElementById(d.name.trim() ? 'ed-find' : 'ed-name');
      if (el) { el.style.borderColor = 'var(--signal)'; el.focus(); }
      return;
    }
    const payload = {
      name: d.name.trim(), town: d.town, state: d.state, ll: d.ll,
      dwell: d.kind === 'lodging' ? 0 : d.dwell, detour: d.kind === 'lodging' ? 0 : 5,
      why: d.why, kind: d.kind, routes: ui.legRouteIds(d.leg),
    };
    if (d.id) store.updateCustom(d.id, payload);
    else store.addCustom(payload);
    ui.closeEditor();
    draw();
    return;
  }

  if (e.target.closest('[data-editor-delete]')) {
    const d = ui.editing();
    if (d && d.id) store.removeCustom(d.id);
    ui.closeEditor();
    draw();
    return;
  }

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

  if (e.target.closest('[data-update]')) {
    if (upd.updateReady) applyUpdate(); else checkUpdate();
    return;
  }
  if (e.target.closest('[data-cleardep]')) { store.setDeparture(null); return; }

  if (e.target.closest('[data-watch]')) { startWatch(); return; }

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

// Notes save as you type, debounced, without redrawing the sheet under you.
let noteT = null;
document.addEventListener('input', e => {
  const n = e.target.closest('[data-note]');
  if (!n) return;
  clearTimeout(noteT);
  noteT = setTimeout(() => store.setNoteQuiet(n.dataset.note, n.value), 400);
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

if ('serviceWorker' in navigator) {
  // Reload only once the user has asked for the update and the new worker has
  // taken control. Nothing swaps under a running session on its own.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
  const register = async () => {
    try {
      reg = await navigator.serviceWorker.register('sw.js');
      if (reg.waiting) setUpd({ updateReady: true, updateNote: 'An update is downloaded and ready.' });
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller)
            setUpd({ updateReady: true, updateNote: 'An update is downloaded and ready.' });
        });
      });
    } catch (_) {}
  };
  // Modules are deferred, so 'load' normally still fires after this runs — but
  // if it has already gone, waiting for it would leave reg null forever and the
  // update button could never work.
  if (document.readyState === 'complete') register();
  else addEventListener('load', register);
}
