// Classic or New: how the app looks on THIS phone. Kevin asked for a switch
// so he can go back and forth. It is a per-phone preference like the theme,
// so it lives in localStorage and never syncs: Ada keeps her own.
//
// New is the streamlined look: the same six tabs, a cleaner face
// (css/skin-new.css), and only the three confirmed plans. No road pickers, no
// alternatives; Classic keeps every option it had.
const KEY = 'milepost.skin';

export const skin = () => {
  try { return localStorage.getItem(KEY) === 'new' ? 'new' : 'classic'; } catch (_) { return 'classic'; }
};
export const isNew = () => skin() === 'new';

/// The confirmed plan for each leg, which is all the New look shows.
export const CONFIRMED = { leg1: 'leg1-plan', leg2: 'leg2-newjersey-plan', leg3: 'leg3-plan' };

export function applySkin() {
  document.documentElement.dataset.skin = skin();
}
export function setSkin(v) {
  try { localStorage.setItem(KEY, v === 'new' ? 'new' : 'classic'); } catch (_) {}
  applySkin();
}
applySkin();
