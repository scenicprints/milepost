# Milepost — the plan

**Read this first.** It is the trip plan, the build state, and the record of every
decision and why. Any Claude agent picking this up continues from here.

**THE LAW: update this file and push it every session.** Not at the end of the
project — every session. If you changed code, changed the trip, or decided
something, it goes in here before you stop.

---

**Live: https://scenicprints.github.io/milepost/** · Repo: `scenicprints/milepost`

## What this is

A road trip planner for one specific trip, built for Kevin and Ada.

Modesto CA → North Carolina (Ada's mom) for Christmas → Houston TX (Ada's
friend) for New Year's → home. About **5,900 miles over ~21 driving days**.

Ada has never been outside California. That is not a footnote — it is half the
point of the app. Stops carry a `first` flag for things she has no California
equivalent for, and the Book screen is built around collecting them.

---

## Hard constraints

| | |
|---|---|
| **Both phones** | Kevin on Android, **Ada on iPhone**. That is why this is a web app and not Flutter. Do not re-pitch Flutter. |
| **Offline** | Non-negotiable. The Mojave, most of Arizona and New Mexico, and West Texas have long dead stretches. Everything ships in the app; the map is drawn from coordinates, never tiles. |
| **Public repo, private plan** | Free GitHub Pages only serves public repos. Code and the tourist stop list are public. **Dates, overnight towns and notes never touch the repo** — they live in localStorage now and Firestore later. A public repo announcing an empty house for three weeks is the thing being avoided. Keep exact travel dates out of THIS file too. |
| **The car** | 2023 Honda Accord Hybrid EX-L, **FWD**, Michelin Defender 2 (all-season touring, not 3PMSF). Does **not** qualify for California's R2 chain exemption, which is AWD-only. Low clearance. This is the least snow-capable configuration on the route and the app's winter advice is written around that. |

---

## Stack

- **Vanilla ES modules, no build step**, served from GitHub Pages. No tooling to
  install; any agent can edit and push and Pages redeploys.
- **Service worker** caches shell + data, cache-first. Offline is designed in.
- **localStorage** today, **Firestore** next — `js/store.js` is the seam. Nothing
  above it knows which.
- **No runtime APIs.** No map tiles, no keys. Weather (Open-Meteo, free, no key)
  is the only planned network call and it pre-fetches and caches.

Local preview: `node tools/serve.js` → http://localhost:5177

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
| 1. Modesto → NC | **The Route 66 road** — I-40, 2,771 mi. Grand Canyon, Meteor Crater, Painted Desert. | **The low road** — I-10/I-20/I-30, 2,984 mi. Nothing above 4,600 ft. The bail-out if Flagstaff or the Panhandle is ugly. |
| 2. NC → Houston | **The Gulf Coast** — I-85/I-65/I-10, 1,221 mi. New Orleans, Mobile, Montgomery. | **The inland run** — I-20/I-45, 1,455 mi. Birmingham and Dallas, skips New Orleans. |
| 3. Houston → Modesto | **The desert road** — I-10, 1,898 mi. River Walk, White Sands, Carlsbad, Saguaro, Joshua Tree. | **Up through Vegas** — via Hoover Dam, 1,960 mi. No LA traffic. |

---

## Winter — the actual design constraint

Three risks, and only one of them is about equipment:

1. **California chain control** (Tehachapi 3,793 ft, Grapevine 4,144 ft). R2 =
   chains on the drive wheels for a FWD car, no exceptions for tires. No chains
   in the vehicle = turned around at the checkpoint. **Buy low-clearance cable
   devices sized off the sidewall; check Honda's clearance restriction first.**
2. **I-40 at Flagstaff, 6,909 ft.** Closes a handful of times a winter. Chains
   irrelevant — the road is simply shut. Sleep in Kingman (3,333 ft) and go over
   in the morning.
3. **Ice, Amarillo → Little Rock.** Late December is prime. Nothing helps on ice.

**Slack in the schedule is the real protection.** Build in two spare days.

Verified: Grand Canyon **South** Rim open all winter (North closed Dec–May).
Carlsbad and White Sands open and good in winter. Blue Ridge Parkway closes for
ice. San Antonio River Walk lit through early January.

---

## Build state

### Done
- Route geometry (`js/route.js`) — haversine, cumulative mileage, projection of
  any point onto the road. Calibrated against real distances.
- Day builder (`js/plan.js`) — walks the route, places stops, breaks days at
  real towns, handles second nights and oversized stops.
- Multi-route model, swappable per leg, everything recomputes.
- Poster map (`js/map.js`) — SVG from coordinates, no tiles.
- Five screens: Road, Ahead, Map, Days, Book.
- Offline service worker, PWA manifest.
- 68 stops with detour cost, winter caveats and `first` flags.

### Next, in order
1. **Firestore sync.** `js/store.js` is the seam. One shared login for the two of
   them. Firestore's offline persistence is the reason it's the right choice —
   writes queue through dead zones. Kevin can open the console in his browser;
   **Claude must not enter passwords** — if it prompts for sign-in, hand it back.
2. **Weather.** Open-Meteo, pre-fetched per overnight town, cached with a
   timestamp so a stale forecast still shows.
3. **Trip planning proper** — Kevin wants to sit down and actually plan it once
   the base is up. Needs: her mom's city, departure date, hotel vs. camping.
4. **Book/scrapbook** — photos per stop.

### Known rough edges
- The Great Lakes in `data/usa.json` are coarse and slightly mangled. The route
  goes nowhere near them; cosmetic only.
- ~~Service worker~~ **Verified working on Pages** — registered and controlling
  (`navigator.serviceWorker.controller` is set). It only failed in the local
  preview browser. Offline is real.
- `Ahead` needs real GPS to be worth anything; only smoke-tested.
- Leg 2 mileage ~4% light.

---

## Open questions for Kevin

- **What city in North Carolina?** Only the last ~300 miles change; everything
  west of Asheville is identical. Not blocking.
- **Departure date.** Drives the countdown and which holiday events are live.
- **Hotels or camping?** Changes what an overnight town needs to have.
- **How many spare days** are you willing to build in? This is the winter plan.

---

## Decisions, and why

- **Web app, not Flutter** — Ada's iPhone. Deliberate exception to the usual
  Flutter/Android default.
- **Multi-route from the start** — Kevin asked for it explicitly: routes chosen
  by mood or by closure.
- **Stops as JSON, not parsed markdown** — see above.
- **Public code / private plan** — a security decision, not a convenience one.
- **Suggested stops on first run** — the app opens with a real plan rather than
  an empty shell. Heuristic in `suggestStops`: everything `big`, anything under
  70 minutes all-in, and any `first` under 150 minutes.

---

## Log

**Session 1** — Reviewed Poppy for reusable patterns. Established stack, route
model, winter constraints and the public/private split. Built route geometry,
day builder, multi-route data, poster map, five screens, offline shell, 68
stops. Fixed two real bugs found by testing: `closeDay` could snap backward and
stall the whole plan (silently truncating it), and stops costing more than a
full day could never be placed. Calibrated `WIGGLE` against real road
distances. Answered the chains question against the actual vehicle.
Published to GitHub Pages and verified live: 5,890 mi / 21 days / 24 stops,
6 route options, all five screens render, service worker controlling.

**Live: https://scenicprints.github.io/milepost/**
