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

**The leg 1 master pool is IN (session 17).** 66 researched stops across three
route options, sights and eateries separated, time-cost colour coding on the
Route tab. Kevin is testing.

**The Rams design is PORTED and live.** The app and the prototype now look the
same; the app additionally syncs, installs and persists.

**⚠ `prototype/` IS STALE.** It is the original design study from before the app
was rebuilt, and it predates the ported design, the Next screen, bookings, the
editor and live weather. Do not read it as the current app and do not republish
it as if it were. Either delete it or rebuild it from the real modules. The app
itself — `index.html` + `js/` + `css/` — is the only current truth. **To show
someone the app, run `tools/bundle-artifact.mjs` and publish that** — it reads
the real modules, so it is the app rather than a copy of it.

Kevin is testing this batch. He has more to add afterwards. He will hand over
leg 2 and leg 3 pools the same way.

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

Each waypoint also carries, as of session 28:

| Field | What |
|---|---|
| `tz` | Standard-time offset. December, so no DST anywhere on this trip. |
| `limit` | Posted speed limit on the segment leading INTO this waypoint. The first waypoint of a route has none — there is no incoming segment. |
| `road` | Which road that segment is, for reading the data back. |
| `urban` | The road crosses a metro here. Charged as a flat `METRO_MIN` penalty, not as a lower mph. |

**There is no mph setting any more, and do not add one back.** Speed is computed
per segment from `limit`; `driveMinutes()` integrates it across a span and
`mileAfter()` inverts it. The planner displays the resulting average so the
number stays inspectable rather than believed.

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
1. **Kevin marks the leg 1 pool in the app.** Every pool stop is in, tap to
   toggle. Cut what he says no to only when he says it.
2. **Leg 2 and leg 3 pools**, same treatment, when he hands them over.
3. **Dark-sky data**, once the routes are settled. The framework is in and
   `data/darksky.json` documents the schema and the licensing trap.
4. **Live weather refinements** as the dates close in. Open-Meteo is wired.

Killed by Kevin, do not revive: **Android Auto** (no, final) and **fuel and
services planning** (gone).

### Known rough edges
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

- **Hotels or camping?** His answer: it depends. So lodging stays per-night,
  chosen in the app, and the seeded list assumes nothing.
- **Spare days:** the schedule is tight. Plan days to the pace setting, do not
  invent slack.

Answered and closed: the North Carolina city is in the route data now. The
departure window is decided and lives in the app only, never in this repo.
Android Auto is no.

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

**Session 31** — The cache could hand you new JS with old CSS. 1.17.3.

Kevin sent a screenshot of the new "Add a place" form rendering as raw HTML,
labels inline, no segmented control, nothing styled. The code was correct and
the deployed site was correct: loading it fresh, `.ed` computed `display:flex`
and `.f` computed `column`. What he had was **the new `desk.js` paired with the
previous deploy's `desk.css`**, which contains none of `.ed`, `.f` or `.seg`, so
the new markup fell back to browser defaults while the rest of the page looked
fine.

**The cause was `networkFirst`'s 2,500 ms timeout, and every asset ran that race
on its own.** On a slow but working connection `desk.js` could come fresh off
the network while `desk.css` timed out and came from the previous version's
cache. That is the worst split available: the new code runs and emits markup
nothing styles, so the page looks broken rather than looking old.

**Code now gets a 15 second timeout, data keeps 2,500 ms.** Not an infinite wait
for code, which was the first attempt and was wrong: hanging forever is exactly
the wrong failure on a weak or captive-portal connection, which is where this app
has to work. Fifteen seconds makes two code assets straddling the boundary
vanishingly unlikely while keeping the graceful fall back to cache.

**`skipWaiting` was deliberately left alone.** The obvious reach is to have the
new worker claim immediately, but `sw.js` says in a comment that auto-takeover
used to swap code under a running session, which is why updates are a button in
Trip instead. That decision stands; it was never the cause here.

Note for anyone hitting the stale form once more: the fix ships in the worker,
so a browser still holding the old one needs one manual clear. Unregister the
worker and drop the caches from the console, or use the update button in Trip.


**Session 30** — Your own places, on the desktop planner. 1.17.2.

Kevin: *"In milepost, I have no way of adding custom stops to the planner on
desktop."* True. `desk.js` read `store.custom` and rendered it, but there was no
way to create one there, so the only route in was the phone.

**The editor writes through `store.addCustom`, the same call the phone uses**, so
a place added at the table is the same object in the car and it syncs. Two rules
came with that, both load-bearing:

- **A custom stop must carry real route ids.** `buildRoute` filters on
  `s.routes.includes(route.id)`, so a stop with an empty or wrong `routes` array
  is silently filtered straight back out and simply never appears anywhere. The
  desktop puts it on every road of the currently selected leg, matching the
  phone's `legRouteIds`.
- **Lodging costs no detour and no dwell**, because it ends a day rather than
  interrupting one. Those two inputs disable when you pick "where you sleep".

Coordinates can be typed directly as well as searched, which the phone does not
offer. That is deliberate: at a table you are usually copying a latitude and
longitude out of something else, and Nominatim cannot find a numbered BLM
dispersed site at all.

**Three bugs, all found by building it:**

1. **`store.addCustom` did `Number(c.dwell) || 60`.** Zero is falsy, so every
   deliberate zero-minute dwell silently became an hour. It never showed up
   before because the phone only ever offered 30/60/120/240 and a bed took a
   separate path. Now that you can type a number, it bit immediately. Fixed to a
   finite check.
2. **The save button computed `disabled` at render time.** The form is
   deliberately rendered OUTSIDE `draw()` so that rebuilding the itinerary on
   every keystroke cannot destroy the field under the caret, which also means
   typing never re-renders the form. So the button read a draft that had not
   caught up and stayed dead however much you filled in. It now validates on
   click and marks the offending field, the way the phone does.
3. **Empty town and state rendered as a bare comma.** A place added by pasting
   coordinates has no town, and `", · 3h 26m to get here"` is not a location. A
   `place()` helper joins whatever exists and drops the separator otherwise.

**The pool row is now a div holding two buttons.** A button inside a button is
invalid HTML, and the edit control has to be clickable independently of the
toggle. Beds get their own short list under the pool, because the pool filters
lodging out and they would otherwise be unreachable to edit.

**This landed as a rebase onto sessions 28 and 29**, which had been pushed in the
meantime and touched the same files. Two things to know about the resolution.
The itinerary row's "how long" inputs are session 29's editable dwell, not mine;
my change to that same line was only the empty-town fix and it rides on top.
And **session 29 did not carry the `dwell: Number(c.dwell) || 60` fix**, because
it was written before this branch existed, so that bug came back on the remote
and is fixed again here. If it reappears a third time, that is why.

**Session 29** — Saved plans, and the export. 1.17.0.

Kevin: *"I want a way to create a spot list for a route, and then save it. And
then make another one for the same route."* Then: *"And then be able to export
them."* Asked what the export was for, he said: **"To give to AI to help with
and to send."**

**A plan is a snapshot, and the live editing surface did not move.** `chosen`,
`sleeps` and `dwells` stay exactly where every module already reads them; a plan
is copied out of them and back in. Nothing above the store had to learn what a
plan is, and an unsaved plan is simply the working state, the way it always was.
A plan belongs to a **route id**, because "the same list on a different road" is
not the same list — which stops exist depends on which way you go.

A plan captures the WHOLE itinerary — ticked stops, placed nights, dwell
overrides, and the departure date and time — which is why `departure`/`departAt`
moved into the store. They were living in the DOM inputs, so two plans could not
have disagreed about when you leave. Still never committed to the repo.

`planIsDirty` compares normalised strings, not raw `JSON.stringify`: key order
is not meaning, and comparing objects directly reported every freshly-loaded
plan as an unsaved edit.

**The export is Markdown, and it carries the REASONS.** A row saying "Meteor
Crater 08:19" is data; a row saying it shuts at 17:00, that you are there 90
minutes, and that Flagstaff at 6,909 ft has to be crossed at midday is a thing
something can help you with. So the file leads with the two facts a reader
cannot infer and will otherwise get wrong — that **times are local to each stop
across three zones**, and that **the 65 mph is computed per segment and is not a
setting** — then the problems, then a table per day with the notes underneath.

The notes go *underneath* because a markdown table has to be contiguous. The
first version interleaved each stop's warnings between the rows, which split one
table into a run of one-row tables that render as garbage. Verified by parsing
the output back and counting broken tables, not by looking at it.

Copy puts it on the clipboard (for pasting to an AI) and download writes a `.md`
(for sending). Copy falls back to a download when the clipboard refuses, which
it does often enough that failing silently would read as a broken button.

**`tools/bundle-artifact.mjs` NOW KNOWS THE APP HAS TWO ENTRY POINTS.** Its
audit had been failing since session 26 — `winter.js`, `itinerary.js`, `desk.js`
and now `export.js` were all "missing from MODULES". They were not missing.
They are the **desk.html graph**, and the artifact's shell markup is
*index.html's* markup, so desk.js — which calls `boot()` and immediately queries
`#leg` — would have thrown at load if it were bundled.

The fix is `DESK_ONLY` beside `MODULES`, and an audit that checks four things
instead of one:

1. the bundled graph is complete and ordered (as before);
2. **no bundled module imports a desk-only one** — that is the dangerous case,
   because it means the desk graph has leaked into the phone app and the bundle
   really would die at boot;
3. every desk-only module's own imports resolve to one list or the other, so a
   file it needs cannot vanish just because this bundle does not build it;
4. nothing on disk is unaccounted for, **and nothing listed is missing from
   disk** — checked first, or the reads in 1–3 die with a raw ENOENT instead of
   saying what is wrong.

Verified by deliberately breaking it four ways and confirming each produced a
clear message, then that it built clean again. Do not "fix" a future audit
failure by adding the file to `MODULES` without checking which entry point it
belongs to.

**The artifact was also silently mojibaking every `·` into `Â·`.** The generated
HTML had no `<meta charset>`, and this file gets opened from disk as often as
over http, where there are no headers to guess from. index.html always declared
it; the artifact never did. Added, along with the viewport meta, and confirmed
zero mojibake across all five tabs with the app actually running.

**Session 28** — Timezones, speed off the road, and how long you'll really be
there. 1.16.0.

Kevin, on the planner: *"One thing I dont like about that planner is I set the
mph. But that varies so much."* Then: *"is this all taking timezones into
account?"* It was not, and that was the worse of the two.

**THE TIMEZONE BUG — the clock never left California.** `winter.js` localised
the *sun* correctly, and `hours.json` is local by definition. But `itinerary.js`
ran one counter of minutes from the trip's first midnight and never shifted it,
so every arrival was in DEPARTURE-local time for all 2,643 miles — and was then
compared directly against a sunset and an opening time that were local to
wherever you actually were.

Proved by running the real `build()` in Node rather than reasoning about it.
Discovery Place, Charlotte: `arriveAt "13:09"`, hours 09:00–16:00, `ok: true`,
zero flags. Charlotte is EST, three hours from Modesto. You arrive at 16:09 and
it shut at 16:00. **The error was 0 in California, +1 in AZ/NM, +2 in TX/OK/TN,
+3 in NC — and always optimistic, so it promised open doors that were locked.**

The fix keeps two clocks and says so in the code: `clock` stays the absolute
monotonic axis, because durations only mean something in one frame; everything
you *read* goes through `localOf(abs, tz)`. Every clock face, every hours
comparison, every sunrise, and the date the weekday is read off — that last one
matters, or "closed Sundays" fires on the wrong day near midnight.

`guessTz = round(lon/15)` was wrong at 5 of 15 checkpoints (Kingman, Amarillo,
OKC, Knoxville, Asheville) and was only saved by `nearestRisk` borrowing a real
`tz` from `winter.json` — which meant **a stop's timezone was being inferred
from how near it was to a snow hazard.** Now every waypoint carries a real `tz`
and `route.js` owns `tzFor(state, lon)`. Tennessee is split on the Cumberland
Plateau at −85.5, which is why it cannot be a plain state lookup: Nashville is
Central and Knoxville is Eastern. Verified in the running app — the hour jumps
land at CA→AZ, NM→TX and *inside* Tennessee, and correctly do NOT land at
AZ→NM (Arizona keeps no DST) or AR→TN (Memphis is Central).

**SPEED NOW COMES OFF THE ROAD.** One mph for 5,900 miles was wrong everywhere
at once. Each waypoint carries `limit`, the posted limit on the segment leading
into it, plus `urban` where the road crosses a metro. `driveMinutes(a, b,
route)` integrates across whatever segments a span crosses — which is what makes
a custom handful of stops still cost the right time, since the road is priced by
the road and not by which stops are ticked. `mileAfter()` is the inverse, for
the day-splitter, and it round-trips exactly.

Two constants, both documented at the definition: `REALISM = 0.94` separates the
sign from the average (traffic you can't pass, grades, and the fuel stops that
are nobody's `dwell`), and `METRO_MIN = 12` charges a city in MINUTES rather
than mph, because Houston doesn't make the 400 miles either side slower — it
takes twenty minutes out of your day as you cross it. Whole-route average comes
out at **64.9 mph**, and the planner now *shows* that number instead of asking
for it. The mph box is gone. `plan.js` and `ui.js` were converted too, or the
phone would have kept answering 62 while the desktop said 65.

**DWELL IS EDITABLE.** Kevin: *"will I really be at the Grand Canyon, South Rim
for 2 hours and 30 minutes?"* The seeded number is a research guess. `dwells` in
the store mirrors `sleeps` — minutes keyed by stop id, so it survives a route
swap — with one difference that matters: **zero is a legitimate answer** (drive
past and look), so absence and zero are different and removing an override is
`clearDwell`, never setting it to nothing. `buildRoute` applies it, which means
`stopCost` and every consumer get it for free. The row shows the control under
the place, and a `reset` link back to the researched figure once you've changed
it. The `ui.js` route cache stamp had to grow to cover dwells, or an edit would
land in the store and the cache would keep serving the old answer.

Note for whoever is next: `data/route.json` now carries `tz`, `limit`, `road`
and `urban` on waypoints. They were generated by rule, not researched one by
one — the tz values are exact, the limits are posted rural limits per road per
state, and the one blend is Amarillo→OKC at 72 because that single segment
spans the 75/70 state line with no waypoint to break it at.

**Session 27** — Sleep is placed by hand, and the planner stopped inventing
days. 1.15.0.

Kevin, on the desktop planner: *"I dont need a lodging section. I just need to
add sleep and set a custom time to put wherever I want."*

**The old day model was wrong and it was wrong quietly.** `itinerary.js` broke
the day by itself the moment the clock ran past dusk, then resumed at the next
morning's crossing window. It looked tidy and it printed a schedule that was
not the trip: a bedtime nobody chose, in a town nobody picked. Worse, it hid
the thing you actually want to see — drive to 02:00 and it silently folded that
into a day break instead of saying so.

**Now: a day ends where you put a sleep, and nowhere else.** Every stop in the
itinerary has a `+ sleep here` under it, revealed on hover. A night is a
DURATION in hours and minutes, not a place and not a hotel. The clock runs
straight through everything else.

- **`store.sleeps`** — minutes asleep keyed by the stop you sleep AFTER. It
  hangs off the stop so it travels with the plan when the road is swapped and
  cannot drift to a different point on the map. Deleting the key is how a night
  is removed, so a zero-length sleep can never sit in the plan pretending to be
  one. It rides the existing `snapshot()`, so it syncs to the phone for free.
- **The calendar now comes from the CLOCK, not from a day counter.** This was
  the subtle one. `dayFor()` used to take a day index, so any day break advanced
  the date by exactly one. With nights placed by hand that breaks in both
  directions: a two hour nap must not move the calendar, and an eight hour night
  starting at 22:00 must. Deriving the date from `floor(clock / 1440)` handles
  both. Verified against a scratch plan: a two hour nap holds the date, a nine
  hour night rolls it one.
- **Winter did not go away, it changed from a rule into advice.** Wake before
  the road is worth driving and the night says so in the terms that made you
  care: *"Back on the road at 05:04, but Grand Canyon Village is not normally
  clear behind the plows until 09:00."* And under five hours gets *"2h is a nap,
  not a night."*
- **Night driving is flagged instead of hidden.** Any stop reached after dusk or
  before first light now says so, with both times.

**Fixed while in there, all three found by building it:**

1. **`bestWindow` was reading the sun off the day's STARTING position**, so
   "after dark" at the Grand Canyon and in Houston resolved to the same minute —
   the exact error the function's own comment warns about. It now takes the sun
   at the stop, on the day the clock has reached.
2. **Every store mutation redrew twice** (the `change` listener plus an explicit
   `draw()`). Harmless for years; the moment a number input had to survive a
   redraw it ate the caret on the second pass. The explicit calls are gone.
3. **`pace.hoursPerDay` was dead** — assigned in `build()` and never read, while
   `desk.js` dutifully passed `8`. A day-length budget does not exist in this
   model at all now. Removed.

**Still open, not touched this session:** the departure input in `desk.html`
carries a hardcoded date as its `value`. That is a travel date sitting in a
public repo, against the rule in CLAUDE.md, and it should read `store.departure`
the way the phone does. Left alone because it is a behaviour change Kevin has
not called. (Do not paste the date into this file when fixing it.)


**Session 26** — The desktop planner, and the two data layers under it.
**Read this before touching planning.**

Kevin's spec, verbatim: *"I want to place the order of places and it calculates
how long it will take to get there and how long I am expected to be there. And
there is an overall trip time, and then each spot says when I should arrive to
it. And it gives me information of opening time, closing time, and optimal time
to be there."*

**`desk.html` + `js/desk.js` + `css/desk.css` — a SECOND VIEW, not a second
app.** index.html is for the road: one hand, moving car, no signal. desk.html
is for the table: deciding which of ~100 stops are in and when you reach each.
It imports `store.js`, so it reads and writes the SAME plan as the phone and
syncs through the same Firestore document. **That shared store is the contract
between the two views** — change its shape carelessly and they stop agreeing.
The engine (route, plan, store, map, darksky, winter, itinerary) has zero DOM
references; all the phone-shaped assumptions live in ui.js and app.js.

**`data/winter.json` + `js/winter.js` — crossing windows.** Kevin corrected the
framing and he was right: *"It is best to assume it will snow there. The whole
point is that I drive during the day after snowplows and not before."* So this
does NOT model storm duration. It models TIME OF DAY: `plowedBy` is when each
risk point is normally clear behind the plows, and the window is the later of
that and first light, closing at dusk. **Sunrise is computed, not stored** —
the departure date is not settled and the route crosses four timezones, one of
which keeps no DST (Arizona) and one of which is Central despite being in
Tennessee (Monteagle). Validated against first principles: day length matches
theory to under a minute at five points. A first attempt folded the longitude
term in twice and was seven hours out in a way that still looked like a time.

**Finding: daylight binds, not the plows.** Out west the roads are clear by
07:00-08:00 but the sun is not up enough until 07:43-08:16, giving about
**8¼ usable hours a day**. That, not the mileage, is what makes the schedule
tight. Amarillo is the exception where plowing binds (10:00) because TxDOT
brines rather than plows and ice needs sun on it.

**`data/hours.json` — opening hours, closing hours, and `best`.** The stops
carried closures as prose in their `winter` text, which a person can read and a
planner cannot. This is the same facts as data. **A stop MISSING from this file
is UNCHECKED, not "always open"** — the planner says so rather than inventing
hours. Roughly half the list is checked; the rest were never verified and must
not be guessed. `best` is a word (dark/golden/morning/early/lunch/evening) that
`bestWindow()` turns into a clock using the date and place, because "after
dark" is 17:16 at the Grand Canyon in December and another hour in Houston.

**`js/itinerary.js` — the clock.** Give it a route, chosen ids, a departure and
a pace; it walks the road and returns arrival and departure times, the hours
for that weekday, and what is wrong. **Order is NOT hand-arranged**: stops sit
on a road with one direction, so the order is `mile` along the route. What you
choose is which stops are in and how long you linger. Two bugs fixed while
building it, both worth not repeating: floating point down a 6,000-mile chain
produced arrival times like `09:33.413`, and the day-break test compared
`arrive % 1440 > shut`, which silently accepted anything rolling past midnight
because a 02:23 arrival is a small number.

It immediately found seven real conflicts in the current plan, including
arriving at Puebla Sunrise at 15:15 when it shuts at 15:00, and at Saborcito
Nica 2h 42m before it opens. 1.14.0.

**Session 26** — True offline (1.13.0). Kevin: *"Let's give it a true offline
mode."*

**The fonts are vendored.** They were the last thing the app could not cache:
the service worker ignores cross-origin requests by design, so the Google Fonts
stylesheet and its woff2 files were always fetched live, and in the Mojave the
whole app fell back to Helvetica. `tools/vendor-fonts.mjs` pulls the four latin
faces into `fonts/` (97 KB total) and writes `css/fonts.css`. Both families are
SIL OFL 1.1, so redistributing them in a public repo is fine; `fonts/OFL.txt`
records it. The artifact bundler inlines them as data URIs, so **the published
bundle now has zero external asset requests** — only the outbound Search and
Navigate links, which are meant to leave.

**There is an answer to "will this work with no signal" now.** Trip has an
Offline line. `sw.js` answers a `CACHE_STATUS` message with how many of its 34
shell entries are really in the cache, and the line says either that everything
is on the phone, or how many parts are still missing.

**Two bugs found by building it, both mine, both worth remembering:**

1. **`navigator.serviceWorker.ready` never settles when nothing is registered.**
   It does not reject — it hangs. The Offline line sat on "Checking…" forever on
   exactly the phones that had no cached copy, which is the case it exists to
   report. **Use `getRegistration()`, which resolves promptly with undefined.**
2. **I moved `CACHE` backwards**, v31 to v27, while bumping the version. Old
   caches would not have been cleaned and the update button would have gone
   wrong. It only ever goes up — check the current value before editing it.

**Environment limit worth knowing: the browser pane refuses to register service
workers at all** — `sw.js` fetches 200 and `register()` still fails with
"unknown error occurred when fetching the script". So the worker cannot be
tested by driving the app here. It was tested instead by running `sw.js` in a
Node VM with stubbed globals and driving the `CACHE_STATUS` handler against a
fake cache: full, two missing, empty — all three correct. A separate check
cross-references `SHELL` against the repo in both directions, which matters
because **one bad path makes `addAll` throw and then NOTHING caches**. 34
entries, none missing, nothing in the repo left out.

**Still not done, and it is not code:** nobody has driven with this. What's Next
has only ever run on a simulated fix.

**Session 25** — The light pollution map, third attempt, after Kevin called
the first two useless. **Read this before touching the sky layer.**

What he actually asked for, in his words: *"It should read like a heat map
within 30 minute driving time from the route. This way I can pull off the road
and sleep in a no light polluted area."*

**What failed, so nobody rebuilds it:**
1. **Bortle zones as filled polygons.** 45 of 60 rendered under 12 pixels
   wide. Specks over the routes and pins. Cause: an 85-mile corridor clip cut
   contiguous regions into slivers, and the size floor was far too low.
2. **Darkness drawn along the route line.** Readable, but it answers the wrong
   question — *you cannot sleep on the interstate*. A stripe on the road says
   nothing about where to pull off. This was me redesigning the request
   instead of repairing it.

**What ships now: a raster.** `data/darksky.png`, one image drawn under the
roads, covering everything within 25 miles of the route (30 minutes at back-
road speed). Brightness is a continuous field, and a 25-mile band contoured
into shapes is all slivers, so it does not become geometry at all. It stays
sharp at every zoom because the map already re-bakes its viewBox.

- **24 KB.** A smooth gradient encoded 3.4 MB, which is too much to cache on a
  phone for an offline app. Nine flat bands, one per Bortle class, as a PNG8
  with a transparent index. Banded also reads faster for "is this dark".
- **A legend.** It was called unreadable twice before it had a scale to read
  it against. The key lives in the tab markup, and the sky toggle deliberately
  does NOT rebuild the tab (so the map never jumps), so `app.js` shows and
  hides the key by hand next to the button. Change one, change the other.
- **Per-stop readings are now exact** — sampled from the source raster at each
  stop's own coordinates rather than by polygon containment, and they carry
  the mag/arcsec² figure. Vegas Strip Bortle 9 (16.22), Memphis 8, Grand
  Canyon 2 (21.89), Copper Breaks 2 (21.94) — which matches its Gold-tier
  dark sky park certification, an independent check that the numbers are real.

Rebuild with `scratch/heatmap.py`. The 3 GB source raster is not in the repo.
**Extraction gotcha:** the script skips extracting when the .tif exists, so an
interrupted extract leaves a truncated file that fails as "corrupted tile" —
delete `wa/` and re-extract whole. 1.12.0.

**Session 24** — The canyon road, and the sky layer redrawn after Kevin called
it unreadable.

**The canyon road** is now its own option on leg 1 (`leg1-canyon`) and leg 3
(`leg3-canyon`). Instead of driving the 60 miles from Williams to the rim and
the same 60 back, it goes THROUGH: in at one entrance, along Desert View Drive
past Lipan, Moran and Grandview, out the other side. Leg 1 runs it west to
east (Williams > village > Desert View > Cameron > Flagstaff); leg 3 runs it
east to west. **Checked against the real numbers**: the loop is +128 miles
over I-40, the out-and-back is 122 — within six miles, so it genuinely costs
the same and repeats nothing. Desert View at 7,438 ft carries a snow risk
note: it is the piece of the park that closes first, and NPS shuts Desert View
Drive for winter weather while the south entrance stays open. The plain
interstate is the fallback.

**New in the data model: `detourBy`.** A stop can cost different time on
different roads — the Grand Canyon is 60 minutes off the interstate from
Williams but 3 minutes off the canyon road, because there the rim IS the road.
One stop id either way, so crossing it off still crosses it off everywhere.
Grand Canyon 4h30 -> 2h36, Sunset Crater 3h16 -> 2h42 (US-89 is the way
through, and the Wupatki loop road leaves and rejoins it).

**The sky layer was wrong and is redrawn.** Painting Bortle zones as filled
areas put 45 polygons under 12 pixels wide on the map — specks over the routes
and pins. The numbers were right and the rendering was useless, which is what
comes of validating data and never looking at the screen. **Darkness now rides
the road**: the active route wears a dark casing, heavier where the sky is
darker, because "where along my road is it dark" is a property of the line and
not of the country. Short flickers are smoothed out — a stretch must run about
33 miles before it earns a mark. 60 polygons became 7 segments. 1.11.0.

**Session 23** — The light pollution map, and the research job `darksky.json`
had been holding since it shipped empty. **Source: Falchi et al. 2016 World
Atlas of Artificial Night Sky Brightness** (GFZ, doi:10.5880/GFZ.1.4.2016.001),
684 MB zip, no login. The licensing note in the old comment was half right:
the trap is not CC BY-NC, it is the README inside the archive, which says
further distribution and commercial use are both prohibited and requires
citing two references. Both citations are in `source`. **Kevin was told the
repo is public and that publishing derived rings is a grey area, and chose to
push it.** The alternative, if it ever needs to be undone: VIIRS from NOAA/EOG
is public domain but needs a free account to download.

Pipeline (scratch only, not in the repo): crop the 3 GB raster to the
corridor, artificial mcd/m2 -> mag/arcsec2, threshold to Bortle, contour with
skimage, simplify, clip to land. 60 zones, 1,453 points, 72 KB.

**Four bugs caught by validating instead of trusting the output. Any rebuild
must keep all four fixes:**
1. Naming and hole-testing by centroid is wrong here — corridor-clipped bands
   are long curves whose centroid falls outside themselves. It rejected 100%
   of zones.
2. `find_contours` returns CLOSED rings (first point == last). Feeding that to
   Douglas-Peucker gives a zero-length baseline, every point measures zero
   distance, and the ring collapses to 2 points and is dropped. Simplify as
   two open halves.
3. Holes must be filled before contouring or a bright city inside a dark
   region comes back as its own contour and is painted AS IF DARK. The cost is
   that bright pockets are not cut out, which `source` states.
4. **The atlas covers the sea.** Open ocean is genuinely dark, so three zones
   landed in the Gulf of Mexico, two of them Bortle 2 — the best sky on the
   gulf route, 40 miles offshore. Masked to `usa.json`'s outline.

Two facts about this trip: **there is no Bortle 1 anywhere on the corridor**
(darkest cell 21.98 against a 21.99 threshold), and **Bortle 4 covers 91% of
it**, so drawing it is a flat tint over everything and it is skipped. The map
carries Bortle 2 and 3.

Also wired `darksky.at()`, which was written for this and never called: each
place sheet now gives its Bortle class in plain words. The zone NAME is
deliberately not shown there — one Bortle 3 zone spans several states and gets
named after an arbitrary town inside it. 1.10.0.

**Session 22** — Devil's Rope is out for good. It is closed November through
February, so it cannot be visited on this trip, and a stop that cannot be
reached does not belong in the app regardless of which list it came from.
**The rule, stated properly: the list decides what is a candidate; a hard
seasonal closure across the travel window decides what ships. When those
conflict, say so and let Kevin call it — do not quietly drop it and do not
quietly keep it.** 96 stops. 1.9.2.

**Session 21** — Three things Kevin caught, all mine.

**1. The low road never belonged.** `leg1-low` was never in any pool doc — it
was invented as a weather bailout and survived two "remove everything not on
my list" passes because it was justified rather than checked. Its only stops
were ones every other road already reached. Gone; leg 1 is the Route 66 road
and the southern line.

**2. Eateries showed grey and did not count.** The cause was `seeded`, a
one-time boolean. The app seeded a plan on first ever run and never again, so
every stop added afterwards arrived unticked. The old placeholder list was
almost entirely sights and the pool REUSED those ids (grand-canyon,
cadillac-ranch, beale-street...), so sights stayed ticked while the genuinely
new ids — overwhelmingly the restaurants, which the old list barely had —
came in grey. Replaced with `seededIds`, the set of ids the seeder has
already ruled on: it runs every boot, acts only on ids it has never seen, so
a new pool arrives ticked and anything deliberately unticked stays unticked.
**Any future pool needs no special handling.** Verified against a planted
old-format store: 22 of 25 eateries tick (the three left grey are the 3h+
ones, which is what suggestStops intends).

**3. Devil's Rope Museum is back.** It is on the leg 1 list, and it was cut
on my own judgment because it closes November to February. Kevin's rule is
that the list is the app; the closure belongs in the winter note where he can
see it and cross it off himself, not in my head. 97 stops, matching 97 doc
entries exactly.

Audit run this session: every entry in all three pool docs is present, no app
stop is absent from the docs, and nothing is silently dropped by MAX_OFF on
any road. 1.9.1.

**Session 20** — The leg 3 pool landed, and the trip is whole: all three legs
are Kevin's lists, nothing else. Leg 3 replaces the old placeholder roads
entirely with three route options: **The road home** (I-45, US-287,
then leg 1's I-40 in reverse), **The Waco line** (TX-6 through Waco, for the
mammoths, at the price of the Sam Houston statue), and **The Vegas
diversion** (north at Kingman for Hoover Dam, the Strip and Seven Magic
Mountains, rejoining at Barstow, +4 hours, and it forfeits Oatman).
8 new stops; 33 leg 1 corridor stops from Amarillo westward joined leg 3
under their existing ids, so marking one seen strikes it on both legs, which
is what Kevin asked for. Ignored by instruction (on no list): Big Texan,
Tyler's, the livestock auction, Acoma, the borax mine, Tehachapi Loop,
Barstow's Route 66 museum. Research: Waco Mammoth is CLOSED New Year's Day.
Valley of Fire's west entrance is closed Mon-Thu through 2026, enter from
SR-169. Seven Magic Mountains is confirmed standing through the trip. La
Chavala Linda is closed Monday, opens mid-afternoon weekdays. Copper Breaks
is $3. Hoover crest walk is free 5am-9pm with free Arizona-side lots.
US-287 at Childress carries an ice risk note. **Bug fixed on the way in:**
the store (and its Firestore copy) remembered route ids that no longer exist
(leg3-i10) and the app crashed at boot; `legChoice` in ui.js now falls back
to the leg's default route and heals the store. 96 stops. 1.9.0.

**Session 19** — The leg 2 pool landed, same contract as leg 1. 21 stops,
Mooresville to Houston, all verified this session. What the research changed:
Gator Country is $15 each, not the pool's $30. The Birmingham Civil Rights
Institute is closed Sunday AND Monday, not just Monday. Eagle's is closed
Monday and Saturday, open Sun/Tue-Fri 10:30-3:30. La Carreta runs Thursday
to Sunday. El Güegüense is at 6403 W Airport, 3pm weekdays, closed Monday.
Marshall's Wonderland of Lights historically ends Dec 28-30, flagged to check
against the drive date. Bellingrath's lights run past New Year's with timed
tickets. Route work: both leg 2 options now share the real I-85 start
(Gastonia, Spartanburg, Greenville, Commerce), Atlanta carries an ice risk,
and **the inland run goes down US-59** (Marshall > Nacogdoches > Lufkin >
Houston) instead of the old placeholder's 200-mile Dallas dogleg — that is
the road that serves Caddo Lake and Marshall, and it is the ~1,150 mile
figure the pool quotes. The gulf run gained Lafayette for waypoint density
(the leg was measuring ~4% light). Bookings added: Caddo boat tours,
Bellingrath timed tickets. Georgia Aquarium now sits on both leg 2 bands and
leg1-south. 88 stops in the app, all from Kevin's lists. 1.8.0. Leg 3's pool
is the remaining gap.

**Session 18, second pass** — Kevin's rule made explicit: **if it is not on
his list, it is not in the app.** All 31 remaining old placeholder stops are
gone, legs 2 and 3 included (French Quarter, Space Center, Carlsbad, Hoover
Dam, the whole set), with their bookings and orphaned normals. The app holds
exactly the leg 1 pool, 67 stops, nothing else. Legs 2 and 3 are empty and
stay empty until Kevin hands over their pools, the same way leg 1 arrived.
Their day splits still compute from waypoints. Georgia Aquarium was on the
list, so it stayed, rewritten as the pool's version on leg1-south. 1.7.2.

**Session 18** — Kevin's fixes on the pool. (1) Leg 1 is now ONLY his list:
the twelve old low-road stragglers (Joshua Tree through Sixth Floor) lost
their leg 1 membership, they live on leg 2/3 where they belong, and Fort
Worth Stockyards is gone outright. (2) **Map blur fixed.** The stage raster
was CSS-scaled and left stretched at rest; now every settle repaint bakes the
visible box into the SVG viewBox at panel size and resets the transform, so
the map is vector-crisp at any depth. The CSS transform only carries the live
gesture delta. `baked` in app.js is the state the SVG was last painted for;
it resets on mount because the tab redraw replaces the SVG. Coordinate output
went from one decimal to three, one stage unit is ~4.4 km so tenths jitter at
depth. (3) **Every pin shows.** Stops sharing a doorstep (Beale and Dyer's
are 11 metres apart, they can never separate by zoom) spread into a small
ring in screen units, which dissolves when real distance takes over. Labels
anchor to the spread position. 1.7.1.

**Session 17** — The leg 1 master pool landed. Kevin handed over a 68-stop
researched pool (Modesto to Mooresville) and answered the open questions:
Mooresville, tight schedule, Android Auto and fuel planning both dead. What
went in:

- **`data/stops.json`**: leg 1's placeholder list replaced wholesale by the
  pool, 66 stops. Every stop re-verified this session: hours, winter closures,
  prices, coordinates. Ids reused where the stop already existed
  (`grand-canyon`, `cadillac-ranch`, `dollywood`...) so notes and seen-marks
  survive. The pool's costs are round-trip, the app's `detour` is one-way, so
  every pool number was halved on the way in. Old low-road-only stops
  (Joshua Tree through Fort Worth) kept, the low road was outside the pool's
  scope. Cut from the pool: **Devil's Rope Museum**, closed November through
  February, it cannot be visited on this trip. Cut with the old list:
  Biltmore, Graceland, Sun Studio, Ryman, OKC Memorial, Hot Springs,
  Mount Mitchell, Big Texan, Pops 66, El Morro, Lowell, Standin' on the
  Corner, Sandia Tram, Tehachapi Loop. If Kevin wants any back, say so and
  they return.
- **`data/route.json`**: leg 1 ends at Mooresville now (Asheville > Hickory >
  Statesville > Mooresville), Raleigh placeholder gone, and there is a third
  option, **`leg1-south`**: same road to Nashville, then I-24/I-75/I-85 through
  Chattanooga and Atlanta, around the Smokies instead of through them.
  Monteagle Mountain waypoint carries the ice risk. Both leg 2 routes now
  start at Mooresville.
- **`data/extras.json`**: 41 official sites added, 16 new town normals,
  Palo Duro booking (day passes sell out holiday week). Biltmore and Graceland
  bookings removed with their stops.
- **UI**: the Route tab has All / Sights / Eateries chips (66 = 41 sights +
  25 eateries), an EAT tag on food rows, and a four-step time colour scale on
  each stop's cost figure (under 45m green, to 1.5h ochre, to 3h orange, 3h+
  red). The scale is documented as the one deliberate exception to the
  one-signal-colour rule, at Kevin's request. 1.7.0.

Research flags worth keeping: Snow Cap winter hours are Facebook-only rumor,
Edge Craft is Thu-Sat 11-3 and sells out, Arnold's is lunch-or-never, the
NCRM closes Tuesdays, Old Town ABQ's full farolito display is Christmas Eve
only, Blue Swallow shuts Jan-Feb but is lit mid-December, the Parthenon's
HVAC closure ended, it is open again at $15. Naylamp's original Warr Acres
location closed, the live one is 2106 SW 44th St.

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

**Session 22b — the bundler had two hand-kept lists and both were wrong.**

Adding `js/darksky.js` and `data/darksky.json` broke the published artifact in
two ways, and **neither showed up as an error in the app itself** — the live
site was fine throughout, because a browser resolves ES modules and fetches
files on its own. Only the bundle broke.

1. **`MODULES` did not list `darksky.js`,** so `__M['./darksky.js']` was never
   created and `ui.init` died on `darksky.load` at boot. The bundle *parsed*
   perfectly; it just did not run.
2. **The data list did not include `darksky.json`,** so the fetch shim did not
   recognise the path, a real network fetch went out, failed inside the
   artifact, and the Sky button silently never appeared. **This one was
   invisible** — no error, no warning, just a missing feature.

**Both lists are now derived, and the module graph is audited.** The data map
reads `data/` off disk. `auditGraph()` refuses to build if any module imports
something absent from `MODULES`, if a dependency is listed after its importer,
or if a file in `js/` is not listed at all — verified by removing `darksky.js`
from the list and confirming it throws.

**The lesson worth keeping: the artifact bundle is a second runtime, and the app
passing proves nothing about it.** Boot the bundle before publishing, don't just
parse it.

A throwaway artifact with **invented** zones exists so the overlay can be looked
at before real data exists: https://claude.ai/code/artifact/2646e778-848b-4e4a-8f2b-ce9488eb12b3
The shapes are rough boxes and every zone is named "Demo only — not real sky
data". **Do not mistake it for a dataset, and do not copy it into the repo.**

**Session 22 — dark-sky overlay: the framework, with no data in it (1.6.0).**

Kevin may sleep in the car or a tent, and wants to find places along the route
dark enough to see the Milky Way. **He asked for the framework only** — the data
comes after the stops and routes are settled, and it is a real research job.

**`data/darksky.json` ships EMPTY, and the Sky button does not exist until it
has zones.** That is deliberate: the stop list sat here as an unapproved
placeholder for twenty sessions and got treated as real by everyone including
me. No data beats data nobody approved, and a control with nothing behind it is
a lie.

**The colour decision, which is the only real design question here.** Every
light-pollution map in the world is a rainbow — black, blue, green, yellow, red.
This app has one colour and it means "in your plan". So **darkness is drawn as
darkness**: one wash, denser the darker the sky, and the thing you hunt for is
the dark patch. No legend to decode. It uses a new `--sky` token — `#191917` on
the light ground, **`#000000` on the dark one** — so "dark" reads dark in both
themes rather than inverting to a bright blob.

Bortle 1–4 only, at fill-opacity .34 / .24 / .15 / .08. **5 and up is not
drawn** — suburban sky, no Milky Way, so painting it is noise.

- `js/darksky.js` — loads, validates, and a point-in-polygon `at(ll, zones)`,
  which is the primitive a later "next dark stretch is 40 miles ahead" needs.
- The layer paints straight after `mland` and under everything else, so routes,
  pins and labels stay readable on top.
- The toggle repaints the layer only; it never rebuilds the tab, so the map does
  not move under you. Verified the transform is unchanged across a toggle, and a
  30-move pinch is still monotonic with the overlay on.

**The validator is loud on purpose.** Bad zones are dropped and named in the
console rather than half-drawn — a silently wrong polygon is a lie about where
it is safe to sleep. Tested with four deliberate failures: bortle out of range,
**lat/lon swapped**, too few points, missing bortle. All four rejected and
reported. The swapped-pair check matters because every published dataset you
would convert from is GeoJSON, which is `[lon, lat]` — the opposite of this app.

**Unresolved, and it is the research job:** the standard source is the World
Atlas of Artificial Night Sky Brightness (Falchi et al. 2016), a VIIRS-derived
raster, so using it means contouring it into rings. **It is CC BY-NC** — fine
for a personal trip, requires attribution, rules out anything commercial.
Whatever gets used goes in the file's `source` field.

**Session 21 — Firsts removed from Trip, and what a third route would do (1.5.1).**

**Firsts is gone from the Trip tab** at Kevin's call — the counter and the list.
**The `first` flag itself stays**: it is still in `stops.json`, still shown as
"A first" on a place sheet, and still the thing the stop list should be chosen
against. He asked to remove it from Trip, not to stop caring about it. Do not
take this as licence to strip the flag.

**"What do we do if there are several alternate routes?"** Tested rather than
guessed, by serving the app with a synthetic third route bolted onto leg 1:

- The **picker** holds three names on one row at 375px and wraps beyond that.
  Fine.
- The **drawer** lists all three and scrolls. Fine.
- **The map is what breaks.** Every non-chosen route is drawn with the same
  dashed `--ink2` line, so with two alternatives you can see that other ways
  exist but not which is which. Verified identical stroke and dash pattern.

**The fix, when a leg actually gets a third route: draw one alternative at a
time — whichever you are reading about in the drawer.** You are never choosing
between three at once; you are asking "should I go that way instead", which is
one comparison. Rejected: a second dash pattern or a fading scale, because both
make the reader decode a legend, and a legend is decoration.

Not built. Every leg has exactly two routes today, so nothing is broken now.

**Session 20 — choosing the way happens on the map now (1.5.0).**

Kevin: *"this should actually sit in the Map part. So you can visually see the
difference."* He was right, and it exposed the real gap: **the map had never
drawn the alternative at all.** `paint()` was given `selected()` — the chosen
route of each leg — so there was nothing on screen to compare. Adding prose to
the Route tab (1.4.0) had been answering the wrong question.

**Three lines on the map now, three weights.** Other legs faint `--rule2`; the
option you are NOT taking in `--ink2`, dashed; the way you are going solid
`--ink`. Contrast against the land, measured in both themes: 1.4 / 3.6 / 13.7
light, 1.7 / 4.3 / 12.7 dark. The alternative was `--ink3` first and it
disappeared into the ground in dark mode.

**A slim picker in the head**, under the leg selector, on the three leg-scoped
tabs. Mono, no boxes, no rules — a dial, not a second row of tabs. The chosen
one is in the signal colour, which still only means "in your plan".

**The route's case lives in a drawer at the foot of the map**, shut by default:
one line, `Why` on the right. It reuses the `.rtopt` component built in 1.4.0,
so there is one definition of what a route option looks like. Capped at 34vh so
247px of map stays visible while you read — reading and looking are the same act
here.

**Two things done deliberately:**

- **Swapping a route no longer resets the view.** It used to call `resetTf()`.
  You zoom into Arizona to see where the two lines split, tap the other route,
  and refitting would throw that away — the same mistake `resetView()` made on
  every aspect change in session 8. Verified: the transform is byte-identical
  across a swap from either the picker or the drawer.
- **The drawer toggles by mutating its own element, not through `draw()`**, so
  opening it never repaints the map underneath. Verified the SVG is untouched.

**No stop list under the map, and that was a refusal.** Kevin asked for one.
It is the whole Route tab one tap away, and session 7 records him calling a list
under the map "that annoying list underneath it" before it was removed. He took
the argument.

**The Route tab is now only the stops** — the fat route rows are gone and the
first stop sits 82px down instead of 563px, which retires the space problem
1.4.0 created.

**Gotcha for the next agent:** `node --check` parses a file as CommonJS and
**missed a duplicate `const` declaration** in `app.js` that the browser caught
instantly. Check modules with `node --input-type=module --check < file`, or just
load the app.

**Session 19 — the case for each route, which was written and never shown (1.4.0).**

Kevin, on alternate routes: *"that was discussed on having multiple routes in
case of closures or change in plans."* **Swapping always worked** — Route tab,
tap an option, stops/mileage/days/map/header all recompute and it syncs. What
was missing is everything you would need to *decide*.

**Each route in `route.json` carries `road`, `character`, `why` and `costs`, and
not one of them was rendered anywhere.** Zero uses in `js/`. The tab showed
"The low road · 2,984 mi" and nothing about it being the bail-out when Flagstaff
is buried, or that taking it costs you the Grand Canyon and means driving most
of the return route twice. All four are on the Route tab now, for all six
routes. No new data — it was already written.

**The prose sits OUTSIDE the button.** The button stays dot + name + miles;
the detail is a sibling in a `.rtopt` wrapper. Reading about a route can
therefore never swap the one you are on, and the button keeps a sane accessible
name instead of announcing four paragraphs. Verified: tapping the name swaps
(2,771 → 2,984), tapping the prose does nothing.

Grid holds — name, road, character, why and costs all start at x=48, the dot on
the vertical at 24, mileage flush right. `road` is mono because it is a set of
route numbers; the rest is Archivo, with `character` in ink and `why`/`costs` in
`--ink2`. No new colour.

**The cost, and Kevin knows about it:** the two options now take 539px, so on a
375×812 phone they fill the first screen of the Route tab and the transit
diagram starts just below the fold. It was ~110px before. If that reads as too
much, **`character` is the one to cut** — it largely restates `why` — which
brings it to roughly 380px. Cut information, not the feature.

**Session 18 — the stop list is a placeholder, and it is being replaced.**

**Kevin never approved the 68 stops.** They were seeded in session 1 as a
working set and have been treated as real ever since, including by me. He is
building a proper list with a different Claude conversation.

`tools/stops-handoff.mjs` writes **`STOPS-HANDOFF.md`** — the current list plus
the contract a replacement has to satisfy. It imports the real `buildRoute` so
the mileposts are the ones the app shows, not a re-derivation. **Re-run it
whenever the data changes; a handoff with stale numbers is worse than none.**

```
node tools/stops-handoff.mjs
```

What the other conversation needs, and what the doc therefore carries: the
stop schema field by field, that `detour` is **one way** and gets doubled, that
`mile` is computed from `ll` and must never be authored, that anything more
than 140 miles off the route (`MAX_OFF`) is **silently dropped**, that `routes`
must name real route ids, that lodging is an ordinary stop with
`kind: 'lodging'` rather than a parallel system, that a new town name needs a
new `extras.json` normals entry or the stop shows no temperatures offline, and
that nothing dated or personal may go in the data because the repo is public.

**When the new list lands:** replace `data/stops.json`, add `normals` entries
for any new towns, check `sites` and `bookings` for ids that no longer exist,
re-run the handoff tool, and re-bundle the artifact. Route waypoints only need
touching if the roads themselves change.

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
