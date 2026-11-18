# Milepost 🛣️

Modesto to North Carolina, down to Houston, and home again. About 5,900 miles
over three weeks, in winter, in a Honda Accord.

A trip planner built for one specific drive — three legs, each with routes you
can swap between for weather or for mood, every stop priced in *minutes off the
interstate*, and a running list of the things Ada has never seen before.

## How it works

- **Three legs, two routes each.** Pick by forecast or by feel; mileage, day
  splits and the stop list all recompute.
- **Every stop shows what it costs the day** — detour out, detour back, and
  time on the ground.
- **Works with no signal.** The map is drawn from real coordinates rather than
  map tiles, and everything is cached on first run. That matters between
  Needles and Flagstaff, and again across West Texas.
- **Winter is built in.** Chain-control rules for this specific car, pass
  elevations, and every state's road-conditions site.
- **Weather where you will be, on the day.** A map of snow and rain along the
  trip, light to heavy, for any day or for the whole trip at once, and a card
  for every stop, bed and pass: the forecast inside 16 days, ECMWF's seasonal
  ensemble beyond that (striped, because it is odds, not amounts), and always
  what the strongest El Niño winters did at that spot. It refreshes itself and
  keeps working offline.

## Running it

No build step. Serve the folder:

```
node tools/serve.js
```

Then open http://localhost:5177

## For Claude agents

Read [PLAN.md](PLAN.md) first, and update it every session. See
[CLAUDE.md](CLAUDE.md).
