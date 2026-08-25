# Milepost — the plan

**Read this before touching anything.** It holds the trip, the build state, the
design direction, every decision and why it was made, and what is still open.

**THE LAW: update this file and push it every session.** Not at the end of the
project — every session. If you changed code, changed the trip, or decided
something, it belongs here before you stop. This file is the only reason a new
agent, or a new Claude account, can continue without losing the thread.

- **Live app:** https://scenicprints.github.io/milepost/
- **Design prototype:** https://claude.ai/code/artifact/1baa877e-f26e-4efe-9013-fab90d17b92e
- **Repo:** `scenicprints/milepost` (public)

---

## State

**The Rams design is PORTED and live.** The app and the prototype now look the
same; the app additionally syncs, installs and persists.

`prototype/` is kept as the design reference and as a fast way to try layout
changes without touching the app. **It duplicates `js/plan.js` and will drift.**
Delete it, or make it import the real modules, once the design settles.

Kevin is testing this batch. He has more to add afterwards.

---

## What Milepost is

A planner for one specific drive, for Kevin and Ada.

Modesto CA → North Carolina (Ada's mom) for Christmas → Houston TX (her friend)
for New Year's → home. **About 5,890 miles over 21 driving days**, in winter.

Kevin's own words on what it is for:

1. **Log the places** they're going
2. **A visualized roadmap for multiple routes**
3. ~~A memories builder — tap a place, see their photos~~ — **CUT.** See decisions.

Ada has never been outside California. That is not colour, it is half the point.
Stops carry a `first` flag for things with no California equivalent.

---

## Hard constraints

| | |
|---|---|
| **Both phones** | Kevin on Android, **Ada on iPhone**. That is why this is a web app and not Flutter. Do not re-pitch Flutter. |
| **Offline** | Non-negotiable. The Mojave, most of Arizona and New Mexico, and West Texas have long dead stretches. Everything ships in the app; the map is drawn from coordinates, never tiles. |
| **Public repo, private plan** | Free GitHub Pages only serves public repos. Code and the tourist stop list are public. **Dates, overnight towns, notes and the trip code never touch the repo.** A public repo announcing an empty house for three weeks is the thing being avoided. |
| **The car** | 2023 Honda Accord Hybrid EX-L, **FWD**, Michelin Defender 2 (all-season touring, not 3PMSF). Does **not** qualify for California's R2 chain exemption, which is AWD-only. Low clearance. The least snow-capable configuration on this route, and the winter advice is written around that. |

---

## Design direction — heavy Dieter Rams

Kevin's brief: *"sleek and user friendly… not cluttered and confusing to
navigate… pretend you are Dieter Rams."* He also disliked Poppy's look, so do
not reach for the poster / warm-cream vocabulary.

**Rams is light, not dark.** Braun housings were warm off-white and grey. An
earlier near-black mockup was rejected as sleek-modern, not Rams.

The rules, as built in `prototype/template.html`:

- **Ground** `#EFEEEA` warm grey, ink `#191917`. Dark mode is a proper
  inversion, not an afterthought.
- **One signal colour** `#E0522A`, the ET66 calculator orange. It means exactly
  one thing: *this is in your plan.* Nothing else is ever coloured — no green
  for done, no red for warnings, no badges.
- **Hierarchy from weight and space, never decoration.** Chosen stop = filled
  circle, medium weight. Unchosen = hollow ring, grey. No pills, no cards, no
  shadows, no rounded corners except the circles, which are round because they
  are dots on a line.
- **Two typefaces with a reason.** Archivo for reading, IBM Plex Mono for
  anything measured — distances, times, labels. That split is the Braun
  instrument convention: housing in one face, dial markings in another.
- **Absolute grid.** Every circle on one vertical line, every label on one left
  edge, every cost right-aligned in one column. Nothing centred.
- **No mascot.** Every other app Kevin has built has one and he likes them, but
  he accepted that it is decoration here. Do not add one back without asking.
- **Sentence case everywhere.** No shouty uppercase labels.

**Navigation: three tabs, scoped to one leg.** Route · Map · Days. The leg
selector at the top (Carolina / Houston / Home) filters all three — Kevin
explicitly wants the trip to feel like *three trips*.

---

## The prototype

```
node prototype/build.mjs
```

- `prototype/template.html` — the design. Contains `__DATA__`, a placeholder.
- `prototype/build.mjs` — pulls live data out of `../data`, computes mileage and
  stop positions with the real `js/route.js`, injects, writes `index.html`.
- `prototype/index.html` — generated. **Do not hand-edit.**

**Rebuild after any change to `route.json` or `stops.json`,** or the prototype
silently drifts from the trip.

To update the published version: republish `prototype/index.html` to the **same
artifact URL** above. Publishing without that URL creates a second, orphaned
artifact.

The prototype carries its own copy of the day-planning logic (a port of
`js/plan.js`). **That is duplication and it will drift.** When the design is
ported into the real app, delete the prototype or make it import the real
module.

---

## How the data works

**`data/route.json`** — three legs, each with **two or more routes you can swap
between**. Waypoints are real lat/lon, dense enough that the polyline
approximates the interstate. Mileage, day splits and every stop's position are
computed from this, so editing waypoints is safe.

`WIGGLE = 1.09` in `js/route.js` converts raw polyline miles to road miles.
Calibrated against Modesto–Raleigh (~2,750 real, 2,771 computed) and
Houston–Modesto (~1,900 real, 1,898 computed). Leg 2 runs ~4% light; it has
fewer waypoints. Add waypoints there if it starts to matter.

**`data/stops.json`** — 68 stops. Each names the `routes` it sits on, so
swapping a route swaps its stops. `detour` is minutes **one way** off the
highway; the app doubles it and adds `dwell`.

Deliberately **not** a markdown-parsed doc like Poppy's. Poppy's parser existed
to rescue a prose document that already existed; here every stop needs
structured fields prose can't carry.

**`data/usa.json`** — hand-written stylized lower-48 outline so the map works
offline.

---

## Route options

| Leg | Default | Alternative |
|---|---|---|
| 1. Modesto → NC | **The Route 66 road** — I-40, 2,771 mi, 36 stops | **The low road** — I-10/20/30, 2,984 mi, 25 stops. Nothing above 4,600 ft. |
| 2. NC → Houston | **The Gulf Coast** — I-85/65/10, 1,221 mi, 9 stops | **The inland run** — I-20/45, 1,455 mi, 7 stops. Skips New Orleans. |
| 3. Houston → Modesto | **The desert road** — I-10, 1,898 mi, 16 stops | **Up through Vegas** — 1,960 mi, 16 stops. No LA traffic. |

---

## Winter — the actual design constraint

1. **California chain control** (Tehachapi 3,793 ft, Grapevine 4,144 ft). R2 =
   chains on the drive wheels for a FWD car, no tire exemption. No chains in the
   vehicle = turned around at the checkpoint. **Buy low-clearance cable devices
   sized off the sidewall; check Honda's clearance restriction first.**
2. **I-40 at Flagstaff, 6,909 ft.** Closes a handful of times a winter. Chains
   irrelevant — the road is shut. Sleep in Kingman (3,333 ft), go over next day.
3. **Ice, Amarillo → Little Rock.** Late December is prime. Nothing helps on ice.

**Slack in the schedule is the real protection.** Build in two spare days.

Verified: Grand Canyon **South** Rim open all winter (North closed Dec–May).
Carlsbad and White Sands open and good in winter. Blue Ridge Parkway closes for
ice. San Antonio River Walk lit through early January.

---

## Sync — how it works

Firebase project **`milepost-trip`**. One document, `trips/{TRIP_CODE}`, holding
the whole plan.

**There is no login, and that was forced.** Enabling any sign-in provider on a
fresh Firebase project routes through Identity Platform, which returns
`BILLING_NOT_ENABLED` without a billing account. Rather than attach a card to a
holiday itinerary, the **document path is the secret**: 80 bits, held in the
deployed rules (server-side, not public) and in each phone's local storage.
Rules deny every other path and deny collection listing, so it cannot be found
by probing.

Verified live: correct code reads and writes 200 · wrong code 403 · collection
listing 403 · full round trip from the deployed app lands every field.

**The code lives in `trip-code.local`, gitignored and untracked.** Deploy rules:

```
node tools/deploy-rules.js && firebase deploy --only firestore:rules --project milepost-trip
```

**Incident, session 3:** the trip code was committed to this public repo once.
`.gitignore` does not apply to already-tracked files, and `firestore.rules` had
been committed earlier with placeholder contents, so `git add -A` picked up the
real secret. Caught immediately; code rotated, rules redeployed, file untracked.
**Lesson: adding a path to .gitignore does nothing if it is already tracked —
always `git rm --cached` too.**

On a connected phone the code shows on the Book tab with Copy and Share. That is
the hand-off path: whoever you give the app to needs the code and nothing else.

---

## Android Auto — recommended AGAINST

Kevin's vision: Milepost docked on the dashboard beside Google Maps, showing
stops ahead plus warnings like "snow ahead" or "worth stopping for fuel."

**The platform does not support that.** Android Auto does not let an app draw
its own UI — you fill in Google's templates (`PlaceListMapTemplate` for a POI
app) and the car maker themes them. And a third-party POI app does **not** dock
alongside Maps; it takes the screen when opened. You would be switching away
from navigation to look at it.

On top of that: six rows maximum, no custom type or colour, text length capped,
five levels of navigation depth, some interaction locked out while moving, a
separate Kotlin codebase, and Play Store publishing with an Android Auto review.

**Recommended instead: a car mode in the web app, phone in a vent mount beside
the head unit.** That literally is "on my dashboard next to GPS," works today,
works on Ada's phone, and keeps the design. Ada is the passenger and the
navigator — a phone in her hands beats a head unit.

The prototype includes an approximation of the Android Auto view at the bottom
so the difference is visible. **Kevin has not made the final call yet.**

---

## Build state

### Done — shipped app
- Route geometry (`js/route.js`) — haversine, cumulative mileage, projection.
- Day builder (`js/plan.js`) — places stops, breaks days at real towns, handles
  second nights and oversized stops.
- Multi-route model, swappable per leg, everything recomputes.
- Poster map (`js/map.js`) — SVG from coordinates, no tiles.
- Offline service worker (network-first for code, cache-first for data).
- PWA: icons, manifest, iOS meta, first-run install walkthrough.
- Firestore sync, verified end to end.
- 68 stops with detour cost, winter caveats and `first` flags.

### Done — prototype
- Rams visual language, three tabs, leg-scoped.
- Transit-diagram route with every stop as a station, tap to toggle.
- Zoomable, pannable map with collision-avoiding labels and viewport culling.
- Place detail with cost, description, December normals, official links.
- Android Auto approximation.

### Next, in order
1. **Whatever comes back from Kevin's testing of the ported design.**
2. **Decide Android Auto** — recommendation above is no.
3. **Car mode** — huge type, glanceable, what's in the next 150 miles.
4. **Fuel and services planning.** Kevin asked for "definitely stop at this gas
   station." Long dry stretches (Van Horn → Fort Stockton, the Mojave crossing)
   are real, and this is a genuinely useful feature that does not exist yet.
5. **Live weather.** Open-Meteo, free, no key. Historical-normals endpoint to
   replace the hand-assigned December numbers; live forecast inside 16 days.
6. **Trip planning proper** — Kevin wants to sit down and plan it for real.

### Known rough edges
- **Google Fonts are not cached by the service worker** (it ignores cross-origin
  so Firestore isn't corrupted). Offline, Archivo and Plex Mono fall back to
  Helvetica and the system mono. Legible, slightly off-design. Vendoring the
  two woff2 files would fix it.
- December normals in `prototype/build.mjs` are **hand-assigned approximations**,
  not from a weather service. Right enough to pack by, not authoritative.
- 42 official links are **best-effort and unverified**. The `nps.gov` ones follow
  a documented stable pattern; the commercial ones are not confirmed. Search is
  always offered as the reliable fallback.
- The Great Lakes in `data/usa.json` are coarse. The route goes nowhere near
  them; cosmetic only.
- The 32px favicon is legible but muddy. Redo alongside the UI port.
- Leg 2 mileage runs ~4% light.
- The prototype duplicates `js/plan.js`. It will drift.

---

## Open questions for Kevin

- **What city in North Carolina?** Only the last ~300 miles change. Not blocking.
- **Departure date.** Drives the countdown and which holiday events are live.
- **Hotels or camping?** Changes what an overnight town needs to have.
- **How many spare days** in the schedule? This is the winter plan.
- **Android Auto: yes or no**, given the recommendation above.

---

## Decisions, and why

- **Web app, not Flutter** — Ada's iPhone. Deliberate exception to Kevin's usual
  Flutter/Android default.
- **Multi-route from the start** — he asked for it: routes chosen by mood or by
  closure.
- **Stops as JSON, not parsed markdown** — every stop needs structured fields.
- **Public code, private plan** — a security decision, not a convenience one.
- **Photos: CUT.** Was going to be Firestore-stored downscaled JPEGs. Kevin
  dropped the feature outright. Do not rebuild it unless he asks.
- **No login** — forced by the Identity Platform billing wall.
- **Rams, and light** — his explicit brief.
- **Three tabs, not five** — "confusing to navigate" was the complaint, and Route
  and Days were the same data at two zoom levels.
- **Map sizing in screen pixels, not `1/sqrt(zoom)`** — see session 5.

---

## Session log

**Session 1** — Reviewed Poppy for reusable patterns. Established stack, route
model, winter constraints, public/private split. Built route geometry, day
builder, multi-route data, poster map, five screens, offline shell, 68 stops.
Fixed two bugs found by testing: `closeDay` could snap backward and stall the
plan while silently truncating it, and stops costing more than a full day could
never be placed. Calibrated `WIGGLE` against real road distances.

**Session 2** — Fixed the PWA. The home-screen shortcut opened in a browser tab
because the manifest had no icons: Chrome requires a 192 **and** a 512 to treat
a manifest as installable, otherwise "Add to Home screen" makes a plain
bookmark. Added generated icons, proper manifest fields, and the
`apple-touch-icon` + `apple-mobile-web-app-capable` tags iOS needs — iOS ignores
the manifest for home-screen behaviour entirely, which would have bitten Ada.
Added a first-run install walkthrough. Wrote the Firestore sync layer and
vendored the Firebase SDK with its gstatic imports rewritten relative.

**Session 3** — Firebase done entirely from the CLI; the Claude-in-Chrome bridge
never connected (the extension turned out to be installed in Brave, not Chrome,
and still would not pair). Created `milepost-trip`, Firestore in nam5, web app,
deployed rules. Auth design changed under the billing wall. **Leaked the trip
code into the public repo and fixed it** — see the incident note. Two real bugs
caught by testing: the trip document was written with no `updatedAt`, which
`watch()` requires, so the phones would have silently never synced; and the
cache-first service worker plus GitHub Pages' HTTP caching served stale code
across repeated reloads, so a fix pushed mid-trip might never have arrived.

**Session 4** — Design conversation. Kevin: the app is "very ugly," he disliked
Poppy's look too, wants sleek and uncluttered, "pretend you are Dieter Rams."
Photos cut. Android Auto scoped to riding alongside Maps. Built the clickable
prototype: Rams visual language, transit-diagram route, leg-scoped tabs, place
detail with links and December normals, map with routes and pins.

**Session 7** — Kevin on the map tab: "damn near broken… I can only zoom in a
little bit, and there's that annoying list underneath it." Three real faults.
(1) `touch-action: none` was on `.mapbox` but not on the SVG that actually
receives the pointer events, so the browser claimed the pinch as a page gesture
and pinch-zoom never fired at all — only the buttons worked. (2) The viewBox was
fitted to a fixed 1.28 landscape aspect while the panel on a phone is 0.63
portrait, so the map was letterboxed and most of the zoom range was spent on
empty ground. The panel is now measured and the fit uses its real aspect.
(3) The winter notes and road-conditions links were two lists stapled under a
picture; they moved into the Trip sheet, where they cover the whole trip rather
than one leg. The map tab is now only the map, full height, no scroll. Zoom
depth went from 41x to 125x, buttons step 2x instead of 1.5x, and double-tap
zooms where you tapped.

**Session 6** — Ported the Rams design onto the app. Replaced `css/app.css`,
`js/ui.js`, `js/app.js` and `js/map.js`; left the engine alone. Five tabs became
three (Route · Map · Days), all scoped to one leg. The Book tab's contents —
countdown, sync code, firsts, where-are-we — moved into a Trip sheet reached
from the whole-trip total in the header, which keeps the tab bar at three.
Pulled the official-site and December-normals tables out of `prototype/build.mjs`
into `data/extras.json` so the app and the prototype share one source. Caught a
class clash on the way: `install.js` was borrowing `.sheet`, which now means the
slide-up panel and would have rendered the install prompt permanently
off-screen. Verified in the running app — leg switching, day scoping, zoom and
fit, both sheets, toggling a stop updating the header, all three theme states,
and an audit confirming zero cards, pills, banners, shadows or border radii.

**Session 5** — Days was showing all 21 days regardless of the selected leg;
scoped it to the leg. Added the map tab, then zoom and pan. **Map label bug:**
`.mstate` set `font-size` and `text-anchor` in CSS, which override SVG
presentation attributes, so per-zoom sizing was thrown away and labels rendered
at 9 *user units* inside a 24-unit viewport — enormous, overlapping text. Fixed
by taking both out of the class, then by correcting the scaling law itself:
sizes are now screen pixels converted via `u = viewBoxWidth / renderedWidth`, so
text holds ~11px at any zoom. Added label collision avoidance and viewport
culling; zooming onto Memphis now separates all four stops. Moved the prototype
source into `prototype/` so it survives the session, with a build script that
reproduces the published artifact byte-for-byte. Researched Android Auto
properly and recommended against it.
