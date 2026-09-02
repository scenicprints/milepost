// Two phones, one itinerary.
//
// Why Firestore: it queues writes while offline and flushes them when signal
// comes back. On this trip that is the whole point — you check off Meteor
// Crater west of Winslow with no bars, and it lands on the other phone at
// Albuquerque.
//
// Why a trip code instead of a login: enabling a sign-in provider on a fresh
// Firebase project routes through Identity Platform, which refuses without a
// billing account. So the document path IS the secret. The code lives in the
// deployed security rules (server-side, not public) and in each phone's local
// storage — never in this repo, which is public. 80 bits of entropy, and the
// rules deny collection listing, so it can't be found by probing.
//
// The SDK is vendored in vendor/ rather than pulled from gstatic so the service
// worker can cache it. A CDN import would fail in exactly the places this trip
// goes.
//
// Everything here is lazy. If this module never loads or never connects, the
// app runs entirely from localStorage. Sync is an enhancement, never a
// dependency.

import { CONFIG } from './firebase-config.js';
import { store } from './store.js';

const CODE_KEY = 'milepost.trip-code';

export const sync = new EventTarget();
export let state = { on: false, status: 'off', code: null, error: null, lastPull: null, lastPush: null };

let db = null, docRef = null, unsub = null, f = null;
let pushTimer = null;
let applyingRemote = false;

function set(patch) {
  state = { ...state, ...patch };
  sync.dispatchEvent(new Event('change'));
}

export const savedCode = () => localStorage.getItem(CODE_KEY);
export const normalise = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  .replace(/(.{4})(?=.)/g, '$1-');

async function load() {
  if (db) return true;
  if (!CONFIG.apiKey) { set({ status: 'unconfigured' }); return false; }
  try {
    const [{ initializeApp }, fs] = await Promise.all([
      import('../vendor/firebase-app.js'),
      import('../vendor/firebase-firestore.js'),
    ]);
    f = fs;
    const app = initializeApp(CONFIG);
    // Persistent cache is what makes the dead zones survivable.
    db = f.initializeFirestore(app, {
      localCache: f.persistentLocalCache({ tabManager: f.persistentSingleTabManager({}) }),
    });
    return true;
  } catch (e) {
    set({ status: 'error', error: 'Could not load Firebase: ' + e.message });
    return false;
  }
}

/// Connect this phone to the shared trip. Verifies the code actually works
/// before saving it, so a typo reports itself instead of silently never syncing.
export async function connect(rawCode) {
  const code = normalise(rawCode);
  if (code.replace(/-/g, '').length < 12) {
    set({ status: 'error', error: 'That code looks too short.' });
    return false;
  }
  if (!(await load())) return false;
  set({ status: 'connecting', error: null });
  try {
    const ref = f.doc(db, 'trips', code);
    const snap = await f.getDoc(ref); // rules reject a wrong code here
    docRef = ref;
    localStorage.setItem(CODE_KEY, code);
    set({ on: true, status: 'connected', code, error: null });
    // PULL BEFORE PUSH. Connecting used to push this phone's state
    // unconditionally, which meant every app open replayed a stale local copy
    // over whatever the trip doc held — a seeded plan, the other phone's
    // fresher state — with an old updatedAt, so the watch guard then saw
    // nothing newer and the clobber stuck. The doc we already fetched to
    // verify the code is the answer: if it is newer than this phone, it wins
    // and there is nothing to push; only a phone that is genuinely ahead
    // writes on connect.
    const data = snap.exists() ? snap.data() : null;
    if (data && typeof data.updatedAt === 'number' && data.updatedAt > store.updatedAt) {
      applyingRemote = true;
      try { store.applyRemote(data); } finally { applyingRemote = false; }
      set({ lastPull: Date.now() });
      watch();
    } else {
      watch();
      push();
    }
    return true;
  } catch (e) {
    set({
      status: 'error',
      error: /permission|insufficient/i.test(e.message || '')
        ? "That code wasn't accepted. Check it against the other phone."
        : 'Could not reach the trip. It will retry when you have signal.',
    });
    return false;
  }
}

export async function resume() {
  const code = savedCode();
  if (code) await connect(code);
}

export function disconnect() {
  if (unsub) { unsub(); unsub = null; }
  localStorage.removeItem(CODE_KEY);
  docRef = null;
  set({ on: false, status: 'off', code: null });
}

/// Live subscription. Remote only wins when genuinely newer, so a phone that
/// has been offline for a day can't overwrite the one being used.
function watch() {
  if (!docRef || unsub) return;
  unsub = f.onSnapshot(docRef, snap => {
    if (!snap.exists()) { push(); return; }
    const data = snap.data();
    if (!data || typeof data.updatedAt !== 'number') return;
    if (data.updatedAt <= store.updatedAt) return;
    applyingRemote = true;
    try { store.applyRemote(data); } finally { applyingRemote = false; }
    set({ lastPull: Date.now() });
  }, err => set({ status: 'error', error: err.message }));
}

/// Debounced, so a burst of taps is one write.
export function nudge() {
  if (!state.on || applyingRemote) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 1200);
}

async function push() {
  if (!state.on || !docRef) return;
  try {
    await f.setDoc(docRef, store.snapshot(), { merge: true });
    set({ lastPush: Date.now(), status: 'connected', error: null });
  } catch (e) {
    // Offline isn't an error — the write is queued and will land.
    if (!/offline|unavailable/i.test(e.message || '')) {
      set({ status: 'error', error: e.message });
    }
  }
}

store.addEventListener('change', nudge);

// A phone that comes back from the background missed everything: the tab was
// suspended, the snapshot listener frozen, and the first thing the user does
// on waking stamps their stale state newest and pushes it over whatever
// arrived while they were away. So on every return to the foreground, ask the
// server once and apply if it is ahead — the same rule connect() uses.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !docRef || !f) return;
  try {
    const snap = await f.getDoc(docRef);
    const data = snap.exists() ? snap.data() : null;
    if (data && typeof data.updatedAt === 'number' && data.updatedAt > store.updatedAt) {
      applyingRemote = true;
      try { store.applyRemote(data); } finally { applyingRemote = false; }
      set({ lastPull: Date.now() });
    }
  } catch (_) { /* offline wake; the live listener will catch up */ }
});
