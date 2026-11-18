# Milepost

**Read [PLAN.md](PLAN.md) before touching anything.** It holds the trip plan,
the build state, every decision and why, and the open questions.

**Update PLAN.md and push it every session.** That is the law here — it is how
the next agent (or the next Claude account) continues without losing the thread.

**The live app and `prototype/` are two different designs.** The prototype is
the direction; the shipped UI is what it replaces. Read PLAN.md before assuming
either is settled.

## Quick facts

- Vanilla ES modules, **no build step**. GitHub Pages serves these files as-is.
- Local preview: `node tools/serve.js` → http://localhost:5177
- Node lives at `%LOCALAPPDATA%\nodejs` on Kevin's machine — not on PATH by
  default, prepend it.
- **Never put travel dates, overnight towns or personal notes in the repo.**
  Public repo. That data belongs in the app's own storage only.
- Ada is on an **iPhone**. This is a web app for that reason. Do not pitch
  Flutter.
- Claude must **not** enter passwords or create accounts. If the Firebase
  console asks for a sign-in, hand it to Kevin.

## Layout

| Path | What |
|---|---|
| `data/route.json` | Three legs, each with swappable routes. Real lat/lon. |
| `data/stops.json` | 68 stops, each naming the routes it sits on. |
| `data/usa.json` | Stylized lower-48 outline so the map works offline. |
| `js/route.js` | Distance, cumulative mileage, projection onto the road. |
| `js/plan.js` | Turns a route + chosen stops into days. |
| `js/map.js` | SVG poster map drawn from coordinates. No tiles. |
| `js/store.js` | All user state. The seam where Firestore drops in. |
| `js/weather.js` | Weather per place and date: forecast, seasonal ensemble, El Niño baseline; plus the snow/rain grid and its severity steps for the Weather map. Cached, refreshes itself. |
| `data/elnino.json` | El Niño analog winters vs normal per place. Generated: `node tools/elnino.mjs`. |
| `data/enso.json` | NOAA's El Niño status. **Hand-updated monthly** from CPC's discussion. |
| `js/ui.js` | The six screens (Classic), and every number both looks show. |
| `js/ui-new.js` | The New look's layouts of the same six screens. Lays out, never computes. |
| `js/skin.js` | Classic or New, per phone, and the three confirmed plans New shows. |
| `css/skin-new.css` | The New look. Every rule scoped to `html[data-skin="new"]`. |
| `js/drivers.js` | Who drives which stretch, and long-day flags. |
| `js/alerts.js` | National Weather Service warnings on the next three days of road. |
| `js/app.js` | Boot, tabs, events. |
| `prototype/` | The agreed new design, not yet ported onto the app. `node prototype/build.mjs` regenerates it. |
