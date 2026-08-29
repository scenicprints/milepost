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
// YOUR OWN PLACES. The editor writes through store.addCustom, the same call the
// phone uses, so a place added here is the same object the phone reads and it
// syncs. Two rules come with that and neither is optional: a custom stop must
// carry REAL ROUTE IDS or buildRoute filters it straight back out and it simply
// never appears, and lodging costs no detour and no dwell because it ends a day
// rather than interrupting one.
//
// Everything below is presentation. The arithmetic lives in js/itinerary.js and
// js/winter.js, and the plan itself lives in js/store.js, which is shared with
// the phone app and synced. This file must not invent state of its own.

import { store } from './store.js';
import { buildRoute } from './route.js';
import { build, hhmm } from './itinerary.js';
import { toMarkdown, fileNameFor } from './export.js';
import * as geo from './geocode.js';

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

// The editor's own state. It is deliberately NOT part of draw(): the itinerary
// rebuilds on every toggle and keystroke, and a text field inside that would be
// destroyed under the caret. drawEditor() is called only when the form itself
// changes, and the field values are read off the DOM at save.
let draft = null;
/// "Kingman, AZ", or just one of them, or nothing at all. A place added by
/// pasting coordinates has no town, and "` , `" is not a location.
const place = s => [s.town, s.state].filter(Boolean).join(', ');

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

  // The departure lives in the store now, because a saved plan has to be able
  // to carry a different one. It is still never committed to the repo.
  if (store.departure) $('date').value = store.departure;
  $('at').value = store.departAt;

  for (const el of ['leg', 'road', 'date', 'at'])
    $(el).addEventListener('change', () => {
      if (el === 'leg') { legIx = +$('leg').value; fillRoads(); }
      if (el === 'date') store.setDeparture($('date').value);
      if (el === 'at') store.setDepartAt($('at').value);
      draw();
    });

  wirePlans();

  for (const b of document.querySelectorAll('[data-kind]'))
    b.addEventListener('click', () => {
      kind = b.dataset.kind;
      for (const o of document.querySelectorAll('[data-kind]')) o.classList.toggle('on', o === b);
      draw();
    });

  document.addEventListener('click', e => {
    // ---- the editor ------------------------------------------------------
    if (e.target.closest('[data-add]')) { openEditor({}); return; }
    if (e.target.closest('[data-ed-close]')) { closeEditor(); return; }

    const edit = e.target.closest('[data-edit]');
    if (edit) {
      const c = store.custom.find(x => x.id === edit.dataset.edit);
      if (c) openEditor({ ...c, query: [c.town, c.state].filter(Boolean).join(', ') });
      return;
    }

    const kind = e.target.closest('[data-ed-kind]');
    if (kind) { readDraft(); draft.kind = kind.dataset.edKind; drawEditor(); return; }

    if (e.target.closest('[data-ed-find]')) {
      readDraft();
      const q = draft.query;
      draft.busy = true; draft.failed = false; draft.results = null;
      drawEditor();
      geo.search(q).then(r => {
        if (!draft) return;                    // closed while it was in flight
        draft.busy = false;
        if (r === null) draft.failed = true; else draft.results = r;
        drawEditor();
      });
      return;
    }

    const pick = e.target.closest('[data-ed-pick]');
    if (pick) {
      readDraft();
      const r = draft.results && draft.results[Number(pick.dataset.edPick)];
      if (r) Object.assign(draft, {
        ll: r.ll, town: r.town, state: r.state, results: null,
        name: draft.name.trim() || r.label.split(',')[0],
      });
      drawEditor();
      return;
    }

    if (e.target.closest('[data-ed-save]')) {
      readDraft();
      if (!draft.name.trim() || !draft.ll) {
        const el = $(draft.name.trim() ? 'ed-lat' : 'ed-name');
        if (el) { el.style.borderColor = 'var(--signal)'; el.focus(); }
        return;
      }
      const bed = draft.kind === 'lodging';
      const payload = {
        name: draft.name.trim(), town: draft.town, state: draft.state, ll: draft.ll,
        // A bed ends the day, so it never competes for the day's hours.
        dwell: bed ? 0 : draft.dwell, detour: bed ? 0 : draft.detour,
        why: draft.why, kind: draft.kind,
        // REAL route ids, every road on this leg. Without these buildRoute
        // filters the stop out and it never appears anywhere.
        routes: DATA.route.legs[legIx].routes.map(r => r.id),
      };
      if (draft.id) store.updateCustom(draft.id, payload);
      else store.addCustom(payload);
      closeEditor();
      return;                                  // store.save() redraws
    }

    if (e.target.closest('[data-ed-delete]')) {
      if (draft && draft.id) store.removeCustom(draft.id);
      closeEditor();
      return;
    }

    const add = e.target.closest('[data-addsleep]');
    if (add) { refocus = 'sh-' + add.dataset.addsleep; return store.setSleep(add.dataset.addsleep, 8 * 60); }

    const drop = e.target.closest('[data-dropsleep]');
    if (drop) return store.clearSleep(drop.dataset.dropsleep);

    const dd = e.target.closest('[data-dropdwell]');
    if (dd) return store.clearDwell(dd.dataset.dropdwell);

    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    store.toggle(t.dataset.toggle);
  });

  // 'change', not 'input': a number stepper fires on every click and the redraw
  // would fight the caret the whole way up from 0 to 8.
  document.addEventListener('change', e => {
    const pair = (attr, id, k) => {
      const el = document.querySelector(`[data-${attr}="${CSS.escape(id)}"][data-p="${k}"]`);
      return Math.max(0, Number(el && el.value) || 0);
    };

    const f = e.target.closest('[data-sleep]');
    if (f) {
      const id = f.dataset.sleep;
      refocus = f.dataset.k;
      return store.setSleep(id, Math.min(pair('sleep', id, 'h'), 47) * 60
                              + Math.min(pair('sleep', id, 'm'), 59));
    }

    const d = e.target.closest('[data-dwell]');
    if (d) {
      const id = d.dataset.dwell;
      refocus = d.dataset.k;
      return store.setDwell(id, Math.min(pair('dwell', id, 'h'), 47) * 60
                              + Math.min(pair('dwell', id, 'm'), 59));
    }
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
  currentLeg = leg; currentOpt = opt;
  const route = buildRoute(opt, DATA.stops.concat(store.custom), store.dwells);
  const it = build(
    route, store.chosen,
    { date: new Date($('date').value + 'T00:00:00Z'), at: $('at').value || '06:00' },
    { HOURS: DATA.HOURS, WINTER: DATA.WINTER, sleeps: store.sleeps });
  return { route, it };
}

// ============================================================ saved plans ===
//
// The store does the work; this only renders it. A plan belongs to a road, so
// the list is filtered by the road selected above — see store.listPlans.
let currentLeg = null, currentOpt = null;

function drawPlanBar() {
  const rid = currentOpt ? currentOpt.id : null;
  const list = store.listPlans(rid);
  const active = store.activePlan;
  const known = list.some(p => p.id === active);

  $('plan').innerHTML =
    `<option value="">${list.length ? '— pick a saved plan —' : '— nothing saved for this road —'}</option>`
    + list.map(p => `<option value="${esc(p.id)}"${p.id === active ? ' selected' : ''}>${esc(p.name)}</option>`).join('');

  const dirty = store.planIsDirty(rid);
  const el = $('dirty');
  if (!known) el.textContent = dirty ? 'unsaved' : '';
  else el.textContent = dirty ? 'edited — not saved' : 'saved';
  el.className = 'dirty' + (known && !dirty ? ' saved' : '');

  // Nothing to rename, delete or overwrite until a plan is actually loaded.
  for (const id of ['prename', 'pdel']) $(id).disabled = !known;
  $('psave').textContent = known ? 'save' : 'save plan';
}

/// The plan as text, for the clipboard or a file.
function planMarkdown() {
  const { route, it } = current();
  const active = store.activePlan && store.getPlan(store.activePlan);
  return toMarkdown(route, it, {
    name: active ? active.name : 'Unsaved plan',
    legName: currentLeg ? currentLeg.name : '',
    routeName: currentOpt ? currentOpt.name : '',
    departure: new Date($('date').value + 'T00:00:00Z'),
    at: $('at').value || '06:00',
  });
}

function draw() {
  const { route, it } = current();
  drawPlanBar();

  // ---- totals -----------------------------------------------------------
  const days = it.dayCount;
  $('totals').innerHTML = `
    <div><b>${Math.round(route.miles).toLocaleString()}</b><span>miles</span></div>
    <div><b>${it.stopCount}</b><span>stops</span></div>
    <div><b>${dur(it.driveMin)}</b><span>driving</span></div>
    <div><b>${Math.round(it.avgMph)}</b><span>avg mph</span></div>
    <div><b>${dur(it.stopMin)}</b><span>stopped</span></div>
    <div><b>${it.sleepMin ? dur(it.sleepMin) : '—'}</b><span>asleep</span></div>
    <div class="big"><b>${days}</b><span>${days === 1 ? 'day' : 'days'}</span></div>`;

  // ---- the pool: everything on this road, in or out ----------------------
  const inPlan = new Set(it.rows.map(r => r.stop.id));
  // A row is a div holding two buttons: a button inside a button is invalid
  // HTML and the edit control has to be independently clickable.
  $('pool').innerHTML = route.stops
    .filter(s => s.kind !== 'lodging')
    .filter(s => kind === 'all' || (kind === 'food') === (s.kind === 'food'))
    .map(s => `<div class="poolrow${inPlan.has(s.id) ? ' on' : ''}${s.mine ? ' mine' : ''}">
        <button class="pick" data-toggle="${esc(s.id)}">
          <span class="tick"></span>
          <span class="nm">${esc(s.name)}${s.kind === 'food' ? '<i>eat</i>' : ''}${s.mine ? '<i class="own">yours</i>' : ''}</span>
          <span class="tw">${esc(place(s))}</span>
          <span class="ct">${dur(s.detour * 2 + s.dwell)}</span>
        </button>
        ${s.mine ? `<button class="edit" data-edit="${esc(s.id)}" title="Edit this place">edit</button>` : ''}
      </div>`).join('');

  // Your own beds never reach the pool, since it filters lodging out, so they
  // get their own short list under it or they would be unreachable to edit.
  // Beds get their own list because the pool above filters lodging out, but
  // they behave like any other stop: click to put them in the plan. Where the
  // night falls is decided by the bed's own mile, not by anything you pick.
  const beds = store.custom.filter(c => c.kind === 'lodging');
  if (beds.length) {
    const onRoute = new Set(route.stops.map(s => s.id));
    $('pool').innerHTML += `<div class="poolBeds">
      <div class="poolLab">Your beds <i>click to sleep there</i></div>
      ${beds.map(b => {
        const here = onRoute.has(b.id);
        return `<div class="poolrow mine bed${inPlan.has(b.id) ? ' on' : ''}">
          <button class="pick" data-toggle="${esc(b.id)}" ${here ? '' : 'disabled'}>
            <span class="tick"></span>
            <span class="nm">${esc(b.name)}</span>
            <span class="tw">${here ? esc(place(b)) : 'not on this road'}</span>
          </button>
          <button class="edit" data-edit="${esc(b.id)}">edit</button>
        </div>`;
      }).join('')}</div>`;
  }

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

    // A bed row is the night itself, so it renders as the sleep block and
    // nothing else. There is no arrival-versus-opening-hours question at a
    // truck stop you are asleep in.
    if (r.kind === 'bed') { html += sleepBlock(r); continue; }

    const h = r.hours;
    const sid = esc(r.stop.id);
    const dh = Math.floor(r.dwell / 60), dm = r.dwell % 60;
    html += `<div class="row${r.ok ? '' : ' bad'}">
      <div class="when"><b>${r.arriveAt}</b><span>leave ${r.departAt}</span></div>
      <div class="what">
        <div class="nm">${esc(r.stop.name)}${r.stop.kind === 'food' ? '<i>eat</i>' : ''}</div>
        <div class="sub">${place(r.stop) ? esc(place(r.stop)) + ' · ' : ''}${dur(r.driveMin)} to get here</div>
        <div class="stay">how long
          <input type="number" min="0" max="47" step="1" value="${dh}"
                 data-dwell="${sid}" data-p="h" data-k="dh-${sid}" aria-label="hours here"><span>h</span>
          <input type="number" min="0" max="59" step="5" value="${dm}"
                 data-dwell="${sid}" data-p="m" data-k="dm-${sid}" aria-label="minutes here"><span>m</span>
          ${r.dwellSet ? `<button data-dropdwell="${sid}" title="Back to the researched ${dur(r.seedDwell)}">reset</button>` : ''}
        </div>
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

/// Saved-plan buttons. Deliberately plain prompts rather than a modal: this is
/// a tool for one table, and a dialog system would be more app than the job.
function wirePlans() {
  const rid = () => (currentOpt ? currentOpt.id : null);

  $('plan').addEventListener('change', e => {
    const id = e.target.value;
    if (!id) { drawPlanBar(); return; }
    // Loading REPLACES what is on screen, so say so while it can still be
    // stopped. Nothing here is recoverable once the working state is gone.
    if (store.planIsDirty(rid())
        && !confirm('You have changes that are not saved to a plan. Load anyway and lose them?')) {
      drawPlanBar();
      return;
    }
    store.loadPlan(id);
    if (store.departure) $('date').value = store.departure;
    $('at').value = store.departAt;
    draw();
  });

  $('psave').addEventListener('click', () => {
    const active = store.activePlan && store.getPlan(store.activePlan);
    if (active && active.routeId === rid()) { store.updatePlan(active.id, rid()); draw(); return; }
    const name = prompt('Name this plan', suggestName());
    if (name && name.trim()) { store.savePlanAs(name.trim(), rid()); draw(); }
  });

  $('pnew').addEventListener('click', () => {
    const active = store.activePlan && store.getPlan(store.activePlan);
    const name = prompt('Name for the new plan',
      active ? active.name + ' v2' : suggestName());
    if (!name || !name.trim()) return;
    // From a loaded plan this duplicates it and then writes the CURRENT screen
    // over the copy, so "save as new" keeps your edits and leaves the original
    // as it was — which is the whole point of making a second one.
    if (active) { const nid = store.duplicatePlan(active.id, name.trim()); store.updatePlan(nid, rid()); }
    else store.savePlanAs(name.trim(), rid());
    draw();
  });

  $('prename').addEventListener('click', () => {
    const p = store.getPlan(store.activePlan);
    if (!p) return;
    const name = prompt('Rename this plan', p.name);
    if (name && name.trim()) { store.renamePlan(p.id, name.trim()); draw(); }
  });

  $('pdel').addEventListener('click', () => {
    const p = store.getPlan(store.activePlan);
    if (!p) return;
    if (confirm(`Delete "${p.name}"? The stops stay ticked — only the saved plan goes.`)) {
      store.deletePlan(p.id);
      draw();
    }
  });

  $('pcopy').addEventListener('click', async () => {
    const md = planMarkdown();
    const btn = $('pcopy');
    try {
      await navigator.clipboard.writeText(md);
      flash(btn, 'copied');
    } catch (_) {
      // Clipboard needs a secure context and a real gesture, and refuses often
      // enough that failing silently would look like a broken button.
      download(md);
      flash(btn, 'downloaded instead');
    }
  });

  $('pdown').addEventListener('click', () => { download(planMarkdown()); flash($('pdown'), 'saved'); });
}

function suggestName() {
  const n = store.listPlans(currentOpt ? currentOpt.id : null).length;
  return currentOpt ? `${currentOpt.name}${n ? ' ' + (n + 1) : ''}` : 'My plan';
}

function download(md) {
  const active = store.activePlan && store.getPlan(store.activePlan);
  const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameFor(active ? active.name : 'milepost-plan');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/// Say a thing happened. A button that does its job silently reads as broken.
function flash(btn, msg) {
  const was = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = was; }, 1400);
}

/// A one-line complaint above the itinerary, for the cases where doing nothing
/// silently would read as the click not having registered. Distinct from
/// flash(), which relabels a button.
function gripe(msg) {
  const w = $('warn');
  if (!w) return;
  w.innerHTML = `<span class="pill bad">${esc(msg)}</span>`;
  setTimeout(draw, 4000);
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
      <div class="nm">Sleep <i>${dur(sl.minutes)}</i>${r.kind === 'bed' ? ` at ${esc(sl.at)}` : ''}</div>
      <div class="sub">${esc(sl.where || sl.at)}${r.kind === 'bed' && r.driveMin ? ` &middot; ${dur(r.driveMin)} to get here` : ''}</div>
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

/// Open the editor. `patch` seeds it, so editing an existing place and adding
/// a new one are the same screen.
function openEditor(patch) {
  draft = {
    id: null, name: '', town: '', state: '', ll: null, query: '',
    kind: 'stop', dwell: 60, detour: 5, why: '',
    results: null, busy: false, failed: false,
    ...patch,
  };
  drawEditor();
  const el = $('ed-name');
  if (el) el.focus();
}

function closeEditor() { draft = null; drawEditor(); }

/// Read the typed fields back into the draft. Called before anything that
/// re-renders the form, or what you typed is lost.
function readDraft() {
  if (!draft) return;
  const v = id => { const el = $(id); return el ? el.value : ''; };
  draft.name = v('ed-name');
  draft.query = v('ed-find');
  draft.why = v('ed-why');
  draft.dwell = Math.max(0, Number(v('ed-dwell')) || 0);
  draft.detour = Math.max(0, Number(v('ed-detour')) || 0);
  const lat = parseFloat(v('ed-lat')), lon = parseFloat(v('ed-lon'));
  if (Number.isFinite(lat) && Number.isFinite(lon)) draft.ll = [lat, lon];
}

function drawEditor() {
  const box = $('editor');
  if (!draft) { box.innerHTML = ''; return; }
  const d = draft;
  const bed = d.kind === 'lodging';
  const leg = DATA.route.legs[legIx];

  box.innerHTML = `<div class="ed">
    <div class="edHead">
      <b>${d.id ? 'Editing your place' : 'Add a place'}</b>
      <button data-ed-close>Close</button>
    </div>

    <div class="seg">
      <button data-ed-kind="stop" aria-pressed="${!bed}">A place to stop</button>
      <button data-ed-kind="lodging" aria-pressed="${bed}">Where you sleep</button>
    </div>

    <label class="f"><span>Name</span>
      <input id="ed-name" value="${esc(d.name)}"
        placeholder="${bed ? 'Blake Ranch Rd BLM' : "Ada's mom"}"></label>

    <label class="f"><span>Find it</span>
      <input id="ed-find" value="${esc(d.query)}" placeholder="Address, or a town and state">
    </label>
    <div class="edActs">
      <button data-ed-find ${d.busy ? 'disabled' : ''}>${d.busy ? 'Looking…' : 'Search'}</button>
      <span class="edHint">or paste coordinates below</span>
    </div>
    ${d.failed ? `<div class="edErr">Could not reach the lookup. Put the latitude and longitude in by hand.</div>` : ''}
    ${Array.isArray(d.results) && !d.results.length ? `<div class="edHint">Nothing found. Try a town and state.</div>` : ''}
    ${Array.isArray(d.results) && d.results.length ? `<div class="edPicks">${d.results.map((r, i) =>
        `<button data-ed-pick="${i}">${esc(r.label)}<i>${esc(r.state)}</i></button>`).join('')}</div>` : ''}

    <div class="two">
      <label class="f"><span>Latitude</span>
        <input id="ed-lat" inputmode="decimal" value="${d.ll ? d.ll[0] : ''}" placeholder="35.189"></label>
      <label class="f"><span>Longitude</span>
        <input id="ed-lon" inputmode="decimal" value="${d.ll ? d.ll[1] : ''}" placeholder="-114.053"></label>
    </div>
    ${d.ll ? `<div class="edHint">${esc(d.town || 'located')}${d.state ? ', ' + esc(d.state) : ''}</div>` : ''}

    <div class="two">
      <label class="f"><span>Minutes off the road, each way</span>
        <input id="ed-detour" type="number" min="0" max="600" value="${bed ? 0 : d.detour}" ${bed ? 'disabled' : ''}></label>
      <label class="f"><span>Minutes there</span>
        <input id="ed-dwell" type="number" min="0" max="1440" step="15" value="${bed ? 0 : d.dwell}" ${bed ? 'disabled' : ''}></label>
    </div>
    ${bed ? `<div class="edHint">A bed ends a day rather than interrupting one, so it costs no detour and no dwell.</div>` : ''}

    <label class="f"><span>Note</span>
      <textarea id="ed-why" rows="2"
        placeholder="${bed ? 'Confirmation number, check-in time' : 'Why it is worth stopping'}">${esc(d.why)}</textarea></label>

    <div class="edHint">Goes on <b>${esc(leg.name)}</b>, all ${leg.routes.length} of its roads, so swapping the road keeps it.</div>

    <div class="edSave">
      <button class="prim" data-ed-save>${d.id ? 'Save' : 'Add it'}</button>
      ${d.id ? `<button data-ed-delete>Delete</button>` : ''}
      <span class="edHint">Needs a name and a location.</span>
    </div>
  </div>`;
}

/// Notice a new version and offer it, rather than sitting on a stale one.
///
/// skipWaiting() stays off by deliberate decision — a worker taking over by
/// itself once swapped the code under a running session — so this ASKS. What it
/// fixes is that the planner previously had no way to ask at all: the update
/// control lives in the phone app's Trip tab and nothing here links to it, so a
/// stale stylesheet could outlive several deploys.
async function watchForUpdate() {
  if (!('serviceWorker' in navigator)) return;
  let reg;
  try {
    reg = await navigator.serviceWorker.getRegistration();
    // desk.html never registered one of its own. The app registers at scope
    // '/', which covers this page, but if you have only ever opened the
    // planner there is nothing registered at all.
    if (!reg) reg = await navigator.serviceWorker.register('sw.js');
  } catch (_) { return; }
  if (!reg) return;

  const offer = () => {
    if (!reg.waiting) return;
    $('upd').innerHTML = `<div class="updbar">
      <span>A newer Milepost is ready.</span>
      <button data-reload>Reload to use it</button>
    </div>`;
  };

  document.addEventListener('click', e => {
    if (!e.target.closest('[data-reload]')) return;
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    else location.reload();
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());

  if (reg.waiting) offer();
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) offer();
    });
  });

  // Actually go and look, every time the planner is opened.
  reg.update().catch(() => {});
}

boot();
watchForUpdate();
