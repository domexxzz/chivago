# Build status

What exists, what runs, and what is honestly not there yet.

> **Status as of 2026-09-15.** 237 commits since 2026-09-01; `main` is clean
> at `2e8ff5f`, no pull request or issue is open, and CI is green. 23 screens,
> 87 API routes, 44 tables, 56 documents, about 53,700 lines of source and
> 24,400 of tests; 1,967 TypeScript tests (core 495, api 881, mobile 527 + 40,
> tokens 25), 11 Dart, 10 Swift. Twelve pull requests merged over the 14th and
> 15th, every one CI-gated and every one opened in a browser before it was
> called done, plus three commits pushed straight to `main`.
>
> **This block was written twice, and the second time is the interesting one.**
> The first version recorded `main` at `c6049f2` with 229 commits, and was
> already wrong when it merged: the owner had pushed the bus work between
> 00:25 and 01:49 the same morning, on a branch nobody in this session was
> watching. Nothing collided — both typechecks pass, all 1,967 tests pass, and
> the game-surface guard still holds because `BusStrip` is a component rather
> than a screen — but a status file that measures itself before the last push
> is a status file that is wrong on arrival, and saying so here is cheaper
> than being trusted wrongly.
>
> **The bus, and what it refuses to draw.** Three commits by the owner added
> transit to the campus work: route 538 to RMUTT Thanyaburi, its four stops at
> the campus edge, a strip on Home and the stops standing on the map
> (`transit.ts`, `BusStrip.tsx`). The design decision is in the header and is
> the same one this repository keeps making. A public service really does
> serve the campus and is mapped, so it is here; **the university's own
> shuttle is published nowhere**, in no feed the app can read, so
> `campusRoutesIn` returns an empty list and the screen says so in words. A
> route invented from the shape of the roads would be believed — somebody
> would stand at a stop that is not a stop — and the first thing the app would
> have taught its users is that it makes things up. Nobody publishes a
> timetable either, and the card says that rather than estimating one.
>
> **Two things were built and one was finished.**
>
> **Finding somebody to go with.** A party had always been joinable by a
> six-character code, which means you could only join one if somebody already
> knew you well enough to read it out — fine for travelling with friends and
> no way at all to meet anyone. Four pull requests closed that: the rules and
> tables (#32), eight HTTP routes (#33), the screens for phone and web (#34),
> and the demo build's answer for them (#35).
>
> **The rule the whole feature is shaped by is that an invitation is posted at
> a PLACE, never at a person.** The reference design the owner sent pins faces
> at live positions, and this cannot. A check-in is consent to be COUNTED,
> which `crowd.ts` already honours by saying how many people checked in
> somewhere and nothing more; turning the same rows into dots a stranger can
> walk towards is a different product with a different consent behind it. The
> app is used outdoors, on an island, by people whose ages we have not
> established. And `wayfinding.ts` settled the principle a fortnight ago: the
> link it hands out carries the destination only.
>
> The happy accident is that this is also the only version that could be
> trusted. A pin drawn from a self-reported fix is worth nothing — a spoofed
> fix puts you anywhere. A count attached to a place comes from check-ins that
> survived the four tests in `presence.ts`. So the honest design and the
> possible design turned out to be the same design.
>
> `InviteListing` is the privacy surface, and its shape is the argument: no
> position, no balance, no real name, no member list, no route. There is
> deliberately no `GET /invites/nearby?lat=&lng=` — a client that wants what
> is near it already knows where it is, so it asks `/places` with a bounding
> box as it always has and asks about what came back. **The server never learns
> where anybody is standing, so it cannot leak it, log it, or be compelled to
> produce it.** Three structural tests hold that: one reads `pragma_table_info`
> so nobody adds a `lat` column later, one walks every request the screen makes
> asserting no path or body carries a coordinate, and one asserts that posting
> an invitation with `lat`, `lng` and `accuracyM` attached keeps none of them.
>
> **A surface for the game layer, and a tab to reach it by.** The owner asked
> why our screens look flatter than the references they sent, and the answer
> was in our own token sheet: *Panels stay flat*, four shadows, all faint. The
> screens had been built inside that system without anybody asking whether it
> applied everywhere. It applies to half the app.
>
> The line already existed — `packages/tokens` has said since the palette was
> written that green means evidence and gold is the game layer — and had never
> been carried into SURFACE, so a mascot's room and an SOS banner were built
> out of the same flat rectangle. #36 added a second vocabulary rather than
> replacing the first, and `game-surface.test.ts` makes the rule a test instead
> of a comment: **every screen must be on the game list or the evidence list,
> and an unclassified one fails the build.** That is how the SOS screen quietly
> grows a bevel in eighteen months. The forbidden list names a reason per
> screen and the SOS entry is asserted separately so a refactor cannot drop it.
>
> Two screens moved on inspection. **Home lands on the evidence side** because
> it carries a healthy score and a crowd figure beside the board, and a screen
> wearing the surface whole would put a bevel under a number the island
> produced. **Onboarding moved there too**: what is on it is permission
> choices, and a consent control is not play.
>
> #37 gave the game layer a cell on the tab bar. Six tabs is one more than a
> 375px bar can carry, so every addition is a swap: **the wallet gave up its
> cell**, because it already had a door on Home showing both balances, while
> companions, the seventy-seven, medals and the passport sat three taps down
> behind it. The bar now reads Home, Map, Missions, Collect, Safety.
>
> **All seventy-seven mascots are now drawn.** They had been rendered by one
> machine from eight body archetypes, which is the only reason seventy-seven
> existed rather than nine, and the cost was that they looked like each other.
> Four pull requests (#38, #39, #40, #41) drew them ten at a time into a
> registry that falls through to the machine for anything undrawn, so no batch
> was a migration and the day a mascot had no art stayed an ordinary day.
> **Not one hex literal entered that file across all seventy-seven**: every
> colour is `mascot.colours`, researched when the emblems were, and a test
> refuses any literal but the ink of an eye and the white of a catchlight.
>
> **What opening the browser caught, twice, that the tests did not.** PR #34
> passed all three CI jobs and merged, and the deployed web build then showed
> `Not in the demo build: GET /invites/pins` — the static demo answers `fetch`
> from a snapshot and had never heard of the new routes, and all 514 tests
> missed it because they mock a different fake server (#35). Then the first
> version of the game surface wrapped the companion's room in a painted sky,
> when `CreatureScene` already renders a room with ground, trees, rocks and
> light that follows the island clock — something better, replaced with
> something flatter. Both were found by looking at the page beside the old one.
>
> **What is honestly not there.** The party feature is complete in code and
> **should not be opened to the public yet**: the question of whether users
> may be minors is unanswered, and it gates launch rather than code. Nothing
> else on the unchanged list moved — money never moves, 75 provinces have no
> places, the Thai has not been read by a native speaker, there is no
> attestation and no independent signature on a statement. Accepting somebody
> into a party is the one thing the demo will not fake, because a party there
> is three lines of seed data with nobody behind it.
>
> Also produced outside the repository on the 14th: a legal brief for Thai
> counsel on whether ESG-derived points could become a blockchain token, with
> seven questions and the seven other areas of law this system already touches;
> a second ESG reference covering per-disclosure metric codes, the calculation
> chain and TGO's Thai emission factors; and a screen-design page showing the
> game look applied to our own palette. `docs/57-the-token-question.md` (#31)
> is the repository's record of the first.

> **Status as of 2026-09-13, evening.** 188 commits since 2026-09-01; `main`
> is clean at `e57b85b`, no pull request or issue is open. 21 screens, 80 API
> routes, 37 console routes, 40 tables, about 48,500 lines of source and
> 22,200 of tests; 1,832 TypeScript tests (core 440, api 839, mobile 498 + 30,
> tokens 25), 11 Dart, 10 Swift, across 55 documents.
>
> **CI was red for two days and is green again.** The two commits of the 11th
> - a companions showcase on Home and the carousel under it - set `Body` at
> 12, which that component's type does not allow, and both runs failed on the
> typecheck job. Every test passed throughout, which is why nothing except
> the job nobody read said so. Fixed on the 13th in electiction's PR #21
> (`b4a669d`): the three lines take 13, which is the floor the design system
> has for body text because Thai stacks a tone mark above the consonant and a
> vowel below it, and the reason for that floor is now written beside the
> type that enforces it. The last green commit before it was `8204f38`, on
> the 10th.
>
> The live API has been up at https://chivago.fly.dev since the evening of
> the 7th and answered on the 13th. Since the 8 September status, in the
> three days before the pitch: the road route is drawn on the app's own map
> rather than handed to a browser, using FOSSGIS's Valhalla because a
> measurement showed OSRM's public server answers a walking request from the
> car graph - about 20 km of it in 22 minutes against Valhalla's 249 - and a
> test now holds the parsed route to a walking pace (`53-the-way-there.md`);
> Home carries a board where the separate accounts in a room can see each
> other, showing approved stories and visible reviews but never a check-in
> (`54-the-board-on-home.md`); monsters stand at places, summoned only by a
> live air reading at or over 51 AQI or an open environmental quest, never by
> an estimate (`55-monsters.md`); the door was opened wide for the day - no
> registration limit, no event token, and a clip is public the moment it is
> posted with the app saying plainly that nobody has looked at it yet; the
> campus map gained building 13, where the hackathon moved, its hillside, its
> streets and its roofs; pins wear their photographs and a moment can be
> posted from the map without opening a place; uploads moved onto the volume,
> where a deploy stops eating them; the bundle is no longer re-downloaded on
> every open; and the app opens in English whatever the phone speaks.
>
> **What this file cannot tell you is how the pitch went.** The last commit
> is `6dcbeb6`, at four in the morning on the 11th, and nothing has been
> written since. The calendar in `50-status-2026-09-08.md` runs to the 11th
> and is now a record of a plan rather than of a day. Whatever was learned in
> that room is still only with the people who were in it, and the list of
> what is not real - money never moves, 75 provinces have no places, the Thai
> has not been read by a native speaker, there is no attestation and no
> independent signature on a statement - is unchanged because nothing since
> has touched it. Two demo URLs are still live and no longer agree:
> https://chivago-demo-sigma.vercel.app, which README points at, was rebuilt
> from `main` on the 13th; https://chivago-demo.vercel.app is pinned to an
> older deployment.
>
> **Later the same day**, seven more pull requests. Three closed gaps the
> owner's 13 September proposal found, written up in
> `56-three-gaps-the-proposal-found.md`: the seventy-seven province mascots
> became the creature you collect, with a per-traveller level, while the five
> habitat species kept the animal facts they carry (#24); gentle steps arrived
> behind the mood check-in under the rule that **a step pays nothing**, with a
> test that fails if a points, streak, badge or rank field is ever added
> (#25); and the sponsor page's hardcoded NGO became an `organisations` table
> whose every figure is marked `declared` or `signed`, shipped empty, with
> adding one gated to a moderator (#26). One more fixed a word: the wallet
> said สัตว์ประจำถิ่น where the rest of the app says เพื่อนร่วมทาง, because it
> carried an inline copy of a block the profile renders from core (#23).
>
> The other three built `scripts/announce.mjs`, which posts what changed to
> the team's Discord channel and saves it to Hermes on the developer's machine
> (#27), then learned the lesson its own first two posts taught — they went
> out in English, which is the language the commits are in and not the one the
> team reads, so it now sends **Thai first and both every time**, and says so
> when the Thai is missing rather than going quietly (#28) — and finally
> gained `--file`, so a deck reaches the channel as an attachment instead of a
> link somebody has to be given access to (#29).
>
> Also produced on the 13th, outside the repository: four published reference
> pages for the team (the whole system, the screen mockups, an ESG reporting
> and ratings guide researched from primary sources, and a KPI dictionary that
> explains every number twice — once plainly, once with the formula), and a
> fifteen-slide Thai pitch deck built from them. **Two findings from that
> research change what the team should say**: SET ESG Ratings ended after the
> 2568 cycle and the exchange moves to FTSE Russell ESG Scores, which score
> only public English disclosure and send no questionnaire; and the SEC's ISSB
> roadmap slipped a year, so SET50 starts in 2570 and SET100 in 2571.

> **Status as of 2026-09-08, afternoon.** 141 commits since 2026-09-01;
> `main` is clean at `d401f08`, no pull request or issue is open, and CI is
> green on every commit since the 7th. 20 screens, 75 API routes, 32 console
> routes, 38 tables, about 43,400 lines of source and 19,700 of tests; 1,629
> TypeScript tests (core 385, api 787, mobile 407 + 25, tokens 25), 11 Dart,
> 10 Swift.
> The live API is up at https://chivago.fly.dev since the evening of the 7th:
> seeded, the demo reset walked (Standing #1 of 2), the event token and the
> registration limit set, the console signed in, the six QR codes made. Its
> first live bug - the first registered device took the web app's fonts and
> /health with it into 401 - was fixed the same night (`2939844`). Since the
> 7 September status: electiction's PR #20 merged after a rebase (docs/49),
> the five campus places have the team's own photographs shipped inside the
> web export, a card without a photograph wears its habitat, and the demo
> reset works in the two hours after island midnight. This afternoon: the
> five companions are the team's own Samui mascots, built to their reference
> art (`51-the-samui-five.md`); a place says how far away it is, which way it
> lies and how long the walk is, and opens a map that has the roads; the
> place cards carry the distance and the row is ordered nearest first; and
> both maps draw the traveller with the fix's own accuracy around them
> (`52-getting-there.md`). What is not real yet is in
> `50-status-2026-09-08.md`, this status in Thai with the calendar to the
> pitch on the 11th and what is owed.

> **Status as of 2026-09-02.** 64 commits since 2026-09-01; `main` deploys to
> https://chivago-demo.vercel.app as a static demo (no API behind it). 17
> screens, 66 API routes, 27 console routes, 35 tables, about 35,700 lines
> of source and 17,000 of tests; 1,317 TypeScript tests, 11 Dart, 10 Swift
> (Swift runs only in CI). Of the competitive read's seven recommendations,
> 01-04 are built and documented (`docs/partners/`, `docs/29`, `docs/30`,
> `docs/31`); 05 (Thai law), 06 (no point economy before a sponsor signs)
> and 07 (open all 77 provinces Roadside-style) are not started. The CI Swift
> job failed on five pushes from `eec0c76` because the Swift package's copy
> of `contract/api-samples.json` was refreshed by hand and was not; the
> capture now writes the copy and a test holds the two identical. The
> sections below are the build-time record and are kept as written. The
> same status in Thai, with the seven recommendations and what is owed, is
> `32-status-2026-09-02.md`.

---

## Screens — the ten from the handoff

Thirteen more exist now. Seven arrived first: Home, Missions, Passport,
Companion, Party, Account and Place reviews (`25-remaining-screens.md`,
`27-companions.md`). Six followed: the mascot field guide and a mascot's room,
medals, the profile, finding a party (`57-the-token-question.md` for the rule
it obeys), and Collect, which took the wallet's cell on the tab bar and is
where the whole game layer now lives.

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

## Tests: 1,317 + 11 Dart + 10 Swift (as of 2026-09-02; the table below is the build-time count)

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
