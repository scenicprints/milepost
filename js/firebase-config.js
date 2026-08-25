// Firebase web config. This is PUBLIC by design — it identifies the project,
// it does not authorise anything. Access is controlled by the Firestore
// security rules in firestore.rules, which allow only the two signed-in
// accounts on the allowlist.
//
// FILLED IN once the project exists. Until apiKey is set, sync.js reports
// "unconfigured" and the app runs happily on localStorage alone.

export const CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// One shared document holds the whole trip.
export const TRIP_ID = 'christmas-2026';
