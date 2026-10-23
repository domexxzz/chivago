# 67 — The second island

Ko Sichang, in Chon Buri: twelve kilometres off Si Racha, six kilometres
long, and the first place the terrain hero would draw that is not Koh Samui.

**Built on 2026-10-23.** This began as the survey that had to come before
the commit; what follows is still that survey, with a section at the end
saying what was done with it and what it cost. Read it in that order: the
measurements first, then the one thing that had to change before an area
could exist at all, then the island as the app now draws it.

Everything numbered below was measured on 2026-10-23 from the two sources
the map already uses — the AWS terrain archive and OpenFreeMap's planet
tiles. Nothing here is from memory.

## What it measures

Flood-filled from a seed at 13.155 N, 100.806 E over the terrarium tiles at
zoom 14 (9.3 m per sample), everything above one metre:

| | |
| --- | --- |
| bounding box | 13.1243 – 13.1818 N, 100.7975 – 100.8208 E |
| north to south | 6.36 km |
| east to west | 2.53 km |
| ground above 1 m | 10.5 km² |
| lowest | 1.0 m |
| median | 23.3 m |
| ninth decile | 66.6 m |
| **highest** | **187.8 m** |

The mask is generous — a nine-metre grid bleeds over a shoreline, and the
figure to trust is the shape, not the third digit.

**It is a steeper island than Samui, not a flatter one.** Samui is 635 m over
25 km, about one in thirty-nine; Sichang is 188 m over 6.4 km, about one in
thirty-four. The campus, for contrast, is one in eight. So the island
exaggeration of 2.0 is close to right here and the campus's 1.15 would be
wrong — which is the opposite of what "a small island" suggests, and the
reason to measure rather than assume. The named summit in the tiles is
เขาพระจุลจอมเกล้า, which the `mountain_peak` layer already carries.

## The problem that has to be solved first

**An area is derived from a province, one to one, and Sichang is in Chon Buri
— where KU Sriracha already is.**

`areaOfProvince` in `packages/core/src/areas.ts` is the spine of the whole
area mechanism:

```
export const areaOfProvince = (province: string): AreaKey =>
  AREAS.find((a) => a.province === province)?.key ?? DEFAULT_AREA;
```

`find` returns the first match. Add Sichang with `province: 'TH-20'` and
every Sichang place is filed under whichever of the two is earlier in the
array — the campus would show the island's places, or the island the
campus's. It is not a map bug; it is Home, the map, the concierge, medals,
stories and stalls, all of which filter with exactly this call:

- `HomeScreen.tsx:162`, `MapScreen.tsx:148`, `ConciergeScreen.tsx:59`
- `medals.ts:176` and `:180`
- `story-service.ts:287`, `stalls.test.ts:26`

Two tests state the one-to-one as a rule, and both would have to change:
`areas.test.ts:22` ("every open province has exactly one area") and
`apps/mobile/test/area.test.ts:39` (`areaOfProvince(a.province) === a.key`
for every area).

### The smallest honest fix

Keep the province for the passport, which is what a province is for, and
decide the AREA by geography, which is what an area is for. `inArea` already
exists and does it:

```
export const areaOf = (p: { lat: number; lng: number; province?: string }): AreaKey =>
  AREAS.find((a) => inArea(a, p))?.key ?? areaOfProvince(p.province ?? '');
```

The two Chon Buri boxes do not overlap, so this is unambiguous: Sichang ends
at 100.8208 E and the campus begins at 100.9173 E, six kilometres apart —
wider than `MARGIN_DEG` either side. The province fallback keeps every
existing place answering exactly as it does today, so the change is additive
and the only call sites that need to move are the seven listed above.

The alternative — an explicit `area` field on `Place` — is more honest still
and more typing; it is the right answer if a third Chon Buri area ever
appears inside one of these boxes. Not yet.

## What the survey already has

From OpenFreeMap's own vector tiles, the eight zoom-14 tiles that cover the
box. These are the features the map would draw, not a wishlist:

| layer | on Sichang |
| --- | --- |
| `poi` | 242 features, 216 of them named |
| `transportation` | 69: 21 path, 19 pier, 12 service, 8 minor, 6 track, 2 ferry, 1 rail |
| `landcover` | 14 grass, 8 wood, **7 sand** |
| `water` / `water_name` | 23 / 28, including Ao Khao Khat · อ่าวเขาขาด |
| `mountain_peak` | the summit, named |
| `place` | **3** |
| `building` | **7** |

Named and ready to be pinned, among others: Phra Chudadhuj Palace (tagged
`park`), Wat Tham Yai Prik · วัดถ้ำยายปริก, Wat Chutathit Thammasapharam
Worawihan, Chao Por Khao Yai Shrine · ศาลเจ้าพ่อเขาใหญ่, Kuan Yin Shrine,
Itsariyabhorn Pass (Khao Khat) · ช่องอิศริยาภรณ์, Ratchakosa Lookout ·
จุดชมวิวราชโกษา, Silasapphasat Royal Throne, the Mundthat Ratanaroj
foundations, the King Rama V monument, Sichang Marine Animal Banks, and
Ko Sichang Tha Lang Pier · ท่าเรือเกาะสีชัง (ท่าล่าง). Five viewpoints,
three Buddhist temples, seventeen places to sleep, seven restaurants.

This is a well-surveyed island. Two numbers in that table are not.

### Seven buildings, and three places

**`building` has seven features here, against seventy-five on the Si Racha
campus.** Whatever the 3D buildings do for the campus at street zoom, they
will do nothing for Sichang. Do not plan a skyline.

**`place` has three features: `Ko Si Chang` (town), `Saphan Khoo Community`
(neighbourhood), and `Ko Sichang` (island).** That number decides two things
that shipped yesterday:

- `place-labels` filters to `class in [town, village]` with an English name.
  On Sichang that matches **one feature**. The island would carry a single
  label.
- the lanterns (docs/36, and the night pass of 2026-10-22) filter to
  `city, town, village, hamlet, suburb`. Same one feature. **The island
  would show one light.**

A single lamp on a dark island is worse than none — it reads as a bug rather
than as a village. Three ways out, in order of how much they claim:

1. add `neighbourhood` and `quarter` to `LIT_PLACES`. Cheap, and worth two
   lights here instead of one. Still not a lit coast.
2. light the `poi` layer where it is dense — seventeen places to sleep and
   seven restaurants are where the people actually are, and they cluster
   along the east shore exactly where the town is. This is the honest one:
   a lamp where the survey records somewhere that is open at night.
3. accept one light and let the hillshade and the surf carry the night.

Whichever, it is a per-area decision, not a global one, and the filter
should say so.

### No roads at the hero pose

The island's road classes are `service`, `minor`, `track` and `path`. There
is **no** motorway, trunk, primary, secondary or tertiary feature on Sichang.

The style draws `roads` / `roads-edge` from those four main classes at every
zoom, and `lanes` / `lanes-edge` (tertiary, minor, service, track) only from
zoom 13, `paths` from 14. Samui's hero settles near zoom 10.5; an island a
quarter the size fits about two levels closer, so Sichang's hero would
settle near 12.5 — **below every minzoom that could draw one of its roads.**
The island would render as green relief with no network on it at all, which
is the campus's "had no streets" failure (docs/43) arriving by a different
road.

The fix is the same shape as the campus's: let the minzoom follow the area's
own frame rather than a number tuned for a 25 km island.

Nineteen `pier` ways, and the style has no pier rendering. On an island
reached only by boat, the pier is the front door.

## Where the map says island and means Samui

Four hard couplings, all in the two files touched yesterday:

| | |
| --- | --- |
| `terrain-style.ts:52` | `SAMUI_BOUNDS`, built from `SAMUI_BBOX` — the camera lock |
| `terrain-style.ts:859` | `heroPose` centres on `SAMUI_BBOX`, whatever zoom it is handed |
| `terrain-style.ts:1064` | `FOG_BOUNDS` — `SAMUI_BBOX` padded by `FOG_PAD_DEG` = 0.6° |
| `TerrainMap.tsx:616` | the `campus ? box : SAMUI_BOUNDS` branch |

The fog padding is the one that will not scale by itself: 0.6° around
Samui's 0.2°-wide box is a sensible margin; around Sichang's 0.023° box it
is fifty times the island, and the mist canvas would spend its 1024 pixels
on open sea. It wants to be a multiple of the box, not a constant.

Everything else in the style is already area-agnostic, and that is worth
saying plainly: the surf band, the deep-water ramp, the hillshade, the
swell, the sky and the lantern breath are all written against elevation,
land cover and the clock. **They would draw Sichang correctly on the day the
camera is pointed at it.** The island map was built for Samui but not around
it.

### On a phone it would draw Samui

`SamuiMap.tsx` sends any area whose `map` is not `'island'` to `CampusList`,
and everything else to `IslandMap` — which draws `ISLAND`, a traced decagon
of Koh Samui, and hangs the pins on it. An area keyed `map: 'island'` and
pointed at Chon Buri would put Phra Chudadhuj Palace on Samui's west coast.

That is the same error docs/43 refused for the campus ("that would put the
library in the Gulf of Thailand"), and it needs the same answer: the drawn
map is Samui's until Sichang has a silhouette of its own, so Sichang on a
phone is a list, or `map` grows a third value and `IslandMap` is told which
island it is drawing.

## The air

The nearest ground station is still PCD `o61`, สนามกีฬาเทศบาลแหลมฉบัง, the
campus's own — **12.4 km** from the island's centre, measured from the
station coordinates in `air.ts`.

That is inside `CROSS_CHECK_REACH_KM` (150), so it may cross-check. It is
not a ground reading for the island, and the doc should resist calling it
one: the campus earned the `live` label at 300 m, and 12.4 km across open
water is further than the CAMS model's own ~11 km cell. **Sichang gets the
model, labelled as the model** — like Samui, and for a better reason than
Samui, because here the cross-check is close enough to be worth running.

No `airStation` on any Sichang place unless a nearer one is confirmed.

## The five places

A proposal, not a survey. One per layer so every companion can hatch, drawn
from features that are already in the tiles:

| layer | candidate | in the tiles as |
| --- | --- | --- |
| Safe | Phra Chudadhuj Palace · พระจุฑาธุชราชฐาน | `poi` park |
| Green | Itsariyabhorn Pass / Khao Khat · ช่องอิศริยาภรณ์ | `poi` viewpoint |
| Wellness | Wat Tham Yai Prik · วัดถ้ำยายปริก | `poi` buddhist |
| Food | the town front by Tha Lang pier | `poi` restaurant cluster |
| Quest | Sichang Marine Animal Banks | `poi` aquarium |

Each needs what every seeded place needs and none of which exists yet: a
host who will stand behind it, coordinates checked on the ground, a
photograph with permission, and metrics that are honestly marked as
estimates until somebody surveys them — held below the accent threshold by
the same test that holds the campus's.

## Still owed

- The decision above: geography-derived area, or an explicit field.
- A host on the island. Nothing can be quested without one.
- Photographs. Commons was not checked for Sichang; the campus's lesson was
  that it had nothing usable.
- A silhouette, if the phone is to draw it at all.
- The ferry: two lines are in the tiles and three terminals are named, but
  the timetable, the operator and the crossing time are not in any source
  the app reads. `52-getting-there.md` and `53-the-way-there.md` assume an
  island you are already on.
- Whether a second area in one province breaks the passport's idea of a
  visit. `medals.ts` counts by area and by province in the same file.


---

## What was built

Five places, one area, and one change to how an area is decided.

### The places

| id | layer | coordinates | from |
| --- | --- | --- | --- |
| `sichang-crab-bank` | Quest | 13.15539 / 100.81364 | OSM `poi`/aquarium, "Sichang Marine Animal Banks" |
| `sichang-marine-station` | Safe | 13.15539 / 100.81364 | **anchored** — not in OSM |
| `sichang-clean-energy` | Wellness | 13.16130 / 100.81037 | **anchored** at OSM `poi`/taxi, "Motor Rickshaws" |
| `sichang-palace` | Green | 13.14908 / 100.81759 | OSM `poi`/park, "Phra Chudadhuj Palace" |
| `sichang-pier-front` | Food | 13.16186 / 100.81078 | OSM `poi`/ferry_terminal, "Ko Sichang Tha Lang Pier" |

Four came from the brief. The fifth, the pier front, did not: an area with
no Food place is an area where one companion cannot hatch, which is the rule
the campus was built to. It is the PIER rather than one of the seven
restaurants around it, because naming a single business is an endorsement
the app has not earned and cannot keep current.

**Two of them are anchors, and the data says so out loud.** The Chulalongkorn
marine station and the clean-energy programme are both real and neither is
in OpenStreetMap — nominatim returns nothing for either, under four
spellings. Rather than invent a coordinate from a name, each stands at the
nearest mapped thing and carries `Site unverified` in its own `meta`, which
is text a reader sees on the card. A test holds that: the two anchored ones
must say it, and the three mapped ones must not.

The clean-energy entry is also the one place here that is not a place. It is
a programme — electric skylabs, separated waste, a community learning point
— and a programme has no coordinate. It stands at the skylab rank by the
pier, which is the one piece of it the survey records and the point where a
visitor actually meets it.

Every metric is an estimate and the island has no `airStation`: the campus's
`o61` is 12.4 km off across open water, further than the air model's own
~11 km cell. `healthy-score.test.ts` now holds **every area but Samui** to
the no-accent-on-an-estimate rule, where it used to say `map === 'campus'`
and would have let an island walk past a rule written for a shape rather
than for its evidence.

### The change that had to come first

`areaOf(place)` decides the area from GEOGRAPHY, falling back to the
province. Seven call sites moved onto it — Home, the map, the concierge,
two in medals, the story service, the stall check — and `MedalPlace` grew
`lat`/`lng` to make the medals one possible.

`areaOfProvince` stays, because the passport counts provinces and that is
still exactly right. What is gone is the assumption that the two are the
same question.

Three tests that had encoded the old rule were rewritten rather than
deleted, and each says why in place:

- "every open province has **exactly one** area" became "**an** area", plus a
  new test that no two area boxes overlap — because if they did, `areaOf`
  would be a coin toss;
- `areas.test.ts` filtered the campus's places by `province === 'TH-20'`,
  and would have quietly asserted that five island places sat inside a
  university fence, carried its ground station and wore its photographer's
  credit. It filters by `areaOf` now;
- `area.test.ts` asserted `areaOfProvince(a.province) === a.key` for every
  area, which cannot be true of two areas in one province.

### The map

The island hero frames the area's own box. Four things that said "Samui" now
take a box: `boundsOf`, `heroPose`, `introPose`, and `fogBounds`. Three
constants that were degrees became fractions, which is the same bug three
times:

| | was | now |
| --- | --- | --- |
| `HERO.latAboveMiddle` | 0.025° | 0.11 of the box's height |
| intro offset | +0.03°, −0.09° | 0.15 of the width, 0.39 of the height |
| fog padding | 0.6° | 2.6 boxes |

On Samui all three are the numbers they always were, because that is where
they were read. On Ko Sichang the old ones put the camera's intro a mile and
a half past the island, outside the frame it is locked to, and spent nine
tenths of a 1024-pixel mist canvas on open sea.

On a phone, `SamuiMap` asked `map !== 'island'` and now asks
`key !== 'samui'`. The drawing it falls through to is a decagon traced from
Samui's coastline; the old question would have put Phra Chudadhuj Palace on
Samui's west coast. `CampusList` is `PlaceList` now and its one line of copy
no longer says "campus", because it serves an island too.

## Still owed

- **The static demo.** `fixtures.json` has none of this, and two tests say
  so by name. Recapturing it needs `demo:reset` — which rebuilds the demo
  account's five days of history — and then `demo:capture` against a running
  API. Not run here: it overwrites local demo state that was not mine.
- **A ground check** for the marine station and the clean-energy learning
  point, which would turn two anchors into two coordinates.
- **A host.** Nothing can be quested on this island until somebody stands
  behind it, and no quests are seeded.
- **Photographs**, with permission. Commons was not checked.
- **A silhouette**, if a phone is ever to draw this island rather than list
  it.
- **The ferry.** Two lines are in the tiles and three terminals are named;
  the timetable, the operator and the crossing are in no source the app
  reads.
- Whether a second area in one province breaks the passport's idea of a
  visit. `medals.ts` counts by area and by province in the same file.
