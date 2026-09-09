# 55 — Monsters

The Arena diagram says what these are in six words: **โผล่จากข้อมูลจริง ไม่ใช่สัตว์**
— they come from real data, and they are not animals. That is the whole
design, and it is the same rule the rest of this codebase runs on. Nothing
here invents a monster to make a screen livelier.

## What summons one

| Monster | Summoned by | Source |
| --- | --- | --- |
| หมอกควัน · Smog | The air reading at that place, at or over 51 AQI | The station the place already cites |
| ผีถุงพลาสติก · Plastic bag ghost | A host has an environmental quest open there | The quest table |

**Fifty-one is not our number.** It is the published boundary where an AQI
stops being "good". A threshold chosen to make a monster appear during a demo
would be the same lie as an invented photograph. On a clean day nothing
stands anywhere, and the screen says so as news rather than as an empty list.

**An estimate can never summon one.** Only a reading marked `live` or `daily`
counts. Our seeded crowd figures and any stale air are estimates, and a
monster built on one would be a picture of our own guess rather than of the
island.

## What pushes one back

Deeds the ledger already holds. There is no attack button.

| Deed | Worth | Why it counts |
| --- | --- | --- |
| A host-verified green quest at that site | 3 | A named person checked it |
| A measured leg on foot touching that place | 1 | Two fixes, far enough apart, slow enough to be walked |
| A check-in | 0 | Standing next to a problem is not doing anything about it |

Five gets it to rest for seven days. The count is communal — anybody's work
counts for everybody — and it is computed from the rows every time it is
asked for. There is no stored HP, because a stored figure is a second place
for the truth to live and the first thing anybody would go looking for on a
demo day. A hidden or reversed deed simply stops counting.

A Trip-paying quest is worth nothing here either. Self-reported work must not
clear a problem that the island is being told is real.

## What beating one does not mean

**Pushing a smog monster back does not clean the air.** It means the island
did the work the game asked for. The reading that summoned it is carried on
the monster and printed on its card, the line saying this sits under the
list, and `restingChangesTheReading` is a value in the core so a test can
hold it. An app that let somebody believe they had fixed an AQI by walking
would be telling exactly the kind of lie this product exists to refuse.

A rested monster stays on the list, dimmed. It is still true that the reading
summoned it.

## Where it lives

- `packages/core/src/monsters.ts` — what summons one, what a deed is worth,
  when it rests. Pure, and the only place those numbers exist.
- `apps/api/src/monster-service.ts` — reads places, quests and the ledger.
  Writes nothing.
- `GET /areas/:key/monsters` — public and cross-origin, like the board's
  feed. The air each monster is judged on is the SAME reading the place cards
  show, taken from the places read rather than fetched again: two different
  numbers for one place's air on one screen would be worse than none.
- `apps/mobile/src/components/MonsterFeed.tsx` — one card per monster on
  Home, above the board. Tapping opens the place, because that is where the
  work is.

## The marks

A haze and a bag, drawn flat, with no eyes. Giving them faces would make them
animals, which is the one thing the design says they are not.

## Tests

- `monsters.test.ts` (core): a clean day summons nothing; an estimate never
  summons anything however bad the number; the bar never runs past full; work
  older than the window stops counting; and resting does not move the reading.
- `monster-service.test.ts` (api): a check-in is worth zero; a Trip-paying
  quest is worth zero; a leg on foot counts at both ends; a non-environmental
  quest summons nothing.
- `home.test.ts` (mobile): the number that summoned it is on the card; the
  screen says pushing one back does not fix it; a clean island reads as news;
  each monster opens its place.
