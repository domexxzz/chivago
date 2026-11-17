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
node scripts/island-blockout.mjs --area koh-sichang --coastline <cached osm.json>
```

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
importance; the rest collapse to dots. Leader lines are the same length and
angle on every label - that consistency is most of what makes a board like
this look designed.

## Camera

Constrained, never free. ±35° of orbit from the default, 28°–55° of pitch,
1.2–3.5 km of dolly. The default view looks from the south, because that is
how the ferry arrives and it is the view anyone who has been will recognise.

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
