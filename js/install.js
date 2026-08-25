// First-run walkthrough for getting Milepost onto the home screen.
//
// Two reasons this matters more than usual: iOS only runs a web app
// full-screen if it was added from the Share sheet (Ada's phone), and the
// service worker only guarantees an offline copy once the app has been
// opened for real. A browser tab bookmarked on the road is not the same thing.

const KEY = 'milepost.installed-prompt';

let deferred = null;   // Android's beforeinstallprompt event, if we get one

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferred = e;
  render();
});

addEventListener('appinstalled', () => {
  localStorage.setItem(KEY, 'installed');
  close();
});

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches ||
         matchMedia('(display-mode: fullscreen)').matches ||
         navigator.standalone === true;
}

function isIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/// Show it on first run, and keep showing it until they install or say no.
export function maybeShow() {
  if (isStandalone()) { localStorage.setItem(KEY, 'installed'); return; }
  if (localStorage.getItem(KEY) === 'dismissed') return;
  render();
}

function close() {
  document.getElementById('install')?.replaceChildren();
}

function render() {
  const host = document.getElementById('install');
  if (!host || isStandalone() || localStorage.getItem(KEY) === 'dismissed') return;

  const steps = isIOS()
    ? [
        ['1', 'Tap <b>Share</b> at the bottom of Safari', 'the square with an arrow coming out of it'],
        ['2', 'Scroll down and tap <b>Add to Home Screen</b>', ''],
        ['3', 'Tap <b>Add</b>', 'it opens full screen from then on'],
      ]
    : [
        ['1', 'Tap the <b>⋮</b> menu, top right', ''],
        ['2', 'Tap <b>Add to Home screen</b>', 'or “Install app”'],
        ['3', 'Tap <b>Install</b>', ''],
      ];

  host.innerHTML = `
    <div class="scrim install-scrim">
      <div class="sheet install-sheet">
        <img class="install-icon" src="icons/icon-192.png" alt="">
        <h3>Put Milepost on your home screen</h3>
        <p class="install-lead">
          There's no signal between Needles and Flagstaff, or for most of West Texas.
          Installed, the whole trip — every stop, the map, all of it — is already on
          the phone before you get there. In a browser tab it isn't.
        </p>

        ${deferred ? `
          <div class="actions" style="margin-top:16px">
            <button class="btn on" data-install-now>Install</button>
            <button class="btn ghost" data-install-later>Not now</button>
          </div>
        ` : `
          <ol class="install-steps">
            ${steps.map(([n, t, sub]) => `
              <li><span class="sn">${n}</span>
                <span>${t}${sub ? `<span class="sub">${sub}</span>` : ''}</span></li>`).join('')}
          </ol>
          <div class="actions">
            <button class="btn ghost" data-install-later>I'll do it later</button>
          </div>
        `}
      </div>
    </div>`;
}

document.addEventListener('click', async e => {
  if (e.target.closest('[data-install-later]')) {
    localStorage.setItem(KEY, 'dismissed');
    close();
    return;
  }
  if (e.target.closest('[data-install-now]') && deferred) {
    const ev = deferred;
    deferred = null;
    ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'accepted') localStorage.setItem(KEY, 'installed');
    close();
  }
});
