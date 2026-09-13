# 56 — Three gaps the proposal found

On 13 September the owner wrote out what ChivaGo is for, in two long
documents: five pillars, the buyers for each, and a roadmap. Read against
the repository, most of it already existed and three things did not. This
is what was built, and — more usefully — the decision each one forced.

The three, in the order they were done:

1. seventy-seven provinces shared five creatures;
2. the Mind pillar was a mood check-in and four phone numbers;
3. the only funder the product could show was a constant.

## 1. The province you collect

`province-companions.ts` had this sentence in its header from the day it was
written: *"going to Chonburi and going to Chiang Mai are different things to
collect."* The code under it did not do that. The creature came from
`SPECIES[habitat]`, which holds five animals, so a Green-layer visit
anywhere in the country produced the same macaque.

The seventy-seven distinct creatures already existed in `mascots.ts`, with a
mark renderer for the phone and a rig for the web. They had no ladder — only
"been there / not yet". The ladder had no distinct creature. Joining them
was most of a day's work in `core` and one screen.

**Both stay.** They answer different questions and neither substitutes:

| | what it answers | how many | withheld until earned? |
| --- | --- | --- | --- |
| `species` | what **lives** in the habitat you earned it in | 5, each with a scientific name, an IUCN category and a checkable fact | yes |
| `mascot` | what the **province** is known by | 77, all different | no — an emblem is public before anybody visits |

### The decision it forced

The rungs were `egg`, `hatchling`, `grown`. Nonthaburi's mascot is a durian
and Loei's is a ghost mask. A durian does not hatch, and one that "grew to
adulthood" would read as a claim about a population — the exact claim
`mascots.ts` opens by refusing.

So the province ladder names **the traveller's record** instead of the
creature's body:

```
unopened → unmet → met → known → vouched for
```

Same evidence, same thresholds, one source of truth. `bondOf` *maps* the
rung; it never re-derives it, so the two vocabularies cannot drift apart.

Levels are per province and per traveller: days you came, plus three for
each quest a host verified. The card prints both parts beside the number.
Three is not a free parameter — `strongest()` already sorts verified quests
above any number of days, and three is the smallest weight that keeps one
approval ahead of a long weekend.

## 2. Gentle steps

The Mind pillar was one mood check-in and the emergency numbers on the
Safety screen. The proposal devotes pages to it. `gentle.ts` is what happens
after somebody presses **Drained** or **Tense**.

### The decision it forced

**A gentle step pays nothing.** Not a small amount — nothing. There is no
points field on the type and no route that could award one. The moment
resting earns currency, three things happen at once:

- the app is paying people to report being drained, so the mood history
  stops recording how anybody feels and starts recording what pays;
- the cheapest steps get farmed, which is the opposite of the behaviour
  they exist to encourage;
- somebody genuinely struggling is handed a scoreboard, which is the one
  thing every piece of advice on this subject says not to do.

The same reasoning rules out a streak, a completion bar, a badge and a
leaderboard. A test asserts the type carries none of those field names, so
the decision survives the next person who wants engagement numbers out of
this screen.

Three more rules fell out of it:

- **It never decides anybody is having a hard day.** It reads the word they
  pressed. No inference, no history, no threshold. `Steady` and `Bright`
  open nothing, because offering a tired person's list to somebody who said
  they are fine is the app claiming to know better.
- **A place is named only when one was measured.** `rechargeFrom` takes the
  crowd count and the AQI the app already holds, discards anything at or
  over 50 AQI or whose air nobody read, and returns null rather than a
  second best. A wellness feature that invents a calm place sends somebody
  who is struggling to a car park on a guess.
- **1323 is shown to everybody who sees a set**, never held back for a state
  four words on a check-in cannot detect, and it says you do not have to be
  in a crisis to call it.

## 3. The funder in a row

`/console/sponsor` carried its funder in a constant — one NGO, 65,000 baht —
with a comment saying why: a table *"would imply an agreement nobody has
signed"*, and it would become one *"when the first sponsor actually signs"*.

That was the right call, and it cost two things. Every deployment showed a
named foundation and money it had never committed, including deployments
where nobody had funded anything. And exactly one organisation could ever
appear, so the first university or company to sign had nowhere to go.

### The decision it forced

The worry is answered by a column rather than by absence. `basis` is
`declared` when somebody typed a figure with nothing behind it and `signed`
when an agreement stands. The default is declared, because that is the safer
one to get wrong, and every page that prints money prints which it read.
**One declared line among signed ones makes the whole page declared** — a
report calling itself signed while one figure is an estimate is worse than
one that says declared throughout.

What is typed and what is real stay apart. The funding figures are entered
by hand and nothing verifies them. The counts they are measured against come
from `quest_progress` and the ledger, the same rows a host's Approve click
writes, and nothing on the new page can touch one. **A buyer can dispute
what they were charged and cannot dispute what was verified.**

It ships empty, adding one is moderator-only — a host who runs a quest must
not set the funding their own work is measured against — and both the
sponsor and ESG pages say so plainly when there is nothing there.

## What was in the proposal and is still not built

Named here rather than left to be discovered:

- **Booking.** The proposal's Travel Marketplace is hotels, tours and
  inquiry flows. What exists is a points-to-voucher marketplace that settles
  to local merchants. Nothing in the repository books anything.
- **Smart Route as a multi-leg journey planner.** `smart-route.ts` models
  it and `POST /route` serves it, but the numbers are straight lines times a
  road factor and fares written down as constants. Ferry timetables and
  songthaew stop data for Samui largely do not exist in machine-readable
  form; that is a data-collection project before it is a routing one.
- **Purpose quests.** Mentor sessions, career talks, peer circles. All of
  them need a person on the other end, and the product has no model for one.
- **Carbon and waste "reduced".** The proposal asks for both. The ledger
  holds weight recorded on approved proofs and nothing else, and "reduced"
  needs a baseline for what would have happened otherwise. Countable is
  *"12 kg collected, a named host signed for it"*, which is a stronger
  sentence anyway. See the *what this does not measure* panel on the ESG
  page, which already refuses this in production.
- **Community revenue.** Voucher settlements are known; a shop's actual
  takings are not. Claiming the second from the first is the single easiest
  number to overstate in this product.

## What holds it

`province-companions.test.ts`: two provinces earned the same way are two
different creatures; all seventy-seven carry an emblem while the species
stays withheld; no rung is ever named for a body; a level reads back to the
evidence under it. `gentle.test.ts`: no step carries a reward, score,
streak, badge or rank field; the words promise no feeling; the first step
never asks anybody to leave the room; bad air disqualifies a place however
empty it is; a place whose air nobody read is not offered.
`organisation-service.test.ts` and the console tests: a deployment with no
organisation shows no invented funder; declared is the default; the weakest
link decides the page; a non-moderator gets a 404 from the page and from
every write to it.
