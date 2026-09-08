# 43 — The campus

The second area: Kasetsart University's Si Racha campus, in Chon Buri. Day
one of the plan in `42-ku-sriracha-story-hook.md` — the part that has to be
true before a story can be pinned on it.

## What opened

Chon Buri (TH-20) was marked `open` in `provinces.ts` since the seventy-seven
provinces landed, with nothing in it. It has five places now, read from
OpenStreetMap on 2026-09-05 (the campus outline is way 1408248543; every
place below is a mapped feature at these coordinates):

| id | Place | Layer | From OSM |
|---|---|---|---|
| `ku-library` | 10th Anniversary Memorial Library · หอสมุดอนุสรณ์ 10 ปี | Safe | way 1408274339 |
| `ku-park` | Campus park and lake | Green | way 753194128, the lake beside it |
| `ku-viewpoint` | Sapandao viewpoint · จุดชมวิวสะพานดาว | Quest | way 753194714 |
| `ku-sports` | Sports centre and fields | Wellness | way 753195247 and three pitches |
| `ku-shops` | Shop row by building 25 | Food | two cafés and a convenience store |

One place per layer, so every companion can hatch on the campus.

Two quests, hosted by **the team** — `SEED_HOSTS.kuTeam`, "ChivaGo team ·
KU Sriracha", its own host record so its queue and its statement never mix
with the platform's island quests. `q7` is a clean-up at the viewpoint,
Green, environmental, 100 m fence; `q8` is a walk round the lake, Trip,
120 m. The seed prints the team's console key once, like every host's.

## The air is measured here

Every campus place carries `airStation`: Pollution Control Department station
`o61`, สนามกีฬาเทศบาลแหลมฉบัง, **300 m** from the campus centre (13.11923,
100.91855, read from the Air4Thai feed). It is the first ground station
within reach of any place in the app: Samui's nearest is 87 km away and can
only cross-check the 11 km model.

`getAir` takes the station as a last argument. When it is there, the reading
is the station's — AQI and PM2.5, provenance `live`, a source that says
*Air4Thai · … · 0.3 km · ground station* — and it is remembered under the
place's own grid cell so the thirty-day history (docs/37) reads it like any
other sample. The country-wide feed is one request per TTL however many
campus places are scored; an offline station (Air4Thai's `-1`) is cached as
a miss. A station that does not answer falls back to the model, labelled as
the model. The island asks no station at all.

The other metrics on the campus — crowd, safety, walkability — are the
team's estimates pending a survey, exactly as Samui's were, and they are
held below the accent-pin threshold by a test: an estimate does not earn the
colour that says *measured*. There is no photograph on any campus place.
Commons had none of the campus on 2026-09-05, only faculty logos; the team's
own photographs, used with permission, are owed.

### The feed that had never been reachable

The station did not answer the first time the campus was scored, and
neither, it turned out, had the Samui cross-check on any request from this
process. `air4thai.pcd.go.th` serves a Let's Encrypt leaf signed by the YR1
intermediate but sends Sectigo's intermediates under it; a browser fetches
the right link for itself, Node does not, and on Linux nothing would. Every
Air4Thai request had been `fetch failed`, swallowed, and cached as a miss
for half an hour. The two missing links are bundled in `apps/api/certs/`
(from letsencrypt.org, fingerprints checked against the leaf's own AIA
pointers), sent with each request, with trust still ending at ISRG Root X1;
a miss is now believed for five minutes, not thirty; and a failure is
logged with the directory's name. Verified live: `ku-park` answered
*Air4Thai · Laem Chabang Municipal Stadium (PCD o61) · 0.3 km · ground
station*, AQI 22, PM2.5 13.4, and the demo fixtures carry it.

## One area at a time

`packages/core/src/areas.ts`: an **area** is what a screen frames at once —
the island, or the campus — and is derived from a place's province, so
nothing is told twice. The app keeps the chosen area the way it keeps the
language (`state/area.ts`): the page URL first, so `?area=ku-sriracha` on a
QR code lands there; then the stored choice; then Samui. Home and the map
carry a two-chip switch.

What frames itself by area: Home's conditions, places and today's quests;
the map's pins and quest marks; the concierge's context; and the day plan —
`POST /trip/plan` takes `area` and plans inside it, on the API and in the
static demo alike, so a Samui day never routes through a campus 400 km
away. `?place=` on the URL opens a place at start-up, for the QR at a pin.

## The campus map

On the web, `TerrainMap` takes the area. For the campus it frames the
outline's box at street zoom (14 to 18.5), lays no mist and paints no sea or
ferries — those are the island's — and raises the buildings from the same
OpenFreeMap tiles the roads already come from (`fill-extrusion` on the
`building` layer).

### The campus is not flat, and the map said it was

For a fortnight this section read "sets no terrain", with a comment in the
code explaining that a campus has no relief "to speak of". That was wrong,
and it is why the map looked like a green sheet with beige boxes on it.

Decoding the elevation tiles the island's map already uses, over the campus
box:

| | metres |
| --- | --- |
| west gate, lowest | 10.4 |
| median | 37.8 |
| the ridge, highest | 190.7 |
| **relief across the campus** | **180.3** |

One hundred and eighty metres is a hillside. The Sapandao viewpoint is named
for being on top of it.

Two things were hiding it. Terrain was switched off for the campus on the
strength of that wrong belief. And the elevation source carried
`maxzoom: 13` — invisible on the island, framed between zoom 9 and 15.5, and
fatal on the campus at 14 to 18.5: a zoom-13 tile stretched to zoom 18 is
one height sample per 250 m of ground, so even with terrain on it would have
rendered as a smooth ramp. The archive has tiles to zoom 15 and returns 404
at 16, so the source now says 15 — the floor of the real data, not a number
picked for looks. That is sixteen times the samples over the same ground,
and it sharpens the island's ridges too.

The campus is lifted at 1.15 rather than the island's 2.0. Khao Pom is 635 m
seen from twelve kilometres and needs the help; 180 m seen from one does
not, and at 2.0 the ridge behind the library reads as an alp.

### What else was flattening it

**The fog.** The style's is written for the island, where the far edge of the
frame is Ko Pha-ngan twelve kilometres out. Over a campus a kilometre and a
half wide the same fog put a grey wash over a hillside fifteen minutes' walk
away. The campus now gets its own sky with the ground blend pushed almost to
the back.

**The colour ramp.** It had four stops below 160 m, tuned for Samui's coconut
plain — and the whole campus lives inside that range, so every pixel of it
fell in one interpolation span and came out one flat wash. Stops at 25, 85
and 125 m now crowd the first two hundred metres. The campus spans eight of
them instead of three.

**No grass.** A university is playing fields and lawn between the blocks, and
the survey has drawn them — four parks, five pitches. Nothing rendered them.
There is now a `grass` layer, and the woods firm up as the camera comes in
(0.42 at island distance, 0.68 at campus distance), because a wood you are
standing under is not a tint on a distant hillside.

### The campus had no streets

The style drew four road classes - motorway, trunk, primary, secondary -
which are the island's roads seen from ten kilometres. A university campus
has NONE of them. Its network is service roads, residential streets and
footways, so the blocks stood in an open field with nothing running between
them, and that is most of why it did not read as a place.

Service roads, minor streets and tracks now draw from zoom 13, with the same
casing-and-fill the main roads use; footways draw dashed from zoom 14,
because a path is dashed on every map anyone has ever read.

### The buildings

OpenStreetMap has **75 buildings** on this campus and the height of **two** of
them — one of five storeys, one of eight. It does record what every one of
them IS: 19 university, 9 dormitory, 7 hospital, 6 roof structures, 5
industrial, 4 apartments, 1 retail, 24 unspecified.

A measured height wins where the survey has one. Otherwise the height and
the tint come from the kind, which is a DRAWING CONVENTION and not a
measurement — but a convention keyed to something the survey actually
recorded, which the old one (every building at four storeys, all in the same
beige) was not. A hall of residence is taller than a shop, everywhere.

A block still read as a lozenge, because MapLibre paints every face of an
extrusion the same colour. Three things fixed that:

- **A roof.** The walls stop 1.3 m short and a second extrusion sits on top
  of them in a roof colour - adjacent rather than overlapping, so the two
  never fight for the same pixels. What it buys is the line where wall meets
  roof, which is most of what tells an eye building rather than box.
  The survey records nothing about these roofs - no shape, no material, no
  colour, on any of the 75 - so it is ONE colour for all of them rather than
  a per-building invention dressed as a survey. It is also lighter than
  instinct suggests: the first pass was a mud brown and at this pitch, where
  the roof is most of what you see, every block came out a slab.
- **A shadow.** The footprint again, dark and soft, pushed a few pixels away
  from the light - the same illumination bearing the hillshade uses, so the
  buildings and the ground agree about where the sun is. A block with
  nothing under it floats.
- **Closer, but not by a fixed number.** The settled zoom went from 15.7 to
  16.2, because a building drawn six pixels tall is a smudge whatever colour
  it is. Sixteen point two was then judged against a laptop — and a single
  zoom number frames a different amount of ground on every screen. On a
  390-pixel phone it cropped two of the five places clean off the map: the
  sports fields past the left edge, the viewpoint above the top, and a place
  you cannot see is worse than one you cannot name. The campus is framed by
  GROUND WIDTH now (`campusZoom`): every doubling of the container is worth
  one zoom level, measured from the width the pose was actually judged
  against, clamped either side so a narrow frame never backs off to a smudge
  and a wide one never presses its nose against a single lecture hall.

On a phone the drawn island is Samui's silhouette and nothing else, so the
campus is its list until it has a drawing of its own. Not the island with
campus pins on it — that would put the library in the Gulf of Thailand.

## Tests

- `areas.test.ts`: every open province has an area; every campus place is
  inside the OSM outline, carries station o61 within a kilometre, has no
  photograph from nowhere; every layer is present; the campus quests are the
  team's and keep fences at campus size.
- `healthy-score.test.ts`: the design comps are the island's five, and only
  theirs; no campus place crosses the accent threshold on an estimate.
- `air.test.ts`: the station is the reading and says so; one feed for the
  whole campus; a silent station leaves the model, labelled; the island asks
  none.
- `campus.test.ts` (mobile): Home on the island shows no campus, Home on the
  campus shows no island, and the chip switches. `area.test.ts`: the URL is
  honoured and nonsense is not.
- The island-only tests (projection, de-collision, the planner's count, the
  handful of model cells) now say they are the island's.

## Still owed

- The team's photographs of the five places, with permission.
- A drawing of the campus for phones. The hillside is web-only, like the
  rest of the real map.
- **Aerial imagery.** The ground is coloured by height and land cover, not
  photographed. Free tiles at campus zoom, with terms that allow this, were
  not found; every candidate wanted a key, which the map does not carry.
- The stories (day two onwards in docs/42).
- The venue's Wi-Fi and the registration limit for the day; the PDPA notice.
