# 69 — The guide program: what we can offer a guide, and what we cannot yet

On 25 October the owner asked how ChivaGo would bring tour guides on board,
for Thai and foreign travellers alike: *imagine you are a real guide and
somebody pitches this to you — what would make you join?* This is the answer,
written before any code: the offer, the phases, how we will know it is
working, and the legal questions each phase has to clear first.

It is written against `docs/61` (inquiry, not booking), `docs/62` (what an
operator account is) and `docs/67` (the door for operators), because the
first pitch made in conversation was not, and two parts of it were wrong.

## What changed from the first pitch

- **"0% commission for six months, then 10%"** assumed ChivaGo takes a cut of
  the guide's price. It does not and cannot: `docs/61` built inquiry, not
  booking, so **no traveller's money passes through the platform**, and there
  is nothing to take a commission from. The honest models are the two
  `docs/61` already names — a fee per answered inquiry, or a listing
  subscription, settled with the guide directly.
- **"Next-day payout, a deposit against no-shows"** both need the platform to
  hold money. That is booking, which `docs/61` deferred for reasons that still
  stand. These move to the last phase, behind the lawyer.
- **"A guide is an operator who also verifies"** contradicts `docs/62`, where
  an operator verifies nothing and is kept off the host board on purpose. A
  guide who verifies is a new kind of host, and that is a decision, made in
  phase 3 below rather than assumed.

## Who a guide is here

**A Thai national holding a Department of Tourism guide licence.** Guiding is
understood to be an occupation reserved to Thai nationals (to confirm — see
the legal list). So *for Thai and foreign travellers* means both **audiences**:
foreign travellers are customers, and a foreign resident cannot be listed as a
paid guide.

The licence card type limits whom a guide may take and where. The listing
records the type alongside the number, and shows both as **stated, not
verified**, exactly as a tour's licence is shown today (`LICENCE_STATED`).

On the system side a guide starts as what already exists: a host of type
`operator`, joining through `/apply`, listing with kind `tour`, which cannot
be published without a stated licence number. Nothing new is needed to list
the first one.

## What a guide is tired of

The pitch has to answer these, in the guide's own terms, or it is not a pitch:

1. **The cut.** The large tour marketplaces take a significant share of every
   booking (commonly cited at 20–30%; to confirm per platform).
2. **Slow money.** Payouts weeks after the trip.
3. **Reviews nobody can check**, and no-shows the guide absorbs alone.
4. **The customer belongs to the platform.** A traveller who loved the day
   books someone else next year through the same app.
5. **A boat trip cancelled for the sea** counts against the guide as if it
   were their fault.

## The offer

| what we offer | available | what it rests on |
|---|---|---|
| **Free listing for founding guides** — the first 20, for six months | phase 1 | nothing to build; billing does not exist yet (`docs/62`) |
| **Then a flat fee, never a cut** — per answered inquiry or monthly, the guide's choice | phase 2 | `docs/61`'s two models; settled off-platform |
| **The guide is paid directly**, by PromptPay or cash, as today | phase 1 | no money through ChivaGo (`docs/61`) |
| **Not exclusive** — keep every other channel | phase 1 | nothing to build; written into the founding terms |
| **A visible response time**, the trust signal that matters to a traveller | phase 1 | exists, after five answers (`docs/62`) |
| **Both audiences on one listing** — Thai and English throughout | phase 1 | listings are already TH/EN |
| **Seen by ChivaGo** — a mark that the owner has seen the licence in person | phase 2 | new; distinct from *stated* and never shown as a government check |
| **Notified anywhere**, not only with the console open | phase 2 | LINE or email; `docs/62` lists it as missing |
| **A traveller can ask the same guide again** from their history | phase 2 | the inquiry already names the operator |
| **Cancelled for the sea, said so with the reading** | phase 2 | the sea-and-sky service (`#143`) |
| **Hotel concierges point guests at guides in the system** | phase 2 | hotels are already hosts; an introduction, not a referral fee |
| **Paid to verify** — a sponsor's per-verified rate for green activity the guide leads | phase 3 | `org_sponsorships.per_verified_thb` exists; the guide-as-verifier type does not |
| **Deposits, in-app payment, fast payout** | phase 4, not scheduled | booking, and every legal question that comes with it |

**What we do not offer, and say so:** ownership of the traveller's contact
details. `docs/61` decision 4 keeps the conversation in the app, and a
traveller's phone number reaches a guide only if the traveller types it. A
guide will ask for this. The answer is that the traveller shares it if they
want to, which is also why the traveller trusts the platform.

**Reviews.** A review of a named person is a heavier thing than a review of a
café. An answered inquiry does not prove the trip happened, so a guide review
is accepted only where something does: in phase 3, an activity the guide led
and a second party verified. Until then a guide's page shows response time and
the licence, and no stars.

## Thai and foreign travellers are different customers

| | Thai travellers | foreign travellers |
|---|---|---|
| books | late, often the same week | ahead, often before arriving |
| in a | family or friends group | couple or small group |
| looks for | food, photo spots, community trips, value | licence, language, safety, reviews |
| pays | PromptPay | card, sometimes cash |
| reached through | LINE, Facebook | the app, the hotel concierge |
| needs on the listing | price stated up front, group size | languages spoken, what is included, the licence |

**One price for everyone.** A listing states one "from" price, if it states
one at all. Different packaging for different audiences is fine; different
prices for the same trip by nationality is not something ChivaGo will display.

**Languages.** The listing needs a *languages spoken* field, which does not
exist yet, and the traveller's browse needs to filter on it. On Samui, English
alone will not do.

## Phases

### Phase 0 — Listen (two to three weeks)

Interview 10–15 licensed guides on Samui before building anything. Ask what
they earn now and through whom, what the platforms cost them, whether a flat
fee or a monthly fee feels fairer, how they want to hear about a question, and
which green activities they already lead.

**Exit:** at least ten say they would list for free, and a majority name a
fee they would pay after six months. If not, the offer is wrong and this
document is rewritten before phase 1.

### Phase 1 — Founding guides (months 1–2)

- Twenty guides through `/apply`, each approved by the owner after a
  conversation and a look at the licence card — the `docs/62` runbook,
  unchanged.
- Each lists at least one tour, licence number and card type stated.
- Inquiry only. The guide answers in the console; the traveller reads it in
  the inbox.
- Founding terms in writing, in Thai: free for six months, not exclusive,
  what the fee will be after, and that it can be left at any time.

**Exit:** fifteen of the twenty have answered at least one real inquiry.

### Phase 2 — Trust (months 3–4)

- The *seen by ChivaGo* licence mark.
- LINE or email notification of a new question.
- A guide page: languages, licence, response time, the trips listed.
- The languages field and filter.
- *Ask again* from a traveller's history.
- Billing begins for guides past their free period, settled directly.

**Exit:** most founding guides still listing after the first invoice.

### Phase 3 — The guide as verifier (month 5 onwards)

This is the part no other platform can offer, and the one that needs the most
care. A guide who leads a beach clean-up or a reef trip is standing right
there; a sponsor already pays per verified activity. Letting the guide verify
needs, first:

- **A host type decision.** Either a new type `guide` that can list *and*
  verify the quests it leads, or the existing rule — a hotel that lists keeps
  its whole console — extended to guides. Either way, decided on what the
  guide *is*, as `docs/62` requires, and the SOS desk stays closed to it.
- **A conflict-of-interest rule.** A guide paid per verification of their own
  tour has a reason to verify generously. Guide-verified points must say who
  verified them, and a share must be checked by a second, unpaid host before
  they count toward a sponsor's report.

Only after both is a guide paid a sponsor's rate, and only then do guide
reviews open, tied to a verified activity.

### Phase 4 — Booking and payment (not scheduled)

Deposits, in-app payment and payouts. Not started until every phase-4 item in
the legal list below has an answer. An answered inquiry is where a booking
would begin, so nothing built in phases 1–3 has to be undone (`docs/61`).

## How we will know it is working

| measure | definition | where it comes from |
|---|---|---|
| **active guides** | answered at least one inquiry in the last 30 days | `inquiries` |
| **inquiries per guide per month** | median, not mean | `inquiries` |
| **answer rate** | answered ÷ (answered + declined + expired) | `inquiries`; expiry is derived |
| **response time** | median hours to answer | two timestamps, as today |
| **asked again** | travellers who sent a second inquiry to the same guide | `inquiries` |
| **Thai / foreign split** | every measure above, by the traveller's app language | a proxy, and labelled one |
| **trips that happened** | guide's own count, asked monthly | a check-in call — the app cannot see it |
| **guide income** | self-reported, at month 0, 3 and 6 | the phase 0 interview, repeated |
| **retention after the free period** | founding guides still listing two months after billing starts | `listings` |

The last two are the ones that matter. Guides tell each other what a platform
did to their income, and that is the recruitment channel for every guide after
the first twenty.

**Starting targets, which are guesses and will be replaced by phase 0:**
twenty founding guides, fifteen active by month 2, median response under 24
hours, and at least 60% still listing after billing begins.

**Where to find the first twenty:** the guide associations, Samui guide
groups on Facebook, the TAT office on Samui, hotel concierges who already
call guides they trust, and community-based tourism groups.

## Legal points to check

Each is attached to the phase that cannot start without it. They are
questions, not conclusions. They go to the lawyer alongside the lists in
`docs/57` and `docs/61`.

**Before phase 1**

1. **Is guiding reserved to Thai nationals** under the current list of
   occupations prohibited to foreigners, and does that affect a foreign
   resident who *assists* a licensed guide without pay?
2. **May a licensed guide sell a trip directly to a traveller**, or must they
   work under a company holding a tour business licence under the Tourism
   Business and Guide Act B.E. 2551? If the latter, a guide's listing has to
   name that company, and the application form has to ask for it.
3. **Does listing guides and passing inquiries make ChivaGo a tour
   business?** `docs/61` asked this for operators; a platform that lists
   individual guides is the sharper case.

**Before phase 2**

4. **Checking a licence.** Is there a Department of Tourism register we may
   check against, and may we display a guide's licence number and card type
   on a public page under the PDPA?
5. **Founding terms.** The free period, the fee and the exit in a short Thai
   contract that a guide can read in five minutes.

**Before phase 3**

6. **Reviews of named individuals** — defamation exposure, and the guide's
   right to respond.
7. **A guide paid per verification** — does it change what a ChivaGo
   statement may claim about who stood behind the activity, and how is a
   sponsor's payment to an individual taxed and withheld?

**Before phase 4**

8. **Holding travellers' money** — whether it makes ChivaGo a payment
   intermediary needing a licence (already on the `docs/57` list).
9. **Selling a tour** — whether confirming and charging for one requires a
   tour business licence, and the insurance for travellers such a licence
   carries.
10. **Deposits and refunds** — what consumer protection law requires when a
    trip is cancelled by the guide, by the traveller, or by the sea.

## What this does not decide

The fee amounts, which phase 0 sets. Whether guides are a new host type or an
extension of an existing one, which phase 3 decides. Anything about booking,
which waits for the lawyer.
