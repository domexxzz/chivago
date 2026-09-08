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

## The switch that opens the fence

`CHIVAGO_FENCE_OFF=1` stops every distance check and every one of the four
checks above. A check-in, a quest arrival and a story are then accepted from
anywhere by anyone. It exists because exercising the flows end to end
otherwise means faking a GPS fix on every device, and the owner asked for it
by name after doing exactly that for an afternoon.

The four checks go with the distance check rather than staying behind. They
exist to make a CLAIMED POSITION credible, and with no position being checked
they only produce refusals that read as bugs — the 450 km jump between an
island beach and the Si Racha campus was refused as impossible travel, which
was correct and useless.

Two rules come with the switch, and they are the reason it is allowed to
exist at all.

**It is off unless the environment says so.** Not a settings row, not a
console toggle: an environment variable, so turning it on is a deploy
somebody performed on purpose and `git log` says when.

**While it is on, the app says so.** `GET /config` reports it, publicly,
because the warning has to be drawn before anybody signs in. The app wears a
red band across the top of every screen that does not dismiss, and the line
under a place's visitor count stops saying "Counted from geofenced check-ins"
and says the server is not checking where anyone is instead.

That second rule is the whole bargain. A system that quietly drops the check
while still printing the claim is not a relaxed demo. It is a false statement
about evidence, and this product has exactly one thing to sell: that its
numbers came from somewhere. The tests hold both halves — `checkin-service.test.ts`
for the switch, `crowd.test.ts` for the sentence, `fence-band.test.ts` for the
band and for the app treating an unreachable server as fenced rather than open.

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
