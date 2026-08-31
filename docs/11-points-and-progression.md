# Points and progression

Two spendable currencies and a lifetime EXP track, built to the pitch deck's
Point Economy and Game Layer slides.

## The one decision everything follows from

**EXP is not a balance.**

The obvious shortcut is to derive level from the points a user holds. It is
also wrong, and wrong in the direction that punishes exactly the behaviour the
product wants: redeem a voucher and you are demoted. A traveller who drops from
Island Explorer back to Wanderer because they bought a coffee learns not to
spend — which kills the marketplace the whole economy exists to feed.

So there are three numbers, not one:

| | What it is | Moves down? |
|---|---|---|
| **Green Points** | Spendable. Host-verified environmental work. | Yes, when spent |
| **Trip Points** | Spendable. Self-verified exploration. | Yes, when spent |
| **EXP** | Lifetime progress. Drives Level and Rank. | **No** — except a reversal |

The one exception: reversing an award that should not have happened takes back
its EXP too. Otherwise a host who approves by mistake leaves behind a rank
nobody earned, and the ladder stops meaning anything.

## Why two currencies and not one with a label

They differ in **evidence**, and that difference is the entire reason the split
is worth its complexity.

**Green** is only ever awarded after a host looked at a photo taken inside a
geofence and said yes. Someone else vouched for it. This is the currency an
Impact Ledger can be built from, and the only one an ESG auditor could accept.

**Trip** is self-verified: the phone claims to be somewhere, a geofence agrees,
a rate limit stops it being a printer. Cheap to earn, cheap to trust, and
deliberately kept **out** of every impact claim.

Mixing them would put self-reported presence into the number a carbon-credit
verifier is asked to trust. That is why `currency` lives on every ledger row
rather than being inferred from the label, and why `checkIn` cannot award Green
even by mistake — the function has no parameter for it.

## The level curve

Advancing from level `L` costs `300 × (L + 1)` EXP. Each level costs a little
more than the last, without the wall a geometric curve builds.

```
expToAdvance(L)  = 300 · (L + 1)
expAtLevel(L)    = 300 · (L(L+1)/2 − 1)
```

Level 12 therefore spans **3,900 EXP** — the figure printed on the deck. A user
at 25,580 lifetime EXP reads as *Level 12 · Island Explorer · 2,480 / 3,900*,
which is the slide exactly. `progression.test.ts` asserts this, so the app and
the pitch cannot drift apart.

## The five ranks

A rank is a **band of levels**, not a level. Level is the number that moves
every session; rank is the name that changes rarely enough to feel earned.

| # | Rank | From level |
|---|---|---|
| 1 | Newcomer · ผู้มาใหม่ | 1 |
| 2 | Wanderer · นักเดินทาง | 5 |
| 3 | Island Explorer · นักสำรวจเกาะ | 10 |
| 4 | Samui Insider · คนในสมุย | 20 |
| 5 | Chiva Legend · ตำนานชีวา | 35 |

The Thai names are a first pass and still need a native review — see the list
in `01-build-status.md`.

## Where points come from

| Source | Currency | Verified by | Guard |
|---|---|---|---|
| Beach cleanup, mangrove, coral, low-carbon travel | **Green** | A host, on a photo | Geofence + host review + `source_ref` |
| Food trail, temple walk | **Trip** | A host, on a photo | Same |
| Place check-in | **Trip** | Nobody. The phone. | Geofence (250 m) + once per place per **island** day |
| Pilot opening balance | Both | Nobody | Once per user, and it says so in the ledger |

The check-in day boundary is the island's, not the device's. A phone still set
to Europe/Berlin would otherwise buy a second free check-in in the middle of
the Samui afternoon.

The opening balance now goes **through the ledger** instead of being written
straight into the wallet. A balance with no ledger row is precisely the thing a
user cannot account for, and "where did this come from" deserves an answer even
when the answer is "we gave it to you to try the app".

## What the UI had to change

- **Wallet** shows both purses side by side, each with a one-line note saying
  where it comes from. Two numbers with no explanation read as one number split
  in two, and the difference between them is the whole design.
- **Map header** shows both. One figure would silently be the wrong one half
  the time, and a check-in that moves nothing visible reads as one that failed.
- **Marketplace** prices each offer in its own currency and says which one is
  short. "Not enough points" is not an answer when the other purse is full.
- **Ledger rows** carry a `G` or `T`, or a `+150` and a `+20` look like the same
  kind of thing.

## The upgrade path

A pilot database already holds real balances. `migrations.test.ts` builds one in
the old shape and asserts the carry-across:

- the old balance becomes **Green**, and nothing becomes Trip
- EXP is backfilled from what was **earned**, not from what is **left** — so a
  user who has already spent keeps the level they worked for
- debits backfill to zero EXP
- re-running the migration is a no-op
- the wallet still cascades on user deletion after the table rebuild

`wallets` needed a rebuild rather than an `ALTER`, because the old
`CHECK (balance >= 0)` names a column being removed and SQLite refuses to drop a
column a constraint mentions.

## Still owed

- **Wellness Route completion** and **reviews** — the deck lists both as Trip
  Point sources. Neither exists yet; reviews are the larger and more valuable
  of the two, and most of the hard part is already built.
- **Low-carbon choice** earning for Green — currently only quests pay Green.
- **Carbon credit conversion.** Unchanged by this work and still not a software
  problem. It would first need the Impact Ledger to record CO₂-equivalent
  rather than points.
- A **native Thai review** of the five rank names and the new check-in strings.

---

## Update: the third Trip Point source

Reviews now pay Trip Points — 40, once per place, only when there are words in
it. See `12-reviews.md`.

That takes Trip Points to three of the deck's four sources:

| Deck source | Built |
|---|---|
| Place check-in | Yes |
| Travel / food missions | Yes (q5, q6) |
| Reviewing and sharing | **Yes** |
| Completing a Wellness Route | No — Wellness Routes do not exist |
