# 68 — The summoning, and the line it is built against

On 23 October the owner asked for a gacha: a mascot collection, drawn,
fantasy. Two files in this repository had already argued against one, in
their own words, and both arguments are right. This is the record of how the
thing was built anyway, and of which half of each argument it kept.

## What the repository already said

`companions.ts` opens with the design question a collection mechanic has to
answer — what makes one rare — and refuses two answers: *spending points
would make this a shop; a random roll would make it a slot machine. Neither
is a thing a conservation app should teach.*

`58-the-prize-question.md` is harder, because it is not an opinion. It lists
four things that would move this product under the Gambling Act B.E. 2478 in
a single commit, and the first is **a drop table, or any reward decided by a
roll**. It also records the finding that made this codebase comfortable:
there is no randomness anywhere in the reward path, and `Math.random` appears
nowhere in `packages/core` or `apps/api`.

## What the objection is actually to

Neither file objects to randomness. Both object to **randomness deciding
something that matters.**

The Gambling Act's section 8 covers a **รางวัล** — a prize — given by
เสี่ยงโชค in the course of a trade. A licence for one has to be applied for
in advance on form พ.น.1, the applicant must have the goods ready to hand
over and state the price paid for them, and money may not be substituted for
the prize. Every one of those conditions is about a thing of value changing
hands. The withholding question behind it (5% for a chance-based promotion,
3% for an ordinary one) is the same question in a different office.

So the line this mechanic is built against is not "no randomness". It is
**nothing of value is drawn, and nothing is bought.**

## The four rules

**Nothing of value is drawn.** A summon yields a spirit and nothing else. It
does not touch `wallets`, write to `ledger`, issue a voucher, grant EXP or
unlock a discount. A spirit cannot be sold, sent, spent or exchanged, and
nobody can be shown one who did not do the work themselves.
`summon-service.test.ts` asserts the row counts before and after a pull and
scans the result payload for the words *voucher*, *prize*, *cash* and
*discount*. Those tests have to be deleted to make a summon pay anything,
which is the point of writing them.

**Nothing is bought.** A summon costs a charm. A charm comes from a
host-verified quest, or from a day on which the traveller checked in
somewhere — both of them rows the ledger already holds. Charms cannot be
bought, and in particular they are not bought with Green Points: that
currency is what an ESG auditor is asked to trust, and it must never be
spendable on a game. A reversed deed stops paying for a charm, like
everywhere else that reads the ledger.

**The roll is committed before it is made.** An epoch is a 32-byte seed whose
SHA-256 is published the moment it opens. Every roll inside it is
`HMAC-SHA256(seed, "<userId>:<nonce>")`, the nonce being that traveller's nth
summon in that epoch. The server therefore cannot choose an outcome after
seeing who asked, and when the epoch closes the seed is published and every
roll ever made under it can be recomputed by anybody — `GET
/summon/verify/:id` does it, and so can a stranger with a receipt and an HMAC
tool. This is the promise `statement.ts` already makes about a digest, in the
same shape.

**Nothing is behind luck alone.** A duplicate becomes stardust, and stardust
buys any spirit outright at a published price. It is slow and it is certain.
A collection with a certain path to every item is not a chase, and the door
exists so that the honest answer to "what if I never get it" is "then you
walk to it".

## What is published, and where

Everything that decides an outcome, served by `GET /summon` in the `rules`
block and printed on the screen above the button:

| | |
| --- | --- |
| Common | 60% |
| Uncommon | 27% |
| Rare | 10% |
| Mythic | 3% |

A rare is guaranteed within 10 summons and a mythic within 30. There is no
soft pity, no streak detection and no hidden weighting — the weights are
integers in ten-thousandths so the table is exact on every machine, and a
test holds that they sum to the total and that the band boundaries are where
the table says.

The app reads those numbers **from the server**, never from its own copy of
`spirits.ts`: a phone a version behind would otherwise print last month's
rates beside this month's roll, which is a false statement about a draw.

## The spirits, and why they are a third collection

Twenty-four of them, in five invented courts. They are **not** the Samui
companions and **not** the seventy-seven provincial emblems, and the
difference is the one this codebase spends most of its comments on:

- a companion is a real animal with a scientific name and an IUCN category;
- a mascot is a province's emblem, with a `basis` saying where it was drawn
  from so a reader can judge it;
- a spirit is **invented**, claims nothing about any animal, province or
  place, and says so on every card. `INVENTED` in `spirits.ts` is that
  sentence, in both languages, and a test holds that no spirit key collides
  with a mascot or a species and that none of them carries a `code`, a
  `scientific` or a `basis`.

They are drawn by the mascots' renderer, from the same eight bodies and the
same short list of parts, so there is one `MascotMark` rather than two that
drift. No spirit wears the evidence green, for the reason no mascot does.

A spirit nobody has met shows as a silhouette with its rarity and its court
and no name. That is the opposite of the mascot guide, which shows all
seventy-seven — because an emblem is public and hiding it would hide nothing,
while an invented creature's name is the only thing a first meeting has.

## What a lawyer still has to settle

`58`'s eight questions stand and this adds nothing to them, because the
answer here was to stay on the far side of the line rather than to approach
it. Two are worth naming again as the ones that would reach this file:

1. Does the registrar look at the **traveller's experience** rather than at
   what is handed over? If a mechanic that visibly rolls reads as เสี่ยงโชค
   whatever it yields, then a cosmetic-only draw is still a question — and
   the answer decides whether this ships in Thailand or ships as a chooser
   with no roll in it at all. The forge door already is that product, so the
   fallback costs one screen.
2. Could a spirit ever become a **thing of value** without anybody deciding
   it? The obvious route is a sponsor offering something to holders of one.
   Nothing in the code allows it today and `funding-guard.test.ts` is the
   shape the refusal would take, but it is the kind of idea that arrives in a
   meeting rather than in a pull request.

## What could not be verified

Nothing about Thai law was read for this document. It rests entirely on
`57` and `58`, which say plainly that no primary legislative text and no
ruling was read for either. Nothing here is advice, including where it sounds
confident.

## What holds it

- `packages/core/src/spirits.test.ts` — 19 tests: the roster, the exact rate
  table, both floors, and the rule that a spirit is not a mascot.
- `apps/api/src/summon-service.test.ts` — 27 tests: charms off the ledger,
  the commit-reveal, an edited row failing its recheck, and the three
  assertions that a summon yields nothing of value.
- `apps/mobile/test/summon.test.ts` — 5 tests: all twenty-four draw, and an
  unmet card gives nothing away.
