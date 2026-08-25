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

let DATA = null;              // { route, stops, usa }
const built = new Map();      // routeId -> built route
let position = null;          // [lat, lon] once geolocation is allowed

export function init(data) { DATA = data; }
export function setPosition(ll) { position = ll; }
export function hasPosition() { return !!position; }

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function routeById(id) {
  if (built.has(id)) return built.get(id);
  for (const leg of DATA.route.legs)
    for (const r of leg.routes)
      if (r.id === id) { const b = buildRoute(r, DATA.stops); built.set(id, b); return b; }
  return null;
}

export const legs = () => DATA.route.legs;
export const selected = () => DATA.route.legs.map(l => routeById(store.routeFor(l.id)));
export const legRoute = i => routeById(store.routeFor(DATA.route.legs[i].id));
export const allStops = () => selected().flatMap(r => r.stops);
export { suggestStops };

// ============================================================== head
export function renderHead(legIx) {
  const rt = legRoute(legIx);
  const t = planTotals(buildDays(rt, store.chosen, store.pace));
  let wm = 0, wd = 0;
  for (const r of selected()) { const x = planTotals(buildDays(r, store.chosen, store.pace)); wm += x.miles; wd += x.days; }

  return `<div class="top">
      <div class="wordmark">Milepost</div>
      <button class="whole" data-trip>${Math.round(wm).toLocaleString()} mi · ${wd} days total</button>
    </div>
    <div class="legname">${esc(DATA.route.legs[legIx].name)}</div>
    <div class="totals">
      <div><span class="tnum">${Math.round(t.miles).toLocaleString()}</span><span class="tlab">mi</span></div>
      <div><span class="tnum">${t.days}</span><span class="tlab">days</span></div>
      <div><span class="tnum on">${t.stops}</span><span class="tlab">stops</span></div>
    </div>
    <div class="legs">${DATA.route.legs.map((l, i) =>
      `<button data-leg="${i}" aria-selected="${i === legIx}">${esc(l.short || SHORT[i])}</button>`).join("")}</div>`;
}

const SHORT = ["Carolina", "Houston", "Home"];

// ============================================================== route
export function renderRoute(legIx) {
  const leg = DATA.route.legs[legIx], rt = legRoute(legIx);
  let h = '<div class="routes">';
  for (const opt of leg.routes) {
    const b = routeById(opt.id);
    h += `<button class="rt" aria-pressed="${opt.id === rt.id}" data-route="${opt.id}" data-rleg="${leg.id}">
      <span class="dot"></span><span class="rn">${esc(opt.name)}</span>
      <span class="rm">${Math.round(b.miles).toLocaleString()} mi</span></button>`;
  }
  h += '</div><div class="line">';

  const nights = buildDays(rt, store.chosen, store.pace).slice(0, -1)
    .map(d => ({ m: d.overnight.mile, n: d.overnight.name }));
  let ni = 0;
  const night = () => `<div class="night"><span class="bar"></span>
    <span class="txt">Night — ${esc(nights[ni].n)}</span><span class="rule"></span></div>`;

  for (const s of rt.stops) {
    while (ni < nights.length && nights[ni].m < s.mile) { h += night(); ni++; }
    const on = store.isChosen(s.id), seen = store.isSeen(s.id);
    h += `<div class="st ${on ? "on " : ""}${s.big ? "big " : ""}${seen ? "seen" : ""}">
      <button class="mark" data-toggle="${s.id}" aria-label="Toggle ${esc(s.name)}"></button>
      <button class="body" data-stop="${s.id}">
        <div class="nm">${esc(s.name)}</div>
        <div class="sub">${esc(s.town)}, ${esc(s.state)} · ${s.detour} min off</div>
      </button>
      <div class="cost">${fmtHours(stopCost(s).total)}</div></div>`;
  }
  while (ni < nights.length) { h += night(); ni++; }
  return h + "</div>";
}

// ============================================================== map
let view = null;
export const getView = () => view;
export function setView(v) { view = v; }
export function resetView() { view = null; }

let mapAspect = mapview.ASPECT;
export const getAspect = () => mapAspect;

/// The panel's shape changes when the phone rotates — and, more often, when the
/// mobile address bar hides on scroll. This used to refit the map, which threw
/// away whatever the user had zoomed to. Now it reshapes around the same centre
/// and keeps the zoom.
export function setAspect(a) {
  if (!a || !isFinite(a) || Math.abs(a - mapAspect) < 0.02) return false;
  mapAspect = a;
  if (view) {
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    const h = view.w / a;
    view = { x: cx - view.w / 2, y: cy - h / 2, w: view.w, h };
  }
  return true;
}

/// The map tab is the map. Nothing under it, nothing beside it. The winter
/// notes and the road-conditions links used to live here and were just a pair
/// of lists stapled to the bottom of a picture; they belong in Trip.
export function renderMap(legIx) {
  const rt = legRoute(legIx);
  const svg = mapview.render(DATA.usa, selected(), rt, {
    view: view || mapview.fitView(rt, mapAspect),
    chosen: store.chosen,
    pos: position,
  });
  return `<div class="mapbox">${svg}
    <div class="zoom">
      <button data-zoom="in" aria-label="Zoom in">+</button>
      <button data-zoom="out" aria-label="Zoom out">−</button>
      <button class="fit" data-zoom="fit" aria-label="Fit to leg">FIT</button>
    </div></div>`;
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
        `<button class="dstop" data-stop="${s.id}"><i></i><span>${esc(s.name)}</span></button>`).join("")}</div>` : ""}
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
  const wx = DATA.normals[s.town];

  return `<div class="sh">
      <div><div class="sloc">${esc(s.town)}, ${esc(s.state)}</div>
        <div class="snm">${esc(s.name)}</div></div>
      <button class="sclose" data-close>Close</button>
    </div>
    <div class="sb">
      <div class="scost"><span class="n">${hh || mm}</span><span class="u">${hh ? "h" : "min"}</span>
        <span class="l">off your day</span></div>
      <div class="srow">${s.detour} min off the interstate, each way<br>${fmtHours(c.dwell)} on the ground${s.cost ? `<br>${esc(s.cost)}` : ""}</div>

      <div class="sdiv"></div>
      <div class="sbody">${esc(s.desc || s.why || "")}</div>

      <div class="sdiv"></div>
      <div class="slab">Late December</div>
      ${wx ? `<div class="temps"><b>${wx[0]}°</b><s>${wx[1]}°</s><em>typical high / low</em></div>` : ""}
      ${s.winter ? `<div class="sbody">${esc(s.winter)}</div>` : ""}

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
export function tripSheet() {
  const st = syncmod.state;
  const dep = store.departure;
  const days = dep ? Math.ceil((new Date(dep + "T00:00:00") - new Date()) / 86400000) : null;
  const inPlay = allStops();
  const seen = inPlay.filter(s => store.isSeen(s.id));
  const firsts = inPlay.filter(s => s.first);

  return `<div class="sh">
      <div><div class="sloc">The whole thing</div><div class="snm">Trip</div></div>
      <button class="sclose" data-close>Close</button>
    </div>
    <div class="sb">
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

      <div class="sdiv"></div>
      <div class="slab">Firsts</div>
      <div class="sbody" style="font-size:13px;color:var(--ink2)">
        ${firsts.filter(s => store.isSeen(s.id)).length} of ${firsts.length} seen.
        Things there is no California version of.</div>
      <div class="links" style="margin-top:12px">
        ${firsts.map(s => `<button data-stop="${s.id}">${esc(s.name)}<span>${store.isSeen(s.id) ? esc(store.seenDate(s.id)) : "—"}</span></button>`).join("")}
      </div>

      ${seen.length ? `<div class="sdiv"></div><div class="slab">Everywhere you've been</div>
        <div class="links" style="margin-top:12px">
          ${seen.map(s => `<button data-stop="${s.id}">${esc(s.name)}<span>${esc(store.seenDate(s.id))}</span></button>`).join("")}
        </div>` : ""}

      <div class="sdiv"></div>
      <div class="slab">Winter watch</div>
      ${riskList()}

      <div class="sdiv"></div>
      <div class="slab">Road conditions</div>
      <div class="sbody" style="font-size:13px;color:var(--ink2)">Check these the night before, not the morning of.</div>
      <div class="links" style="margin-top:12px">${dotLinks()}</div>

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
