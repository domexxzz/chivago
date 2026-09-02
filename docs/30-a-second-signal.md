# 30 — A second signal on the geofence

The competitive read said it bluntly: a 250 m circle checked server-side is
"a marketing phrase, not a security property" until something else is stacked
on it. Android ships a developer option whose documented purpose is to fake
the GPS location; Play Integrity and App Attest say nothing about where a
device is; and the one rigorous public measurement of a check-in service
(Polakis et al., ACSAC 2013, on Foursquare) found the real hole was not
spoofing but *tolerance* — the API accepted an accuracy field, and claiming
to be imprecise was enough. They also covered 36,120 km of venues in 25 hours
with every check-in accepted, because nobody had written down that this was
impossible.

This is the stack, all of it server-side, all of it cheap, all of it landing
on the "recorded, not scored" path (`docs/29`) rather than a dead end.

## The four checks

| Check | Refuses | Code | Where |
|---|---|---|---|
| **Mocked** | a fix the OS flagged as simulated | `403 MOCK_LOCATION` | check-in, arrival, proof |
| **Accuracy** | a fix whose error circle is wider than the fence | `403 FIX_TOO_COARSE` | check-in, arrival, proof |
| **Travel** | faster than 12 km/min since the last accepted fix | `403 IMPOSSIBLE_TRAVEL` | check-in, arrival, proof |
| **Dwell** | proof filed under 10 minutes after arriving | `409 TOO_SOON` | proof |

The client now sends the fix's own `accuracyM` and `mocked` flag alongside
`lat`/`lng`. An older client that sends neither is still accepted — refusing
unknown accuracy would refuse every honest phone that predates this — but a
*stated* accuracy wider than the fence is not.

Proof of work now carries a **second in-fence position**, taken when the
volunteer taps submit. Arrival proved they got there; this proves they were
still there ten minutes later. Turf calls that staying, and it prices out a
photograph taken from the road.

## The fences got smaller

A quest site is a point. Ingress interacts at 40 m; Pokémon GO counts a
visit at 40–50 m. Ours were 250–400 m, wider than a check-in — a beach clean
"arrived at" from a café four streets back.

| Quest | Was | Now |
|---|---|---|
| Beach Cleanup, Chaweng | 250 m | 80 m |
| Mangrove Planting, Thong Krut | 300 m | 120 m |
| Coral Nursery Check, Taling Ngam | 400 m | 120 m |
| Fisherman's Village food trail | 350 m | 100 m |
| Big Buddha morning walk | 300 m | 80 m |
| Walk, don't ride | 12,000 m | 12,000 m — the site is the island |

The 250 m **check-in** radius is unchanged. A place is a beach or a market,
not a point, and a check-in pays only self-verified Trip Points. A test in
core holds the seed to this: every quest arrives within 120 m unless its
site is the island.

## What this does not do

- It does not stop a rooted phone with a mock-location module that hides the
  flag. Nothing server-side can. Device attestation is the next layer and it
  needs a native build and a Google Cloud project.
- It does not stop a venue-side collusion — staff waving friends through the
  fence. The host's photo review is the guard there, and it is a human one.
- It does not use Wi-Fi or cell IDs. They are not accurate enough to place
  someone inside a site, only within a district.
- It does not use a venue QR. A code someone at the venue can text to someone
  who is not is a wormhole, and the ACSAC authors rule it out for that reason.

## Still owed

- Device attestation (Play Integrity / App Attest) as the flanking layer.
- NFC at the meeting point, the EKITAG model — hardware, when there is a host
  to hold it.
- A native Thai read of the four refusal strings.
