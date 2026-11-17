# The island diorama

A hand-styled 3D map of Ko Sichang, in the shape the reference board asks for:
a low-poly island floating in empty sea, its landmarks modelled and labelled.

This file is the part that has to live in the repository: the numbers, the
rules a build script enforces, and the reasoning behind both. The full art
direction - palette swatches, hero-by-hero silhouette briefs, the review
gates - is a separate document the artist works from.

## The brief, and the contradiction in it

Somebody who has never been to Ko Sichang should look for ten seconds and want
to go. Somebody who has been should be able to point and say *I stood there*.

Those two pull against each other. The first wants everything trimmed and the
proportions pushed; the second wants positions and building shapes to be
right. So the rule is: **lie about size, never about place.**

## The scale contract

| Class | Multiplier |
|---|---|
| Horizontal position and distance | ×1.0 |
| Terrain height | ×2.6 |
| Piers and bridges | ×3 |
| Ordinary buildings | ×5 |
| Hero buildings | ×8 |
| Trees | ×2.2 |
| Boats | ×3.0 |

The building numbers started at 1.8 and 2.2, which is what a building needs at
a close framing, and the first render killed them: a 31 m temple on a
six-kilometre island came out as four grey pixels. The map opens on the whole
island, so the multipliers have to suit that view. On the reference board a
temple is about 3% of the island's length - 180 m of ground here - and a 22 m
ubosot reaches that at ×8.

**The cost, said plainly.** Zoomed to 1.2 km, the closest the camera goes, a
hero is two thirds the width of a village. That is the trade a diorama makes.
The place to change it is the constant, for the whole class at once.

Horizontal is untouchable because people navigate with this map. Height and
object size are the lie, and it has to be applied per class, never per object.
A building nudged on its own is how a scene ends up "looking odd somewhere"
with nobody able to say where.

## Terrain is generated, not sculpted

`scripts/island-terrain.mjs` reads the same Terrarium elevation tiles
`terrain-style.ts` already loads, and writes a glTF.

```bash
node scripts/island-terrain.mjs --area koh-sichang --out apps/mobile/assets/islands/koh-sichang.glb
```

Measured on 17 November 2026:

```
4 tiles at z13, 139 KB
2,819 x 6,085 m, grid 52 x 112 at 55 m
7,164 triangles, highest 186 m before exaggeration
757 KB uncompressed
```

186 m is the island's real summit, which is the cheapest check that the
pipeline is reading the right ground.

**Zoom 13 and no deeper.** `terrain-style.ts` measured the archive on this
island: above z13 its NODATA upsample returns values like −2,021 m, about one
texel in two thousand, and each one is a needle through the ridge. The source
is SRTM at one arc-second, so z13 is the real resolution and everything above
it is interpolation of detail that never existed. The script drops any sample
outside −200…3,000 m rather than smoothing through it.

**No simplifier.** The grid spacing is chosen for the facet size the style
wants and the triangle count falls out of it: 55 m gives 7,164 against a
budget of 8,000, 70 m gives 3,950. Quadric decimation would be hundreds of
lines to reach the same count with less control over how the facets read.

**The shore comes from the OSM coastline, not from the elevation.** It was the
elevation at first, cut at 0.5 m, and the painted ground made the mistake
impossible to miss: an island half again too big with grass and sand in the
sea around it wherever the archive's noise landed above the line. Measured
over this bbox on 17 November 2026, against a real island of about 7.9 km²:

| threshold | land |  | threshold | land |
|---|---|---|---|---|
| > 0.5 m | 12.8 km² | | > 3 m | 10.7 km² |
| > 1 m | 12.3 km² | | > 5 m | 9.7 km² |
| > 2 m | 11.4 km² | | > 8 m | 8.4 km² |

There is no step anywhere in that curve, because SRTM smears a coast over
several metres. Every threshold is wrong, and the one that gets the area right
eats real coastal ground to do it. `--coastline` takes the surveyed line
instead; without it the script says in one line that the shore is wrong by
square kilometres rather than letting somebody find out later.

**One island per mesh.** The bbox catches neighbours, so only the largest
connected run of land survives. Ko Kham Yai is a real island with a quest on
it, so it gets its own bbox rather than a cleanup.

## The ground is painted, not photographed

`scripts/island-surface.mjs` draws the texture from OpenStreetMap - the same
data behind the vector tiles the map already loads.

```bash
node scripts/island-surface.mjs --area koh-sichang --width 2048
node scripts/island-terrain.mjs --area koh-sichang --spacing 55 \
  --coastline <cached osm.json> --texture koh-sichang.png
```

Measured on 17 November 2026:

```
683 ways · 487 areas, 179 lines
2,048 x 4,421 px over 2,819 x 6,085 m = 1.38 m a pixel
125 KB, plus 476 building footprints in a sidecar JSON
```

**Why not satellite.** Google, Bing, Apple and Esri all forbid deriving a
product like this from their imagery, and the imagery that is genuinely open
is Sentinel-2 at 10 m a pixel, which makes this island about 280 pixels wide
in total. There is no high-resolution orthophoto of Ko Sichang that may
legally be baked into a shipped asset. And the reference board has no
photography in it anywhere: the ground is flat colour with drawn paths, so a
photograph would produce a different product rather than a better one.

**What OSM has here**: 173 ways with a highway tag (40 of them paths), 478
buildings, 16 coastline ways, 3 beaches. The paths end up where the paths are
and the village ends up in the shape of the village. The building footprints
go to a sidecar file for whoever instances the houses - the chorus does not
have to be scattered by hand.

**ODbL.** Anything drawn from this data carries "© OpenStreetMap contributors"
wherever it is shown. That is a licence condition, not a courtesy.

**Vertex colour is left out when a texture is used.** Two colour sources over
one surface is how a texture ends up muddy, and the one drawn from real paths
and real buildings is the one worth keeping.

## Placement comes from the database

Every prop is positioned from the `lat`/`lng` already stored for that place,
projected with the same transform the heightmap used, then snapped to the
terrain. Nothing is placed by eye and remembered. The day somebody moves a pin
in the console, a hand-placed map starts lying and no test can tell.

Nine of the fourteen labels on the reference board already have real
coordinates in `bootstrap-koh-sichang.ts` and the seed. These five do not, and
need surveying before the art pass:

- Laem Chakraphong
- Chong Khao Khat
- Tham Chakraphong
- Customs Lighthouse
- Wat Chuthathit

## Gate one: the grey boxes

`scripts/island-blockout.mjs` puts a plain box where every landmark will
stand, from the coordinates the app already navigates to, so the composition
and the scale contract can be judged before anybody models anything.

```bash
node scripts/island-blockout.mjs --area koh-sichang --coastline <cached osm.json> \
  --village <village.json> --roads <roads.json>
```

**RUN IT WITHOUT THOSE FLAGS AND IT WILL SUCCEED, QUIETLY, AT BUILDING A
POORER ISLAND.** On 17 November it was run bare to pick up four new landmarks
and exited 0 with a cheerful summary — 17 landmarks, 7 heroes — having
dropped the 476 houses and every road, because those come from files it was
not given. The only sign was the file size: **390 KB where the shipped island
is 602**. Check that number before replacing the glb, or compare the two in
git; the summary line will not tell you.

The anchors sidecar is safe to regenerate on its own: it depends on the
terrain sampler and the place list, not on the village or the coastline, so a
bare run produces a correct `*.anchors.json` even when its glb must be thrown
away. That is how the four landmarks of 17 November got their names onto the
island while the model kept its village.

Run on 17 November 2026: **13 boxes, 6 of them heroes**, plus an anchors JSON
for the label layer. Three findings, none of them about the boxes:

**The southern half of the island is empty.** Every record is in the north,
because that is where the database's places are. The reference board has
landmarks the length of the island, and five of them have no coordinates yet
(above). As it stands, the long view from the south is half a diorama.

**Five anchors sit outside the surveyed shore**, and the script says so by
name on every run. Measured:

| | distance offshore |
|---|---|
| Tha Lang pier | 97 m |
| Tham Phang Beach | 44 m |
| Phra Chudadhuj Palace | 19 m |
| Atsadang Bridge | over water by definition |
| Ko Kham Yai | a different island |

The first and the fourth are right: a pier head is in the water. The palace at
19 m is coastline generalisation, not a wrong record. Tham Phang at 44 m wants
an eye on it. None of them is fixed by moving a coordinate - the database is
the truth and the shore is a drawn line - but a box standing in the sea has to
be a decision rather than a surprise.

**A shop row was given the shape of a jetty**, because the classifier matched
`/pier|bridge/` against the name and the record is called "Shop row by Tha
Lang pier". Classes now come from a list of ids. Anything that reads a name to
decide what a thing *is* will eventually meet a name like that one.

## The landmarks are built in code

`scripts/island-landmarks.mjs` builds each one from primitives - boxes, gable
and pyramid roofs, prisms, cones, domes - in the palette above. Ten archetypes
cover the island: the palace's teak houses on stilts, the white dome and chedi
of Wat Atsadang Nimit, the Chinese shrine's terrace and flag poles, the
mondop's tiered gold roof and spire, the cave monastery under its rock, the
museum's long block, a Thai ubosot, the lighthouse, a pier on piles, and the
ordinary roofed building everything else gets.

They are not the art. Every roof is flat planes and every curve is eight
segments. They carry the proportion, the colour and the stance, so a
composition can be judged and a silhouette specified - and so that nobody
reaches for an asset pack whose generic Thai temple would stand in for a white
European dome.

Assignment is by id, never by reading the name.

## The village stands where the village stands

`island-surface.mjs` writes out every building footprint OpenStreetMap holds
for the island. `island-blockout.mjs --village` builds a house on each.

```
460 houses placed, 16 skipped inside a landmark, 8,280 triangles
```

Scattering houses by hand would put a village somewhere plausible. This puts
it where it is, in roughly the shape it has - only the footprint's bounding
box survives, so the ridge runs along whichever side is longer, which is what
a roof usually does. Colour is chosen from the building's id, not at random,
so a rebuild produces the same village.

The sixteen skipped are the heroes' own footprints: without that clearance the
temple gets a tin-roofed house in the middle of it.

**Houses stand on the mesh, not on the archive.** Placed at the real ground
height a third of the village had its feet underground, because between the
mesh's 70 m nodes the surface is a flat facet several metres above the ground
it was built from. Placement takes the highest corner of the cell: a building
that floats a little reads as a building on a plinth, one that sinks reads as
a bug.

**×2.4, not the ordinary ×5.** A few hundred houses at the building multiplier
merge into one grey mass, which is a suburb rather than a village.

## Roads, and a village that is laid out

`--roads` builds the network as ribbons on the terrain: 174 ways, widened
x4 because at the real seven metres a lane is four pixels on a six-kilometre
island, and lifted clear of the ground it lies on. A segment with an end
outside the surveyed shore is not drawn - the mesh is one island and
OpenStreetMap's ways run on to the others, so the first pass had a lane
looping through open water beside Ko Kham Yai.

The village is tidied in three steps, none of which invents anything:

1. **Drop the sheds.** A footprint under 26 m² is a garage or a water tank.
2. **One building to a plot.** Where two survive within 26 m the larger
   stands: at this scale they overlap into one blob anyway, and the blob
   reads as clutter rather than as two houses.
3. **Face the lane.** Each house turns square to the nearest road. Without it
   every roof points north and a few hundred footprints read as a crate yard;
   with it the same footprints read as streets.

```
240 houses of 423 on this island
0 too small, 169 sharing a plot, 14 inside a landmark, 53 on another island
```

## Looking at it

Nothing on this toolchain opens a glTF: the preview pane refuses a local file
and a static server is not always available. So the thing every gate is judged
by was the one thing nobody could see.

`scripts/island-preview.mjs` renders a .glb to a PNG - a scanline rasteriser
with a depth buffer, supersampled three times, lit by the rig above. Not a
renderer to ship behind; a renderer to decide with.

```bash
node scripts/island-preview.mjs koh-sichang.glb --out preview.png --yaw 20 --pitch 30
```

It paid for itself immediately. Three things it caught that no test did:

- **Every face in the landmark file was wound inside out.** Under a flat
  Lambert with a floor it looked merely dull; under this rig the roofs came
  out near black, because a roof facing down gets nothing but the sea bounce.
- **A building sits on a plinth**, so the box's underside and the plinth's top
  are one plane, and at equal depth float error decided which was drawn. Back
  faces are culled now, which settles it.
- **A wall out of the sun rendered black**, because the sky term clamped to
  `max(0, n.y)` and a vertical face then sees no sky at all. A vertical
  surface sees half the sky and half the water. Both terms say so now.

## Technical budget

| | Ceiling |
|---|---|
| Triangles, whole scene | 120,000 |
| Draw calls | 60 |
| Materials | 5 |
| Textures | none - vertex colour only |
| File size, compressed | 3.5 MB |
| First frame on 4G | 2.5 s |
| Frame rate | 30 fps on a three-year-old mid-range phone |

Loaded lazily when the map tab opens. The main bundle is large enough already.

## Where it runs

The same place MapLibre runs: inside a WebView. `three` is already a
dependency and `ChivarBot3D` already draws with it on web. Expo Go cannot take
a native module, which is what kept MapLibre's native binding off phones and
what rules out `expo-gl` here. A browser library inside a browser is the
trick that works on the toolchain this project actually uses.

## Labels are HTML, not geometry

Projected from 3D to screen each frame and drawn as DOM. Thai text in a
texture atlas loses its vowel and tone marks to blurring and misplacement;
HTML keeps IBM Plex Sans Thai crisp at every zoom and gives a 44 px tap
target for free. At most seven labels at once, ranked by distance and
importance; the rest collapse to dots.

**The dot is the place; the pill is only its name.** Measured on 17 November,
after a screenshot showed seven labels stacked in a column over the sea: the
layout sorted by DEPTH and moved each label below the last by a fixed step,
whatever the horizontal distance between them, so places spread across six
kilometres collapsed into one row in an order matching nothing a person could
see. Depth now chooses *which* seven are named; the screen decides *where* the
names go, and a label only moves when it would cover one already placed -
which means overlapping on **both** axes.

Two things this paragraph used to claim that the code had never done, and now
does:

- **every place on screen gets a dot**, not only the seven that are named, so
  the island stops looking emptier than the database it is drawn from;
- **a leader line joins a displaced name to its dot.** It cannot be "the same
  length and angle on every label" - that is a static board's luxury, and this
  camera orbits. It is drawn only when the name had to move, in whichever
  direction it moved, and the dot is what stays put.

## Camera

Constrained, never free. ±35° of orbit from the default, 24°–55° of pitch. The
default view looks from the south, because that is how the ferry arrives and it
is the view anyone who has been will recognise.

**Dolly: 1.2 km in, and out to whatever frames the island.** This paragraph
used to say "1.2–3.5 km", a range that did not contain the view the map opens
on. Measured 17 November from the model itself: the Ko Sichang mesh is 2,871 ×
5,976 m, and the framing that fits it is 6,872 m back. The far end is therefore
not written down — it is read off the island when it loads, because there is
nothing to see further out than the whole island, and a second island of
another size would need a different number. Only the near end is a constant,
`CAMERA.zoomMin`.

**Three ways to work it, because the first two are invisible.** Pinch with two
fingers, a wheel or trackpad, and a pair of buttons in the corner. The map
lives in a 320 px band inside a page that scrolls, where a two-finger gesture
is neither obvious nor comfortable; the buttons are how zoom is discovered at
all and the only way to use it one-handed. They disable themselves at each end
of the range, because a control that still looks live at the limit is a small
lie told every time somebody presses it.

One finger turns the island, two change how close you are. Both gestures come
down the same pointer events, so which one is happening is decided by how many
are on the glass, never by guessing at the device. When a pinch ends with one
finger still down, that finger starts a *new* turn from where it is — without
that the island jumps the moment the other finger lifts, which is the most
common way a two-gesture map feels broken.

## What would make this bad

- Too many trees. The island becomes a green carpet and the buildings vanish.
- Saturated colour on ordinary buildings, so nothing reads as important.
- Real-time shadows, which cost frames on a phone and look worse than baked.
- Detail under 1.5 m, which nobody sees and which eats the budget.
- Stock models for the hero buildings. Wat Atsadang Nimit is a white European
  dome; a generic Thai temple asset in its place is wrong to anyone who has
  been there.
- The map and the database disagreeing. This product sells the credibility of
  its data. A map that points at the wrong place once discredits all of it.

---

## The page runs at an opaque origin, and that decides what it may fetch

Measured on 17 November 2026, on production, after three rounds of making the
island file smaller had failed to make it appear.

A WebView handed bare HTML (`source={{ html }}`) has an **opaque origin**, and
so does an iframe with `srcDoc` — which is both of the places this page runs.
Every request such a page makes is therefore cross-origin, and **an ES module
import is always fetched in CORS mode**. Workers Assets sends no
`access-control-allow-origin` of its own, so:

```
import * as THREE from 'https://chivargo.com/vendor/three-0.170.0.min.js'
```

was refused by the browser **before the module body ran**. Nothing in the page
could report it, because nothing in the page had executed. The spinner stayed
up, which a person reads as *slow* — and two commits were spent making a thing
faster that was not happening at all.

The fix is in `apps/mobile/public/_headers`:

```
/islands/*
  access-control-allow-origin: *
/vendor/*
  access-control-allow-origin: *
```

**Anything new the page fetches needs the same rule.** A texture, a second
island, a font: add the prefix to `_headers` *and* to
`apps/api/src/served-from-export.ts`, or it is invisible twice over — 401 for
not being listed, then CORS-blocked for not being allowed.

Proven from an opaque origin after the fix: module ran at 3 ms (three.js r170),
`koh-sichang.glb` fetched whole, 616,752 bytes, at 16 ms.

### And the page must be able to say when it cannot start

Because the failure happened before any of the page's code ran, the page could
not draw its own error. Two things now cover that:

- a **watchdog in the classic script** — the one block guaranteed to execute —
  which reports any resource error and anything still not started after ten
  seconds;
- the reason is held **on the React side**, not in the page, so there is always
  something able to draw it, with a line pointing at the flat map.

A diorama that fails should say so in one second, not look slow for ever.
