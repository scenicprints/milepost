// Firebase web config. PUBLIC by design — it identifies the project, it does
// not authorise anything. Access is controlled entirely by firestore.rules.
//
// There is deliberately NO trip code in here. The code is the secret: it lives
// in the deployed security rules (which are server-side and not public) and in
// each phone's local storage, entered once. Putting it in this file would
// publish it, since this repo is public.

export const CONFIG = {
  apiKey: 'AIzaSyDRQomoP_0laVOpMthuiHwJcWlnuttwyQM',
  authDomain: 'milepost-trip.firebaseapp.com',
  projectId: 'milepost-trip',
  storageBucket: 'milepost-trip.firebasestorage.app',
  messagingSenderId: '309080612066',
  appId: '1:309080612066:web:36f56c261aa02065bb12bb',
};
