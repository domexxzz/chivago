# 59 — Two sides of the same evidence

On 26 September the owner settled the shape of the ESG business, and the
sentence that settled it was about customers rather than about features:

> บางบริษัทก็มี report อยู่แล้ว หน้าที่เราคือตรวจสอบ วิเคราะห์ ให้ตรงตามหลักการ
> ส่วนบริษัทที่ไม่มี report เราทำให้ทั้งหมดเลย ตั้งแต่ต้นน้ำยันปลายน้ำ

Two kinds of buyer, and **they are not buying the same thing.** One is buying
judgement. The other is buying a system. Most of what this platform has built
over the last month serves one side or the other, and until this document
nobody had said which.

## Side A — the company that already files

They have a sustainability report. They have a consultant, or a team, or a
template inherited from a parent company. What they do not have is anybody
who can tell them whether what they filed matches the standard they filed
under.

**We do not write their report. We check it.**

The worked example is already in this repository. `57-the-token-question.md`
found that beach-cleanup waste is **not** GRI 306-3: GRI defines waste as what
*the holder* discards, and a cleanup collects what somebody else discarded.
The honest home is GRI 3-3-e-ii as a supplementary indicator, or GRI 306 in
the role of a waste *manager*, said as such.

That finding took a day and would have survived a review unchallenged. It is
the product.

## Side B — the company that does not file

No report, or one that is a page of photographs. They are being asked for data
by a customer, a bank, or a regulator, and they have nowhere to start.

**We do the whole chain** — design the quest, agree the KPI before anything
runs, collect the evidence, verify it, issue the statement, hand over the
figures. This is the side the platform was actually built for, and it is a
subscription rather than an engagement.

## What exists, and which side it serves

| built | side | where |
|---|---|---|
| Immutable statement, public verify page, digest anyone can recompute | both | `statement-service.ts` |
| Reversed work stops counting, seven reads | both | #50, #57, #59, #60, #62, #63, #64 |
| **Evidence pack: reconciles a statement against the rows under it** | **A** | #67 |
| **One activity, one filer** | **A** | #66 |
| ESG report, period-bounded, pillar-separated, distinct people | B | `esg.ts` |
| Sponsorship: agreed, received, owed, earned | B | #65 |
| **Voucher face value, and what it refuses to mean** | B | #68 |
| Evidence level: agreed as a column, attained as a derivation | both | #70 |
| KPI per quest, on a closed set of measures and with no formula box | B | #71, #72 |
| **Reading a partner's own file without adopting it** | **A** | #73 |
| **An assurer's conclusion, carried without being made** | **A** | #74 |

The reversal sprint sits under both, because it is not a feature. It is what
makes any figure above it worth printing.

The last four rows arrived on 26 September, after the rest of this document
was written, and two of them make a section below untrue. It is rewritten
rather than quietly corrected — see the next heading.

## The limit on side A, and the day it lasted

This section used to say something that is no longer true, and the honest
thing is to leave the claim visible rather than edit it away:

> Side A's evidence is not in our ledger. Every tool built for them reads rows
> this platform recorded... So side A is, today, a **service** that uses our
> judgement, with this platform as a reference implementation rather than the
> system of record.

It named two things that would change that, and said neither was small: an
import path for somebody else's activity data, and a way to attest to a figure
whose evidence we never held.

**Both shipped the same day**, in #73 and #74. What was slow was not the
building; it was that nobody had written down which side each thing was for,
so nobody could see that two gaps were the whole gap.

The limit as it now stands is narrower and worth stating precisely. An
imported file is still **level 1 evidence** — somebody typed it — and the
review it produces says so above every figure. What the platform can do is
tell a company what is wrong on the face of their own file: dates outside the
period they claim, identical rows, mixed units, a stated total their own rows
do not add up to. What it cannot do, and must never appear to do, is make an
imported figure true. `declared.ts` refuses that in its shape: a review has
nowhere to put a digest, and a test holds it there.

So side A is now a product with a service around it, rather than a service
with a platform beside it. The judgement is still ours and still the thing
being bought. The difference is that the judgement now arrives with the file
already read.

## What each side still needs

Three of the six items this section carried on 26 September were closed the
same day. They are struck through rather than deleted, because a list that
only ever shows what is left hides how fast it moved and why.

**Side A**

- An indicator mapping layer that **refuses** the wrong indicator, not merely
  suggests the right one. The 306-3 finding generalised: the value is in the
  no. **Still open, and now the largest single item on either side.**
- ~~An import path.~~ #73. Reads a pasted sheet, matches columns by name in
  Thai or English, and produces a **review, never a statement**.
- ~~Countersignature.~~ #74. Bound to the digest the statement had, appended
  rather than edited, withdrawable without being deleted, and carrying all
  four opinions including the three nobody wants.

**Side B**

- ~~Evidence level as a field.~~ #70. The agreed rung is stored; the attained
  one is derived on every read. It also turned up that a geofenced arrival
  proves nothing while `CHIVAGO_FENCE_OFF` is set, which production has had
  set since the pitch — so `fence_enforced` is recorded from now on and
  unknown earns no rung.
- ~~KPI, unit, formula, baseline, target, per quest.~~ #71 and #72. Five of
  the six, and **the formula is refused on purpose**: a free-text formula lets
  `attendees × 3.2 kg CO₂e` into a contract and the platform prints the
  product of a measurement and a coefficient it has never held.
- **A merchant who states a price.** Still open, and still not a code problem.
  #68 gave the market somewhere to put one and deliberately left all six
  seeded offers at `null`, because they name real businesses on Samui.
- Consent and retention as fields rather than as behaviour. Still open, and
  closer to PDPA than to ESG.

## What each side pays for

Side A is priced per engagement: a review of one filing, against one standard,
with the evidence trail behind it. It needs no platform adoption at all, which
means it can be sold to a company that will never run a quest.

Side B is priced per year: the account, the reports it produces, and the
statements it issues.

The arithmetic done on 26 September put a plausible mix at about **12.7 M THB
a year at fifty thousand travellers**, against a platform running cost of
**757,332 THB a year**. The ratio matters more than either number: **six
customers at 150,000 covers the whole platform.** Everything after that is not
about scale, it is about staffing.

**Neither side needs the payment rails.** #65 split agreed money from received
money so an invoice can be recorded honestly, and that is the whole
requirement. Taking money *through* the platform — routing sponsor funds to
hosts — makes us a payment intermediary, and that is item eight on the
lawyer's list in `57`.

## One disagreement, unresolved

The framework note says, of co-funding:

> ไม่อ้างผลซ้ำ เมื่อมีหลายผู้สนับสนุน ต้องกำหนดสัดส่วนหรือบทบาทของแต่ละราย

`claims.ts`, merged in #66, **refuses to define a proportion.** Its header
gives the reason: splitting needs to know whose baht paid for which cleanup,
nothing knows that, and a 50/50 rule would be an invented attribution wearing
the clothes of arithmetic. It discloses instead — *nine of these forty are
also in another partner's report* — on the grounds that an auditor can act on
that and cannot act on 4.5.

The two readings agree if "บทบาท" means *disclose who else took part*. They
conflict if it means *assign each partner a numeric share*. **It is a product
decision and it has not been made.** The code currently implements the
stricter reading, which is the safer one to be wrong in: a disclosure can
become a split later, and a split that turns out to be invented cannot be
withdrawn from a filing somebody already made.

## The ladder now reaches four

`evidence-level.ts` grades evidence one to four and, when it was written, said
that four is *a third party checking that approval, which this pack supports
and does not perform*. That sentence was accurate and slightly sad: nothing in
the system could hold somebody else's opinion, so rung four was a label with
no way to reach it.

#74 built the way. An accredited assurer's conclusion attaches to the digest
the statement had, and the platform carries it **without ever having made it**
— every sentence on the page has the firm as its subject, and a test asserts
the page never says "this statement is assured".

What has not changed is who does the work. ChivaGo is still rung three and
still says so on every document. What is new is that rung four has somewhere
to land.

## What could not be verified

The revenue figures are **modelled, not quoted**. The Fly prices behind the
running cost are read from Fly's own page and converted at 33.3 THB; the
customer counts, the price points and the mix are assumptions chosen to order
the options, not forecasts.

**No customer has bought either side.** Every claim here about what a buyer
wants is inference from the framework note, from `57`, and from what the
standards require — not from a signed engagement.

The GRI reading in `57` is a reading, done against published guidance and not
against a ruling or an assurer's opinion.

## What holds it

The first version of this document changed no code, and said so. What it
changed was which questions counted as answered — and within hours of it
naming two open gaps on side A, both were closed. That is the argument for
writing the list down rather than carrying it in somebody's head: **the gaps
were not hard, they were unnamed.**

Eleven features are now on the table above, each in a column. The next commit
on either side should be able to point at a row and say which one it lands in.
A feature that lands in neither is a feature nobody has found a buyer for yet,
and saying so early is cheaper than saying it after it ships.

This document has now been wrong once, about the thing it was most confident
about, and lasted less than a day before it had to be rewritten. That is the
right failure rate for a document about a business that is still being built.
The version that is never wrong is the one that never said anything.
