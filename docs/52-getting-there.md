# 52 — Getting there

How far a place is, which way it lies, and a button that opens a map with
the roads on it. Added 8 September 2026, after the question "why is there no
navigation?" turned out to have two different answers.

## The two questions that were being treated as one

**Smart Route** — the deck's multi-leg promise: plane, boat, car, songthaew,
moto. Audited on 31 August in `10-pitch-gap-audit.md` and still unbuilt, for
a reason that has not changed: it needs ferry timetables and songthaew stop
data that largely does not exist in machine-readable form for Samui. That is
a data-collection project first and a routing problem second, and nothing
here starts it.

**Where is this place, and how do I get to it** — needs no Samui data at all.
Every ingredient was already in the repo:

| Already there | Where |
| --- | --- |
| Every place's coordinates | `packages/core/src/seed.ts`, and on the wire in every `ScoredPlace` |
| Great-circle distance | `metresBetween` in `presence.ts`, used on every check-in |
| The device's position | `expo-location`, already requested by the check-in |
| A map with pins | `TerrainMap.tsx` |

The only missing step was saying the answer out loud. So that step is what
this adds, and nothing more.

## What it looked like before

The app measured the distance to a place on **every** check-in, against a
250 m fence, and spoke it in exactly one situation: when refusing.

> You need to be at the place to check in — about 400 m away

That is the only distance the product has ever shown a traveller. Three other
things followed from it:

- the companion room's **"Go there"** button opened another screen inside the
  app rather than going anywhere;
- the map never showed the traveller's own position;
- nothing anywhere linked out to a map that has roads. The app's only
  `Linking.openURL` calls were telephone numbers.

Meanwhile `low-carbon.ts` pays 30 Trip Points for a **measured walking leg**
between two places. The product asked people to walk between places and gave
them no way to find the walk.

## What it does now

On the place screen, directly above the check-in button — the two answer the
same question in order, *how far am I* then *can I claim this yet*:

| State | Shown |
| --- | --- |
| **arrived** (≤ 250 m, inside the check-in fence) | "You're here" and the map button |
| **away, walkable** | the distance, the compass point, the walk in minutes, the map button |
| **away, too far to walk** | the distance, the compass point, the map button — and no walk quoted at all |
| **unknown** (no position) | one line saying the distance needs a location, and the map button |

`packages/core/src/wayfinding.ts` holds all of it as pure functions, so the
rules are held by test rather than by opening the app in five places.

**Distances are rounded to the precision the fix has**, not the precision it
arrives with: ten metres under a kilometre, a tenth of a kilometre under ten,
whole kilometres after that. Consumer GPS is 30–50 m out under trees, so
"182 m" would claim four times the accuracy behind it.

**The walk is estimated at 4.5 km/h**, deliberately *not* the 6 km/h in
`low-carbon.ts`. That number is an upper bound used to reject a songthaew,
not a pace anybody keeps; quoting it would make every estimate optimistic in
the one direction that leaves somebody out in the tropical sun.

**Walking is only offered under 3 km**, about forty minutes. Beyond that the
walk is not quoted at all and the map does not open in walking mode: most
people take a songthaew whatever the app says, a map opened in walking mode
for a two-hour walk has to be corrected before it can be used, and "about
105 min on foot" beside an eleven-kilometre distance is not information a
traveller can act on. On this island in this heat it is closer to bad
advice. The distance above it has already said the place is far.

## What is deliberately not in the URL

The link is the documented `api=1` universal Google Maps URL, and it carries
the **destination only**:

```
https://www.google.com/maps/dir/?api=1&destination=9.535700,100.061700&travelmode=walking
```

No `origin`. Google Maps fills in "your location" itself, from the permission
the traveller already gave *it*, so this app never puts a traveller's own
position into a URL — the one place a position would be logged by a third
party, cached, and carried by anyone who copies the link. It also makes the
link identical for every traveller looking at the same place, which is a good
property for a link that ends up in a screenshot. A test asserts the absence.

## And it does not raise a permission dialog

`useHere` (`apps/mobile/src/state/here.ts`) asks
`getForegroundPermissionsAsync` — the variant that reads the answer without
prompting — and gives up quietly on anything else. A check-in *requests* the
permission, because a check-in without a position cannot happen and the
traveller understands why the dialog appeared. A distance is a convenience,
and a convenience that raises a system dialog is how an app teaches people to
tap Deny by reflex, which then costs it the request that mattered.

Null is a normal outcome, not an error. The screen has a complete third state
for it.

## Held by test

- `packages/core/src/wayfinding.test.ts` — bearings against the four
  cardinals; rounding; both languages always filled; the walk estimate slower
  than the leg-detector ceiling; arrival at exactly the fence radius; the URL
  carrying the destination and never an origin; every seeded place producing
  a link whose coordinates survive the round trip.
- `apps/mobile/test/screens-detail.test.ts` — the four states on the real
  screen: 1.5 km north-east with a walk time, eleven kilometres with the
  distance but no walk, arrival with no distance shown, and a refused
  permission that costs the distance but not the map.
- `apps/mobile/test/home.test.ts` — the card carrying the distance, saying
  "Here" from inside the fence, and carrying nothing at all with no
  permission. That last one is asserted on the spoken label rather than on
  the word "km", for the reason in the next section.

## And on the cards, which is where the choice is actually made

The place screen answers *how do I get to this one*. The row on Home answers
*which one*, and that is the question somebody scrolling it is asking — so
the distance goes there too, as a second chip.

Two chips, deliberately not the same kind of thing. **Top left is the score**,
a claim about the place. **Top right is the distance**, a fact about where
the reader is standing. Inside the fence the chip reads "Here"; the sentence
would wrap to three lines on a 172 px card and the row would stop being
scannable.

It sits on the photograph rather than under the name because the card's meta
line is already a sentence with a kilometre in it — *"Beach · 2.1 km of
sand"* — and two adjacent kilometre figures meaning different things is
worse than no figure at all. The first version of the no-permission test
asserted the absence of the string "km" and failed on exactly that line,
which is a fair way to be told the layout decision was the right one.

`useHere` is called **once for the whole row**, in `Places`, and the position
passed down. A card that asked for its own would take a fix per place and
answer the same question five times.

The spoken label carries the distance and the compass point, so a screen
reader user gets the fact the row is being scanned for rather than only the
score.

## Still owed

- **Sorting.** The row is still in the server's order. Nearest-first would be
  a different claim — that proximity is what should decide — and it is the
  owner's call, not a side effect of showing a number.
- **The map's own "you are here" dot.** `TerrainMap.tsx` still never draws
  the traveller.
- **"Safe path from here"** on the same screen switches to the Safety tab.
  It is the second button in the app that reads like navigation and is not.
- **Apple Maps.** The universal Google URL opens the Google app on iOS if it
  is installed and the web map if it is not. An iPhone with no Google Maps
  gets a browser, which works and is not what that traveller expects.
- **Smart Route is still not started**, and the reason above still holds.
