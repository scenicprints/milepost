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
import { tripStats, money } from './stats.js';
import * as wx from './weather.js';

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
    <div class="legname">${tab === "trip" ? "The whole trip" : esc(DATA.route.legs[legIx].name)}</div>
    <div class="totals">
      <div><span class="tnum">${Math.round(tab === "trip" ? wm : t.miles).toLocaleString()}</span><span class="tlab">mi</span></div>
      <div><span class="tnum">${tab === "trip" ? wd : t.days}</span><span class="tlab">days</span></div>
      <div><span class="tnum on">${tab === "trip" ? ws : t.stops}</span><span class="tlab">stops</span></div>
    </div>
    ${tab === "trip" ? "" : `<div class="legs">${DATA.route.legs.map((l, i) =>
      `<button data-leg="${i}" aria-selected="${i === legIx}">${esc(l.short || SHORT[i])}</button>`).join("")}</div>`}`;
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
// Pan/zoom lives in a CSS transform on .mapstage — see js/map.js for why.
let tf = null;                       // { x, y, s } or null for "fit on mount"
export const getTf = () => tf;
export const setTf = t => { tf = t; };
export const resetTf = () => { tf = null; };

// kept for the old call sites
export const resetView = resetTf;

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
      </div>
    </div>`;
}

/// Paint the map for the scale it is currently shown at.
export function paintMap(legIx, scale, view) {
  const svg = document.getElementById("msvg");
  if (!svg) return;
  svg.innerHTML = mapview.paint(DATA.usa, selected(), legRoute(legIx), {
    chosen: store.chosen, pos: position, scale, view,
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
  const nrm = DATA.normals[s.town];
  const book = DATA.bookings[s.id];

  return `<div class="grab" data-grab><i></i></div>
    <div class="sh">
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
      <div id="wx-${esc(s.id)}">${tempLine(nrm, null)}</div>
      ${s.winter ? `<div class="sbody">${esc(s.winter)}</div>` : ""}

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
  const firsts = inPlay.filter(s => s.first);

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

// ============================================================== stats
const n0 = v => Math.round(v).toLocaleString();
const n1 = v => (Math.round(v * 10) / 10).toLocaleString();
const usd = v => "$" + Math.round(v).toLocaleString();

function row(k, v, sub) {
  return `<div class="srow2"><span class="k">${k}</span><span class="v">${v}</span>${
    sub ? `<span class="s">${sub}</span>` : ""}</div>`;
}
function block(title, rows) {
  return `<div class="statblock"><div class="slab">${title}</div>${rows}</div>`;
}

export function renderStats() {
  const S = tripStats(selected(), store.chosen, store);
  const f = S.fuel;
  const dep = store.departure;
  const out = [];

  out.push(`<div class="bignums">
    <div><b>${n0(S.miles)}</b><span>miles</span></div>
    <div><b>${S.days}</b><span>driving days</span></div>
    <div><b>${n0(S.driveMins / 60)}</b><span>hours at the wheel</span></div>
    <div><b>${S.stops}</b><span>stops</span></div>
  </div>`);

  out.push(block("The drive", [
    row("Average day", n0(S.milesPerDay) + " mi", n1(S.hoursPerDay) + "h driving"),
    row("Longest day", S.longest ? n0(S.longest.miles) + " mi" : "—",
        S.longest ? esc(S.longest.from.name) + " → " + esc(S.longest.overnight.name) : ""),
    row("Shortest day", S.shortest ? n0(S.shortest.miles) + " mi" : "—",
        S.shortest ? esc(S.shortest.from.name) + " → " + esc(S.shortest.overnight.name) : ""),
    row("Time stopped", n1(S.stopMins / 60) + "h", n1(S.detourMins / 60) + "h of it just detouring"),
    row("Second nights", String(S.secondNights), "days you don't move on"),
  ].join("")));

  out.push(block("Fuel", [
    row("Estimated", n0(S.gallons) + " gal", usd(S.fuelCost) + " at " + n1(S.mpg) + " mpg"),
    row("Fill-ups logged", String(f.count), f.count ? usd(f.spend) + " spent" : "none yet"),
    row("Measured mpg", f.avgMpg ? n1(f.avgMpg) : "—",
        f.avgMpg ? `best ${n1(f.bestMpg)} · worst ${n1(f.worstMpg)}` : "needs two full fill-ups"),
    row("Price per gallon", f.avgPrice ? "$" + n1(f.avgPrice) : "—", f.count ? "your average" : ""),
  ].join("")));

  out.push(`<div class="statblock"><div class="slab">Log a fill-up</div>
    <div class="fillform">
      <input id="f-odo" class="tinput" inputmode="decimal" placeholder="Odometer">
      <input id="f-gal" class="tinput" inputmode="decimal" placeholder="Gallons">
      <input id="f-ppg" class="tinput" inputmode="decimal" placeholder="$ / gal">
    </div>
    <div class="actions"><button data-addfill>Add</button>
      <button data-partial="0" id="f-part">Full tank</button></div>
    ${f.count ? `<div class="links" style="margin-top:6px">${store.fills.slice().reverse().map(x =>
      `<button data-delfill="${x.id}">${n0(x.odometer)} mi · ${n1(x.gallons)} gal${x.partial ? " · partial" : ""}
        <span>${usd(x.gallons * x.pricePerGallon)}</span></button>`).join("")}</div>` : ""}
  </div>`);

  out.push(block("The country", [
    row("States", String(S.states.length), S.states.join(" · ")),
    row("Highest point", S.high ? n0(S.high.elev) + " ft" : "—", S.high ? esc(S.high.name) : ""),
    row("Winter watch days", String(S.riskDays), "of " + S.days),
  ].join("")));

  out.push(block("Places", [
    row("In the plan", S.stops + " of " + S.available, "stops available on your routes"),
    row("Firsts", S.firstsIn + " of " + S.firstsAll, "no California equivalent"),
    row("Seen so far", String(S.seen), S.seen ? "and counting" : "trip hasn't started"),
    row("Admission", usd(S.admission), S.unpriced ? S.unpriced + " with no price listed" : "everything priced"),
  ].join("")));

  if (S.tags.length) out.push(block("What you picked", S.tags.slice(0, 8)
    .map(([t, c]) => row(t, String(c), "")).join("")));

  out.push(block("Per leg", S.legs.map((l, i) =>
    row(esc(DATA.route.legs[i].name), n0(l.totals.miles) + " mi",
        l.totals.days + " days · " + l.totals.stops + " stops")).join("")));

  if (dep) {
    const left = Math.ceil((new Date(dep + "T00:00:00") - new Date()) / 86400000);
    out.push(block("Countdown", row(left > 0 ? "Days until you leave" : "Days since you left",
      String(Math.abs(left)), esc(dep))));
  }

  return `<div class="statsbody">${out.join("")}</div>`;
}
