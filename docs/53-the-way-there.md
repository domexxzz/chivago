# 53 — The way there, on our own map

The road route, drawn inside the app. `52-getting-there.md` closed the
distance question and handed the roads to Google; this draws the roads on
the island the traveller has been looking at all along.

## What was asked, and what it costs

> เราเอาแมพมาไว้ภายในแอพไม่ได้หรอ ไม่ต้องไปเปิดใน Browser

Three levels were on offer. A straight line costs nothing and is not a
route. Turn-by-turn is competing with Google Maps on their own ground. The
middle one — a real road route drawn on our map — was chosen knowing what it
costs, which is that **the app now depends on somebody else's road graph**.

That is the honest headline. Everything below is how the dependency was kept
from being able to hurt anyone.

## Which router, and the measurement that chose it

| | OSRM demo | Valhalla, FOSSGIS |
| --- | --- | --- |
| Key or account | none | none |
| Walking profile | **the car graph** | real |
| Chaweng → Na Muang on foot | 19.9 km in **22 min** | 19.3 km in **249 min** |

OSRM's public server hosts only the car graph, and its `/foot/` and `/bike/`
paths return the car answer unchanged. Twenty kilometres in twenty-two
minutes is 54 km/h. Valhalla's 249 minutes is 4.6 km/h, which is a person —
and within a rounding error of the 4.5 km/h `wayfinding.ts` already uses for
its own walking estimate.

An app whose point economy pays Trip Points for **walking** cannot ship a
walking time that is really a driving time. That measurement is the whole
reason for the choice, and `routing.test.ts` keeps it: a test asserts the
parsed route's implied speed is between 3 and 7 km/h, which is the assertion
that would have caught OSRM.

Neither carries a key, so `terrain-style.test.ts`'s **"free, and stays
free"** rule survives untouched, and there is no new secret to rotate before
an event. A routing test asserts the request URL carries no key either.

## What it costs somebody else, and what follows

`valhalla1.openstreetmap.de` is run by FOSSGIS for the OpenStreetMap
community. Free, no key, no promise of uptime, no published rate limit. So
the rule this feature is built around is: **nothing breaks when it does not
answer.**

- **A failure is not an error state.** No red box, no retry button. The map
  falls back to the straight line between the traveller and the place, drawn
  **dashed**, and the banner says in words that it is a direction and not a
  road. A dashed line across a bay that somebody reads as a road is how a
  traveller ends up in the sea.
- **An eight-second timeout.** A request with no deadline is a spinner with
  no end, and on a conference network that is what a judge would be looking
  at.
- **One request per destination, not per fix.** The traveller's position
  moves as they walk; re-routing on every fix would hammer a free server for
  a line that has not visibly changed. The effect is keyed on both points
  rounded to a 150 m grid.
- **The last answer wins, not the last to arrive.** Two destinations chosen
  quickly must not race, or the map shows the road to the place the
  traveller changed their mind about.
- **Nothing is asked without a destination and a position.** Opening the map
  asks nobody anything.

If this ever carries real traffic it moves to a routing server this project
runs. That is a cost decision, not an engineering one, and it is on the
owner's list rather than hidden in a comment.

## What a traveller does

1. On a place, **"Show the way on the map"** — above the Google button, which
   stays for the turn-by-turn this app does not do.
2. The Map tab opens with a banner over the map: where to, how far along the
   road, how long, and two modes.
3. The route draws on the island: a dark casing under a line in the CTA
   orange, which is the app's "start something" colour and the one strong
   colour on the map that is neither the evidence green nor a quest's gold.

**Two modes, not five.** Walking is the default, because walking is what the
product pays for. The other is "by road" — the moto and the songthaew follow
the same roads at roughly the same speed, and a third line labelled
*songthaew* would be the car answer wearing a different name. That is the
same dishonesty OSRM was rejected for.

**This is not Smart Route.** Routing *by road* is one problem and it is
solved by OSM data that exists. Ferry timetables and songthaew stops are a
different problem, and `10-pitch-gap-audit.md` is unchanged: that data still
does not exist in machine-readable form for Samui.

## On the phone

The drawn island does **not** get the route line. It is a diagram with real
points on it, and a road route traced across a hand-drawn coastline would
claim a precision the drawing does not have — the same rule that already
keeps quest marks off it. A phone gets the banner's distance and time, and
the Google hand-off. The real map is still web-only until `expo-gl` and a
development build the project has never had.

## Held by test

- `packages/core/src/routing.test.ts` — the request carries no key; walking
  and riding are asked as different questions; the polyline decodes at
  **six** decimal places, not the five every snippet assumes (at five this
  route lands in the Gulf of Thailand); the line starts at the traveller and
  ends at the place; a truncated line is a short line rather than a throw;
  the walking time is a walking time; every unusable reply returns null. The
  fixture is a real reply from the FOSSGIS server, captured 8 September.
- `apps/mobile/test/way.test.ts` — the banner names the place and says the
  road distance and time; both modes are offered; no route says *the
  direction, not a road* and shows no duration; a destination asks the
  router exactly once, on foot, from where the traveller is; no destination
  asks nothing at all; a router that fails costs the road and not the map;
  no location permission asks nobody anything.

## Still owed

- **A routing server of our own**, if this is ever more than a demo.
- **The phone's map.** Same blocker as everything else native.
- **The route is not saved.** Leaving the Map tab and coming back asks
  again. Fine for one journey; wrong if this ever becomes a planner.
- **No steps.** The banner says how far and how long, not "turn left". That
  is deliberate — see the third level this feature declined.
