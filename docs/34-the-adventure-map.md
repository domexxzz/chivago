# 34 — The adventure map

The hero was honest and flat: a pale island in the app's own tokens, a blue
sea at half strength, seven layers, nothing saturated but a measured place.
It read as a diagram. A traveller opening this app is not looking at a
diagram; they are standing on the island it draws, deciding where to go.
This is the map as a place you could set out into.

## What is on screen

The same island — OpenStreetMap's coastline, the elevation model's mountain,
the real roads — drawn like the chart of somewhere worth exploring:

- **The land is coloured by its real height.** A `color-relief` layer over
  the Terrarium elevation: sand to four metres, the coconut plain to forty,
  jungle, the high forest, and the pale cloud on the top of Khao Pom at
  635 m. Below zero the model carries a little bathymetry, and the reef flat
  off the beaches shows through the sea as the pale water it is.
- **It is lit by the island's clock.** The same `island-clock.ts` that lights
  a companion's room sets the hillshade's sun — east in the morning, south at
  noon, west in the evening, anchored to the map so the shadows stay on the
  same side of the ridge however the camera turns — and blends the whole
  palette through gold at the edges of the day into a blue tropical night
  where the labels invert and the quest marks glow. `?hour=13` on the URL
  shows any hour.
- **The sea is deep, the routes are dotted.** The ferry lines to Pha-ngan and
  the mainland are the dotted routes of a chart; the roads are trails, a
  sand line over a dark edge; the streams that come off the mountain are
  drawn from eleven zoom levels in. Two pinches in, the buildings stand up.
- **X marks the spot.** Every quest on today's list stands on the map where
  the work is, with its code and what it pays. The ring pulses gold until
  you join it, blue while it is yours, and goes quiet green with a tick once
  a host has verified — the only one of the three that has earned the colour.
  Tapping it opens the quest.
- **The camera moves like it has somewhere to be.** The intro rises and
  swings into the settled pose as before; then the view keeps turning,
  sixteen degrees over forty-five seconds, until the first touch. A compass
  rose keeps true north through all of it, and tapping it flies the camera
  home.
- **The pins stand on the ground.** A chip on a stem with a shadow at its
  foot, riding the terrain; it bobs a little.

## What it refuses

**No layer wears the verified green.** The island is a jungle and a jungle is
green, but its greens are olive — every land colour in every hour's palette
is held twenty-five degrees of hue from the evidence emerald by a test, so
a forest can be a forest without spending the meaning of a verified score
on trees. The one thing on the map in that green is a place somebody
measured, or a quest a host signed.

**The geography is still the geography.** Nothing is redrawn to look better.
The mountain is exaggerated, twice the truth, and `HERO.exaggeration` says
so where a person can read it.

**Free, and stays free.** No tile URL carries a key. OpenFreeMap and the AWS
terrain tiles, as before.

**Reduce-motion means still.** No intro, no drift, no bob, no pulse — one
settled frame.

**A quest's X is a web mark.** The native island is a traced decagon with
real points on it, and an X on a stylised coastline would claim a precision
the drawing does not have. On a phone the quests are the card under the
map, as they were.

## What was learned

- **A marker's position is MapLibre's.** Its stylesheet makes the mark
  `position: absolute`; a `position: relative` in the marks' own CSS wins by
  being declared later, and every mark is then laid out in a column under
  the first. The first build looked like the pins had slid into the sea.
- **A hidden document loads no style.** MapLibre defers style loading and
  every render to `requestAnimationFrame`, which a background tab never
  gets. This is fine for a person; it is confusing for a test harness, and
  the reason `TerrainMap` measures its container again on the next frame,
  on load, and on every resize after.

## Uncharted, and the sea

Two things the first version left owed, now built:

**The mist.** Everywhere this traveller has not been is drawn under a pale
parchment haze - named, because a chart has names, but not yet seen - and it
lifts in a soft circle, a beach and a walk wide, around each place they have
actually reached. It is the honest version of exploration: `GET /explored`
derives the list from the ledger's geofenced check-ins and the passport's
self-issued stamps, each place once with the check-in winning, and nothing
else clears it. A place you have looked at is still mist; a place you stood
at is not. The legend counts it - "Explored · 3 of 5" - and prints zero
rather than hiding it, because an unexplored island is the truthful start.
The haze is a canvas source painted by `paintFog`, so a cleared circle has
a feathered edge and two that overlap simply overlap.

**The swell.** The `sea` fill wears a pattern the map repaints twelve times
a second: the sea colour, a little deeper in the troughs, with the crests of
three crossing swells drifting over it, and by moonlight the glitter a low
moon leaves on water. Every wave is an integer number of cycles across the
tile, which is what makes it tile without a seam; `swell()` and `crest()` are
pure and tested. Reduce-motion gets one frame. A hidden tab gets none.

## The view, the approach, the weather

**The sky is in the frame.** MapLibre's default pitch ceiling is sixty,
which puts the horizon just above the hero. The map raises the ceiling to
`MAX_PITCH` and the hero sits at sixty-six: the sky comes in over Ko
Pha-ngan, the fog runs to the horizon, and at half past five it is peach.

**The approach is by sea.** The intro starts out to the south, low over the
water and turned well round, and eases in over three and a half seconds
with the island coming up over the bow. Not a zoom.

**Cloud shadows.** Nine soft ellipses drift over the whole island's box on
the trade wind and come round again, painted small because a shadow's edge
is soft anyway and draped under the roads. `cloudField(t)` is pure and
seeded, so it is the same afternoon every visit.

**The route dots walk.** A dash array has no phase, so the ferry lines are
cycled through five arrays with a growing zero-length lead, and the dots
crawl toward the island with the tide.

## On a phone

The drawn island - the traced decagon a phone renders, with real points on
it - has the same weather now, in SVG, with no development build and no
native module: it runs in Expo Go as it stands.

- **The mist** is a mask: a parchment rectangle cleared by radial gradients
  around the places reached, through the same projection and tilt as the
  pins (`mistCircles` in `map-geometry.ts`), so the cleared circle sits on
  the ground plane, foreshortened like the island.
- **The water** is a tile of six crest marks repeated across the map and
  slid one tile per loop on the native driver, behind the island.
- **The cloud shadows** are the web map's own seeded `cloudField`, drawn
  twice side by side and slid one width per crossing, over the island and
  under the mist.
- **Reduce-motion** is one hook for everything - `useReduceMotion` reads the
  phone's setting and the web's media query - and the drawn mark's breath,
  which had claimed to stop under it for some time, now does.

`?map=drawn` on the web shows the phone's island in a browser, which is how
this was looked at.

## The Thai

The review tooling no longer flags what it should not: `{host}`-style slots
in notification templates, the initials of reporting standards (ESG, ISAE,
HCMI, CHSB, CF-Hotels), a template that is nothing but interpolations, and a
second rendering of one English phrase that is marked `// thai: intentional`
on its line. The pile it hands a native reader went from 22 to 0 - which
means the pile is now the whole 551 pairs, read for register rather than for
mechanics, and the page at `scripts/thai-review.mjs --html` is that pile.
Four things were changed in the source on the way: the ESG headline's
count now interpolates the same variable in both languages, the Missions
screen's Thai title is the tab's, the compass reads "กลับไปมุมมองทั้งเกาะ",
and the two intentional variants are marked.

## Still owed

- **A native Thai read** of the 551 pairs for register and naturalness, on
  the review page. A machine has nothing more to say about them.
