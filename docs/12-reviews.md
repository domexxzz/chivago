# Reviews verified by check-in

The deck's answer to pain point 05 — fake reviews — is "รีวิวยืนยันจากการเช็กอินจริง".
This is that, built on the geofence the quest flow already had.

## The claim, and its exact limits

**Verification is not a badge on some reviews. It is the precondition for one
existing at all.** `writeReview` refuses anyone with no check-in at that place,
so there is no unverified row in the table to distinguish from a verified one.
That is why the app can make one statement above the whole list instead of
decorating rows:

> Every review here is from someone the app confirmed was standing at this place

What that buys, concretely: writing about Chaweng requires having been inside a
250 m circle around Chaweng, on some day, with the server holding the ledger row
that proves it. A review farm would have to physically visit the island.

**What it does not buy, and we should not imply otherwise:** someone who really
was there can still write something false, paid, or malicious. This raises the
cost of a fake review; it does not make one impossible. Anybody presenting this
as "no fake reviews" is overselling it — and `hidden_at` exists because of that
gap, not in spite of it.

## Rules, and why each one is there

| Rule | Why |
|---|---|
| Must have checked in at **that** place | A check-in 14 km away unlocking Chaweng would make "verified" mean nothing |
| The gate **never expires** | Someone who came last Tuesday can still write it up. Telling them to do a thing they already did is the worst kind of error message |
| **One review per person per place**, editable | Without it, one traveller with an opinion buries a place under twenty one-star rows |
| `visitedAt` from the **check-in**, not the writing | Write-ups happen on the flight home. The row still says when they were standing there |
| Rating **1–5 whole numbers** | A fractional or out-of-range rating is a client bug, not a user intention |
| Body **optional**, capped at 600 | A star alone is still signal; demanding prose only produces padding |
| Over-long bodies are **cut, not rejected** | Losing a last paragraph beats losing the whole review to a 400 they cannot see the reason for |

## Earning

**40 Trip Points, once per place, only when there are words in it.**

The `source_ref` is `review:<placeId>:user:<userId>` — no timestamp, no version.
It is the same key on the first write and the fortieth edit, so the ledger
refuses a second payment without the service having to remember anything.

That also closes the obvious exploit: withdraw the review, write it again, get
paid again. The ledger row outlives the review row, so delete-and-repost is a
dead end.

A **bare rating earns nothing** — the points are for helping the next traveller,
and a lone star does not. Padding a short review out later does pay, once.

Reviews pay **Trip**, never Green. Nobody verified the opinion; the check-in it
rests on was self-reported presence. See `11-points-and-progression.md` for why
that boundary is load-bearing.

## Ratings are kept out of the Healthy Score

Deliberately. The score is a measured claim about air, crowding, safety and
walkability where every component can name its source and its freshness. Folding
a subjective mean into it would make the number unexplainable, which is the one
property it must never lose.

They sit side by side on the place screen instead — a measured score and a human
one, neither pretending to be the other.

## No author names, on purpose

The pilot has no accounts. Every user is created as "Traveller", so a review list
would show a column of identical names, which reads as a bug. Inventing distinct
ones would be fabricating people.

The row shows **Verified visit · 12 Oct** where a name would go. The reader loses
nothing: one-review-per-person-per-place already guarantees every row is a
different traveller, and the useful fact is the verification, not the handle.

`authorName` is still in the API payload — it is the real stored display name,
not a placeholder — so the moment accounts land the UI can start rendering it.

## Language

Reviews are stored **as typed**, with the language they were written in recorded
and labelled to the reader. Never auto-translated.

Unlike a rejection reason, a human sentence cannot be keyed, and a machine
translation presented as the traveller's own words is a quote they never said.
The same reasoning already governs `review_note` in the host console.

## A bug this work surfaced

The check-in's timestamp never reached the ledger. `checkIn` accepted a `now` and
used it only for the island day key, so the ledger row carried the wall clock
instead. Nothing depended on that until reviews started reading it to say when
the traveller was there — at which point every review would have claimed the
visit happened at the moment of writing. Fixed by carrying `occurredAt` through
`awardCheckin`.

## Still owed

- ~~A moderation screen.~~ **Built** — `/console/reviews`, see
  `13-review-moderation.md`. Gated on a moderator ROLE, because reviews are
  about places and no host owns a place.
- ~~A report control for travellers.~~ **Built** — see `14-reporting.md`.
- **Photos in reviews.** The upload pipeline exists for quest proof and would
  mostly transfer.
- **Helpfulness ranking.** Currently newest-first, which is fine at pilot volume
  and will not be at scale.
- **Native Thai review** of the new strings.
