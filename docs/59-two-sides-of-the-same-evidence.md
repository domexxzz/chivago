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

The reversal sprint sits under both, because it is not a feature. It is what
makes any figure above it worth printing.

## The limit on side A that has to be said out loud

**Side A's evidence is not in our ledger.**

Every tool built for them — the evidence pack, the exclusivity check, the
reconciliation — reads rows this platform recorded. A company that already
files has its numbers in a spreadsheet, an ERP, and somebody's inbox, and
nothing here can reach them.

So side A is, today, a **service** that uses our judgement, with this platform
as a reference implementation rather than the system of record. That is a
real business and it is not the business the platform automates. Pretending
otherwise would put us in front of a buyer promising a check we cannot run.

Two things would change that, and neither is small: an import path for
somebody else's activity data, and a way to attest to a figure whose evidence
we never held. Both are open.

## What each side still needs

**Side A**

- An indicator mapping layer that **refuses** the wrong indicator, not merely
  suggests the right one. The 306-3 finding generalised: the value is in the
  no.
- An import path. Until there is one, every engagement starts with a
  spreadsheet somebody emails.
- Countersignature. The statement is immutable and digested; an accredited
  assurer could sign against that digest, and the platform would carry real
  ISAE 3000 assurance without ever claiming it itself.

**Side B**

- **Evidence level as a field.** The framework note of 26 September grades
  evidence one to four — self-reported, digital trace, partner-verified,
  third-party checked. Everything this platform produces is level 3, and
  `EVIDENCE_LEVEL` in `evidence.ts` now says so on the document. It is a
  sentence, not a column: a contract that requires level 2 for one indicator
  and level 4 for another cannot be expressed.
- **KPI, unit, formula, baseline, target, per quest.** A quest carries an
  `esg_pillar` and nothing else. The framework note asks for all six, agreed
  before the project starts, and that is the right order — a KPI agreed
  afterwards is a KPI chosen to suit the result.
- **A merchant who states a price.** #68 gave the market somewhere to put one
  and deliberately left all six seeded offers at `null`, because they name
  real businesses on Samui. The S-pillar figure exists as code and has no data
  until somebody rings the shop.
- Consent and retention as fields rather than as behaviour.

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

Nothing in this document changed any code. What it changes is which questions
count as answered: the shape of the business was settled on 26 September, and
until now the repository recorded seven features without recording who each
one was for.

The next commit on either side should be able to point at a row in the table
above and say which column it lands in. A feature that lands in neither is a
feature nobody has found a buyer for yet, and saying so early is cheaper than
saying it after it ships.
