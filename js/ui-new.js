// The New look's screens. Kevin, on a first pass that only restyled Classic:
// "You can do a much bigger overhaul. That still looks the same." So these
// are new layouts, not new paint: each tab has its own title, each leg its own
// colour, stops sit under the day you reach them, and the calendar is an
// agenda of cards you open.
//
// Same data, same builder, same store as Classic: every number here comes
// from the functions ui.js already uses, and every button fires the same
// data-attributes app.js already handles. Only the arrangement is new.

import { store } from './store.js';
import { stopCost, fmtHours, driveMinutes } from './route.js';
import * as wx from './weather.js';
import * as mapview from './map.js';
import * as syncmod from './sync.js';
import { VERSION } from './version.js';
import { skin } from './skin.js';
import {
  data, realDays, realTotals, legRoute, selected, whereNow, whereAmI, lodgingFor, hasPosition,
  depOf, depKey, kindNow, wxBand, wxGlyph, drawerOpen, hasSky, skyOn,
  dueFor, dueText, dueShort, plansFor, timetable, drivers, dayAlerts, alertText, soonAlerts,
} from './ui.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dshort = d => `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
const mi = n => Math.round(n).toLocaleString();
const SHORT = ['Carolina', 'Houston', 'Home'];
const legShort = i => data().route.legs[i].short || SHORT[i];
const isoOf = d => d.toISOString().slice(0, 10);
const deg = n => (n < 0 ? '−' + Math.abs(n) : String(n));

// Little line icons, drawn inline so they take the text colour.
const I = {
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  nav: '<svg viewBox="0 0 24 24"><path d="M12 3l7 18-7-4-7 4z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  loc: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
};

// ================================================================== header
//
// Leg screens get a band in the leg's colour with the three legs as tabs on
// it. Whole-trip screens get a plain large title. Map screens get the slim
// version so the map keeps its room.
export function renderHead(legIx, tab) {
  const legs = data().route.legs;
  if (tab === 'cal' || tab === 'trip' || tab === 'wx') {
    let m = 0, d = 0;
    for (const r of selected()) { const t = realTotals(r); m += t.miles; d += t.days; }
    const title = { cal: 'Dates', trip: 'Trip', wx: 'Weather' }[tab];
    return `<div class="n-head plain${tab === 'wx' ? ' slim' : ''}">
      <div class="n-title">${title}</div>
      <div class="n-sub">${d} days · ${mi(m)} miles · three legs</div></div>`;
  }
  const li = tab === 'next' ? whereNow().legIx : legIx;
  const rt = legRoute(li);
  const t = realTotals(rt);
  const slim = tab === 'map';
  return `<div class="n-head leg${li}${slim ? ' slim' : ''}">
    <div class="n-kicker">${tab === 'next' ? 'On the road · ' : ''}Leg ${li + 1} of 3</div>
    <div class="n-title">${esc(legs[li].name)}</div>
    ${slim ? '' : `<div class="n-sub">${mi(t.miles)} mi · ${t.days} ${t.days === 1 ? 'day' : 'days'} · ${t.stops} stops</div>`}
    ${tab === 'next' ? '' : `<div class="n-legs">${legs.map((l, i) =>
      `<button data-leg="${i}" aria-selected="${i === li}">${esc(legShort(i))}</button>`).join('')}</div>`}
  </div>`;
}

// ================================================================== today
export function renderNext() {
  const here = whereNow();
  const rt = here.route;
  const days = realDays(rt);
  const day = days.find(d => here.mile >= d.startMile - 1 && here.mile <= d.endMile + 1) || days[0];
  const ahead = rt.stops
    .filter(s => store.isChosen(s.id) && s.mile > here.mile - 2 && !store.isSeen(s.id))
    .sort((a, b) => a.mile - b.mile);
  const next = ahead[0];
  const after = ahead.slice(1, 5);
  const bed = day ? lodgingFor(rt, day.endMile) : null;
  const risks = rt.towns.filter(t => t.risk && t.mile > here.mile && t.mile < here.mile + 260);

  let h = `<div class="n-page leg${here.legIx}">`;
  for (const a of soonAlerts())
    h += `<div class="n-alert ${a.level}">${I.warn}<span><b>${esc(a.day)}: ${esc(a.event)}</b>
      <small>${esc(alertText(a).slice(a.event.length).replace(/^ near /, 'Near ').replace(/^, /, ''))}</small></span></div>`;
  if (!hasPosition())
    h += `<button class="n-banner" data-watch>${I.loc}<span><b>Location is off.</b> Distances are counted from
      the first place you haven't marked seen.</span><em>Turn on</em></button>`;

  if (next) {
    const dist = Math.max(0, Math.round(next.mile - here.mile));
    const c = stopCost(next);
    h += `<div class="n-hero">
      <button class="n-herobody" data-stop="${next.id}">
        <div class="n-kick">${next.kind === 'lodging' ? 'Tonight' : 'Next stop'}</div>
        <div class="n-heroname">${esc(next.name)}</div>
        <div class="n-heromuted">${esc(next.town)}, ${esc(next.state)}${next.kind === 'lodging' ? '' : ` · ${fmtHours(c.total)} all in`}</div>
        ${(() => { const r = dueFor(rt, next.id); return r ? `<div class="n-due">${esc(dueText(r))}</div>` : ''; })()}
        <div class="n-dist"><b>${dist.toLocaleString()}</b> ${dist === 1 ? 'mile' : 'miles'} away</div>
      </button>
      <div class="n-herobtns">
        <a class="n-btn solid" href="https://www.google.com/maps/dir/?api=1&destination=${next.ll[0]},${next.ll[1]}"
           target="_blank" rel="noopener">${I.nav}Navigate</a>
        <button class="n-btn" data-seen="${next.id}">${I.check}Been there</button>
      </div>
    </div>`;
  } else {
    h += `<div class="n-hero"><div class="n-herobody"><div class="n-kick">All done</div>
      <div class="n-heroname">Nothing left on this leg</div>
      <div class="n-heromuted">Everything you picked is marked seen.</div></div></div>`;
  }

  if (after.length)
    h += `<div class="n-sec">Coming up</div><div class="n-card n-list">${after.map(s =>
      `<button class="n-row" data-stop="${s.id}"><span class="n-dot"></span>
        <span class="n-rowmain"><b>${esc(s.name)}</b><small>${esc(s.town)}, ${esc(s.state)}</small></span>
        <span class="n-rowend">${(() => { const r = dueFor(rt, s.id); return r ? `<b class="n-time">${esc(dueShort(r))}</b>` : ''; })()}${mi(Math.max(0, s.mile - here.mile))} mi</span></button>`).join('')}</div>`;

  const nextIsTonight = next && next.kind === 'lodging' &&
    (bed ? bed.id === next.id : Math.abs(next.mile - (day ? day.endMile : -1)) < 2);
  if (day && !nextIsTonight) {
    const toNight = Math.max(0, day.endMile - here.mile);
    h += `<div class="n-sec">Tonight</div><div class="n-card n-night">
      <span class="n-ic">${I.moon}</span>
      <span class="n-rowmain"><b>${esc(day.overnight.name)}</b>
        <small>${mi(toNight)} mi · ${fmtHours(driveMinutes(here.mile, day.endMile, rt))} of driving${day.arriveAt ? ` · in about ${esc(day.arriveAt)}` : ''}</small></span>
      ${bed ? `<button class="n-chip" data-stop="${bed.id}">${esc(bed.name)}</button>`
        : `<button class="n-chip add" data-addbed="${here.legIx}" data-town="${esc(day.overnight.name)}"
             data-st="${esc(day.overnight.state || '')}">Add a bed</button>`}
    </div>`;
  }

  if (risks.length)
    h += `<div class="n-sec">Watch out</div>${risks.map(t => `<div class="n-card n-warn">
      <span class="n-ic">${I.warn}</span><span class="n-rowmain"><b>${esc(t.name)}${t.elev ? ` · ${t.elev.toLocaleString()} ft` : ''}</b>
      ${t.note ? `<small>${esc(t.note)}</small>` : ''}</span><span class="n-rowend">${mi(t.mile - here.mile)} mi</span></div>`).join('')}`;

  const pct = Math.min(100, Math.max(0, here.mile / rt.miles * 100));
  h += `<div class="n-sec">This leg</div><div class="n-card n-prog">
    <div class="n-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    <div class="n-progrow"><span><b>${mi(here.mile)}</b> mi behind</span><span><b>${mi(Math.max(0, rt.miles - here.mile))}</b> to go</span></div>
    ${here.onRoute === false && hasPosition() ? `<small>You're ${Math.round(here.off)} miles off the route; these numbers assume you rejoin it.</small>` : ''}
  </div>`;
  return h + '</div>';
}

// ================================================================== route
//
// The stops under the day you reach them, each with a switch. A day is a
// card: where it runs, how far, and where you sleep at the end of it.
const bucket = m => (m < 45 ? 't0' : m < 90 ? 't1' : m < 180 ? 't2' : 't3');

export function renderRoute(legIx) {
  const rt = legRoute(legIx);
  const days = realDays(rt);
  const dated = !!depOf(rt).date;
  const kf = kindNow();
  let h = `<div class="n-page leg${legIx}">
    <div class="n-tools">
      <div class="n-pills">
        <button data-kindfilter="all" aria-pressed="${kf === 'all'}">All</button>
        <button data-kindfilter="sight" aria-pressed="${kf === 'sight'}">Sights</button>
        <button data-kindfilter="food" aria-pressed="${kf === 'food'}">Food</button>
      </div>
      <button class="n-add" data-add>${I.plus}Add a place</button>
    </div>`;

  const stops = rt.stops.filter(s => s.kind !== 'lodging' &&
    (kf === 'all' || (kf === 'food') === (s.kind === 'food')));
  days.forEach((d, i) => {
    const last = i === days.length - 1;
    const mine = stops.filter(s => s.mile > (i ? d.startMile : -1) && (last || s.mile <= d.endMile));
    const bed = last ? null : lodgingFor(rt, d.overnight.mile);
    const on = mine.filter(s => store.isChosen(s.id)).length;
    h += `<section class="n-day">
      <div class="n-dayhead">
        <span class="n-daynum">Day ${i + 1}</span>
        ${dated ? `<span class="n-daydate">${esc(dshort(d.date))}</span>` : ''}
        <span class="n-daymeta">${mi(d.miles)} mi · ${fmtHours(d.driveMins)}</span>
      </div>
      <div class="n-dayto">${esc(d.from.name)} <span>→</span> ${esc(d.overnight.name)}</div>
      <div class="n-card n-stops">
        ${mine.length ? mine.map(s => {
          const c = stopCost(s), chosen = store.isChosen(s.id), seen = store.isSeen(s.id);
          return `<div class="n-stop${chosen ? ' on' : ''}${seen ? ' seen' : ''}">
            <button class="n-stopbody" data-stop="${s.id}">
              <b>${esc(s.name)}${s.kind === 'food' ? '<i class="n-tag">food</i>' : ''}${s.big ? '<i class="n-tag big">highlight</i>' : ''}</b>
              <small>${esc(s.town)}, ${esc(s.state)} · <span class="n-cost ${bucket(c.total)}">${fmtHours(c.total)}</span></small>
            </button>
            <button class="n-switch" role="switch" aria-checked="${chosen}" data-toggle="${s.id}"
              aria-label="${chosen ? 'Remove' : 'Add'} ${esc(s.name)}"><i></i></button>
          </div>`;
        }).join('') : `<div class="n-none">${kf === 'all' ? 'Just driving.' : 'Nothing of this kind today.'}</div>`}
        ${last ? `<div class="n-end">${I.pin}<span><b>${esc(d.overnight.name)}</b><small>End of the leg</small></span></div>`
          : `<${bed ? `button data-stop="${bed.id}"` : 'div'} class="n-end">${I.moon}<span><b>${esc(bed ? bed.name : d.overnight.name)}</b>
             <small>Night ${i + 1}${d.arriveAt ? ` · in at ${esc(d.arriveAt)}` : ''}</small></span>${bed ? I.chev : ''}</${bed ? 'button' : 'div'}>`}
      </div>
      ${on ? '' : ''}
    </section>`;
  });
  return h + '</div>';
}

// ================================================================== dates
//
// An agenda. Each leg is a coloured section; each driving day a card that
// opens to its stops. Parked days fold into one line. Which cards are open
// survives the redraws the weather refresh causes.
const opened = new Set();
if (typeof document !== 'undefined')
  document.addEventListener('toggle', e => {
    const id = e.target && e.target.dataset && e.target.dataset.nday;
    if (!id) return;
    if (e.target.open) opened.add(id); else opened.delete(id);
  }, true);

function dayWx(d) {
  const ps = [];
  let night = null;
  for (const r of d.rows) if (r.stop && r.date) {
    const p = wx.picture(r.stop.id, r.stop.ll, r.kind === 'bed' ? r.wakeDate : r.date);
    if (!p) continue;
    if (r.kind === 'bed') night = p; else ps.push(p);
  }
  const all = ps.length ? ps : night ? [night] : [];
  if (!all.length) return '';
  const hi = Math.max(...all.map(p => p.hi));
  const worst = all.reduce((a, p) => ((p.snow || 0) + (p.heavy || 0) > (a.snow || 0) + (a.heavy || 0) ? p : a));
  return `<span class="n-wx">${esc(wxGlyph(worst))} ${deg(hi)}°${night ? `<small>/${deg(night.lo)}°</small>` : ''}</span>`;
}

export function renderCalendar() {
  const legs = data().route.legs;
  let h = '<div class="n-page">';
  const ends = [];
  legs.forEach((leg, li) => {
    const rt = legRoute(li);
    const dep = depOf(rt);
    const key = depKey(rt);
    const editor = `<div class="n-depset">
        <input type="date" value="${esc(dep.date || '')}" data-depdate="${esc(key)}" aria-label="Departure date">
        <input type="time" value="${esc(dep.at)}" data-depat="${esc(key)}" aria-label="Departure time"></div>`;
    if (!dep.date) {
      h += `<section class="n-legsec leg${li}"><div class="n-leghead"><span class="n-legbar"></span>
        <div><b>${esc(leg.name)}</b><small>No departure date yet</small></div></div>
        <div class="n-card n-pad">Pick when this leg leaves and its days lay themselves out here.${editor}</div></section>`;
      return;
    }
    const D = realDays(rt);
    const plans = plansFor(rt);
    const first = D[0].date, last = D[D.length - 1].date;
    if (ends.length) {
      const prev = ends[ends.length - 1];
      const gap = Math.round((first - prev.date) / 86400000) - 1;
      if (gap > 0) h += `<div class="n-parked">${I.pin}<span>Parked in <b>${esc(prev.where)}</b> for ${gap} ${gap === 1 ? 'day' : 'days'}</span></div>`;
    }
    ends.push({ date: last, where: rt.waypoints[rt.waypoints.length - 1].name });
    h += `<section class="n-legsec leg${li}">
      <details class="n-leghead" data-nday="dep-${li}"${opened.has('dep-' + li) ? ' open' : ''}>
        <summary><span class="n-legbar"></span><div><b>${esc(leg.name)}</b>
          <small>${esc(dshort(first))} – ${esc(dshort(last))} · ${D.length} ${D.length === 1 ? 'day' : 'days'} · leaves ${esc(dep.at)}</small></div>
          <em>Change</em></summary>${editor}</details>`;
    D.forEach((d, di) => {
      const id = isoOf(d.date) + '-' + li + '-' + di;
      const p = plans[di];
      h += `<div class="n-dcard">
        <div class="n-dtop">
          <span class="n-dd"><b>${d.date.getUTCDate()}</b><small>${WD[d.date.getUTCDay()]}</small></span>
          <span class="n-dmain"><b>${esc(d.from.name)} → ${esc(d.overnight.name)}</b>
            <small>${mi(d.miles)} mi · ${fmtHours(d.driveMins)} driving${d.stopMins ? ` · ${fmtHours(d.stopMins)} stopped` : ''}</small>
            ${dayAlerts(li, di).map(a => `<span class="n-flag nws ${a.level}">${I.warn}${esc(alertText(a))}</span>`).join('')}
            ${d.risks.length ? `<span class="n-flag">${I.warn}Winter watch · ${esc(d.risks.map(r => r.name + (r.atLabel ? ' ' + r.atLabel : '') + (r.dark ? ', dark' : '') + (r.early ? ', before plows' : '')).join(' · '))}</span>` : ''}
            ${p && p.long ? `<span class="n-flag long">${I.warn}Long day: ${esc(p.reasons.join(' · '))}</span>` : ''}</span>
          ${dayWx(d)}
        </div>
        <div class="n-tt">
          <div class="n-tth"><span>Arrive</span><span>Leave</span><span></span></div>
          ${timetable(d, di === D.length - 1).map(t => `<${t.id ? `button data-stop="${t.id}"` : 'div'} class="n-ttr ${t.kind}">
            <span class="a">${esc(t.arrive || '')}</span><span class="l">${esc(t.leave || '')}</span>
            <span class="n">${esc(t.name)}<small>${esc(t.note)}</small>${t.bad ? `<small class="bad">${esc(t.bad)}</small>` : ''}</span>
          </${t.id ? 'button' : 'div'}>`).join('')}
        </div>
        ${p && p.stretches.length ? `<details class="n-more" data-nday="${id}"${opened.has(id) ? ' open' : ''}>
          <summary><b>Who drives</b><span>${esc(drivers.splitLine(p))}</span></summary>
          <div class="n-drv">${p.stretches.map(s => `<div class="n-str ${s.who}"><i>${s.who === 'you' ? 'You' : s.who === 'maybe' ? 'Co-driver if dry' : 'Co-driver'}</i>
            <span>${esc(s.from)} → ${esc(s.to)}<small>${fmtHours(s.min)} · ${s.miles} mi${s.why.length ? ' · ' + esc(s.why.join(', ')) : ''}</small></span></div>`).join('')}
            ${wxBand(d, rt)}</div>
        </details>` : ''}
      </div>`;
    });
    h += '</section>';
  });
  return h + '</div>';
}

// ================================================================== map
//
// The map fills the screen under the slim leg header. Round floating
// controls; at the foot, one card for the leg in its own colour that opens to
// the case for the route. The ids and data-attributes are the Map tab's own,
// so the gestures, zoom, sky layer and drawer all work unchanged.
export function renderMap(legIx) {
  const rt = legRoute(legIx);
  const leg = data().route.legs[legIx];
  const opt = leg.routes.find(o => o.id === rt.id) || {};
  const t = realTotals(rt);
  const open = drawerOpen();
  return `<div class="mapbox n-mapbox leg${legIx}" id="mapbox">
      <div class="mapstage" id="mstage" style="width:${mapview.MW}px;height:${mapview.MH}px">
        <svg class="mapsvg" id="msvg" width="${mapview.MW}" height="${mapview.MH}"
             viewBox="0 0 ${mapview.MW} ${mapview.MH}" role="img" aria-label="Map of the trip with this leg in colour"></svg>
      </div>
      <div class="zoom n-zoom">
        <button data-zoom="in" aria-label="Zoom in">${I.plus}</button>
        <button data-zoom="out" aria-label="Zoom out"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
        <button data-zoom="fit" aria-label="Fit to leg"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
        ${hasSky() ? `<button class="sky" data-sky aria-pressed="${skyOn()}" aria-label="Show where the sky is dark">${I.moon}</button>` : ''}
      </div>
      ${hasSky() ? `<div class="skykey" id="skykey"${skyOn() ? '' : ' hidden'}>
        <span class="kt">Sky within 30 min of the road</span>
        <span class="ks">
          <i style="background:#12163a"></i><i style="background:#1a2350"></i><i style="background:#1a3a78"></i><i style="background:#206e60"></i><i style="background:#b0a838"></i><i style="background:#d67a28"></i><i style="background:#c63c2c"></i><i style="background:#e29696"></i><i style="background:#f6e8e8"></i>
        </span>
        <span class="kl"><b>dark</b><b>city</b></span>
      </div>` : ''}
      <div class="mways n-mways${open ? ' up' : ''}" id="mways">
        <button class="mwbar" data-drawer aria-expanded="${open}">
          <span class="n-legdot"></span>
          <span class="t"><b>${esc(rt.name)}</b><small>${mi(t.miles)} mi · ${t.days} days · ${t.stops} stops</small></span>
          <span class="x">${open ? 'Close' : 'Why'}</span>
        </button>
        <div class="mwbody">
          ${opt.road ? `<div class="n-road">${esc(opt.road)}</div>` : ''}
          ${opt.character ? `<p>${esc(opt.character)}</p>` : ''}
          ${opt.why ? `<p class="m">${esc(opt.why)}</p>` : ''}
          ${opt.costs ? `<p class="m">${esc(opt.costs)}</p>` : ''}
        </div>
      </div>
    </div>`;
}

// ================================================================== trip
//
// Settings, grouped the way a phone groups its own: the countdown, the three
// legs, the look, sharing, then what to book, what to watch and who to call.
export function renderTrip(upd = {}) {
  const st = { ...syncmod.state, ...upd };
  const dep = store.departure;
  const days = dep ? Math.ceil((new Date(dep + 'T00:00:00') - new Date()) / 86400000) : null;
  const legs = data().route.legs;
  let h = '<div class="n-page">';

  // The countdown, striped with the three legs' colours.
  h += dep
    ? `<div class="n-count"><div class="n-stripe"><i class="leg0"></i><i class="leg1"></i><i class="leg2"></i></div>
        <b>${days > 0 ? days : 0}</b><span>${days > 0 ? (days === 1 ? 'day until you leave' : 'days until you leave') : "You're out there"}</span>
        <button class="n-link" data-cleardep>Change the date · ${esc(dep)}</button></div>`
    : `<div class="n-card n-pad"><b class="n-strong">When do you leave?</b>
        <div>It stays on your phones and never goes in the repo.</div>
        <input type="date" id="depart" class="n-input"></div>`;

  // The three legs, each in its colour; tap through to its days.
  h += `<div class="n-sec">Your three legs</div><div class="n-card">${legs.map((l, i) => {
    const rt = legRoute(i), d = depOf(rt);
    return `<button class="n-row leg${i}" data-tab="cal"><span class="n-dot"></span>
      <span class="n-rowmain"><b>${esc(l.name)}</b><small>${esc(rt.name)}</small></span>
      <span class="n-rowend">${d.date ? esc(dshort(new Date(d.date + 'T00:00:00Z'))) : 'No date'}</span></button>`;
  }).join('')}</div>`;

  h += `<div class="n-sec">Look</div><div class="seg2 n-look">
      <button data-skinpick="classic" aria-pressed="${skin() === 'classic'}">Classic</button>
      <button data-skinpick="new" aria-pressed="${skin() === 'new'}">New</button></div>
    <div class="n-note">New is the streamlined look with only the three confirmed plans. Each phone keeps its own; nothing is lost switching back.</div>`;

  h += `<div class="n-sec">Both phones</div><div class="n-card n-pad">${st.on
    ? `<div>Changes on either phone show up on the other. Anything done with no signal lands when you get bars.</div>
       <div class="n-code">${esc(st.code)}</div>
       <div class="n-btns"><button class="n-btn2" data-copy-code="${esc(st.code)}">Copy the code</button>
         <button class="n-btn2" data-sync-off>Disconnect</button></div>`
    : `<div>Enter the trip code to share this plan with the other phone.</div>
       <input id="tripcode" class="n-input" placeholder="XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false">
       <button class="n-btn2 solid" data-sync-connect>Connect</button>`}
    ${st.error ? `<div class="n-err">${esc(st.error)}</div>` : ''}</div>`;

  // Bookings: what in the plan needs booking ahead, soonest deadline first.
  const B = data().bookings;
  const need = selected().flatMap(r => r.stops).filter((s, i, a) =>
    store.isChosen(s.id) && B[s.id] && a.findIndex(x => x.id === s.id) === i);
  if (need.length) {
    const due = s => { if (!dep) return null; const d = new Date(dep + 'T00:00:00'); d.setDate(d.getDate() - B[s.id].lead); return d; };
    need.sort((a, b) => (dep ? due(a) - due(b) : B[b.id].lead - B[a.id].lead));
    const open = need.filter(s => !store.isBooked(s.id)).length;
    h += `<div class="n-sec">Bookings · ${open ? `${open} to book` : 'all booked'}</div><div class="n-card">${need.map(s => {
      const booked = store.isBooked(s.id), d = due(s);
      return `<div class="n-row"><button class="n-check${booked ? ' on' : ''}" data-book="${s.id}" aria-label="Mark ${esc(s.name)} booked">${I.check}</button>
        <button class="n-rowmain" data-stop="${s.id}"><b>${esc(s.name)}</b>
          <small>${booked ? 'Booked' : d ? `Book by ${esc(dshort(new Date(d.toISOString().slice(0, 10) + 'T00:00:00Z')))}` : `${B[s.id].lead} days ahead`}</small></button></div>`;
    }).join('')}</div>`;
  }

  // Winter watch: every flagged spot on the three roads, once, in road order.
  const seenT = new Set(), risks = [];
  for (const r of selected()) for (const t of r.towns) if (t.risk && !seenT.has(t.name)) { seenT.add(t.name); risks.push(t); }
  h += `<div class="n-sec">Winter watch</div><div class="n-card">${risks.length ? risks.map(t =>
    `<details class="n-fold"><summary><span class="n-ic warn">${I.warn}</span><span class="n-rowmain"><b>${esc(t.name)}, ${esc(t.state)}</b>
      ${t.elev ? `<small>${t.elev.toLocaleString()} ft</small>` : ''}</span></summary>${t.note ? `<p>${esc(t.note)}</p>` : ''}</details>`).join('')
    : '<div class="n-pad">Nothing flagged on these roads.</div>'}</div>`;

  // Road conditions: each state you cross, once, in the order you cross it.
  const seenS = new Set(), dots = [];
  for (const r of selected()) for (const t of r.towns) if (!seenS.has(t.state)) {
    seenS.add(t.state);
    const d = data().route.dot.find(x => x.state === t.state);
    if (d) dots.push(d);
  }
  if (dots.length)
    h += `<div class="n-sec">Road conditions · check the night before</div><div class="n-chips">${dots.map(d =>
      `<a class="n-statechip" href="${d.url}" target="_blank" rel="noopener"><b>${esc(d.state)}</b>${esc(d.name)}</a>`).join('')}</div>`;

  const seen = selected().flatMap(r => r.stops).filter((s, i, a) => store.isSeen(s.id) && a.findIndex(x => x.id === s.id) === i);
  if (seen.length)
    h += `<div class="n-sec">Been there · ${seen.length}</div><div class="n-card">${seen.map(s =>
      `<button class="n-row" data-stop="${s.id}"><span class="n-ic">${I.check}</span><span class="n-rowmain"><b>${esc(s.name)}</b></span>
        <span class="n-rowend">${esc(store.seenDate(s.id))}</span></button>`).join('')}</div>`;

  const here = whereAmI();
  h += `<div class="n-sec">This phone</div><div class="n-card">
    <button class="n-row" data-update><span class="n-rowmain"><b>${st.updateReady ? 'Restart to update' : 'Check for updates'}</b>
      ${st.updateNote ? `<small>${esc(st.updateNote)}</small>` : ''}</span><span class="n-rowend">${esc(VERSION)}</span></button>
    <div class="n-row"><span class="n-rowmain"><b>Offline</b><small id="offline-state">Checking…</small></span></div>
    ${here ? `<div class="n-row"><span class="n-rowmain"><b>Where we are</b>
        <small>${mi(here.mile)} of ${mi(here.route.miles)} miles into ${esc(here.route.name)}</small></span></div>`
      : `<button class="n-row" data-locate><span class="n-rowmain"><b>Use my location</b>
        <small>Shows where you are on the route</small></span><span class="n-rowend">${I.chev}</span></button>`}
  </div>`;
  return h + '</div>';
}
