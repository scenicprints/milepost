// Everything the two of you own. Right now it lives in localStorage; the
// Firestore layer drops in behind this same interface so nothing above it
// has to change.
//
// Note what is deliberately NOT in the repo: dates, overnight towns and
// notes. A public repo announcing an empty house for three weeks is the
// thing we're avoiding, so that data only ever exists here and (later) in
// Firestore behind the login.

import { DEFAULT_PACE } from './plan.js';

const KEY = 'milepost.v1';

const DEFAULTS = () => ({
  routes: { leg1: 'leg1-i40', leg2: 'leg2-gulf', leg3: 'leg3-i10' },
  chosen: [],            // stop ids
  seen: {},              // stopId -> yyyy-mm-dd
  notes: {},             // stopId -> text
  booked: {},            // stopId -> yyyy-mm-dd it was booked
  custom: [],            // your own places, same shape as data/stops.json entries
  pace: { ...DEFAULT_PACE },
  departure: null,       // yyyy-mm-dd, set by the user, never committed
  // Nights, as MINUTES ASLEEP keyed by the stop you sleep AFTER. Not a place
  // and not a hotel: the planner used to break the day by itself whenever the
  // clock ran past dusk, which invented a bedtime nobody chose. Now the day
  // ends where there is a sleep in here and nowhere else.
  sleeps: {},
  // How long you will REALLY be somewhere, as minutes keyed by stop id. The
  // number in stops.json is a researched guess and it is often wrong for you —
  // two and a half hours at the Grand Canyon is somebody's average, not your
  // morning. An entry here wins over the seed. Zero is a legitimate answer
  // (drive past and look), so absence and zero are different things.
  dwells: {},
  // Which stop ids the seeder has already had its say about. NOT a boolean:
  // the stop list grows as each leg's pool arrives, and a one-time flag meant
  // everything added later showed up unticked and stayed that way. Ids in here
  // are never re-seeded, so a stop you deliberately untick stays unticked.
  seededIds: [],
  departAt: '06:00',     // clock time you pull out, paired with `departure`
  // Saved plans, keyed by id. A plan is a WHOLE itinerary — which stops, where
  // you sleep, how long you linger, and when you leave — so two of them for the
  // same road can genuinely disagree. See the plans section below.
  plans: {},
  activePlan: null,      // id of the plan currently loaded, if any
});

/// Ids that read as themselves in a JSON export. Not crypto, just unique
/// enough that two plans made a second apart cannot collide.
let seq = 0;
const planId = name =>
  'p-' + (name || 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)
  + '-' + Date.now().toString(36) + (seq++).toString(36);

class Store extends EventTarget {
  constructor() {
    super();
    this.s = DEFAULTS();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.s = { ...this.s, ...JSON.parse(raw) };
    } catch (_) {}
    this.chosen = new Set(this.s.chosen);
  }

  save() {
    this.s.chosen = [...this.chosen];
    this.s.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch (_) {}
    this.dispatchEvent(new Event('change'));
  }

  // ---- the seam sync.js writes through ----
  get updatedAt() { return this.s.updatedAt || 0; }

  /// The whole trip as one plain object, safe to hand to Firestore.
  ///
  /// updatedAt is stamped here rather than only in save(), because the very
  /// first push happens on connect — before anything has been edited — and a
  /// document without it is ignored by sync's snapshot handler. That would
  /// mean the two phones silently never see each other's changes.
  snapshot() {
    this.s.chosen = [...this.chosen];
    if (typeof this.s.updatedAt !== 'number') this.s.updatedAt = Date.now();
    return JSON.parse(JSON.stringify(this.s));
  }

  /// A newer copy from the other phone. Written straight to storage without
  /// re-stamping updatedAt, or the two devices would ping-pong forever.
  applyRemote(data) {
    this.s = { ...this.s, ...data };
    this.chosen = new Set(this.s.chosen || []);
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch (_) {}
    this.dispatchEvent(new Event('change'));
  }

  // ---- route selection ----
  routeFor(legId) { return this.s.routes[legId]; }
  setRoute(legId, routeId) { this.s.routes[legId] = routeId; this.save(); }

  // ---- stops ----
  isChosen(id) { return this.chosen.has(id); }
  toggle(id) {
    this.chosen.has(id) ? this.chosen.delete(id) : this.chosen.add(id);
    this.save();
  }
  choose(ids) { for (const id of ids) this.chosen.add(id); this.save(); }

  // ---- the scrapbook ----
  isSeen(id) { return !!this.s.seen[id]; }
  markSeen(id) {
    if (this.s.seen[id]) delete this.s.seen[id];
    else this.s.seen[id] = new Date().toISOString().slice(0, 10);
    this.save();
  }
  seenDate(id) { return this.s.seen[id]; }

  note(id) { return this.s.notes[id] || ''; }
  setNote(id, t) { this.s.notes[id] = t; this.save(); }
  /// Save without notifying, so typing in a textarea doesn't redraw it away.
  setNoteQuiet(id, t) {
    this.s.notes[id] = t;
    this.s.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify({ ...this.s, chosen: [...this.chosen] })); } catch (_) {}
  }

  // ---- your own places ----
  //
  // A hotel is not a separate kind of thing: it is a stop with kind 'lodging',
  // which anchors it to the end of a day instead of costing detour time.
  get custom() { return this.s.custom || (this.s.custom = []); }

  addCustom(c) {
    const id = 'c' + Date.now().toString(36);
    this.custom.push({
      id,
      name: c.name,
      town: c.town || '',
      state: c.state || '',
      ll: c.ll,
      detour: Number(c.detour) || 0,
      dwell: Number(c.dwell) || 60,
      why: c.why || '',
      kind: c.kind === 'lodging' ? 'lodging' : 'stop',
      routes: c.routes || [],
      mine: true,
    });
    if (c.kind !== 'lodging') this.chosen.add(id);
    this.save();
    return id;
  }

  updateCustom(id, patch) {
    const c = this.custom.find(x => x.id === id);
    if (!c) return;
    Object.assign(c, patch);
    this.save();
  }

  removeCustom(id) {
    this.s.custom = this.custom.filter(x => x.id !== id);
    this.chosen.delete(id);
    delete this.s.seen[id];
    delete this.s.notes[id];
    delete this.sleeps[id];
    this.save();
  }

  isMine(id) { return this.custom.some(x => x.id === id); }

  // ---- bookings ----
  isBooked(id) { return !!this.s.booked[id]; }
  bookedOn(id) { return this.s.booked[id]; }
  toggleBooked(id) {
    if (this.s.booked[id]) delete this.s.booked[id];
    else this.s.booked[id] = new Date().toISOString().slice(0, 10);
    this.save();
  }

  // ---- sleep ----
  //
  // A sleep hangs off the stop it follows, so it travels with the plan when
  // the road is swapped and it cannot drift to a different point on the map.
  // The value is minutes; deleting the key is how a night is removed, so a
  // zero-length sleep can never sit in the plan pretending to be a night.
  get sleeps() { return this.s.sleeps || (this.s.sleeps = {}); }

  sleepAfter(id) { return this.sleeps[id] ?? null; }

  setSleep(id, minutes) {
    const m = Math.round(Number(minutes) || 0);
    if (m > 0) this.sleeps[id] = m;
    else delete this.sleeps[id];
    this.save();
  }

  clearSleep(id) { delete this.sleeps[id]; this.save(); }

  // ---- dwell ----
  //
  // Same shape as sleeps and for the same reason: keyed by stop id so it
  // survives a route swap. Unlike a sleep, ZERO IS MEANINGFUL — it says you
  // will drive past and look — so removing an override is `clearDwell`, never
  // setting it to nothing.
  get dwells() { return this.s.dwells || (this.s.dwells = {}); }

  dwellFor(id) { return this.dwells[id] ?? null; }

  setDwell(id, minutes) {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    this.dwells[id] = m;
    this.save();
  }

  clearDwell(id) { delete this.dwells[id]; this.save(); }

  // ---- pace ----
  //
  // KEPT ONLY FOR OLD SAVED PLANS. Speed is no longer a setting: it comes off
  // the road, per segment, from the posted limit on each stretch — see
  // route.js. One mph for 5,900 miles was wrong everywhere at once.
  get pace() { return this.s.pace; }
  setPace(p) { this.s.pace = { ...this.s.pace, ...p }; this.save(); }

  get departure() { return this.s.departure; }
  setDeparture(d) { this.s.departure = d; this.save(); }

  get departAt() { return this.s.departAt || '06:00'; }
  setDepartAt(t) { this.s.departAt = t || '06:00'; this.save(); }

  // ---- saved plans ----
  //
  // The live editing surface does not move. `chosen`, `sleeps` and `dwells`
  // stay exactly where every other module already reads them, and a plan is a
  // SNAPSHOT copied out of them and back in. That is the whole trick: nothing
  // above the store had to learn about plans, and an unsaved plan is simply
  // the working state, the way it has always been.
  //
  // A plan belongs to a route id, because "the same list on a different road"
  // is not the same list — the stops that exist depend on the road.
  get plans() { return this.s.plans || (this.s.plans = {}); }

  /// Saved plans for one road, newest edit first.
  listPlans(routeId) {
    return Object.values(this.plans)
      .filter(p => !routeId || p.routeId === routeId)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  get activePlan() { return this.s.activePlan || null; }
  getPlan(id) { return this.plans[id] || null; }

  /// Everything that makes this itinerary this itinerary.
  currentPlanBody(routeId) {
    return {
      routeId,
      chosen: [...this.chosen],
      sleeps: { ...this.sleeps },
      dwells: { ...this.dwells },
      departure: this.s.departure || null,
      departAt: this.departAt,
    };
  }

  /// Save the working state as a NEW plan and make it active.
  savePlanAs(name, routeId) {
    const id = planId(name);
    this.plans[id] = {
      id, name: String(name || 'Untitled').trim().slice(0, 60),
      ...this.currentPlanBody(routeId),
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.s.activePlan = id;
    this.save();
    return id;
  }

  /// Write the working state over the plan already loaded.
  updatePlan(id, routeId) {
    const p = this.plans[id];
    if (!p) return null;
    Object.assign(p, this.currentPlanBody(routeId), { updatedAt: Date.now() });
    this.save();
    return id;
  }

  /// Copy a plan under a new name, so "the same but without Dollywood" starts
  /// from what you already built instead of from nothing.
  duplicatePlan(id, name) {
    const p = this.plans[id];
    if (!p) return null;
    const nid = planId(name);
    this.plans[nid] = {
      ...JSON.parse(JSON.stringify(p)),
      id: nid, name: String(name || p.name + ' copy').trim().slice(0, 60),
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.s.activePlan = nid;
    this.save();
    return nid;
  }

  /// Load a plan into the working state. This REPLACES what is on screen, so
  /// the caller is responsible for having offered to save first.
  loadPlan(id) {
    const p = this.plans[id];
    if (!p) return null;
    this.chosen = new Set(p.chosen || []);
    this.s.chosen = [...this.chosen];
    this.s.sleeps = { ...(p.sleeps || {}) };
    this.s.dwells = { ...(p.dwells || {}) };
    this.s.departure = p.departure || null;
    this.s.departAt = p.departAt || '06:00';
    this.s.activePlan = id;
    this.save();
    return p;
  }

  renamePlan(id, name) {
    const p = this.plans[id];
    if (!p) return;
    p.name = String(name || p.name).trim().slice(0, 60);
    p.updatedAt = Date.now();
    this.save();
  }

  deletePlan(id) {
    delete this.plans[id];
    if (this.s.activePlan === id) this.s.activePlan = null;
    this.save();
  }

  /// True when the working state has drifted from the plan it was loaded from,
  /// so the UI can say "unsaved" rather than quietly losing an edit.
  planIsDirty(routeId) {
    const p = this.activePlan && this.plans[this.activePlan];
    if (!p) return this.chosen.size > 0;
    const a = this.currentPlanBody(routeId);
    // Key order is not meaning: {a:1,b:2} and {b:2,a:1} are the same plan, and
    // comparing them raw reported every load as an unsaved edit.
    const flat = o => Object.entries(o || {}).map(([k, v]) => k + '=' + v).sort().join(',');
    const norm = o => [
      [...(o.chosen || [])].sort().join(','),
      flat(o.sleeps), flat(o.dwells),
      o.departure || '', o.departAt || '06:00',
    ].join('|');
    return norm(a) !== norm(p);
  }
}

export const store = new Store();
