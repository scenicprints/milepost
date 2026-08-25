// The five screens. Everything reads from the store and the built routes;
// nothing here holds state of its own.

import { store } from './store.js';
import { buildRoute, stopCost, fmtMiles, fmtHours, milesBetween, project, measure } from './route.js';
import { buildDays, planTotals, suggestStops } from './plan.js';
import * as mapview from './map.js';
import * as syncmod from './sync.js';

let DATA = null;                 // { route, stops, usa }
const built = new Map();         // routeId -> built route
let position = null;             // [lat, lon] from geolocation, if allowed

export function init(data) { DATA = data; }
export function setPosition(ll) { position = ll; }

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function routeById(id) {
  if (built.has(id)) return built.get(id);
  for (const leg of DATA.route.legs) {
    for (const r of leg.routes) {
      if (r.id === id) {
        const b = buildRoute(r, DATA.stops);
        built.set(id, b);
        return b;
      }
    }
  }
  return null;
}

/// The three routes currently selected, in order.
function selected() {
  return DATA.route.legs.map(leg => ({ leg, route: routeById(store.routeFor(leg.id)) }));
}

function allStopsInPlay() {
  return selected().flatMap(({ route }) => route.stops);
}

function tripTotals() {
  let miles = 0, days = 0, driveMins = 0, stops = 0, firsts = 0;
  for (const { route } of selected()) {
    const d = buildDays(route, store.chosen, store.pace);
    const t = planTotals(d);
    miles += t.miles; days += t.days; driveMins += t.driveMins;
    stops += t.stops; firsts += t.firsts;
  }
  return { miles, days, driveMins, stops, firsts };
}

// ============================================================= ROAD
export function renderRoad() {
  const t = tripTotals();
  const totalFirsts = allStopsInPlay().filter(s => s.first).length;
  const seenCount = allStopsInPlay().filter(s => store.isSeen(s.id)).length;

  let h = '';

  h += `<div class="card">
    <div class="stats">
      <div class="stat"><b>${Math.round(t.miles).toLocaleString()}</b><span>MILES</span></div>
      <div class="stat"><b>${t.days}</b><span>DRIVING DAYS</span></div>
      <div class="stat"><b>${Math.round(t.driveMins / 60)}</b><span>HOURS DRIVING</span></div>
      <div class="stat"><b>${t.stops}</b><span>STOPS</span></div>
    </div>
    <div class="small muted" style="margin-top:12px">
      Modesto to North Carolina, down to Houston, and home again —
      ${t.firsts} of your ${totalFirsts} picked stops are things Ada has never seen.
      ${seenCount ? `<b>${seenCount} done so far.</b>` : ''}
    </div>
  </div>`;

  h += `<div class="banner">
    <b>Chains: buy a set, plan not to use them.</b>
    A FWD Accord on Defender 2s does not qualify for California's R2 exemption — that's AWD only —
    so chain control on Tehachapi or the Grapevine means chains on the drive wheels or a turnaround.
    They do nothing for the two risks that actually matter: I-40 closing at Flagstaff, and ice
    between Amarillo and Little Rock. Slack in the schedule is the real protection.
  </div>`;

  selected().forEach(({ leg, route }, i) => {
    const days = buildDays(route, store.chosen, store.pace);
    const tt = planTotals(days);
    h += `<div class="leg-head"><span class="n">${i + 1}</span><h2>${esc(leg.name)}</h2>
      <span class="muted small" style="margin-left:auto">${fmtMiles(route.miles)} · ${tt.days} days</span></div>`;
    h += `<div class="routepick">`;
    for (const opt of leg.routes) {
      const b = routeById(opt.id);
      const on = store.routeFor(leg.id) === opt.id;
      h += `<button class="routeopt" aria-pressed="${on}" data-pick-route="${opt.id}" data-leg="${leg.id}">
        <div class="nm">${esc(opt.name)} ${opt.default ? '<span class="pill">DEFAULT</span>' : ''}</div>
        <div class="rd">${esc(opt.road)} · ${fmtMiles(b.miles)}</div>
        <div class="ch">${esc(opt.character)}</div>
        ${on ? `<div class="why">${esc(opt.why)}</div>
                <div class="costs">Costs you: ${esc(opt.costs)}</div>` : ''}
      </button>`;
    }
    h += `</div>`;
  });

  return h;
}

// ============================================================= AHEAD
export function renderAhead() {
  if (!position) {
    return `<div class="card">
      <b>Where are we?</b>
      <div class="small muted" style="margin-top:6px">
        This screen watches your position and tells you what's coming up in the next
        150 miles, soonest first, with what each one costs the day.
      </div>
      <div class="actions" style="margin-top:12px">
        <button class="btn on" data-locate>Use my location</button>
      </div>
    </div>
    <div class="empty">Nothing to show until it knows where you are.</div>`;
  }

  // Which of the three routes are we actually on? The one we're closest to.
  let bestRoute = null, bestOff = Infinity, bestMile = 0;
  for (const { route } of selected()) {
    const p = project(position, route.waypoints, route.cum);
    if (p.off < bestOff) { bestOff = p.off; bestRoute = route; bestMile = p.mile; }
  }

  const ahead = bestRoute.stops
    .filter(s => s.mile > bestMile - 5 && s.mile < bestMile + 150)
    .sort((a, b) => a.mile - b.mile);

  const nextTown = bestRoute.towns.find(t => t.mile > bestMile);

  let h = `<div class="card tight">
    <div class="row between">
      <div>
        <b>${esc(bestRoute.name)}</b>
        <div class="tiny muted">${Math.round(bestMile).toLocaleString()} of ${Math.round(bestRoute.miles).toLocaleString()} miles${bestOff > 25 ? ` · ${Math.round(bestOff)} mi off route` : ''}</div>
      </div>
      ${nextTown ? `<div style="text-align:right">
        <b>${esc(nextTown.name)}</b>
        <div class="tiny muted">${Math.round(nextTown.mile - bestMile)} mi ahead</div>
      </div>` : ''}
    </div>
  </div>`;

  if (!ahead.length) return h + `<div class="empty">Nothing in the next 150 miles. Enjoy the drive.</div>`;

  h += `<div class="stack">`;
  for (const s of ahead) {
    const dist = Math.round(s.mile - bestMile);
    const c = stopCost(s);
    const seen = store.isSeen(s.id);
    h += `<button class="card tight stopline" data-stop="${s.id}" style="display:block">
      <div class="row between">
        <div class="grow">
          <div class="nm">${esc(s.name)}
            ${s.first ? '<span class="pill first">FIRST</span>' : ''}
            ${seen ? '<span class="pill seen">SEEN</span>' : ''}</div>
          <div class="sub">${esc(s.town)}, ${esc(s.state)} · ${s.detour} min off the road</div>
        </div>
        <div style="text-align:right">
          <div class="nm">${dist <= 0 ? 'here' : dist + ' mi'}</div>
          <div class="sub">${fmtHours(c.total)} all in</div>
        </div>
      </div>
    </button>`;
  }
  h += `</div>`;
  return h;
}

// ============================================================= MAP
export function renderMap() {
  const sel = selected();
  const activeId = mapLegId || sel[0].route.id;
  const route = routeById(activeId);

  let h = `<div class="seg">`;
  for (const { leg, route: r } of sel) {
    h += `<button class="btn ${r.id === activeId ? 'on' : ''}" data-map-leg="${r.id}">${esc(leg.name.replace(/ to /, ' → '))}</button>`;
  }
  h += `</div>`;

  h += `<div class="mapwrap">${mapview.render(DATA.usa, route, { chosen: store.chosen, pos: position })}</div>`;

  const risks = route.towns.filter(t => t.risk);
  if (risks.length) {
    h += `<div class="card"><b>Winter watch on this route</b><div class="stack" style="margin-top:8px">`;
    for (const r of risks) {
      h += `<div>
        <div class="row" style="gap:6px">
          <span class="pill ${r.risk === 'ice' ? 'bad' : 'warn'}">${r.risk.toUpperCase()}</span>
          <b class="small">${esc(r.name)}, ${esc(r.state)}${r.elev ? ` · ${r.elev.toLocaleString()} ft` : ''}</b>
        </div>
        ${r.note ? `<div class="small muted" style="margin-top:3px">${esc(r.note)}</div>` : ''}
      </div>`;
    }
    h += `</div></div>`;
  }

  h += `<div class="card"><b>Road conditions</b><div class="small muted" style="margin:6px 0 10px">
    Every state you cross, in order. Check these the night before, not the morning of.</div>
    <div class="seg" style="margin:0">`;
  const states = [...new Set(route.towns.map(t => t.state))];
  for (const st of states) {
    const d = DATA.route.dot.find(x => x.state === st);
    if (d) h += `<a class="btn" href="${d.url}" target="_blank" rel="noopener">${esc(st)}</a>`;
  }
  h += `</div></div>`;
  return h;
}

let mapLegId = null;
export function setMapLeg(id) { mapLegId = id; }

// ============================================================= DAYS
export function renderDays() {
  let h = '';
  let dayNo = 0;

  for (const { leg, route } of selected()) {
    const days = buildDays(route, store.chosen, store.pace);
    h += `<div class="leg-head"><span class="n">${DATA.route.legs.indexOf(leg) + 1}</span>
      <h2>${esc(leg.name)}</h2>
      <span class="muted small" style="margin-left:auto">${esc(route.name)}</span></div>`;

    if (days.truncated) {
      h += `<div class="banner"><b>This plan didn't finish building.</b>
        It hit the day limit, which means something in the route or pace is off. Tell Claude.</div>`;
    }
    if (days.unplaced && days.unplaced.length) {
      h += `<div class="banner"><b>${days.unplaced.length} chosen stop(s) couldn't be scheduled:</b>
        ${days.unplaced.map(s => esc(s.name)).join(', ')}. Give the day more hours, or drop them.</div>`;
    }

    for (const d of days) {
      dayNo++;
      h += `<div class="card"><div class="day">
        <div class="num"><span>DAY</span><b>${dayNo}</b></div>
        <div class="grow">
          <div class="route">${esc(d.from.name)} → ${esc(d.overnight.name)}${d.sameTown ? ' <span class="pill">2ND NIGHT</span>' : ''}</div>
          <div class="meta">${Math.round(d.miles).toLocaleString()} mi · ${fmtHours(d.driveMins)} driving${d.stopMins ? ` · ${fmtHours(d.stopMins)} stopped` : ''}</div>
          ${d.over ? `<div class="warn">Runs long — ${fmtHours(d.driveMins + d.stopMins)} on the go.</div>` : ''}
          ${d.risks.length ? `<div class="warn">Winter watch: ${d.risks.map(r => esc(r.name)).join(', ')}</div>` : ''}
          ${d.stops.length ? `<div class="stoplist">${d.stops.map(s => stopLine(s)).join('')}</div>` : ''}
        </div>
      </div></div>`;
    }
  }
  return h;
}

function stopLine(s) {
  const c = stopCost(s);
  return `<button class="stopline" data-stop="${s.id}">
    <div>
      <div class="nm">${esc(s.name)} ${s.first ? '<span class="pill first">FIRST</span>' : ''}${store.isSeen(s.id) ? '<span class="pill seen">SEEN</span>' : ''}</div>
      <div class="sub">${esc(s.town)}, ${esc(s.state)}</div>
    </div>
    <div class="cost">${s.detour} min off<br>${fmtHours(c.total)}</div>
  </button>`;
}

// ============================================================= BOOK
export function renderBook() {
  const inPlay = allStopsInPlay();
  const firsts = inPlay.filter(s => s.first);
  const seen = inPlay.filter(s => store.isSeen(s.id));
  const dep = store.departure;

  let h = '';

  if (dep) {
    const days = Math.ceil((new Date(dep) - new Date()) / 86400000);
    h += `<div class="card" style="text-align:center">
      <div class="stat"><b style="font-size:38px">${days > 0 ? days : 0}</b>
      <span>${days > 0 ? 'DAYS UNTIL YOU LEAVE' : 'YOU\'RE OUT THERE'}</span></div>
    </div>`;
  } else {
    h += `<div class="card">
      <b>When do you leave?</b>
      <div class="small muted" style="margin:5px 0 10px">
        Stays on your phones — it never goes in the repo.
      </div>
      <input type="date" id="depart" class="btn" style="width:100%">
    </div>`;
  }

  h += `<div class="card">
    <div class="row between"><b>Firsts</b>
      <span class="muted small">${firsts.filter(s => store.isSeen(s.id)).length} of ${firsts.length}</span></div>
    <div class="small muted" style="margin-top:4px">
      Things there is no California version of. Tap one when you've done it.
    </div>
    <div class="stoplist" style="margin-top:10px">
      ${firsts.map(s => `<button class="stopline" data-seen="${s.id}">
        <div><div class="nm">${esc(s.name)}</div>
        <div class="sub">${esc(s.town)}, ${esc(s.state)}</div></div>
        <div class="cost">${store.isSeen(s.id) ? `<span class="pill seen">${esc(store.seenDate(s.id))}</span>` : '○'}</div>
      </button>`).join('')}
    </div>
  </div>`;

  h += syncCard();

  if (seen.length) {
    h += `<div class="card"><b>Everything you've seen</b>
      <div class="stoplist" style="margin-top:10px">
        ${seen.map(s => stopLine(s)).join('')}
      </div></div>`;
  }
  return h;
}

/// Both phones, one plan. The code is the whole secret, so it is shown only
/// on a phone that is already connected.
function syncCard() {
  const s = syncmod.state;
  const on = s.on;
  return `<div class="card">
    <div class="row between">
      <b>Both phones</b>
      <span class="pill ${on ? 'seen' : ''}">${on ? 'SYNCED' : 'THIS PHONE ONLY'}</span>
    </div>
    <div class="small muted" style="margin-top:5px">
      ${on
        ? `Changes on either phone show up on the other. Writes made with no signal
           queue up and land when you get bars again.`
        : `Enter the trip code to share this plan with Ada's phone. Everything works
           without it — it just won't be shared.`}
    </div>
    ${on
      ? `<div class="field" style="margin-top:10px">
           <div class="k">TRIP CODE</div>
           <div class="v" style="font-family:ui-monospace,monospace;letter-spacing:.06em">${esc(s.code)}</div>
         </div>
         <div class="actions"><button class="btn ghost" data-sync-off>Disconnect this phone</button></div>`
      : `<div style="margin-top:10px">
           <input id="tripcode" class="btn" style="width:100%;font-family:ui-monospace,monospace;letter-spacing:.08em"
                  placeholder="XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false">
           <div class="actions"><button class="btn on" data-sync-connect>Connect</button></div>
         </div>`}
    ${s.error ? `<div class="small" style="color:var(--bad);margin-top:8px">${esc(s.error)}</div>` : ''}
  </div>`;
}

// ============================================================= SHEET
export function stopSheet(id) {
  const s = allStopsInPlay().find(x => x.id === id);
  if (!s) return '';
  const c = stopCost(s);
  const chosen = store.isChosen(s.id);
  const seen = store.isSeen(s.id);
  const maps = `https://www.google.com/maps/search/?api=1&query=${s.ll[0]},${s.ll[1]}`;

  return `<div class="scrim" data-close-scrim><div class="sheet" role="dialog">
    <div class="row between">
      <div class="grow">
        <h3>${esc(s.name)}</h3>
        <div class="where">${esc(s.town)}, ${esc(s.state)}</div>
      </div>
      <button class="btn ghost" data-close>Close</button>
    </div>
    <div class="row" style="gap:6px;margin-top:10px;flex-wrap:wrap">
      ${s.first ? '<span class="pill first">NEVER SEEN ANYTHING LIKE IT</span>' : ''}
      ${s.big ? '<span class="pill big">WORTH REBUILDING THE DAY</span>' : ''}
      ${seen ? `<span class="pill seen">SEEN ${esc(store.seenDate(s.id))}</span>` : ''}
    </div>

    <div class="why">${esc(s.why)}</div>

    <div class="field"><div class="k">WHAT IT COSTS YOU</div>
      <div class="v"><b>${fmtHours(c.total)}</b> all in —
      ${s.detour} min off the road each way, about ${fmtHours(c.dwell)} on the ground.</div></div>

    ${s.winter ? `<div class="field"><div class="k">IN LATE DECEMBER</div>
      <div class="v">${esc(s.winter)}</div></div>` : ''}

    <div class="field"><div class="k">COST</div><div class="v">${esc(s.cost || '—')}</div></div>

    <div class="field"><div class="k">NOTES</div>
      <textarea data-note="${s.id}" placeholder="Anything you want to remember">${esc(store.note(s.id))}</textarea></div>

    <div class="actions">
      <button class="btn ${chosen ? 'on' : ''}" data-toggle="${s.id}">
        ${chosen ? 'In the plan' : 'Add to the plan'}</button>
      <button class="btn ${seen ? 'on' : ''}" data-seen="${s.id}">
        ${seen ? 'Seen it' : 'Mark seen'}</button>
      <a class="btn" href="${maps}" target="_blank" rel="noopener">Open in Maps</a>
    </div>
  </div></div>`;
}

export { routeById, selected, suggestStops };
