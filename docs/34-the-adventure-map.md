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

## Still owed

- **Fog of war.** The ledger knows which places this person has been to;
  the map could draw the rest as uncharted and reveal it as they go. That
  is the honest version of "exploration", derived from evidence, and it is
  not built.
- **Water that moves.** The sea is a flat fill. A shader with a little
  swell would be worth its weight.
- **A native Thai read** of the two new strings, through the review page.
