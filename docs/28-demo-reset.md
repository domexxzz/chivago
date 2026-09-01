# 28 — The demo reset, and the walk that proves it

A demo fails in one of two ways. Either the data is stale — last night's
rehearsal left an SOS live and the wallet already spent — or it is empty, and
a screen with nothing on it looks exactly like a screen that is broken. Both
are discovered in front of the audience, which is the worst possible moment
and the only moment nobody has budgeted for.

```bash
pnpm --filter @chivago/api demo:reset --walk
```

Run it the morning of. It clears the first failure and refuses to leave the
second.

---

## What it does not do

It does not write results.

That is the whole design constraint. There is no line in this script that
inserts a balance, a companion stage, a Healthy Score or an impact figure.
Every number the demo shows is computed by the same functions the running app
calls, over history seeded by driving the real services on a backdated clock:

- Check-ins go through `checkIn`, geofenced, at the places' real coordinates,
  with `now` set to the day being seeded. A refused check-in throws rather
  than being skipped, because a seeded state the app itself cannot produce is
  not worth demonstrating.
- Quests go through the real state machine — `joinQuest` → `arriveAtQuest` →
  `submitProof` → `resolveVerification`. An invalid transition throws. This is
  the only way a Green Point comes to exist, which is the entire difference
  between the two currencies.
- Moods go through `recordMood`, typed against the real `MoodKey` union, so a
  key the app does not have fails at the typecheck rather than three days
  before the demo.

If a service is broken, this produces a broken demo. That is the point: it
runs before the audience arrives.

---

## The shape of the seeded history

Five days, ending today. Every part of it is doing a job.

| Habitat  | Days | Result |
| -------- | ---- | ------ |
| Safe     | 3    | grown (q1 is host-verified at Chaweng) |
| Food     | 3    | hatchling |
| Green    | 2    | hatchling |
| Quest    | 1    | grown (q2 is host-verified at the mangrove) |
| Wellness | 1    | **egg** |

The single Wellness day is deliberate. It leaves the presenter an egg to
hatch **live**, by checking in at Shala on stage — the one moment in the demo
where the mechanic is shown working rather than described. Everything else is
already at a stage, so all three stages are on screen together and the
difference between them is visible rather than explained.

Four quests are carried through host verification: three green and one trip.
Two currencies that differ by evidence is the product's central claim, and a
demo that can only spend one of them proves half of it — the wrong half,
since Green is the one an auditor would ask about.

Resulting wallet: **320 Trip · 610 Green · 930 EXP**, which affords one offer
in each currency. Not two, not ten. Enough to show the redeem flow and watch
the balance drop.

---

## The walk

`--walk` reads the seeded state back through the same functions the HTTP
routes call, and exits non-zero naming anything that would open empty.

```
[chivago] walking the demo:
  PASS  Wallet           320 trip · 610 green · 930 exp
  PASS  Wallet history   14 entries
  PASS  Chiva Balance    74 from 5 components
  PASS  Mood history     5 check-ins
  PASS  Companions       Green:hatchling Wellness:egg Food:hatchling Safe:grown Quest:grown
  PASS  Impact           4/4 figures above zero
  PASS  Safety           5 services · 3 contacts · no live alert
  PASS  Quests           6 quests, 4 today
  PASS  Marketplace      1 trip · 1 green affordable of 6

[chivago] every screen has something to show.
```

The checks are deliberately shallow. This is not a test suite — 818 of those
already run in CI. It is the thing that stops somebody presenting an empty
Wallet. But three of them are stricter than "not empty", because "not empty"
is not the same as "demonstrable":

- **Companions** requires all three stages present. A collection where
  everything is an egg demonstrates nothing about hatching.
- **Marketplace** requires something affordable in *each* currency, for the
  reason above.
- **Safety** fails if an SOS alert from a previous run is still live. That one
  is not about emptiness at all — it is the specific stale state that would
  otherwise open the app with a red banner nobody meant to leave there.

---

## Two guards that run before anything is deleted

**Schema drift.** The traveller tables are enumerated by hand, not discovered
from `sqlite_master`. A wildcard would start deleting places the day somebody
adds a content table. But an enumeration rots in two directions, and both are
silent: a *renamed* table stops being cleared and the demo shows yesterday's
data; a *new* table nobody classified stops being cleared for the same reason,
except nobody knows to look.

So every table in the database must appear in either `TRAVELLER_TABLES`
(cleared) or `KEPT_TABLES` (kept), and the check runs before the first
`DELETE` — a half-finished reset is worse than either failure.

This caught two things while it was being written: a table in the list that
does not exist, and `users` being deleted outside the list. Both were mine.

**Missing content.** Without a content check, the first failure on a fresh
database is `check-in at chaweng was refused outright` — true and useless. The
check-in was refused because the place does not exist. The operator reading
that at eight in the morning needs to be told to run the content seed, not to
debug a geofence:

```
Error: no places, quests, offers in this database. Run the content seed first:
  pnpm --filter @chivago/api seed
```

---

## Running it

```bash
# once, or after a content change
pnpm --filter @chivago/api seed

# the morning of the demo
pnpm --filter @chivago/api demo:reset --walk
```

`CHIVAGO_DB` points it at a database; `CHIVAGO_DEMO_USER` changes which user
is seeded (default `demo-user`, which is what the API assumes when no
`x-chivago-user` header is sent).

It is idempotent. Running it twice produces byte-identical state, because the
reset is total and the seed is deterministic apart from the clock.
