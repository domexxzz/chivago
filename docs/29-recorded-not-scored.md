# 29 — Recorded, not scored

A check-in used to be one thing that did three: it stamped the passport, it
paid twenty Trip Points, and it unlocked a review. All three hung on the same
geofence, so when the geofence said no — GPS under the palms at Thong Krut,
a dead battery, a permission declined at the wrong moment, a beach walked the
day before the app was installed — the traveller got all three refusals and a
red message. Every sensor failure was a rebuke to somebody who was really
there.

The competitive read (`docs/partners/` and the analysis it came from) turned
up two products that had already solved this. **SummitLynx** shows the
check-in button only within 300 m and never auto-checks-in, but lets you add
a summit retroactively — with the one rule that "there are no points collected
for badges for this check-ins". **YAMASTA**, the Japanese mountain stamp rally,
lets you issue yourself up to ten stamps a year for peaks the app did not catch
you on. Record the visit; score only the verified one.

## What changed

A visit the phone cannot prove can now be **noted**. It goes into a table of
its own, `self_visits`, and from there into exactly one place: the passport,
drawn as a dashed stamp and labelled self-reported.

| | Verified check-in | Self-issued visit |
|---|---|---|
| Written to | `ledger` (kind `checkin`) | `self_visits` |
| Pays | 20 Trip | nothing |
| Unlocks a review | yes | **no** — `hasVisited` reads the ledger |
| Feeds a companion | yes | **no** — evidence reads the ledger |
| Passport | solid stamp, `visited` | dashed stamp, `selfReported` |
| Limit | once per place per island-day | once per place ever; **10 per island-year** |

The two lists are never merged. `/passport` returns `visited` and
`selfReported` as separate arrays, and `visitedProvincesFor` still reads the
ledger alone, so nothing downstream can mistake a claim for evidence.

## The routes

- `POST /places/:id/visits` — records the stamp. `recorded: false` for a place
  already stamped this way (a duplicate, not a second visit, and it costs no
  quota). `429 VISIT_QUOTA` when the year's ten are spent.
- `GET /visits/self` — the traveller's stamps and how many remain, so the
  place screen can say so on return.

## What the app does

The place screen offers **"Note that I was here · no points"** only after a
check-in has failed — too far, or no fix. It is a secondary button under the
primary one, it says what it does not pay in its own label, and it disappears
once used. The toast that follows says the stamp is self-reported and how many
remain this year. The passport legend gains a fourth state.

## Why the quota is the only guard

There is nothing on the other side of a self-issued stamp worth forging: no
currency, no companion, no review. The quota exists so that a passport cannot
be filled in an afternoon from a sofa, which would make the solid stamps next
to the dashed ones mean less. Ten a year is YAMASTA's number and it fits: the
two or three places a phone genuinely misses on a fortnight's trip, and not
seventy-seven.

The year is the island's, like the check-in day is the island's. A phone on a
European clock must not get a fresh ten an hour before New Year.

## Still owed

- The web demo cannot exercise the offer, because its check-in always succeeds
  at 18 m. Against the real API from anywhere off the island it appears
  immediately; that is how it was verified.
- A native Thai read of the four new strings.
