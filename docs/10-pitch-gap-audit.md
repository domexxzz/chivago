# Pitch deck vs. built system — gap audit

Audited 2026-08-31 against the "Chiva Go Samui" hackathon deck
(artifact 95558d28, 12 slides) and the code in this repo.

The deck pitches a national Wellness Travel OS. This repo builds the Koh Samui
mobile app from `design_handoff_chivago`. Those are not the same scope, and the
difference is not a criticism of either — but a pitch that claims a feature is
demoable had better have something to open when a judge asks.

## The finding that matters most

The deck's roadmap slide has a column headed **"วันนี้ · จำลองใช้งานแล้ว (NOW)"**
and slide 09 marks six systems **DEMO LIVE**. Against this codebase:

| Deck says DEMO LIVE / NOW | In this repo |
|---|---|
| Digital Twin 3D | 2D SVG map with interactive pins. No 3D, no tiles. |
| AI Trip Planner | Day view assembled client-side from saved places + joined quests. No AI, no budget/weather/health input, no server route. |
| Price Forecast | Nothing. No price field exists anywhere. |
| Smart Route | Nothing. No routing, no transport legs. |
| Wellness Engine · Mood Check-in · Chiva Balance | Onboarding wellness profile weights the Healthy Score. No mood check-in, no Balance Score. |
| Game Layer · EXP · Level · Rank | Five badge tiers on a points balance. No EXP, no level number, and the five rank names in the deck do not exist. |

If "DEMO LIVE" refers to a **separate pitch prototype** (the deck footer credits
"Chiva Go Prototype" photos), that prototype is not in this repo and this audit
cannot see it. Confirm which artefact the judges will be shown. If it refers to
this codebase, four of those six have nothing to open.

## Slide 03 — the eight pain points

The deck's central promise is that all eight are closed in one platform.

| # | Pain point | Deck's answer | Built | Note |
|---|---|---|---|---|
| 01 | Price volatility | Price forecast + reference price | **No** | No price data model at all |
| 02 | Multi-leg travel | Smart Route (plane/boat/car/songthaew/moto) | **No** | No routing engine, no transport schedules |
| 03 | Language barrier | Live translate 12+, tone preserved | **No** | App is EN/TH only. Console is EN/TH switchable. A static "Thai↔English interpreter on call" label in the Safety Shield is a label, not a service. |
| 04 | Unsafe | Safety Live 24/7 + SOS with real position | **Yes** | Built past the deck. See below. |
| 05 | Fake reviews | Reviews verified by real check-in | **Yes** | Built — `12-reviews.md`, with a moderation desk in `13-review-moderation.md`. A review cannot exist without a geofenced check-in at that place. |
| 06 | Exhausting trips | Wellness Engine + Chiva Balance | **Partial** | Healthy Score is real, explainable and profile-weighted. Chiva Balance and Mood Check-in do not exist. |
| 07 | Concentration | Quests to secondary towns and community shops | **Partial** | Quests and community/NGO/municipality hosts exist. No dispersal logic and no metric that shows visits moved anywhere. |
| 08 | Environmental burden | Green Point + Impact Ledger | **Partial** | Green Points earned through verified quests, yes, and now a distinct currency that self-reported activity cannot reach. Impact Ledger partial. Carbon credit, no. |

**Two of eight closed. Three partial. Three not started.**

> Updated: the point economy below is now built. The eight pain points are
> unchanged by that work - a currency split closes no pain point on its own.

## Slide 10 — the point economy

The deck headlines **two currencies**. The build has **one**.

| Deck | Built |
|---|---|
| **Trip Point** — place check-ins, food/travel missions, completing a Wellness Route, reviewing and sharing | Does not exist. There is no check-in earn, no route completion, no review earn. |
| **Green Point** — beach cleanup, coral planting, low-carbon travel/stay/shop choices, verified by location + photo | `wallets.balance`, earned only from host-verified quests. The location + photo verification the deck describes is built and works. Low-carbon choice earning does not exist. |
| Redeem for partner discounts and level perks | Vouchers with QR codes and merchant redemption — built, and beyond what the deck claims. |
| Convert to **Carbon Credit** an organisation can buy | Nothing. See "not a software problem" below. |
| Island-level **Impact Ledger** government and orgs cite | `community_metrics` gives actual/target totals. The per-action ledger is a *points* ledger, not a CO₂/impact ledger, and nothing is auditable to a standard. |

Slide 01 states "2 สกุลแต้ม Trip · Green" and "CO₂ Carbon Credit Ready" as
headline stats. Both are currently false of this codebase.

## What is built that the deck never mentions

The deck undersells the work in one specific and costly way: the machinery that
makes its ESG claim *auditable* is invisible in the pitch.

- **Host console** (bilingual EN/TH, session auth, CSRF, host-scoped) — the only
  way points are ever released. Without it, every impact number in the deck is
  an unverified self-report. This is the answer to "how do you know they really
  picked up the rubbish", and it is not on any slide.
- **Push notifications** — outbox written in the same transaction as the award,
  retry with backoff, token pruning, keyed templates rendered per reader.
- **SOS dispatch** — four channels with counted, never asserted, delivery.
- **Escalation ladder** — three rungs, idempotent, tells the traveller when
  nobody answered.
- **Background location** — trail not just a pin, offline queue, honest
  "no signal for 8 min" state.
- **Public live-location link** — a family member abroad can follow without an
  account.
- **Voucher system** — real artefact with expiry and merchant settlement, not a
  toast.
- **PDPA consent** with notice versioning and a right-to-erasure cascade.
- **Live air quality** with per-metric provenance, and the honest admission that
  no station exists on the island.
- **Healthy Score** — profile-weighted, staleness-aware, fully explainable.

Slide 09 marks Safety Live as **NEXT**. It is the most complete subsystem in the
repo. That is a slide worth correcting before the pitch, not after.

## Sizing the gaps

Ordered by pitch value per unit of work.

**Cheap, and closes a headline claim (hours)** — DONE, see
`11-points-and-progression.md`
1. ~~**EXP / Level / Rank**~~ **BUILT.** The deck shows "Level 12 · Island Explorer ·
   2,480 / 3,900 EXP" and five named ranks (Newcomer → Wanderer → Island
   Explorer → Samui Insider → Chiva Legend). The repo has five differently-named
   badge tiers on the points balance. Aligning names and adding a level number
   was a change to `BADGE_TIERS` and `wallet.ts`, plus the wallet screen. The
   curve now reproduces the deck figure exactly, and a test asserts it so the
   slide and the app cannot drift apart.
2. ~~**Two currencies**~~ **BUILT.** `wallets.balance` is split into `trip_points` and
   `green_points`, tag each `ledger` row with its currency, and add the earn
   rules for check-ins. The ledger and idempotency machinery already exist;
   this was a schema migration and a service change, not new architecture.
   Place check-ins were added alongside, because a currency with no earn is a
   label rather than a currency.

**Medium, and genuinely differentiating (days)**
3. ~~**Verified reviews**~~ **BUILT.** The geofence pipeline was already there,
   so this was mostly wiring existing parts. See `12-reviews.md` — including
   what the claim does NOT cover, which matters more than what it does.
4. **Mood check-in + Chiva Balance** — this is the deck's emotional core
   ("no platform ever asks whether you came back healthier"). It needs a real
   decision on what Balance *means* before any code: a self-report scale, a
   derived index, or both. Do not ship a number nobody can define.

**Blocked on a decision, not on engineering**
5. **3D Digital Twin** — open question 1 (tile provider) is still unanswered and
   now blocks two things: the deck's 3D headline and the polyline on the SOS
   duty desk. Google Photorealistic 3D Tiles is metered per session; MapLibre
   with terrain is far cheaper and far less impressive. Pick one and the work
   becomes ordinary.
6. **Live Translate** — feasible, but it is a per-call cost with no free tier at
   quality, and "preserves the speaker's tone" is a claim about output quality
   that needs testing in Thai before it goes on a slide.

**Needs real data before it can be honest**
7. **Price Forecast** — requires partner rate feeds or scraped history. A
   forecast with no data behind it is a made-up number shown to someone deciding
   how to spend money.
8. **Smart Route** — requires ferry timetables, songthaew routes and stop data
   that largely does not exist in machine-readable form for Samui. This is a
   data-collection project first and a routing problem second.

**Not a software problem**
9. **Carbon Credit conversion** — a credit is a methodology, an accredited
   verification body and a registry. Software can produce the evidence trail;
   it cannot mint a credit. "Carbon Credit Ready" is defensible on a slide only
   if it means *the evidence is structured so a verifier could audit it* — which
   would first require the Impact Ledger to record CO₂-equivalent, not points.
10. **24/7 staffing** — the SOS desk software runs. Nobody is watching it. The
    "24/7" on slide 01 is an operations commitment, not a build item, and it is
    the single most dangerous claim in the deck if made before someone is
    actually rostered.

## Recommendation before the pitch

Two things, in this order.

1. **Make the deck true.** Either move the four unbuilt systems out of DEMO LIVE,
   or point them at whichever prototype does demo them. A judge who opens one
   and finds nothing costs more than a slide with fewer claims on it.
2. **Put Safety Live and the host console on a slide.** They are built, they are
   the hardest parts, and they are what turns "we track impact" from a promise
   into something an auditor could check. Right now the pitch's strongest
   evidence is the part it does not mention.

Everything else is a scoping decision for after the hackathon.
