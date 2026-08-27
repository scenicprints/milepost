// The three screens, plus the two sheets. Everything reads from the store and
// the built routes; nothing here holds trip state of its own.
//
// Route · Map · Days, and all three are scoped to ONE leg. The trip is three
// trips, and the leg selector at the top drives all of it.

import { store } from './store.js';
import { buildRoute, stopCost, fmtHours, project } from './route.js';
import { buildDays, planTotals, suggestStops } from './plan.js';
import * as mapview from './map.js';
import * as syncmod from './sync.js';
import { VERSION } from './version.js';
import * as wx from './weather.js';
import * as geo from './geocode.js';
import * as darksky from './darksky.js';

let DATA = null;              // { route, stops, usa }
const built = new Map();      // routeId -> built route
let position = null;          // [lat, lon] once geolocation is allowed

export function init(data) {
  DATA = data;
  SKY = darksky.load(data.darksky);
}
let SKY = { zones: [], source: null };
/// The overlay only exists once there is data behind it — no dead control.
export const hasSky = () => SKY.zones.length > 0;
export const skySource = () => SKY.source;
export function setPosition(ll) { position = ll; }
export function hasPosition() { return !!position; }

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/// Seed stops plus your own. A custom place lists every route on its leg and
/// lets the geometry decide — buildRoute drops anything too far off pavement.
function stopData() {
  return DATA.stops.concat(store.custom);
}

let builtFor = '';
export function routeById(id) {
  const stamp = store.custom.map(c => c.id + c.ll.join()).join('|');
  if (stamp !== builtFor) { built.clear(); builtFor = stamp; }
  if (built.has(id)) return built.get(id);
  for (const leg of DATA.route.legs)
    for (const r of leg.routes)
      if (r.id === id) { const b = buildRoute(r, stopData()); built.set(id, b); return b; }
  return null;
}

export const legRouteIds = i => DATA.route.legs[i].routes.map(r => r.id);
export const legNames = () => DATA.route.legs.map(l => l.name);

export const legs = () => DATA.route.legs;
/// The stored choice can name a route that no longer exists — route options
/// get replaced as the plan matures, and the store (and its Firestore copy)
/// remembers the old id. Fall back to the leg's default rather than crashing.
function legChoice(l) {
  const r = routeById(store.routeFor(l.id));
  if (r) return r;
  const def = l.routes.find(o => o.default) || l.routes[0];
  store.setRoute(l.id, def.id);
  return routeById(def.id);
}
export const selected = () => DATA.route.legs.map(legChoice);
export const legRoute = i => legChoice(DATA.route.legs[i]);
export const allStops = () => selected().flatMap(r => r.stops);
export { suggestStops };

// ============================================================== head
export function renderHead(legIx, tab) {
  const rt = legRoute(legIx);
  const t = planTotals(buildDays(rt, store.chosen, store.pace));
  let wm = 0, wd = 0, ws = 0;
  for (const r of selected()) {
    const x = planTotals(buildDays(r, store.chosen, store.pace));
    wm += x.miles; wd += x.days; ws += x.stops;
  }

  return `<div class="top">
      <div class="wordmark">Milepost</div>
      <div class="whole">${Math.round(wm).toLocaleString()} mi · ${wd} days total</div>
    </div>
    <div class="legname">${tab === "trip" ? "The whole trip"
      : tab === "next" ? esc(DATA.route.legs[whereNow().legIx].name)
      : esc(DATA.route.legs[legIx].name)}</div>
    <div class="totals">
      ${tab === "next" ? (() => {
        const h = whereNow();
        const pct = Math.min(100, Math.max(0, h.mile / h.route.miles * 100));
        return `<div><span class="tnum">${Math.round(h.mile).toLocaleString()}</span><span class="tlab">mi in</span></div>
          <div><span class="tnum">${Math.round(h.route.miles - h.mile).toLocaleString()}</span><span class="tlab">to go</span></div>
          <div><span class="tnum on">${Math.round(pct)}</span><span class="tlab">%</span></div>`;
      })() : `
      <div><span class="tnum">${Math.round(tab === "trip" ? wm : t.miles).toLocaleString()}</span><span class="tlab">mi</span></div>
      <div><span class="tnum">${tab === "trip" ? wd : t.days}</span><span class="tlab">days</span></div>
      <div><span class="tnum on">${tab === "trip" ? ws : t.stops}</span><span class="tlab">stops</span></div>`}
    </div>
    ${tab === "trip" || tab === "next" ? "" : `<div class="legs">${DATA.route.legs.map((l, i) =>
      `<button data-leg="${i}" aria-selected="${i === legIx}">${esc(l.short || SHORT[i])}</button>`).join("")}</div>
    <div class="ways">${DATA.route.legs[legIx].routes.map(o =>
      `<button data-route="${o.id}" data-rleg="${DATA.route.legs[legIx].id}"
        aria-pressed="${o.id === rt.id}">${esc(o.name)}</button>`).join("")}</div>`}`;
}

const SHORT = ["Carolina", "Houston", "Home"];

// ============================================================== route
/// Sights or eateries. Kevin asked for the two kept apart; 'all' shows the
/// line as it runs, with food rows tagged.
let kindFilter = 'all';
export const setKindFilter = k => { kindFilter = k; };

/// The time scale: total cost (detour both ways + dwell) bucketed for colour.
const timeBucket = mins =>
  mins < 45 ? 't0' : mins < 90 ? 't1' : mins < 180 ? 't2' : 't3';

export function renderRoute(legIx) {
  const rt = legRoute(legIx);
  let h = '<div class="routes">';
  // Choosing the route happens on the Map, where you can see the two lines
  // split. This tab is the stops.
  h += `<button class="rt addrow" data-add><span class="dot plus">+</span>
      <span class="rn">Add a place of your own</span></button>`;
  h += `</div><div class="kinds">
    <button data-kindfilter="all" aria-pressed="${kindFilter === 'all'}">All</button>
    <button data-kindfilter="sight" aria-pressed="${kindFilter === 'sight'}">Sights</button>
    <button data-kindfilter="food" aria-pressed="${kindFilter === 'food'}">Eateries</button>
    <span class="scale"><i style="background:var(--t0)"></i>quick
      <i style="background:var(--t1)"></i>1h
      <i style="background:var(--t2)"></i>2h
      <i style="background:var(--t3)"></i>3h+</span>
  </div><div class="line">`;

  const nights = buildDays(rt, store.chosen, store.pace).slice(0, -1)
    .map(d => ({ m: d.overnight.mile, n: d.overnight.name }));
  let ni = 0;
  const night = () => {
    const bed = lodgingFor(rt, nights[ni].m);
    return `<div class="night"><span class="bar"></span>
      <span class="txt">Night — ${esc(nights[ni].n)}</span><span class="rule"></span>
      ${bed ? `<button class="bed" data-stop="${bed.id}">${esc(bed.name)}</button>` : ""}</div>`;
  };

  for (const s of rt.stops) {
    if (s.kind === 'lodging') continue;          // shown on the night it belongs to
    const isFood = s.kind === 'food';
    if (kindFilter === 'food' && !isFood) continue;
    if (kindFilter === 'sight' && isFood) continue;
    while (ni < nights.length && nights[ni].m < s.mile) { h += night(); ni++; }
    const on = store.isChosen(s.id), seen = store.isSeen(s.id);
    const c = stopCost(s);
    h += `<div class="st ${on ? "on " : ""}${s.big ? "big " : ""}${seen ? "seen " : ""}${timeBucket(c.total)}">
      <button class="mark" data-toggle="${s.id}" aria-label="Toggle ${esc(s.name)}"></button>
      <button class="body" data-stop="${s.id}">
        <div class="nm">${esc(s.name)}${isFood ? '<span class="eat">eat</span>' : ""}</div>
        <div class="sub">${esc(s.town)}, ${esc(s.state)} · ${s.detour} min off</div>
      </button>
      <div class="cost">${fmtHours(c.total)}</div></div>`;
  }
  while (ni < nights.length) { h += night(); ni++; }
  return h + "</div>";
}

// ============================================================== map
// Pan/zoom lives in a CSS transform on .mapstage — see js/map.js for why.
let tf = null;                       // { x, y, s } or null for "fit on mount"
export const getTf = () => tf;
export const setTf = t => { tf = t; };
export const resetTf = () => { tf = null; };

// kept for the old call sites
export const resetView = resetTf;

/// The drawer at the foot of the map. Survives redraws, like the map transform.
let drawer = false;
export const drawerOpen = () => drawer;
export const setDrawer = v => { drawer = !!v; };

/// The dark-sky overlay. Off by default: it is for the night you are choosing
/// where to sleep, not for every look at the map.
let sky = false;
export const skyOn = () => sky && hasSky();
export const setSky = v => { sky = !!v; };

/// One route option: the selector, then the case for taking it.
function routeOption(leg, opt, chosenId) {
  const b = routeById(opt.id);
  return `<div class="rtopt">
    <button class="rt" aria-pressed="${opt.id === chosenId}" data-route="${opt.id}" data-rleg="${leg.id}">
      <span class="dot"></span><span class="rn">${esc(opt.name)}</span>
      <span class="rm">${Math.round(b.miles).toLocaleString()} mi</span></button>
    ${opt.road ? `<div class="rroad">${esc(opt.road)}</div>` : ""}
    ${opt.character ? `<div class="rchar">${esc(opt.character)}</div>` : ""}
    ${opt.why ? `<div class="rwhy">${esc(opt.why)}</div>` : ""}
    ${opt.costs ? `<div class="rcost">${esc(opt.costs)}</div>` : ""}
  </div>`;
}

export function renderMap(legIx) {
  const rt = legRoute(legIx);
  return `<div class="mapbox" id="mapbox">
      <div class="mapstage" id="mstage" style="width:${mapview.MW}px;height:${mapview.MH}px">
        <svg class="mapsvg" id="msvg" width="${mapview.MW}" height="${mapview.MH}"
             viewBox="0 0 ${mapview.MW} ${mapview.MH}" role="img"
             aria-label="Map of the trip with the current leg emphasised"></svg>
      </div>
      <div class="zoom">
        <button data-zoom="in" aria-label="Zoom in">+</button>
        <button data-zoom="out" aria-label="Zoom out">−</button>
        <button class="fit" data-zoom="fit" aria-label="Fit to leg">FIT</button>
        ${hasSky() ? `<button class="fit sky" data-sky aria-pressed="${skyOn()}"
          aria-label="Show where the sky is dark">SKY</button>` : ""}
      </div>
      <div class="mways${drawer ? " up" : ""}" id="mways">
        <button class="mwbar" data-drawer aria-expanded="${drawer}">
          <span class="t">${esc(rt.name)}</span>
          <span class="m">${Math.round(rt.miles).toLocaleString()} mi</span>
          <span class="x">${drawer ? "Close" : "Why"}</span>
        </button>
        <div class="mwbody">${DATA.route.legs[legIx].routes
          .map(o => routeOption(DATA.route.legs[legIx], o, rt.id)).join("")}</div>
      </div>
    </div>`;
}

/// Which stops are marked seen, as a set the map can ask cheaply.
const seenSet = () => new Set(allStops().filter(s => store.isSeen(s.id)).map(s => s.id));

/// Paint the map for the scale it is currently shown at.
export function paintMap(legIx, scale, view) {
  const svg = document.getElementById("msvg");
  if (!svg) return;
  const leg = DATA.route.legs[legIx], cur = legRoute(legIx);
  svg.innerHTML = mapview.paint(DATA.usa, selected(), cur, {
    chosen: store.chosen, seen: seenSet(), pos: position, scale, view,
    alts: leg.routes.filter(o => o.id !== cur.id).map(o => routeById(o.id)),
    sky: skyOn() ? SKY.zones : [],
  });
}

// ============================================================== days
export function renderDays(legIx) {
  const rt = legRoute(legIx);
  const D = buildDays(rt, store.chosen, store.pace);
  let h = '<div class="days">';
  if (D.truncated)
    h += `<div class="err">This plan didn't finish building. Something in the route or pace is off.</div>`;
  if (D.unplaced && D.unplaced.length)
    h += `<div class="err">Couldn't schedule: ${D.unplaced.map(s => esc(s.name)).join(", ")}. Give the day more hours, or drop them.</div>`;

  D.forEach((d, i) => {
    h += `<div class="day">
      <div class="dnum">Day ${i + 1}</div>
      <div class="dto">${esc(d.from.name)} → ${esc(d.overnight.name)}${d.sameTown ? " (2nd night)" : ""}</div>
      <div class="dmeta">${Math.round(d.miles).toLocaleString()} mi · ${fmtHours(d.driveMins)} driving${d.stopMins ? ` · ${fmtHours(d.stopMins)} stopped` : ""}</div>
      ${d.risks.length ? `<div class="warn">Winter watch — ${d.risks.map(r => esc(r.name)).join(", ")}</div>` : ""}
      ${d.stops.length ? `<div class="dstops">${d.stops.map(s =>
        `<button class="dstop${store.isSeen(s.id) ? " seen" : ""}" data-stop="${s.id}"><i></i><span>${esc(s.name)}</span></button>`).join("")}</div>` : ""}
      ${bedRow(rt, d, legIx)}
    </div>`;
  });
  return h + "</div>";
}

// ============================================================== place sheet
export function placeSheet(id) {
  let s = null;
  for (const leg of DATA.route.legs)
    for (const r of leg.routes) { const f = routeById(r.id).stops.find(x => x.id === id); if (f) s = f; }
  if (!s) return "";

  const on = store.isChosen(s.id), seen = store.isSeen(s.id);
  const c = stopCost(s), hh = Math.floor(c.total / 60), mm = c.total % 60;
  const q = encodeURIComponent(`${s.name} ${s.town} ${s.state}`);
  const site = DATA.sites[s.id];
  const nrm = DATA.normals[s.town];
  const book = DATA.bookings[s.id];
  const dark = darksky.at(s.ll, SKY.zones);

  return `<div class="grab" data-grab><i></i></div>
    <div class="sh">
      <div><div class="sloc">${esc(s.town)}, ${esc(s.state)}</div>
        <div class="snm">${esc(s.name)}</div></div>
      <button class="sclose" data-close>Close</button>
    </div>
    <div class="sb">
      ${store.isMine(s.id) ? `<div class="links" style="margin-top:14px">
        <button data-edit="${esc(s.id)}">Edit this place<span>yours</span></button></div>` : ''}
      <div class="scost"><span class="n">${hh || mm}</span><span class="u">${hh ? "h" : "min"}</span>
        <span class="l">off your day</span></div>
      <div class="srow">${s.detour} min off the interstate, each way<br>${fmtHours(c.dwell)} on the ground${s.cost ? `<br>${esc(s.cost)}` : ""}</div>

      <div class="sdiv"></div>
      <div class="sbody">${esc(s.desc || s.why || "")}</div>

      <div class="sdiv"></div>
      <div class="slab">Late December</div>
      <div id="wx-${esc(s.id)}">${tempLine(nrm, null)}</div>
      ${s.winter ? `<div class="sbody">${esc(s.winter)}</div>` : ""}

      ${dark ? `<div class="sdiv"></div>
        <div class="slab">Night sky</div>
        <div class="srow">Bortle ${dark.bortle}</div>
        <div class="sbody">${esc(darksky.describe(dark.bortle))}</div>
        ${dark.note ? `<div class="sbody">${esc(dark.note)}</div>` : ""}` : ""}

      ${book ? `<div class="sdiv"></div>
        <div class="slab">Booking</div>
        <div class="sbody">${esc(book.note)}</div>
        <div class="srow">${bookDeadline(book)}</div>
        <div class="links" style="margin-top:12px">
          <button data-book="${esc(s.id)}">${store.isBooked(s.id) ? "Booked" : "Mark as booked"}<span>${store.isBooked(s.id) ? esc(store.bookedOn(s.id)) : "not yet"}</span></button>
        </div>` : ""}

      <div class="sdiv"></div>
      <div class="slab">Notes</div>
      <textarea class="tinput" rows="3" data-note="${esc(s.id)}"
        placeholder="Anything worth remembering">${esc(store.note(s.id))}</textarea>

      ${s.first ? `<div class="sdiv"></div><div class="slab">A first</div>
        <div class="sbody">There is nothing in California like this.</div>` : ""}

      <div class="sdiv"></div>
      <div class="slab">Look it up</div>
      <div class="links">
        ${site ? `<a href="${site}" target="_blank" rel="noopener">Official site<span>${esc(site.replace(/^https?:\/\/(www\.)?/, "").split("/")[0])}</span></a>` : ""}
        <a href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">Search<span>Google</span></a>
        <a href="https://en.wikipedia.org/w/index.php?search=${q}" target="_blank" rel="noopener">Background<span>Wikipedia</span></a>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${s.ll[0]},${s.ll[1]}" target="_blank" rel="noopener">Directions<span>Maps</span></a>
        <button data-seen="${s.id}">${seen ? "Been there" : "Mark as seen"}<span>${seen ? esc(store.seenDate(s.id)) : "—"}</span></button>
      </div>
    </div>
    <div class="sact">
      <button class="${on ? "prim" : ""}" data-toggle="${s.id}">${on ? "In the plan" : "Add to plan"}</button>
      <a class="btn" style="flex:1;text-align:center;padding:13px 0"
         href="https://www.google.com/maps/dir/?api=1&destination=${s.ll[0]},${s.ll[1]}"
         target="_blank" rel="noopener">Navigate</a>
    </div>`;
}

// ============================================================== trip sheet
export function renderTrip(upd = {}) {
  const st = { ...syncmod.state, ...upd };
  const dep = store.departure;
  const days = dep ? Math.ceil((new Date(dep + "T00:00:00") - new Date()) / 86400000) : null;
  const inPlay = allStops();
  const seen = inPlay.filter(s => store.isSeen(s.id));

  return `<div class="tripbody">
      ${dep
        ? `<div class="count"><b>${days > 0 ? days : 0}</b>
             <span>${days > 0 ? "days until you leave" : "you're out there"}</span></div>
           <div class="links"><button data-cleardep>Change the date<span>${esc(dep)}</span></button></div>`
        : `<div class="field"><div class="slab">When do you leave</div>
             <div class="sbody" style="font-size:13px;color:var(--ink2)">Stays on your phones. It never goes in the repo.</div>
             <input type="date" id="depart" class="tinput"></div>`}

      <div class="sdiv"></div>
      <div class="slab">Both phones</div>
      ${st.on
        ? `<div class="sbody" style="font-size:13px;color:var(--ink2)">Changes on either phone show up on the other.
             Anything you do with no signal queues and lands when you get bars.</div>
           <div class="codebox">${esc(st.code)}</div>
           <div class="links" style="margin-top:14px">
             <button data-copy-code="${esc(st.code)}">Copy the code<span>Share it</span></button>
             <button data-sync-off>Disconnect this phone<span>—</span></button>
           </div>`
        : `<div class="sbody" style="font-size:13px;color:var(--ink2)">Enter the trip code to share this plan.
             Everything works without it — it just won't be shared.</div>
           <input id="tripcode" class="tinput" placeholder="XXXX-XXXX-XXXX-XXXX"
                  autocapitalize="characters" autocomplete="off" spellcheck="false">
           <div class="actions"><button class="on" data-sync-connect>Connect</button></div>`}
      ${st.error ? `<div class="err">${esc(st.error)}</div>` : ""}

      ${seen.length ? `<div class="sdiv"></div><div class="slab">Everywhere you've been</div>
        <div class="links" style="margin-top:12px">
          ${seen.map(s => `<button data-stop="${s.id}">${esc(s.name)}<span>${esc(store.seenDate(s.id))}</span></button>`).join("")}
        </div>` : ""}

      <div class="sdiv"></div>
      <div class="slab">Bookings</div>
      ${bookingList()}

      <div class="sdiv"></div>
      <div class="slab">Winter watch</div>
      ${riskList()}

      <div class="sdiv"></div>
      <div class="slab">Road conditions</div>
      <div class="sbody" style="font-size:13px;color:var(--ink2)">Check these the night before, not the morning of.</div>
      <div class="links" style="margin-top:12px">${dotLinks()}</div>

      <div class="sdiv"></div>
      <div class="slab">Version</div>
      <div class="links" style="margin-top:12px">
        <button data-update>${st.updateReady ? "Restart to update" : "Check for updates"}<span>${esc(VERSION)}</span></button>
      </div>
      ${st.updateNote ? `<div class="sbody" style="font-size:13px;color:var(--ink2)">${esc(st.updateNote)}</div>` : ""}

      <div class="sdiv"></div>
      <div class="slab">Where are we</div>
      <div class="sbody" style="font-size:13px;color:var(--ink2)">
        ${position ? whereAreWe() : "Turn this on and the map shows your position along the route."}</div>
      ${position ? "" : `<div class="actions"><button data-locate>Use my location</button></div>`}
    </div>`;
}

function whereAreWe() {
  let best = null, off = Infinity, mile = 0;
  for (const r of selected()) {
    const p = project(position, r.waypoints, r.cum);
    if (p.off < off) { off = p.off; best = r; mile = p.mile; }
  }
  const next = best.towns.find(t => t.mile > mile);
  return `${Math.round(mile).toLocaleString()} of ${Math.round(best.miles).toLocaleString()} miles into ${esc(best.name)}.`
    + (next ? ` ${esc(next.name)} is ${Math.round(next.mile - mile)} miles ahead.` : "");
}

/// Every winter trouble spot across the three chosen routes, in road order.
function riskList() {
  const seen = new Set();
  let h = "";
  for (const r of selected())
    for (const t of r.towns) {
      if (!t.risk || seen.has(t.name)) continue;
      seen.add(t.name);
      h += `<div style="margin-top:16px">
        <div style="font-size:14px">${esc(t.name)}, ${esc(t.state)}${t.elev ? ` · ${t.elev.toLocaleString()} ft` : ""}</div>
        ${t.note ? `<div class="sbody" style="font-size:13px;color:var(--ink2);margin-top:5px">${esc(t.note)}</div>` : ""}
      </div>`;
    }
  return h || `<div class="sbody" style="font-size:13px;color:var(--ink2)">Nothing flagged on the routes you've picked.</div>`;
}

/// Each state you cross, once, in the order you cross it.
function dotLinks() {
  const seen = new Set();
  let h = "";
  for (const r of selected())
    for (const t of r.towns) {
      if (seen.has(t.state)) continue;
      seen.add(t.state);
      const d = DATA.route.dot.find(x => x.state === t.state);
      if (d) h += `<a href="${d.url}" target="_blank" rel="noopener">${esc(d.name)}<span>${esc(t.state)}</span></a>`;
    }
  return h;
}

// ============================================================== bookings
/// Deadline = departure minus the lead time. Without a departure date there is
/// no deadline to compute, which is the honest answer rather than a fake one.
export function bookDeadline(book) {
  const dep = store.departure;
  if (!dep) return `Book about ${book.lead} days before you leave — set a departure date and this becomes a real date.`;
  const d = new Date(dep + "T00:00:00");
  d.setDate(d.getDate() - book.lead);
  const iso = d.toISOString().slice(0, 10);
  const left = Math.ceil((d - new Date()) / 86400000);
  return left >= 0 ? `Book by ${iso} — ${left} days from now.` : `Book by ${iso} — that was ${-left} days ago.`;
}

function bookingList() {
  const chosen = allStops().filter(s => store.isChosen(s.id) && DATA.bookings[s.id]);
  if (!chosen.length)
    return `<div class="sbody" style="font-size:13px;color:var(--ink2)">Nothing in your plan needs booking ahead.</div>`;
  const dep = store.departure;
  const withDate = chosen.map(s => {
    const b = DATA.bookings[s.id];
    let due = null;
    if (dep) { const d = new Date(dep + "T00:00:00"); d.setDate(d.getDate() - b.lead); due = d; }
    return { s, b, due };
  }).sort((a, c) => (a.due && c.due ? a.due - c.due : c.b.lead - a.b.lead));

  const open = withDate.filter(x => !store.isBooked(x.s.id)).length;
  return `<div class="sbody" style="font-size:13px;color:var(--ink2)">
      ${open ? `${open} of ${withDate.length} still to book.` : `All ${withDate.length} booked.`}
      ${dep ? "" : " Set a departure date to turn the lead times into deadlines."}
    </div>
    <div class="links" style="margin-top:12px">
      ${withDate.map(x => `<button data-stop="${x.s.id}">${esc(x.s.name)}<span>${
        store.isBooked(x.s.id) ? "booked"
          : x.due ? x.due.toISOString().slice(0, 10)
          : x.b.lead + "d ahead"}</span></button>`).join("")}
    </div>`;
}

// ============================================================== live weather
/// Shows what we have now and upgrades in place when the network answers.
function tempLine(nrm, live) {
  if (live && live.hi != null)
    return `<div class="temps"><b>${live.hi}°</b><s>${live.lo}°</s>
      <em>forecast for ${esc(live.date)}${live.words ? " · " + esc(live.words) : ""}</em></div>`;
  if (nrm)
    return `<div class="temps"><b>${nrm.hi ?? nrm[0]}°</b><s>${nrm.lo ?? nrm[1]}°</s>
      <em>${nrm.real ? `late-December average, last ${nrm.years} years` : "typical high / low"}</em></div>`;
  return `<div class="srow">No temperatures for this one yet.</div>`;
}

/// Called after the sheet is on screen. Replaces the estimate with real data.
export async function hydrateWeather(id) {
  const st = allStops().find(x => x.id === id);
  const host = document.getElementById("wx-" + id);
  if (!st || !host) return;

  const day = plannedDate(id);
  const live = await wx.forecast(st.ll, day);
  if (live) {
    live.words = wx.describe(live.code);
    host.innerHTML = tempLine(null, live);
    return;
  }
  const real = await wx.normals(st.ll);
  if (real) host.innerHTML = tempLine(real, null);
}

/// Which calendar day this stop falls on, given a departure date.
export function plannedDate(id) {
  const dep = store.departure;
  if (!dep) return null;
  let n = 0;
  for (const r of selected()) {
    for (const d of buildDays(r, store.chosen, store.pace)) {
      if (d.stops.some(s => s.id === id)) {
        const x = new Date(dep + "T00:00:00");
        x.setDate(x.getDate() + n);
        return x.toISOString().slice(0, 10);
      }
      n++;
    }
  }
  return null;
}

/// The lodging place nearest a night, if you have added one.
export function lodgingFor(route, mile) {
  let best = null, gap = 45;
  for (const s of route.stops) {
    if (s.kind !== 'lodging') continue;
    const d = Math.abs(s.mile - mile);
    if (d < gap) { gap = d; best = s; }
  }
  return best;
}

function bedRow(route, day, legIx) {
  const b = lodgingFor(route, day.endMile);
  if (b) return `<button class="bedrow" data-stop="${b.id}">Sleeping at ${esc(b.name)}</button>`;
  return `<button class="bedrow add" data-addbed="${legIx}" data-town="${esc(day.overnight.name)}"
    data-st="${esc(day.overnight.state || '')}">Add where you are sleeping</button>`;
}

// ============================================================== editor
let draft = null;
export const editing = () => draft;

export function openEditor(seed) {
  draft = Object.assign({
    name: '', town: '', state: '', ll: null, dwell: 60, detour: 5,
    kind: 'stop', leg: 0, why: '', query: '', results: null, busy: false,
  }, seed || {});
}
export function closeEditor() { draft = null; }
export function patchDraft(p) { if (draft) Object.assign(draft, p); }

export async function runSearch(q) {
  if (!draft) return;
  draft.busy = true;
  draft.query = q;
  draft.results = null;
  draft.failed = false;
  const r = await geo.search(q);
  if (!draft) return;
  draft.busy = false;
  if (r === null) draft.failed = true;
  else draft.results = r;
}

export function editorSheet() {
  const d = draft;
  if (!d) return '';
  const ready = !!d.ll && d.name.trim().length > 0;
  const bed = d.kind === 'lodging';
  return `<div class="grab" data-grab><i></i></div>
    <div class="sh">
      <div><div class="sloc">${d.id ? 'Editing' : 'Your own'}</div>
        <div class="snm">${bed ? 'Where you sleep' : 'A place'}</div></div>
      <button class="sclose" data-editor-close>Close</button>
    </div>
    <div class="sb">
      <div class="seg2">
        <button data-kind="stop" aria-pressed="${!bed}">A place to stop</button>
        <button data-kind="lodging" aria-pressed="${bed}">Where you sleep</button>
      </div>

      <div class="field"><div class="slab">Name</div>
        <input class="tinput" id="ed-name" value="${esc(d.name)}"
          placeholder="${bed ? 'Comfort Inn, Barstow' : "Ada's mom"}"></div>

      <div class="field"><div class="slab">Where</div>
        <input class="tinput" id="ed-find" value="${esc(d.query)}"
          placeholder="Address, or a town and state">
        <div class="actions">
          <button data-find>${d.busy ? 'Looking…' : 'Find it'}</button>
          <button data-here>Use my location</button>
        </div>
        ${d.ll ? `<div class="srow">${esc(d.town || 'located')}${d.state ? ', ' + esc(d.state) : ''}
            · ${d.ll[0].toFixed(3)}, ${d.ll[1].toFixed(3)}</div>` : ''}
        ${d.failed ? `<div class="err">Could not reach the lookup. Try again, or use your location while you are there.</div>` : ''}
        ${Array.isArray(d.results) && d.results.length === 0
          ? `<div class="srow">Nothing found. Try a town and state.</div>` : ''}
        ${Array.isArray(d.results) && d.results.length
          ? `<div class="links">${d.results.map((r, i) =>
              `<button data-pick="${i}">${esc(r.label)}<span>${esc(r.state)}</span></button>`).join('')}</div>` : ''}
      </div>

      <div class="field"><div class="slab">Which leg</div>
        <div class="seg2 three">${legNames().map((n, i) =>
          `<button data-leg-pick="${i}" aria-pressed="${d.leg === i}">${esc(SHORT[i])}</button>`).join('')}</div>
      </div>

      ${bed ? '' : `<div class="field"><div class="slab">Roughly how long</div>
        <div class="seg2 three">${[30, 60, 120, 240].map(m =>
          `<button data-dwell="${m}" aria-pressed="${d.dwell === m}">${m < 60 ? m + 'm' : (m / 60) + 'h'}</button>`).join('')}</div>
      </div>`}

      <div class="field"><div class="slab">Note</div>
        <textarea class="tinput" rows="2" id="ed-why"
          placeholder="${bed ? 'Confirmation number, check-in time' : 'Why it is worth stopping'}">${esc(d.why)}</textarea></div>
    </div>
    <div class="sact">
      <button class="${ready ? 'prim' : ''}" data-editor-save>${d.id ? 'Save' : 'Add it'}</button>
      ${d.id ? `<button data-editor-delete>Delete</button>` : ''}
    </div>`;
}

// ============================================================== what's next
//
// Keyed off WHERE YOU ARE, never off the date. A schedule view assumes the
// schedule held; one snow day at Flagstaff and every date after it is wrong.
// This asks the road, not the calendar.

/// Which leg and milepost you are actually on, by projecting your position
/// onto each selected route and taking the closest.
export function whereAmI() {
  if (!position) return null;
  let best = null;
  selected().forEach((route, legIx) => {
    const p = project(position, route.waypoints, route.cum);
    if (!best || p.off < best.off) best = { route, legIx, mile: p.mile, off: p.off };
  });
  if (!best) return null;
  best.onRoute = best.off < 60;
  return best;
}

/// Where the Next screen reckons you are. GPS if there is any, otherwise the
/// guess below.
///
/// **Both the header and the body must call this.** They used to differ — the
/// header fell back to mile 0 while the body fell back to the first unseen
/// stop — so with no GPS one screen showed "0 mi in / 0%" above "behind you
/// 241 mi / 8.7%". One function, one answer.
export function whereNow() { return whereAmI() || fallbackSpot(); }

/// Falls back to the first thing you have not marked seen, so the screen is
/// still useful parked in the driveway in August.
function fallbackSpot() {
  const legs = selected();
  for (let i = 0; i < legs.length; i++) {
    const route = legs[i];
    for (const s of route.stops) {
      if (store.isChosen(s.id) && !store.isSeen(s.id) && s.kind !== 'lodging')
        return { route, legIx: i, mile: Math.max(0, s.mile - 1), off: 0, onRoute: false, guessed: true };
    }
  }
  return { route: legs[0], legIx: 0, mile: 0, off: 0, onRoute: false, guessed: true };
}

export function renderNext() {
  const here = whereNow();
  const rt = here.route;
  const days = buildDays(rt, store.chosen, store.pace);
  const day = days.find(d => here.mile >= d.startMile - 1 && here.mile <= d.endMile + 1) || days[0];

  const ahead = rt.stops
    .filter(s => s.kind !== 'lodging' && store.isChosen(s.id) && s.mile > here.mile - 2 && !store.isSeen(s.id))
    .sort((a, b) => a.mile - b.mile);
  const next = ahead[0];
  const after = ahead.slice(1, 4);

  const bed = day ? lodgingFor(rt, day.endMile) : null;
  const toNight = day ? Math.max(0, day.endMile - here.mile) : 0;
  const risks = rt.towns.filter(t => t.risk && t.mile > here.mile && t.mile < here.mile + 260);

  let h = '<div class="nextbody">';

  if (!position) {
    h += `<div class="nonav">
      <div class="sbody">This screen needs to know where you are. Everything below is a
        guess from the first place you haven't marked seen.</div>
      <div class="actions"><button class="on" data-watch>Turn on location</button></div>
    </div>`;
  }

  if (next) {
    const dist = Math.max(0, Math.round(next.mile - here.mile));
    const c = stopCost(next);
    h += `<button class="nextcard" data-stop="${next.id}">
      <div class="nlab">Next</div>
      <div class="nbig"><b>${dist.toLocaleString()}</b><span>mi</span></div>
      <div class="nname">${esc(next.name)}</div>
      <div class="nsub">${esc(next.town)}, ${esc(next.state)} · ${next.detour} min off the road
        · ${fmtHours(c.total)} all in</div>
    </button>
    <div class="actions" style="margin-top:2px">
      <a class="btn on" style="text-align:center;padding:13px 0"
         href="https://www.google.com/maps/dir/?api=1&destination=${next.ll[0]},${next.ll[1]}"
         target="_blank" rel="noopener">Navigate there</a>
      <button data-seen="${next.id}">Been there</button>
    </div>`;
  } else {
    h += `<div class="nextcard"><div class="nlab">Next</div>
      <div class="nname">Nothing left on this leg.</div>
      <div class="nsub">Everything you picked is marked seen.</div></div>`;
  }

  if (after.length) {
    h += `<div class="nblock"><div class="slab">Then</div><div class="stoplist2">${
      after.map(s => `<button class="nrow" data-stop="${s.id}">
        <span class="t">${esc(s.name)}</span>
        <span class="d">${Math.max(0, Math.round(s.mile - here.mile)).toLocaleString()} mi</span>
      </button>`).join('')}</div></div>`;
  }

  if (day) {
    h += `<div class="nblock"><div class="slab">Tonight</div>
      <div class="nrow big">
        <span class="t">${esc(day.overnight.name)}${day.overnight.state ? ', ' + esc(day.overnight.state) : ''}</span>
        <span class="d">${Math.round(toNight).toLocaleString()} mi · ${fmtHours(toNight / store.pace.mph * 60)}</span>
      </div>
      ${bed
        ? `<button class="nrow" data-stop="${bed.id}"><span class="t">${esc(bed.name)}</span>
             <span class="d">booked in</span></button>`
        : `<button class="nrow add" data-addbed="${here.legIx}" data-town="${esc(day.overnight.name)}"
             data-st="${esc(day.overnight.state || '')}"><span class="t">No bed set for tonight</span>
             <span class="d">add one</span></button>`}
    </div>`;
  }

  if (risks.length) {
    h += `<div class="nblock"><div class="slab">Watch out</div>${risks.map(t => `
      <div class="nrow"><span class="t">${esc(t.name)}${t.elev ? ` · ${t.elev.toLocaleString()} ft` : ''}</span>
        <span class="d">${Math.round(t.mile - here.mile).toLocaleString()} mi</span></div>
      ${t.note ? `<div class="nnote">${esc(t.note)}</div>` : ''}`).join('')}</div>`;
  }

  const done = here.mile, left = Math.max(0, rt.miles - here.mile);
  h += `<div class="nblock"><div class="slab">This leg</div>
    <div class="nrow"><span class="t">Behind you</span><span class="d">${Math.round(done).toLocaleString()} mi</span></div>
    <div class="nrow"><span class="t">Still to go</span><span class="d">${Math.round(left).toLocaleString()} mi</span></div>
    <div class="bar"><i style="width:${Math.min(100, Math.max(0, done / rt.miles * 100)).toFixed(1)}%"></i></div>
    ${here.onRoute === false && position ? `<div class="nnote">You're ${Math.round(here.off)} miles off the route — these numbers assume you rejoin it.</div>` : ''}
  </div>`;

  return h + '</div>';
}
