# 58 — The prize question: what a sponsor may hand a traveller

On 16 September the owner answered the question the cost model had stopped on.
Asked who funds the real goods behind a drop, the answer was: **sponsors do —
goods, discounts, and cash prizes.**

That answer removes the largest line in the cost model. It also moves the
product across a line in Thai law that the token question never touched, and
the two halves of the answer land on opposite sides of it.

## What it does to the numbers

The cost of running this platform for fifty thousand people is about 4,800
THB a month of machines, twenty-five thousand of moderation, and a hundred
and nine thousand for a safety desk that is staffed around the clock. Against
those, the goods behind the drops were the only unbounded line — a fifth of
fifty thousand people redeeming a hundred baht of real value is a million a
month, and it is the line that decides whether the business exists.

Sponsors funding it does not make that line smaller. It makes it **somebody
else's**, and turns it from the largest cost into the only revenue. The
machinery is already here: `org_sponsorships` carries `funded_thb` beside
`per_verified_thb`, so what the platform keeps is the difference between two
columns in one row, which a sponsor can read without asking.

## Where the line is in Thai law

Not between big prizes and small ones. Between **chance and performance**.

A reward given by drawing lots, by a roll, or by any other method of เสี่ยงโชค
in the course of a trade or business falls under section 8 of the Gambling Act
B.E. 2478, and needs a licence applied for on form **พ.น.1** at the Department
of Provincial Administration before the campaign runs. Not after it.

Two conditions of that licence matter to what the owner described:

- the applicant must have the goods **ready to hand over**, and must state the
  price actually paid for them;
- **money may not be paid or accepted in place of the prize.**

So of the three things the owner named, the third is the one with a problem
attached, and only when it is won by chance. A **cash prize drawn at random**
is close to the exact thing the licence for random prizes forbids.

Tax follows the same line rather than a different one. A prize from a
chance-based promotion is withheld at **5%**; a reward from an ordinary sales
promotion at **3%**. The payer withholds and files **ภ.ง.ด.3** by the 7th of
the following month. The classification decides the rate, which means the
classification is not a labelling exercise.

## Where ChivaGo stands today, which is better than expected

There is **no randomness anywhere in the reward path**. `Math.random` appears
nowhere in `packages/core` or `apps/api`. The only randomness in either is
`randomInt` in `party-service.ts` and `account-service.ts`, generating a party
code and a device-link code — cryptographic randomness, in a place where a
guessable string is the vulnerability.

What decides a reward instead is `DEED_WEIGHT` and `DEEDS_TO_REST = 5` in
`monsters.ts`. A monster retreats because five weighted deeds were done and a
host approved the ones that count. Do the work, get the result; do it twice,
get it twice.

That was not written with the Gambling Act in mind. It was written because a
stored, rollable outcome is a second place the truth lives, and the first
thing anybody does on a demo day is find the request that decrements it.

**The honesty rule and the licensing line turned out to be the same line.**
This is the third time that has happened in this codebase — the geofence, the
place-not-person rule for invitations, and now this — and it is worth naming
as a pattern rather than as luck. A system that refuses to assert what it
cannot show tends not to need permission to assert it.

## What would cross the line, in one commit

- a drop table, or any reward decided by a roll
- a "chance to win" anywhere in the copy, whatever the mechanism underneath
- cash handed over in place of a sponsored item
- a sponsor's stock running out mid-campaign, so that qualifying travellers
  get nothing and the thing they did earn quietly becomes a lottery ticket

The last is the one that arrives without anybody deciding it.

## What a lawyer has to settle

Ordered so the first two decide whether any code gets written.

1. Does a reward that is **deterministic on verified work** fall outside
   section 8 entirely — or does the registrar look at the traveller's
   experience, in which case a creature that "drops" an item may read as
   เสี่ยงโชค however the code decides it?
2. If a sponsor's stock runs out and the last qualifying travellers receive
   nothing, does the promotion become a chance-based one retrospectively?
   This decides whether stock levels must be a hard gate in code.
3. Does the prohibition on paying money in place of a prize apply only to
   licensed draws, or to prize promotions generally? The owner asked for cash
   prizes and the answer decides whether they can exist at all.
4. **3% or 5%** — is the classification ours to make, and on what record?
5. When a sponsor supplies the goods and we run the mechanism, who is the
   prize-giver, who withholds, and who issues the withholding certificate?
6. Is a **discount redeemed at a merchant** a รางวัล at all, or a commercial
   term between the traveller and that merchant?
7. A Green point is earned, then later spent on a voucher. Does the chain make
   the point a prize, and does it matter that the point was earned rather than
   drawn?
8. **May a minor receive a prize, and who signs for it?** This is the minors
   question from `57` arriving in a second place, which is an argument for
   settling it once rather than twice.

## What could not be verified

Everything above about Thai law is read from the Department of Provincial
Administration's own public-service page for the licence and from Thai tax
commentary. **No primary legislative text was read, and no ruling.** Nothing
here is advice, including where it sounds confident.

The cost figures in the second section are **modelled, not quoted**. The Fly
machine, volume and bandwidth prices are read from Fly's own pricing page and
converted at 33.3 THB; everything downstream of them — sessions per traveller,
media per traveller, what a safety desk costs to staff around the clock —
is an assumption, and the million-a-month redemption line is an illustration
of a shape rather than a forecast of a number.

Numbers 1 and 2 in particular look like questions a practitioner answers from
experience of how the registrar actually reads these campaigns, rather than
from the text — which is exactly why they are in a list addressed to one.

## What holds it

No behaviour changed for this document. One test did arrive alongside it, for
the rule the owner's answer makes load-bearing: **funding is not
verification** (`apps/api/src/funding-guard.test.ts`). A sponsor may pay for
the opportunity to do work and may never pay for the record that it was done,
and now `organisation-service.ts` cannot reach `wallets` without somebody
deleting an assertion that says why not.

The absence of `Math.random` in the reward path is currently a fact about the
code rather than a rule the code enforces. If the answer to question 1 is that
determinism is what keeps this unlicensed, that absence should become a test
in the same shape as the one above, and this paragraph is the note to write it.
