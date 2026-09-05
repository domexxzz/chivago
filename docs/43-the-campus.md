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
outline's box at street zoom (14 to 18.5), sets no terrain, lays no mist
and paints no sea or ferries — those are the island's — and raises the
buildings from the same OpenFreeMap tiles the roads already come from
(`fill-extrusion` on the `building` layer). OpenStreetMap knows the height
of one building on the campus, so the rest stand at four storeys: a drawing
convention, not a measurement, and this document says so.

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
- A drawing of the campus for phones.
- The stories (day two onwards in docs/42).
- The venue's Wi-Fi and the registration limit for the day; the PDPA notice.
