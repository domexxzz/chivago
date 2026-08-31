# Place photography

The five places have no photographs. This document is about why that is still
true, and what was built so that fixing it is a data change rather than a code
change.

## What I would not do

The obvious shortcut is to generate five convincing images of Chaweng Beach,
Na Muang Waterfall, Fisherman's Village, Lamai Yoga Shala and Thong Krut
Mangrove, and put them in the app.

That is fabricating a record of real places. Every other claim in this codebase
is built to be checkable — a review needs a geofenced check-in, a score returns
its breakdown, a fare carries the date it was true — and a generated photograph
presented as a place would quietly undo all of it. It would also be the easiest
thing on the pitch stage for anyone who knows Samui to catch.

So the five heroes are still not photographs, and the app now says so.

## What was built instead

**A photo is no longer a URL.** `photoUrl: string | null` became:

```ts
photo: {
  url: string;
  credit: string;         // photographer or rights holder
  licence: string;        // "Unsplash License", "CC BY-SA 4.0", "Used with permission"
  sourceUrl: string | null;
} | null
```

A bare URL cannot be shipped. Unsplash, Creative Commons and a hotel's own
press pack all require the credit to travel with the image, and storing the URL
alone is how a photograph ends up on screen with nobody able to say who took it
or under what terms. The API maps the record all-or-nothing: a url without a
credit resolves to `null`, because half a licence is not shippable.

**The hero renders.** It never did. `photo_url` existed in the schema and the
type since the first build, and the place screen drew a hardcoded grey
rectangle regardless — so even a correct URL would have shown nothing. It now
renders the image with the design's grayscale(1) contrast(1.08) treatment, and
the credit rides **on** the image rather than in a settings screen nobody
opens.

**The placeholder admits what it is.** Where there is no photograph, the hero
draws bands keyed to the layer with a horizon set by the Healthy Score, over
the words "no photograph yet". It is graphic, not photographic, and it is not
credited to anybody — a test asserts that, because a drawing credited as a
photo is the same lie in smaller type.

## Adding a real photograph

One row per place in `packages/core/src/seed.ts`, then re-seed:

```ts
photo: {
  url: 'https://images.unsplash.com/photo-...',
  credit: 'Photographer Name',
  licence: 'Unsplash License',
  sourceUrl: 'https://unsplash.com/photos/...',
},
```

```bash
pnpm --filter @chivago/api seed
```

No code changes. The columns, the mapping, the render and the credit are all
in place.

### Sources worth using, in order

1. **A partner's own press pack.** Lamai Yoga Shala and Sabeinglae Coffee are
   named partners; a hotel or café will usually hand over photographs gladly,
   and "Used with permission" is the cleanest licence there is.
2. **Wikimedia Commons.** Has CC-licensed photographs of Na Muang Waterfall and
   Fisherman's Village. Attribution is mandatory and the licence string must be
   exact — `CC BY-SA 4.0` is not `CC BY 4.0`.
3. **Unsplash.** Broad Koh Samui coverage, attribution not legally required but
   expected, and the `credit` field exists so there is no reason to skip it.

Check that the photograph is **of the place**, not of a generic beach filed
under "Thailand". A wrong photograph is worse than none: it is the same
category of error as a pin labelled with its layer, which this project has
already shipped once.

## What is now on screen

Three of five, sourced from Wikimedia Commons with the licence read from the
API rather than the page, so the strings are exact:

| Place | Photographer | Licence |
| --- | --- | --- |
| Chaweng Beach | Wipkinger (Wikivoyage) | Public domain |
| Na Muang Waterfall | Koudkeu | CC BY-SA 4.0 |
| Fisherman's Village | Ruta Badina | CC BY-SA 3.0 |
| Lamai Yoga Shala | — | no photograph |
| Thong Krut Mangrove | — | no photograph |

The two gaps are gaps on purpose. Lamai Yoga Shala is a business rather than a
landmark and Commons has nothing of it; a picture of Lamai Beach under that
name would be a photograph of somewhere else. Commons has no imagery of the
Thong Krut mangrove either, and the nearest candidate — Ang Thong Marine Park —
is forty kilometres away and a different place.

The first search for the village returned two photographs of beer bottles taken
in Bophut restaurants. They matched the search term and not the subject, which
is exactly the failure the "check it is OF the place" note above exists for.

Images are hotlinked to Commons' 1280px thumbnail rather than the 4000px
original: a 4 MB JPEG for a 150px hero is the wrong trade on the one-bar
connection this app is designed around.

## Still owed

- **Two of the five.** See the table above for why.
- **No local caching.** Remote images are fetched every time the place screen
  opens, which on a beach with one bar of signal is the wrong trade.
- **The test harness does not model loading.** `Image` is stubbed because
  react-native-web reaches for `window`; a broken URL, a slow one and a missing
  one are indistinguishable in tests today.
