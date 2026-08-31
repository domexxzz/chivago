# Build status

What exists, what runs, and what is honestly not there yet.

---

## Screens — all 10 from the handoff

| Route | Screen | Status |
| --- | --- | --- |
| `onboarding` | Wellness profile, 3 steps | Built. Writes the profile that weights every score. PDPA consent captured with notice version. |
| `map` | Smart Map + Healthy Score | Built. Real coordinates, live scores, layer filter, feed mode. |
| `place` | Place detail | Built. Plus a score-breakdown sheet the design does not have. |
| `quests` | Green Quest list | Built. Filter by today / weekend / all, host named on every row. |
| `quest` | Quest detail + proof | Built. Real GPS geofence, camera with EXIF, five stages, plus a rejection path. |
| `wallet` | Points wallet | Built. Server-owned balance, derived tiers, numeral badges, ledger. |
| `market` | Marketplace | Built. Real vouchers with code and expiry. |
| `impact` | Impact dashboard | Built. Personal stats derived from verified quests; community bars computed. |
| `safety` | Security Shield / SOS | Built. Persistent alert, haptics, hold progress, Thai emergency numbers. |
| `trip` | Trip itinerary | Built. Assembled from saved places rather than hard-coded. |

---

## Verified running

The full loop was exercised against a clean database:

```
wallet 1240 · Eco Explorer
places  75 Chaweng · 88 Na Muang · 81 Fisherman's · 86 Lamai · 77 Thong Krut   (live AQI)
join    -> arrive from Na Muang        -> OUTSIDE_GEOFENCE (11,370 m away)
        -> arrive at Chaweng           -> arrived
        -> submit proof                -> host_verification, balance UNCHANGED
host    -> reject "not geotagged"      -> back to arrived, reason attached
        -> resubmit                    -> host_verification, stale rejection cleared
        -> approve                     -> complete, +150, balance 1390
        -> approve again (retry)       -> INVALID_TRANSITION, still paid once
impact  4.2 kg waste · 0.8 hr · 1 quest verified      (derived, not hard-coded)
redeem  CG-8B0838A8 · balance 1210 · merchant double-scan safe
sos     fires, persists across navigation, re-fire returns the same alert
ledger  +150 Beach Cleanup (Samui Municipality) · −180 Cold brew (Sabeinglae Coffee)
```

The app was also run in a browser against that API: onboarding, map with pins at
real coordinates, quest list, wallet, impact and safety all render and navigate.

The point economy was exercised the same way, on a clean database:

```
opening   trip 320 · green 1240 · exp 1560 -> L3 Newcomer (60/1200)
check in  at Chaweng, standing there   -> +20 Trip, exp 1580
          again, same island day       -> awarded:false, nothing moved
          from Na Muang, 14 km away    -> OUTSIDE_GEOFENCE
quest q1  Beach Cleanup approved       -> +150 GREEN   (host-verified)
quest q6  Big Buddha walk approved     -> +80  TRIP    (host-verified, not green)
redeem    o1 · 180 Trip                -> ok, trip 240
          o3 · 500 Trip                -> REFUSED "You need 260 more Trip Points."
                                          ...while holding 1,390 Green
          o6 · 600 Green               -> ok, green 790
after     spent 780 points total, EXP unchanged at 1810
reconcile sum of ledger exp 1810 == wallet exp 1810   MATCH
```

And the upgrade path, against a database built in the OLD single-balance shape:

```
before    balance 1610   (1,790 earned, 180 already spent)
after     trip 0 · green 1610 · exp 1790
          green preserved, nothing became Trip
          EXP from what was EARNED (1790), not what is LEFT (1610)  <- keeps the
                                                                      level they
                                                                      worked for
          re-running migrate: no-op
```

---

## Tests: 602 + 10 Dart

| Package | Tests | Covers |
| --- | --- | --- |
| `packages/core` | 44 | Score formula, calibration against the design comps, weighting, staleness, tiers, ledger formatting |
| `apps/api` | 321 | Transactions, idempotency, geofence, state machine, rejection path, air fallbacks, host auth, console scoping, upload safety, HTML escaping |
| `apps/mobile` | 13 | Map projection, label de-collision, geography preservation |

The ones that would catch a real regression:

- **`a repeated host callback pays once`** — the failure mode that ends a points economy.
- **`a debit larger than the balance is refused and changes nothing`** — no orphan ledger rows.
- **`the client cannot award itself points`** — the whole trust model.
- **`a southern place never ends up above a northern one`** — caught a real bug.
- **`{place} scores {n} +/- 1`** — five tests pinning the formula to the approved comps.
- **`reproduces the figure on the pitch deck`** — the level curve must produce
  "Level 12 · Island Explorer · 2,480 / 3,900". If it stops doing that, the app
  and the pitch deck disagree in front of a judge.
- **`progression comes from EXP, not from the balance`** — spend a thousand
  points and the level must not move. A level that falls when you buy a coffee
  teaches people not to spend.
- **`a full Green balance cannot pay a Trip price`** — the two purses are
  separate or the split means nothing.
- **`a check-in never touches Green Points`** — self-reported presence must not
  reach the currency an ESG auditor is asked to trust.
- **`checking in somewhere else does not unlock this place`** — a check-in 14 km
  away letting you review Chaweng would make "verified" mean nothing.
- **`withdrawing and rewriting does not pay again`** — the ledger row outlives
  the review row, so delete-and-repost is a dead end rather than a printer.
- **`a hidden review leaves the list AND the average`** — a hidden one-star
  still dragging the mean down would make moderation cosmetic.
- **`a hotel partner cannot reach the desk at all`** — and cannot hide a review
  by posting straight at the route either. Reviews are about places, which no
  host owns, so a commercial stake must not come with the power to bury.
- **`the author is told, with a KEY not a sentence`** — taking words down and
  saying nothing is censoring quietly; the reason renders in their language.
- **`reporting hides NOTHING, at any number of reports`** — no count trips a
  switch, so a coordinated pile-on cannot be used to bury a rival.
- **`anyone can report — a check-in is NOT required`** — the person most likely
  to spot a review naming their child is a local reading it.
- **`a resolved report keeps the outcome it had at the time`** — a report upheld
  on Monday and reversed on Friday was still upheld on Monday.
- **`the window rolls — yesterday does not count against today`** — a rate limit
  that never forgives punishes the diligent, not the abusive.
- **`survives the restore that erases the review row evidence`** — the audit log
  must outlive the marks that are deliberately cleared from the review.
- **`an SOS alert ignores quiet hours entirely`** — an emergency at 03:00 is
  exactly when a notification matters most.
- **`restoring and dismissing are NOT capped`** — rate limiting the safe actions
  would push a moderator toward the dangerous one.
- **`a promise with no mechanism behind it is worse than no promise`** — the 24h
  review SLA had a notification template and nothing that ever sent it.
- **`a custom window that does NOT wrap is a plain range`** — the first quiet-
  hours maths silenced anyone who set a window that did not cross midnight.
- **`someone who always takes down a lot does NOT trip the spike rule`** — a
  flag that is always on is a flag nobody reads.
- **`a moderator whose calls keep being reversed is flagged on nothing else`**
  — volume says busy, reversals say wrong, and the second one is invisible to
  every threshold on activity.
- **`vouchers answer in camelCase like everything else`** (Dart) — that
  endpoint returned raw database rows while the TypeScript client declared a
  camelCase type, and nothing caught it until a second language read it.
- **`a Bangkok-local reading is converted, not passed through`** — every air
  timestamp was seven hours out, and staleness weighting reads it.
- **`a proposal changes nothing on its own`** — proposing a bulk take-down is
  not deciding one; it needs a second moderator.
- **`batch hides do not count toward the volume rules`** — if the safe path
  made you look worse than acting alone, nobody would take it.
- **`"batches" is not swallowed as a review id`** — route order, and the kind
  of bug that never shows in a service test and always shows in traffic.
- **`EXP comes from what was EARNED, not from what is left`** — the migration
  guard. Backfilling EXP from the balance would silently demote every pilot
  user who had ever redeemed anything.
- **`A HOST CANNOT DECIDE ANOTHER HOST SUBMISSION`** — a signed-in reviewer with a
  valid CSRF token reaching for work that is not theirs.
- **`the empty-hash authentication bypass`** — eight malformed stored hashes that
  must all fail closed.

---

## Bugs found and fixed during the build

> Five more were found by OPENING THE APP for the first time, after five
> screens had been changed without one being rendered. Onboarding replayed on
> every launch; a caption named one currency over two figures; every map pin
> was labelled with its layer instead of its place. See
> `21-walking-the-app.md` — `22-screen-tests.md` for the 19 screen tests, and
> `23-interaction-tests.md` for the 17 that press things, and
> `24-whole-screen-tests.md` for the 19 that let a screen fetch, and
> `25-remaining-screens.md` for the 30 covering the last six screens, and
> `26-place-photography.md` for why the heroes are still not photographs, and
> `27-companions.md` for the egg-per-habitat collection
> that now stand between those bugs and a release.

1. **Nested transaction.** Redeeming an offer opened a transaction and called a
   service that opened its own; SQLite threw `cannot start a transaction within
   a transaction` on the first redemption. `transact` is now re-entrant via
   savepoints.
2. **Device-local day boundaries.** The ledger showed "Today"/"Yesterday" using
   the phone's timezone, so a German tourist would see a different day label than
   the merchant standing next to them. Now island-local (Asia/Bangkok).
3. **Air cache 100x too fine.** Snapped to 0.01° against an 11 km model, inventing
   100 cache entries and 100 upstream calls per model cell.
4. **De-collision inverted geography.** "Always push up" put Chaweng (south)
   above Fisherman's Village (north) — wrong information on a map.
5. **Map chips clipping and the island bleeding past the viewport.**
6. **"All 2" instead of "All 4"** — the segment showed the filtered count.
7. **Tier bar pinned at 100%** past 2,500 points (inherited from the prototype).
   The deeper version of the same bug only became visible when levels arrived:
   a level derived from a SPENDABLE balance goes DOWN when the user spends.
   Buying a coffee would have demoted an Island Explorer to a Wanderer, which
   teaches people not to spend — killing the marketplace the economy exists to
   feed. EXP is now a separate lifetime figure that only reversals can lower.
8. **An authentication bypass in the host console.** A corrupt `api_key_hash`
   decoded to an empty buffer, and `timingSafeEqual(empty, empty)` is `true` — so
   any key would have authenticated against that row. Found by a test written to
   assert it fails closed.
9. **The console's HTML escaping boundary.** Nested templates were escaped into
   visible tag soup; the photo gallery rendered as literal markup text.
10. **A prototype-key hole in reason validation.** `'__proto__' in obj` is true
    for every plain object, so `__proto__` passed as a valid rejection reason and
    the lookup returned `Object.prototype` — the volunteer would have been told
    their proof failed because "undefined". Now `Object.hasOwn`.
11. **Check explanations were formatted in the service**, so a Thai reviewer got
    Thai labels above English sentences. The service now returns a key plus the
    numbers, and the view renders them.
12. **A hard-coded `contacts_notified = 2`** in the SOS dispatch panel — copied
    from the prototype's fixed string. It told someone in trouble that two
    people had been alerted when nothing had been sent. Now counted from real
    delivery attempts.
13. **Non-deterministic inbox ordering.** Two notifications written in the same
    millisecond came back in arbitrary order, so the list reordered itself
    between reads. Surfaced as a flaky test; fixed with a `rowid` tiebreaker.
14. **A review moderation screen that lost its own tab.** `moderationPage` set
    the active nav but not the permission flag, so the Reviews tab vanished
    exactly where the moderator was standing. Only visible with the page open.
15. **`COUNT(*) AS all`.** `all` is a SQL keyword, so the moderation filter
    counts threw a syntax error — a 500 on first load of the desk.
16. **The check-in timestamp never reached the ledger.** `checkIn` accepted a
    time and used it only for the island day key, so the row carried the wall
    clock instead. Nothing depended on that until reviews started reading it
    to say when the traveller was there — at which point every review would
    have claimed the visit happened at the moment of writing.
17. **A review list of identical names.** With no accounts, every user is
    "Traveller", so the list rendered three rows of the same name. Inventing
    distinct ones would have been fabricating people; the row now shows
    "Verified visit" where a name would go.
18. **The obvious EXP migration would have demoted every paying user.**
    Backfilling lifetime EXP from the current balance looks right and is not:
    a pilot user who earned 1,790 and spent 180 holds 1,610, so they would have
    silently lost 180 EXP of progress for having used the marketplace. EXP is
    backfilled from the ledger's credits instead. Caught by writing the
    migration test before trusting the migration.

---

## Not built — the honest list

**Blocking a real pilot:**
- ~~No push notifications.~~ **Done** — see `docs/07-notifications.md`.
- **No receipt checking.** Expo returns a ticket now and a receipt later; we act
  on the ticket only, so a push accepted by Expo but dropped by APNs is
  invisible to us.
- ~~No quiet hours.~~ **Done** — 22:00-07:00 island time, SOS exempt. See
  `docs/16-moderator-accountability.md`.
- ~~Verification can take 24h with no way to tell the user.~~ **Done** — the
  overdue sweep in `docs/17-slas-and-oversight.md` finally sends the
  `quest_review_delayed` template that had existed unwired since the
  notification work.
- ~~SOS notifies nobody.~~ **Done** — see `docs/08-sos-dispatch.md`. What
  remains is operational: somebody must watch the desk, and SMS needs a provider.
- **No money movement.** Redemptions record a settlement obligation, nothing more.
- **Thai copy is design draft**, not natively reviewed (app + console, and now
  the five rank names and the check-in strings).

**Known gaps, lower stakes:**
- No real authentication — identity is a device-scoped header. Fine for a pilot,
  not for accounts.
- No photography; every image is a sized placeholder.
- Offline proof queue reports "saved" but does not yet retry on reconnect.
- Crowd density is synthetic. There is no live feed behind it.
- No MapLibre; the map is drawn SVG from real coordinates.

**From the pitch deck, still not built** — see `docs/10-pitch-gap-audit.md`:
- ~~EXP / Level / Rank~~ and ~~two currencies~~ **Done** — see
  `docs/11-points-and-progression.md`.
- **Trip Points have two of their four deck sources.** Check-ins and
  travel/food quests pay; Wellness Route completion and reviews do not exist.
- **Green Points have one of two.** Verified quests pay; choosing a low-carbon
  stay, route or shop does not.
- **No Digital Twin 3D, AI Trip Planner, Price Forecast, Smart Route or Live
  Translate.** Four of the six the deck marks DEMO LIVE.
- ~~No traveller reviews~~ **Done** — `12-reviews.md` through
  `16-moderator-accountability.md`: verified reviews, a moderation desk, a
  report control, outcome notifications, appeals, an audit log and rate
  limits on both sides. What remains is a bulk action with a second
  approver, and a deadline on unread appeals.
- **No carbon credit conversion.** Still not primarily a software problem: the
  Impact Ledger would first have to record CO2-equivalent rather than points.
