# Milepost — the plan

**Read this before touching anything.** It holds the trip, the build state, the
design direction, every decision and why it was made, and what is still open.

**THE LAW: update this file and push it every session.** Not at the end of the
project — every session. If you changed code, changed the trip, or decided
something, it belongs here before you stop. This file is the only reason a new
agent, or a new Claude account, can continue without losing the thread.

- **Live app:** https://scenicprints.github.io/milepost/
- **Design prototype (STALE, session 4):** https://claude.ai/code/artifact/1baa877e-f26e-4efe-9013-fab90d17b92e
- **The app, published (session 16):** https://claude.ai/code/artifact/83665c31-a7df-4a3c-8d54-1a0654c8fdba
- **Repo:** `scenicprints/milepost` (public)

---

## State

**The Rams design is PORTED and live.** The app and the prototype now look the
same; the app additionally syncs, installs and persists.

**⚠ `prototype/` IS STALE.** It is the original design study from before the app
was rebuilt, and it predates the ported design, the Next screen, bookings, the
editor and live weather. Do not read it as the current app and do not republish
it as if it were. Either delete it or rebuild it from the real modules. The app
itself — `index.html` + `js/` + `css/` — is the only current truth. **To show
someone the app, run `tools/bundle-artifact.mjs` and publish that** — it reads
the real modules, so it is the app rather than a copy of it.

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

**Navigation: four tabs.** Route · Map · Days · Trip. The first three are scoped
to one leg via the selector at the top (Carolina / Houston / Home) — Kevin
explicitly wants the trip to feel like *three trips*. Trip is whole-trip and
settings: departure, sync code, firsts, winter, road conditions, version and
updates. It was a hidden sheet at first and Kevin could not find it.

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
1. **Trip planning proper — this is what Kevin said is next.** See the open
   questions below; the departure date and the North Carolina city both block it.
2. **Decide Android Auto** — recommendation above is no.
3. ~~"What's next" mode~~ **DONE, session 15.**
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

**Session 17 — both faults fixed, and "been there" now reaches the whole app (1.3.1).**

**One answer to "where am I".** `renderHead` fell back to mile 0 while
`renderNext` fell back to the first unseen stop, so with no GPS the header read
*0 mi in / 0%* directly above *behind you 241 mi / 8.7%*. There is now one
exported `whereNow()` — `whereAmI() || fallbackSpot()` — and both call it.
**If you add a third reader of position, call `whereNow()`, not `whereAmI()`.**

**The Navigate buttons are no longer underlined.** `.links a` set
`text-decoration: none` but `.btn` never did, and "Navigate there" on Next and
"Navigate" in every place sheet are `<a>` tags. Fixed on `.btn` so both, and
anything else using it, are covered.

**"Been there" now shows up everywhere the stop's name does.** It already
updated Route, Trip and the sheet; **Days and the map did not**. Both do now,
and all four use *the same mark*: the name struck through in `--rule2`. No new
colour — the signal colour still only ever means "this is in your plan" — and
no third pin state on the map, which would have been new design rather than the
existing one applied consistently.

`paintMap` now passes a `seen` set into `mapview.paint`, which puts the class on
the label rather than the pin. Note the map only labels what fits at the current
zoom, so a struck-through name appears when you zoom in far enough for that
label to be placed at all. That is the existing collision-avoidance, not a bug.

Verified against the **real app served from source**, not just the bundle,
because the bundle re-stubs geolocation on reload and would have hidden the
no-GPS path entirely: header and body now read 241 / 2,530 / 9% together, and
they move together as stops are marked (341 / 2,430 / 12% after two). Marking
one stop propagates to Route (`st on seen`), Days (`dstop seen`), the map label
(`mlabel seen`, line-through), Trip's "Everywhere you've been" with its date,
and the firsts counter.

**Left alone deliberately, and Kevin should decide:** a seen stop still costs
its time in `buildDays`, so Days keeps budgeting 2h 40m for a park you already
walked. Dropping seen stops from the plan would make the remaining days honest,
but it also reshuffles every day boundary mid-trip and "Day 1 — Modesto →
Barstow" stops being a fixed thing. The header stop count is untouched for the
same reason: it counts what is in the plan, not what is left.

**Session 16 — the app itself, published (`tools/bundle-artifact.mjs`).**

Kevin had never seen What's next with a real position. **The first attempt was
one screen in a display case** — captured DOM in a framed box with a caption and
dead tab bar — and he rejected it flatly: *"it should look like the real app
where I can navigate through it."* He was right. **A mockup of a screen is not
a mockup of an app.**

**`tools/bundle-artifact.mjs` bundles the whole app into one HTML file** and
every tab works. It reads `js/`, `css/` and `data/` straight off disk, so unlike
`prototype/` **it cannot drift** — there is no second copy of anything.

```
node tools/bundle-artifact.mjs out.html
```

**How the ES modules survive.** Each module is wrapped in its own IIFE and
registered in a tiny `__M` map, rather than concatenated: module scope is
preserved so nothing collides, and exports are `Object.defineProperty` getters
so a namespace import (`import * as syncmod`) still sees live values —
`sync.state` is reassigned, and a plain copy would freeze it. Blob-URL or
import-map bundling was avoided because an artifact's CSP may refuse them.
The bundler throws if it meets an `export` form it does not handle, so it fails
loudly rather than emitting a broken file.

**Exactly three things differ from the deployed app, all in the preamble:**
geolocation is stubbed to a fixed fix (35.025 N, 110.560 W — I-40 between
Winslow and Holbrook AZ, milepost 752 of 2,771), `fetch` serves `data/*.json`
from inside the file, and the install walkthrough is pre-dismissed. Everything
else off-network — Open-Meteo, Nominatim, Firestore, `sw.js` — simply fails,
and **the app already degrades for exactly that case**: place sheets fall back
to the `extras.json` estimates, which is the desert behaviour, on purpose.
Firebase is a lazy dynamic import that is never reached without a saved code,
so no secret is anywhere near this.

Verified in the bundle, not just in tests: all five tabs render, leg switching,
route swap (2,771 → 2,984 mi), place sheets, the editor, Trip. **The map
gestures were re-measured as continuous pointer streams** per the session-8
rule — a 20-move drag translates exactly 80/40 with no scale change, a 30-move
pinch ramps monotonically at max frame ratio 1.09, and lifting a finger
mid-pinch jumps by exactly 0. Console is clean apart from the `sw.js`
registration failing, which is caught.

**The two faults found by looking at the Next screen still stand, unfixed:**

1. **The no-GPS state contradicts itself.** `renderHead` uses
   `whereAmI() || { mile: 0 }` while `renderNext` uses `fallbackSpot()`. With no
   position the header reads *0 mi in / 2,771 to go / 0%* while the body of the
   same screen reads *behind you 241 mi / still to go 2,530 / 8.7%*.
   Fix: have the head call `fallbackSpot()` too, or export one `here()` that
   both use.
2. **Two buttons are underlined.** `.links a` sets `text-decoration: none` but
   `.actions .btn` and `.sact .btn` never do, and both are `<a>` tags — so
   "Navigate there" on Next and "Navigate" in every place sheet render
   underlined inside a solid orange button. One line of CSS.

**Session 15 — what's next (1.3.0).**

**Built now, not in December, and Kevin was right to push.** My reasoning for
waiting was bad: you cannot test a driving feature in December. Deferred, its
first real use is at 70mph on I-40 with one bar — and the map saga is what
happens when something only worked in tests. Built now it gets shaken out on
every drive between here and Christmas. Nothing arrives between now and then
that changes the design.

**It keys off position, never the date.** `whereAmI()` projects your GPS onto
each selected route and takes the closest; the day is the one whose milepost
span contains you. So being a day behind changes nothing. With no GPS it falls
back to the first stop you haven't marked seen, so the screen still works parked
at home.

Shows: miles to the next chosen stop with its detour cost, the three after it,
tonight's town with distance and drive time plus the bed if one is set,
risk points within 260 miles, and progress along the leg.

`watchPosition`, not a one-shot, because it is glanced at while moving — but
only when asked, since a continuous GPS lock costs battery and there is no
reason to hold one in August. If it was on last session the app reopens on Next
and resumes it.

Verified against a simulated position west of Winslow: 17 mi to Standin' on the
Corner, then Wigwam Motel 51, Petrified Forest 70; tonight Gallup at 150 mi /
2h25; Continental Divide flagged 175 mi ahead; header 727 in / 2,044 to go / 26%.

**Session 14 — the editor (1.2.0).**

**Kevin's correction, and he was right: a hotel is just a stop.** Same place,
same coordinates, same navigate, same notes field for the confirmation number,
and the existing booking feature already handles booked / book-by. So lodging is
not a parallel system — it is `kind: 'lodging'` on an ordinary stop. The
difference is that it anchors the END of a day instead of costing detour time:
`buildDays` skips lodging entirely, and each night is matched to the nearest
lodging place within 45 miles.

**You can add your own places now.** `js/geocode.js` (Nominatim: free, no key,
CORS-open, handles street addresses) plus "use my location", plus a manual
fallback because Nominatim is rate-limited and can refuse. A custom place is
assigned to a LEG, gets every route id on that leg, and the geometry decides —
`buildRoute` drops anything more than 140 miles off the pavement. Add from the
Route tab, or from "Add where you're sleeping" on any day in Days, which
pre-fills the overnight town.

`readDraft()` in app.js exists because the editor redraws on every choice: the
typed fields must be pulled into the draft first or a redraw wipes them.

**"What's next" replaces the planned "today" mode, and it is a better idea —
Kevin's.** A today view assumes you are on schedule; one snow day at Flagstaff
and every date is wrong for the rest of the trip. What's next keys off where you
actually are. **Build it that way, and not before December.**

**Session 13** — Stats removed at Kevin's call: "they look too cumbersome."
Gone entirely — the tab, `js/stats.js`, the fuel log, its store model and its
styles. Back to four tabs. Bookings, weather and notes all stay.

**Correction on FuelWise, because I had it wrong.** FuelWise ships
`native/UpkeepProvider.kt`, an Android **ContentProvider**, and Upkeep reads the
fuel log through it on-device — no token, no network, no repo. Its own comment
calls a cloud round-trip "absurd ceremony for two apps six inches apart." The
accurate statement is that FuelWise is unreachable **from a web app**, not
unreachable: Milepost runs in a browser sandbox and cannot query a
ContentProvider. (The provider is also deliberately minimal — odometer and date
only, no gallons or price — so it could not produce MPG anyway.) **If a future
agent wants app-to-app data on this phone, the ContentProvider is the pattern;
it just isn't available to this app.**

**Session 12 — bookings, real weather, stats (1.1.0).**

**FuelWise cannot be connected, and this is why.** `scenicprints/fuelwise-data`
is empty — a 79-byte README, untouched since July. FuelWise only pushes
`data.json` there once a PAT is pasted into it, and that never happened. Even if
it had, the repo is **private** and Milepost is a **public** web app: reading it
would mean publishing a credential. So Milepost has its own fill-up log using
**FuelWise's exact `FillUp` schema** (`odometer`, `gallons`, `pricePerGallon`,
`station`, `partial`), which keeps the two interchangeable, and MPG is computed
the same way — only full fills close an interval; partials just add gallons.

**Bookings.** `data/extras.json` gained a `bookings` map: which stops must be
reserved and how many days ahead (`lead`). Deadline = departure minus lead, so
without a departure date the app says so rather than inventing one. The place
sheet gets a Booking block, Trip lists what's outstanding sorted by urgency.
Verified with a Dec 18 departure: French Quarter Oct 19, Biltmore Nov 3.

**Weather is real now.** `js/weather.js` uses Open-Meteo. Two endpoints for two
questions: the forecast API when the planned date is inside 16 days (so nothing
until December), and the **archive** API averaged over the same late-December
window across 5 years for honest normals right now. That replaces the
hand-assigned numbers, which were my estimates — Asheville was 49/29 by hand and
is 51/31 in fact. Cached in localStorage, served cache-first, degrades to the
table offline. The service worker ignores cross-origin so it never interferes.

**Stats tab**, fifth tab. Derived from the plan, nothing stored: distance,
pace, longest and shortest day, time stopped vs detouring, fuel estimated and
measured, states crossed, highest point, winter-watch days, admission total with
unpriced counted separately, firsts, tags, per-leg breakdown, countdown.

Also finished the half-built notes: the store had `note`/`setNote` with no UI.
There is a textarea in the place sheet now, saving debounced through
`setNoteQuiet` so typing doesn't redraw the field away.

**Session 11** — Kevin: "that last update didn't take, when I swipe down the
refresh icon still appears, and I don't see settings anywhere."

Settings were unfindable and that was a design error, not a bug: Trip was hidden
behind tapping the small grey mileage text in the header. **Trip is now a fourth
tab** — Route · Map · Days · Trip — showing whole-trip totals and hiding the leg
selector, since neither applies there. The place sheet stays a sheet.

`overscroll-behavior` alone was not stopping Chrome's pull-to-refresh. The body
is now `position: fixed; inset: 0; overflow: hidden`, so nothing at document
level can scroll and there is no over-scroll for the browser to interpret. All
scrolling happens inside `.scroll`.

**Navigation is four tabs now, not three.** Discoverability beat minimalism:
"I don't see settings anywhere" is a worse failure than one extra tab.

**Session 10** — Killed pull-to-refresh, which was eating every swipe-down the
app wanted for itself: `overscroll-behavior: none` on html/body and `contain` on
both scrolling panes. Sheets now swipe down to dismiss — a grab handle at the
top, the sheet follows the finger, and it closes on a drag past 110px or a flick
over 45px in under 260ms; anything shorter springs back. The drag only engages
when the sheet's own scroll is already at the top or the gesture starts on the
handle, so it never steals scrolling from the content.

Updates moved to a button in Trip that also shows the version.
`sw.js` no longer calls `skipWaiting()` on install — a new worker used to take
over by itself and swap the code under a running session. It now waits for a
`SKIP_WAITING` message, which only the button sends.

**Version lives in `js/version.js`. Bump it with the `CACHE` name in `sw.js` on
every deploy** — they are the two things that must move together.

**Session 9 — the map, done properly.** Kevin, after two failed fixes: "still
terrible… jittery as hell. I zoom and it jumps to a super zoom." Then: "go look
at how Poppy does it."

**Poppy does not hand-roll gesture maths.** It paints the map once and hands it
to Flutter's `InteractiveViewer`, which applies a transform matrix on top
(`lib/focus_map.dart`, `maxScale: 8`). Nothing is recomputed while you zoom.

Every attempt here had been recomputing the SVG viewBox on each pointer move,
re-deriving label sizes and pin radii per frame — that is the jitter — and
re-rendering during the gesture destroyed the element holding pointer capture —
that is the jumping.

**The rewrite matches Poppy.** The SVG is painted once into a fixed-size
`.mapstage`; pan and zoom write only a CSS transform on that stage, composited
on the GPU. After a gesture settles, one repaint fixes label density and pin
sizes for the new scale.

The gesture model is the standard baseline one: take a baseline when the FINGER
COUNT changes, then derive the transform from that baseline on every move.
Deriving it incrementally from the previous frame is what accumulated error and
let one bad delta throw the map across the country.

Measured after the rewrite: a 30-frame pinch produces a perfectly linear scale
ramp (max frame-to-frame ratio 1.107), lifting a finger mid-pinch jumps by
exactly 0, adding one jumps by exactly 0, scale clamps at 0.15 and 60, FIT
returns exactly, and pins still open their sheet.

**RULE: never recompute map geometry inside a gesture, and never replace a DOM
node mid-gesture. Transform, then repaint on release.**

**Session 8** — Kevin: "the zoom is atrocious. It just straight up doesn't
work." He was right and the session-7 tests were the reason I missed it: they
used discrete taps and synthetic wheel events, which never exercise a
*continuous* gesture. Three faults.

(1) Every zoom step called `draw()`, which replaces the whole scroll pane —
destroying the SVG element holding `setPointerCapture`. A pinch therefore died
after its first move event. Gestures now mutate the `viewBox` attribute only,
and a full re-render (which rescales labels and re-culls pins) is debounced to
after the gesture ends.

(2) The aspect re-measure called `resetView()`. On a phone the address bar
hiding on scroll changes viewport height, so the aspect check fired and threw
away whatever the user had zoomed to — the map visibly snapped back. `setAspect`
now reshapes the existing view around its centre and keeps the zoom.

(3) `redrawMap()` replaces `.mapbox`, leaving the ResizeObserver watching a
detached node, so rotations stopped being reported. Redraw re-mounts the
observer. Also fixed the first paint, which rendered at the default 1.28 aspect
before the panel had ever been measured.

**RULE going forward: test drag and pinch as continuous streams of pointermove
events on one element. Discrete taps prove nothing about a gesture.**

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
