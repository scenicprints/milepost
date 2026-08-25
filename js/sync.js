// Two phones, one itinerary.
//
// Why Firestore and not something simpler: it queues writes while offline and
// flushes them when signal comes back. On this trip that is the entire point —
// you check off Meteor Crater somewhere west of Winslow with no bars, and it
// lands on the other phone when you reach Albuquerque.
//
// The SDK is vendored in vendor/ rather than pulled from gstatic so the
// service worker can cache it. A CDN import would mean the app fails to boot
// in exactly the places this trip goes.
//
// Everything here is lazy: if this module never loads, or never connects, the
// app still runs entirely from localStorage. Sync is an enhancement, never a
// dependency.

import { CONFIG, TRIP_ID } from './firebase-config.js';
import { store } from './store.js';

export const sync = new EventTarget();

export let state = { on: false, status: 'off', who: null, error: null, lastPull: null };

let db = null, auth = null, docRef = null, unsub = null;
let pushTimer = null;
let applyingRemote = false;

function set(patch) {
  state = { ...state, ...patch };
  sync.dispatchEvent(new Event('change'));
}

async function load() {
  if (db) return true;
  if (!CONFIG.apiKey) { set({ status: 'unconfigured' }); return false; }
  try {
    const [{ initializeApp }, a, f] = await Promise.all([
      import('../vendor/firebase-app.js'),
      import('../vendor/firebase-auth.js'),
      import('../vendor/firebase-firestore.js'),
    ]);
    const app = initializeApp(CONFIG);
    auth = a.getAuth(app);
    // Persistent cache is what makes the dead zones survivable.
    db = f.initializeFirestore(app, {
      localCache: f.persistentLocalCache({ tabManager: f.persistentSingleTabManager({}) }),
    });
    docRef = f.doc(db, 'trips', TRIP_ID);
    sync._f = f;
    sync._a = a;
    return true;
  } catch (e) {
    set({ status: 'error', error: 'Could not load Firebase: ' + e.message });
    return false;
  }
}

/// Sign in with the shared trip login. The password is typed by whoever owns
/// the trip, into their own app — it is never stored anywhere but the
/// browser's own credential handling.
export async function signIn(email, password) {
  if (!(await load())) return false;
  set({ status: 'connecting', error: null });
  try {
    const cred = await sync._a.signInWithEmailAndPassword(auth, email.trim(), password);
    set({ on: true, status: 'connected', who: cred.user.email, error: null });
    localStorage.setItem('milepost.sync-email', email.trim());
    watch();
    return true;
  } catch (e) {
    set({ status: 'error', error: friendly(e.code || e.message) });
    return false;
  }
}

export async function resume() {
  if (!localStorage.getItem('milepost.sync-email')) return;
  if (!(await load())) return;
  set({ status: 'connecting' });
  sync._a.onAuthStateChanged(auth, user => {
    if (user) {
      set({ on: true, status: 'connected', who: user.email, error: null });
      watch();
    } else {
      set({ on: false, status: 'signed-out' });
    }
  });
}

export async function signOut() {
  if (unsub) { unsub(); unsub = null; }
  localStorage.removeItem('milepost.sync-email');
  if (auth) await sync._a.signOut(auth);
  set({ on: false, status: 'off', who: null });
}

/// Live subscription. Remote wins only when it is genuinely newer, so a phone
/// that has been offline for a day doesn't overwrite the one that was being
/// used.
function watch() {
  if (!docRef || unsub) return;
  unsub = sync._f.onSnapshot(docRef, snap => {
    if (!snap.exists()) { push(); return; }
    const data = snap.data();
    if (!data || typeof data.updatedAt !== 'number') return;
    if (data.updatedAt <= store.updatedAt) return;
    applyingRemote = true;
    try { store.applyRemote(data); } finally { applyingRemote = false; }
    set({ lastPull: Date.now() });
  }, err => set({ status: 'error', error: err.message }));
}

/// Debounced so a burst of taps is one write.
export function nudge() {
  if (!state.on || applyingRemote) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 1200);
}

async function push() {
  if (!state.on || !docRef) return;
  try {
    await sync._f.setDoc(docRef, store.snapshot(), { merge: true });
  } catch (e) {
    // Offline is not an error here — the write is queued and will land.
    if (!/offline|unavailable/i.test(e.message || '')) {
      set({ status: 'error', error: e.message });
    }
  }
}

function friendly(code) {
  if (/user-not-found|invalid-credential|wrong-password/.test(code))
    return 'That email and password combination was not accepted.';
  if (/network/.test(code)) return 'No connection. It will sync when you have signal.';
  if (/too-many-requests/.test(code)) return 'Too many attempts. Wait a minute.';
  return code;
}

store.addEventListener('change', nudge);
