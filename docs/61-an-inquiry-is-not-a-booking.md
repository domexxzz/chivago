# 61 — An inquiry is not a booking

`docs/56` named the gap on 17 September and nobody has touched it since:

> **Booking.** The proposal's Travel Marketplace is hotels, tours and inquiry
> flows. What exists is a points-to-voucher marketplace that settles to local
> merchants. Nothing in the repository books anything.

On 28 September the owner asked for the travel marketplace to move. This is
the decision about *which* marketplace, made before any code, because the two
obvious versions carry very different obligations and the code would
otherwise make that choice silently.

## What exists

| built | what it does | what it refuses |
|---|---|---|
| `MarketScreen` | Trip and Green points buy vouchers at six local merchants; the merchant scans to settle | every offer is unpriced in baht until the merchant says otherwise (`seed.ts`) |
| `trip-planner.ts` | an explainable constraint solver that orders real places into a day | *"book anything, price anything live, or read a road network"* |
| `PlaceScreen` | a place, its scores, its reviews | — |
| the notification outbox | a row written in the same transaction as the event; push afterwards, inbox always | — |

None of it lets a traveller reach a hotel, a boat or a guide and ask a
question.

## The two marketplaces

**Booking.** The traveller picks a date, pays, and is confirmed. This is what
the word "marketplace" suggests and it is the wrong first build, for three
reasons that stack:

- **It takes the traveller's money.** `docs/57`'s list for the lawyer already
  says that routing money through the platform makes it a payment
  intermediary. A booking is that, for every stay.
- **It sells tours.** The same list asks *whether trip planning needs a
  tourism licence*. Selling a tour package is the case that question is
  about, and a platform that confirms and charges for one is much closer to
  operating a tour business than one that passes a question along.
- **It needs inventory it does not have.** A confirmed booking needs the
  operator's live availability. Hotels keep that in channel managers; boat
  co-ops keep it in a notebook. Neither is a weekend of integration.

**Inquiry.** The traveller asks an operator a question — *two people, the
longtail to Koh Taen, Saturday morning?* — and the operator answers. Nothing
is reserved, no money moves through ChivaGo, and the operator is the seller
from the first word to the last. This is what the proposal actually named, and
it is the version whose obligations are **small, known, and the same ones this
platform already carries**: a message between two people, delivered through
an inbox that exists.

**Inquiry is built. Booking is not, and this document is the place that says
so.** Booking becomes possible later on top of inquiry — an answered inquiry
is exactly where a booking would start — and nothing built here has to be
undone to get there.

## Five decisions

**1. An inquiry reserves nothing, and every screen says so.** The traveller's
confirmation reads *sent*, never *booked*. An operator's answer reads
*answered*, never *confirmed*. The same discipline that refused to call a
declared use a retirement, or a stand-down an Article 6 adjustment: the word
is where the misunderstanding starts.

**2. The operator is the seller, and is named on everything.** Price,
availability and terms are the operator's. A figure in an answer is *the
operator's quote*, shown with the operator's name as its subject — the rule
`countersign.ts` set, where the subject of every sentence is whoever made the
claim.

**3. A tour carries the licence number its operator states — or is not
listed.** A listing of kind `tour` cannot be published without a stated
Department of Tourism licence number, and the page shows it as **stated, not
verified**, because nobody here can check it. That is a protective default,
not a legal conclusion: *which* activities count as a tour is itself one of
the questions for the lawyer, and the design keeps that answerable by making
the category explicit rather than guessed.

**4. The conversation stays in the app.** The operator answers in the host
console; the traveller reads it in the inbox the notification outbox already
feeds. No phone number or email is handed to an operator by the platform. A
traveller who wants to share one can type it into their own message — their
choice, made by them, which is the only kind of consent that PDPA question
needs.

**5. Nothing on a listing is invented.** A "from" price is the operator's own
figure or it is absent, exactly as `valueTHB` is null on all six seeded
offers until a merchant says otherwise. And no operator is seeded: the named
businesses on Samui are real, and a listing is a claim made in their name.

## The states

```
sent ──▶ answered
  │  ╲──▶ declined
  │   ╲─▶ withdrawn   (by the traveller)
  ╰─────▶ expired     (no answer in time — derived, never written)
```

`expired` is **derived**, not stored: an inquiry nobody answered within the
window reads as expired on every read, the same argument `evidence-level.ts`
made for the attained rung. A stored `expired` is a second copy of the clock
that drifts the day the window changes.

An answered inquiry is **not a contract** and the state machine does not
pretend otherwise. There is no `confirmed`.

## What ChivaGo earns from it

Not a commission on money it never touches. The honest models are a fee per
answered inquiry or a listing subscription, settled with the operator
directly — the same off-platform settlement `#65` already records honestly
for sponsors. This document does not build billing; it notes that the model
exists and does not require holding a traveller's baht.

The metric that matters to an operator buying leads is **how fast they
answered** — derivable from two timestamps, and worth showing a traveller as
a trust signal once there is enough of it to be more than an anecdote.

## Staging

1. **The record.** `inquiry.ts` in core for the states and what each refuses;
   `listings` and `inquiries` in the schema; a service that sends, answers,
   declines and withdraws — with the tour-licence rule and the derived expiry
   enforced where only the database can hold them.
2. **The operator's side.** A console page listing the operator's own
   listings and the inquiries waiting on them, with a reply that reaches the
   traveller through the existing outbox. **Done in `#89`.** Waiting
   inquiries lead the page, soonest deadline first, each saying how long is
   left — from `answerBy`, the same instant the rule enforces, so the page
   cannot promise time the server will refuse. The reply form says, where
   the operator types, that answering confirms nothing.
3. **The traveller's side.** An inquiry form, the traveller's own questions
   with each operator's answer, and a way in. **Done in `#90`**, and not
   where this line first put it. Listings are **not in the market**: a
   voucher is a transaction and an inquiry is deliberately not one, so
   sharing a screen would blur the line this document draws. And **not on
   place pages**: a listing says where it is in the operator's own words,
   not as a place id, so there is no honest join between the two yet. They
   have their own screen, *Stays & tours*, reached from the trip planner —
   where a traveller wonders about a boat or a bed. The form runs the
   server's own `inquiryProblems`, and the server's refusal now names each
   problem, so the two cannot disagree about what a valid question is. A
   send that fails is said inside the sheet, under the button: verifying the
   screen showed that a toast draws beneath the sheet, and a refusal sent
   there looked like a button that did nothing. The "thread" is one question
   and one answer; a follow-up is a new question. Listings sit behind a
   device key exactly as offers do — showing them to the open web is its own
   decision, and a test pins it. The demo shows the empty list: not even a
   demo invents an operator.

## What could not be verified

- **Whether an inquiry channel needs a tourism licence at all.** The design
  assumes it is much further from one than a booking engine is. That is an
  assumption, and it is the first question for the lawyer engagement
  `docs/57` already recommends.
- **Which activities count as a tour.** A longtail boat trip to Koh Taen may
  or may not be. Decision 3 makes the category explicit so the answer, when it
  comes, changes one rule rather than every listing.
- **Whether operators will answer.** A lead channel is only worth what its
  response rate is, and there is no operator on the platform yet to measure.
- **No operator has been asked.** Every claim here about what an operator
  wants is inference.

## What holds it

The easiest thing to build next would be a *Book* button. It would demo
beautifully and it would quietly decide two legal questions nobody has
answered. This document exists so that the button, when it comes, comes on
purpose.
