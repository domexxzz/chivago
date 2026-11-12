# 73 — A placement is not a recommendation

`docs/61` decided *which* marketplace before any code existed, because the two
obvious versions carried different obligations and the code would otherwise
have chosen silently. This is the same kind of document for the same kind of
moment.

On 11 November the owner named what **ChivaGo Connect** is, from the revenue
model's section C:

> **C. Chiva Go Connect — Solution Discovery & Promotion.** Show partner logos
> and promote their projects — the example given is Sentriara, water solutions
> — with links straight to the partner's own site. The partner or solution
> company pays. Revenue: **Featured Listing, Campaign Fee, Referral Fee.**

So Connect is an **advertising surface**. Not an integration, not an API, not
a login. Money from a party who is not the traveller, in exchange for being
seen by the traveller.

The menu is parked. This document is written while it is parked, on purpose:
every rule below is cheap to agree today and expensive to argue once a deal is
close.

## Why this product in particular

This app's entire claim is that its numbers mean something. A Healthy Score is
measured. A Green Point exists because a host passed a proof. A licence number
is shown as *stated, never verified*, because nobody here checked it. An
operator that does not exist says **Example · not a real business** everywhere
its name appears.

Advertising is the first thing this platform has sold that is **not evidence
and does not want to look like an advertisement**. That is the whole risk, in
one sentence.

## What exists already, and what it is worth here

| already built | what it establishes |
|---|---|
| `org_sponsorships` | money is already modelled, and its `basis` column is `'declared'` or `'signed'` — the schema already separates what somebody said from what somebody countersigned |
| `questOrder`, and its test | **the rule against ordering by money is already written** — see below |
| `docs/61` decisions 2 and 5 | the seller is named on everything; nothing on a listing is invented |
| `LICENCE_STATED` | the sentence this platform uses when it is passing on somebody else's claim |
| `ExampleMark` | the pattern for a label that must appear *everywhere* a thing appears, not once in a footer |
| `healthy-score.ts` | measures **air (US AQI) and crowd**. Not water. This matters in decision 6 |

The ordering rule is real and it is three years of judgement in two lines, but
it lives in a **test comment**, on `questOrder`, in `apps/mobile/test/home.test.ts`:

> Deliberately NOT sorted by reward. Ranking by payout would be the app
> recommending whatever it most wants done and calling it a suggestion.

A rule that lives only in a test comment is a rule that survives until somebody
is in a hurry on a different screen. Moving it here is half the point of this
document.

## The three revenue lines are not equally safe

**Featured listing** — buying a place to stand. The lightest of the three,
and survivable with nothing more than a label that says it was bought.

**Campaign fee** — a campaign has a start and an end, and the hazard is
format: a campaign that reads as an article is the app speaking in a partner's
voice for money.

**Referral fee** — ChivarGo earns per click-through. This is the one the
`questOrder` rule points straight at, because the moment the platform is paid
per click, **everything near the click has an interest in being clicked.**
It also implies click tracking, which is the first time this platform would
record where somebody went *outside* it. That is a PDPA question, not a
product one, and it is listed below as unanswered rather than assumed.

## Six decisions

**1. A paid placement says it is paid, everywhere it appears.** Not once, not
in a footer, not in a settings page nobody opens. `ExampleMark` is the
precedent: the label travels with the thing, in every language, or the thing
does not ship. A reader must never have to work out which rows were bought.

**2. Paid space is its own space.** Connect does not interleave with places
carrying a measured Healthy Score, with `docs/61` listings, or with
`local_shops`. Those surfaces answer *what is true near you*; Connect answers
*who paid to be seen*. Mixing them is how the first becomes worth nothing.

**3. Nothing is ordered by money.** The `questOrder` rule, extended: no
surface sorts, ranks or selects by what was paid. Where anything near paid
content is ordered at all, the screen states the key it was ordered by. A sort
nobody can see is a recommendation nobody can check.

**4. A referral fee is disclosed where the click happens, not only in a
contract.** If leaving for a partner earns ChivarGo money, the traveller is
told so at the point of leaving. A platform that is paid for the journey and
describes it as a suggestion is making a false statement about its own
interest.

**5. A partner's claim stays the partner's.** Logos, copy and links are
theirs, shown as stated and never verified, in the words `LICENCE_STATED`
already uses. ChivarGo does not restate a partner's claim in its own voice,
does not summarise it into something stronger, and does not call a partner a
solution to anything.

**6. A paid placement never stands beside the indicator it sells against.**
Today this is not live: the Healthy Score measures air and crowd, and the
named example partner sells water solutions, so the two do not meet. `docs/60`
is the design for adding indicators, and **the day an indicator ships that a
partner sells a remedy for, that partner leaves that screen.** An app that
reports a condition and takes money from the cure, on the same screen, has
stopped reporting.

## What this does not decide

- **Whether to take the money at all.** That is the owner's call and this
  document assumes the answer is yes.
- **Price, or what a campaign costs.**
- **Who approves a partner, and against what.** Decision 5 keeps ChivarGo from
  vouching, which is not the same as deciding who may appear.
- **Where Connect sits in the app.** The menu is parked; this is about what it
  may look like when it is not.

## What could not be verified

- **Whether any partner is signed.** Sentriara is named in the revenue model
  as an example. `org_sponsorships` would call that `'declared'`, not
  `'signed'`, and so should this.
- **Whether referral tracking is in scope at all.** "Referral Fee" may mean a
  counted click or an agreed flat sum per period. The first needs a PDPA
  answer before it is built; the second needs none.
- **What a partner's site does with somebody who arrives from here.** The link
  leaves the platform and nothing here can follow it, which is an argument for
  decision 4 and against decision 5 ever softening.
- **Whether any of this has been put to a lawyer.** `docs/57` recommended an
  engagement and this adds a third question to its list, after the tourism
  licence and the payment intermediary ones.

## What holds it

The easiest thing to build is a carousel of partner logos on Home that looks
exactly like the row of places above it. It would demo well, it would be the
first revenue this project has ever had, and it would quietly spend the one
thing the product is actually made of.
