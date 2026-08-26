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
  pace: { ...DEFAULT_PACE },
  departure: null,       // yyyy-mm-dd, set by the user, never committed
  seeded: false,
});

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

  // ---- bookings ----
  isBooked(id) { return !!this.s.booked[id]; }
  bookedOn(id) { return this.s.booked[id]; }
  toggleBooked(id) {
    if (this.s.booked[id]) delete this.s.booked[id];
    else this.s.booked[id] = new Date().toISOString().slice(0, 10);
    this.save();
  }

  // ---- pace ----
  get pace() { return this.s.pace; }
  setPace(p) { this.s.pace = { ...this.s.pace, ...p }; this.save(); }

  get departure() { return this.s.departure; }
  setDeparture(d) { this.s.departure = d; this.save(); }
}

export const store = new Store();
