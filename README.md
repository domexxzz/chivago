# ChivaGo

**The evidence layer hotels do not have.** Pilot region: Koh Samui, Thailand.

A hotel's sustainability numbers are its own: HCMI and CHSB are computed and
submitted by the hotel, and Thailand's CF-Hotels is a carbon calculator the
hotel fills in itself. None of them can show a third party that a specific
thing happened on a specific day with somebody standing behind it. ChivaGo
produces exactly that — activity a named host verified, inside a geofence, on
a date — as a **statement anyone can check**, attached to the report a hotel
already files. It measures no building and replaces no number.

For the traveller it is a wellness-travel app, bilingual EN/TH throughout:
*เที่ยวให้สนุก* (travel for fun) becomes **เที่ยวอย่างสุขภาพดี** (travel
healthily), with safety and the island's condition on the same screen.

One idea holds the whole product together:

> **A point is only worth something if somebody had to check it.**

Green Points are issued when a **named host** approves a geotagged submission.
Trip Points are self-verified and are never allowed to look like the other kind.
Everything downstream — the leaderboard, the sponsor's report, the ESG filing,
the companions, the passport — is derived from that one ledger, and refuses to
report a number it cannot trace back to it.

**Status as of 2026-09-02:** [`docs/01-build-status.md`](docs/01-build-status.md)
in English, [`docs/32-status-2026-09-02.md`](docs/32-status-2026-09-02.md) in Thai.

---

## Try it

**https://chivago-demo-sigma.vercel.app** — the static demo build. Nothing
is saved (the strip at the top says so): every screen answers from a snapshot
captured from the real API after `demo:reset`, writes mutate an in-memory
copy, and a reload starts over. The host console, real geofencing and real
host verification are not in it; those need the API, below. Rebuild it with
`pnpm --filter @chivago/mobile demo:web` and host `apps/mobile/dist-demo`
anywhere static.

## Run it

**Node 22.15 or newer** (the Dockerfile and CI use 24). `node:sqlite` is
unflagged from 22.13 and the mobile test harness's `module.registerHooks`
exists from 22.15; on anything older every script below fails before it
starts, and the error names a missing built-in rather than the version.

Two processes. The API must be up before the app.

```bash
pnpm install
```

```bash
pnpm seed
```

```bash
pnpm api
```

```bash
pnpm mobile
```

The API listens on `http://localhost:8787`. Expo prints a QR code — scan it with
Expo Go, or press `w` for the browser.

The **host console** is at `http://localhost:8787/console`. The seed prints one
access key per host, **once** — only its scrypt hash is stored, so a lost key is
reissued by reseeding, never recovered.

**On a physical phone**, `localhost` is the phone, not your laptop:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.42:8787 pnpm mobile
```

---

## Tests

```bash
pnpm test
```

**1,608 tests** — 374 core, 787 API, 422 mobile, 25 tokens — plus 11 in the Dart
SDK (`pnpm test:dart`) and 10 in the Swift one (`swift test`). `pnpm typecheck`
covers all four packages. `.github/workflows/ci.yml` runs all of it on every
push, on Linux and macOS, so the numbers above are checked by a machine nobody
owns rather than asserted here.

The API's contract fixtures (`contract/*.json`) are **tracked**. They were
ignored for the first forty commits, which meant five API tests and the whole
Dart suite failed on every fresh clone, and the drift guard they exist for had
no baseline to fire against — while the API renamed a field both SDKs still
decoded. Regenerate with `pnpm contract` against a running server and review
the diff like any other contract change.

The suites run **one package at a time**, deliberately. In parallel they exhaust
memory on an ordinary laptop: scrypt fails to derive a key — the exact failure
`host-auth.ts` warns about in its own comment — and the mobile renderer takes a
hard OOM. Sequential costs about a minute and is the difference between a suite
you trust and one you re-run.

Most of them exist because something was actually wrong. The ones worth knowing:

| Test | What it holds shut |
| --- | --- |
| `apps/api/src/wallet-service.test.ts` | A repeated host callback pays once; a failed debit leaves no orphan ledger row; a reversal never double-refunds. |
| `apps/api/src/quest-service.test.ts` | The client cannot award itself points. Arrival is geofence-verified server-side. |
| `apps/api/src/account-service.test.ts` | A user id is not a credential. A revoked device is refused like an unknown one. Keys are stored only as hashes. |
| `apps/api/src/account-routes.test.ts` | The old unauthenticated header **stops working** the moment one account exists — it fails against the previous commit, which is the only way to know a guard works. |
| `apps/api/src/party-routes.test.ts` | Forming a party moves **nobody's wallet**. If this fails, Green Points have stopped meaning anything. |
| `apps/api/src/standing-service.test.ts` | The pilot's 1,240-point opening grant is not counted as verified achievement. |
| `packages/core/src/sponsorship.test.ts` | `SponsorOutcome` has no field for reach, impressions or estimated value — structurally, so nobody can fill one in. |
| `packages/core/src/esg.test.ts` | No `tco2e` field exists. One person who did three activities is one participant, not three. |
| `apps/api/src/statement-service.test.ts` | A statement cannot be edited, is refused on read if its digest no longer matches, and names nobody. Work verified after it was issued is not in it. |
| `packages/tokens/src/contrast.test.ts` | Every filled surface has a measured label colour. Four claimed ratios were wrong when this was written. |
| `apps/mobile/test/palette.test.ts` | A Trip-Point reward is never painted in the verified green. |
| `apps/mobile/test/reachable.test.ts` | Every screen in the navigator has a case in `App`. The passport once shipped complete and unreachable. |
| `apps/mobile/src/components/map-geometry.test.ts` | Pins paint far-to-near, and every real coordinate lands on the drawn coastline. |
| `apps/mobile/test/regressions.test.ts` | Three bugs a deep read found in the loops a render test cannot reach: a finished quest reports its points **once** even though the parent re-renders on the callback; the SOS position stream posts one fix and then **waits**, instead of chasing its own poll in a tight loop; a fix sent during an emergency carries the **device key**, without which the server refused every one of them. Each fails on the code as it was. |
| `apps/api/src/account-routes.test.ts` (registrations) | The eleventh account from one address in an hour is refused, and a refused one provisions nothing. Minting accounts had meant minting vouchers. |
| `apps/api/src/escalation-service.test.ts` (by name) | A re-alerted contact reads the **traveller's** name, not "Chaweng, 120 m's alert". |

---

## Layout

```
packages/tokens    Design tokens. Colour, type, spacing, motion — with the
                   contrast ratios measured and enforced, not asserted
packages/core      Domain types · Healthy Score · wallet rules · provinces ·
                   companions · sponsorship · ESG · parties · all EN/TH strings
apps/api           Hono + node:sqlite. Server-owned points, quests, vouchers,
                   SOS, accounts, and the host console
apps/mobile        Expo React Native. 17 screens
packages/sdk-dart  Client SDK, kept in step by a recorded API contract
packages/sdk-swift Client SDK
docs/              Architecture, answered open questions, research findings
```

---

## What it does

**The evidence loop.** Join a quest → arrival verified against a real geofence →
camera proof with EXIF geotag → a named host approves or rejects with a reason →
points are issued by the server, idempotently, keyed `quest:<id>:user:<id>`.

**Two currencies that differ by evidence.** Green is host-verified; Trip is
self-verified. They are separated in the ledger, in the colour system, and in
every screen that spends or displays them.

**Seventy-seven provinces.** Two are open — Koh Samui, and the Si Racha
campus of Kasetsart University in Chon Buri (`docs/43`): real places, a named
host who can verify, and on the campus the first air in the app measured on
the ground, at a station 300 m away, rather than modelled. The other
seventy-five are *listed*: real, findable, and not yet built. The passport's
denominator is always 77.

**A companion per province.** Grown on the same evidence ladder — checked in,
came back, a host verified work. Seventy-five of them are **sealed eggs that
name no species**, because you cannot say what lives somewhere nobody has
surveyed. On the web each companion has a room in three dimensions — the
animal on the ground it lives on, lit by the island's clock, breathing,
blinking, looking at your finger and answering a tap the way that animal
would (`docs/33-companions-in-3d.md`). It wants nothing: the meters under it
are still the habitat's measured air and crowding.

**The console in a pocket.** The host console fits a phone, and the queue's
count moves without a reload — badge, tab title, and a browser notification
when a host has asked for one (`docs/41-the-console-in-a-pocket.md`).

**A party on one proof.** Party members inside the fence when a proof is
taken ride it; the host sees them by name and one approval pays each of them
the same reward, once. One rejection sends them all back
(`docs/40-a-party-on-one-proof.md`).

**The statement as a file.** `/statements/:id/csv` and `/pdf` — the same
immutable record for a spreadsheet and a filing cabinet, each carrying the id,
the digest and the verify URL; the PDF is hand-written, one standard font,
and says its Thai is in the record (`docs/39-the-statement-as-a-file.md`).

**Saved means written.** A proof taken with no signal goes into an outbox and
is sent when there is some; a proof the server refuses is dropped with its
reason, not retried forever. And **the leg on foot**: two check-ins a walk
apart on the same day pay Trip Points for the walk — measured by the phone,
so never green (`docs/38-offline-and-the-leg-on-foot.md`).

**The island counts itself.** Every place carries how many ChivaGo travellers
checked in there in the last hour, counted from the ledger; and the air over
it by day, as the server recorded it, from the day it started recording
(`docs/37-the-island-counts-itself.md`). The seeded crowd figure is labelled
the estimate it always was.

**A look you would open.** Teal, white cards on a pale ground, capsule buttons,
a search field that asks the concierge, photographs that scroll sideways —
the shape of the travel app the owner set as the reference, with the measured
island in it (`docs/36-the-look.md`). Green still means a host verified it.

**Seventy-seven mascots, one per province.** The province's emblem drawn as a
small creature — the white elephant on Chiang Mai's seal, Trang's dugong,
Nonthaburi's durian, Loei's ghost masks — built from eight bodies and a box of
parts by one renderer, in three dimensions on the web and as a mark on a phone.
No two are the same creature, every card says what it is drawn from, and the
guide hides nothing: a province's emblem is public (`docs/35-seventy-seven-mascots.md`).
The Samui eggs stay sealed; a mascot is an emblem, not a wildlife claim.

**A map you could set out into.** On the web the island is real terrain —
OpenStreetMap's coastline, the elevation model's mountain — coloured by its
true height from the sand to the cloud on Khao Pom, lit by the island's clock
from a golden dawn to a blue night, with the ferry lines as the dotted routes
of a chart and every quest on today's list standing where the work is: an X
that pulses gold until you join it and goes green only once a host has
verified; the sea moves; and everywhere you have not been is under a mist that
lifts only where the ledger says you stood (`docs/34-the-adventure-map.md`).
A phone gets the mist, the water and the cloud shadows in SVG, no native
module needed. The jungle is olive, on purpose: no layer wears the evidence
green.

**Accounts with no password and no email.** A device holds a random key; moving
to a second phone means reading eight characters off the first. The least
personal data is the safest amount.

**Parties.** Solo, duo and party are one thing counted. A party **never shares
points** — it aggregates what members separately earned, and the only figure it
adds is provinces reached *between* you, counted once each.

**A host console** at `/console`, bilingual — municipalities, NGOs and hotels
sign in with their own key, review geotagged proof, and approve or reject.
Scoped so no host can see or decide another host's submissions.

**Reporting that refuses to inflate.** The sponsor page leads with what a host
verified, not with joins, and prints what it does not measure. The ESG report
adds a period, a stated boundary, distinct participant counts, and names three
things it will not claim: carbon, independent assurance, and additionality.

**A statement a hotel can file.** A host issues a statement of what it
verified in a period: per activity per day, counted, with nobody named. It is
written once, refused an edit by the database, and carries a public id and a
SHA-256 digest — `/verify/<id>` shows the same record to anyone holding the
hotel's report. It adds a fourth refusal to the ESG three: it is not a
property carbon figure and does not replace HCMI, CHSB or CF-Hotels. The
traveller whose work it counts is told which statement it is on.

**Safety.** SOS persists across navigation, backgrounding and restart, reports
the truth about every delivery channel, escalates when nobody answers, and
points at 1669 rather than waiting silently.

---

## What is not real

Kept short and kept honest, because the rest of the document is only worth
reading if this section is.

- **No money moves.** A redemption records the merchant's settlement obligation;
  it does not pay them. Sponsor funding is a constant in one route, because no
  contract has been signed and a table would imply one.
- **One traveller exists.** The leaderboard mechanism is built and tested and
  says so rather than drawing a podium of one.
- **Seventy-five provinces are closed.** That is fieldwork — real places,
  measurements, a licensed photo, a host — not a sprint.
- **No SMS provider.** The channel exists and is recorded; a contact without the
  app is reachable only through the live link the traveller shares.
- **Nobody is obliged to watch the SOS desk.** The console shows alerts in under
  a second. Whether a human is looking is an operational commitment.
- **One place has no photograph.** Thong Krut Mangrove: Wikimedia Commons has
  nothing of it, and a photograph of somewhere else with this place's name under
  it is worse than a blank.
- **Thai copy has not been read by a native speaker.** The bulk of it is in
  `packages/core/src/strings.ts` and `apps/api/src/console/i18n.ts`, but it
  is 447 EN/TH pairs across 23 files. `pnpm thai:review` writes
  `thai-review.html`: one self-contained page with every pair in source
  order, the machine's 20 flags, and an editable Thai field. The reviewer
  presses *Export corrections* and sends back a block of JSON;
  `pnpm thai:apply corrections.json` writes it into the source literal by
  literal and refuses anything that has moved. CI prints the flag count on
  every run; it does not fail the build, because only a person can close it.
- **The app has never run on a physical device.** Web and simulator only.
  Location, the camera, background tracking and push have not met hardware.
- **Accounts are free to mint, and each one used to come with a balance.**
  `POST /devices` is now rate-limited per address (ten an hour) and the
  production config sets the opening balance to zero, because a gift handed to
  every unauthenticated registration was a voucher printer. The limit is a
  speed bump, not a wall: a pool of addresses defeats it.
- **A contact who has not added you back is not pushed.** Anyone can type
  anyone's user id into their emergency list, so a push to a linked user goes
  out only when that user has listed the traveller on *their* list too. The
  attempt is recorded as unavailable with the reason, so the traveller sees
  that contact was not reached. Mutual listing is the only consent this pilot
  can record; a proper invitation flow would be better.
- **The Air4Thai cross-check is one station 87 km away.** It is applied now
  (a reading that disagrees with it by a full EPA category is marked
  *estimated*), but it can only ever say "the model and the mainland
  disagree", never which is right for the island.
- **Air quality is an ~11 km area reading**, not a per-place measurement.
  Thailand has no monitoring station on Koh Samui — see `docs/05-research.md`.
  This is the most consequential finding of the build.
- **The island silhouette is a design comp**, not survey data. Pin positions are
  real coordinates, and the map says so on itself.

---

## Design system

Light scheme: a pale sky ground carrying a brand blue, one green, one orange and
one coral. It was dark-first until the mockups moved; every screen reads colour
through role names, so the whole theme moved from one file.

**What each colour is allowed to mean** — the rule the screens are held to:

| Token | Means |
| --- | --- |
| `accent` green | **Evidence.** A host verified it, or the island measured it. |
| `brand` blue | The app speaking: nav, selection, links, map, focus. |
| `cta` orange | Start something. The button, and little else. |
| `gold` | The game layer: levels, ranks, ratings, Trip Points. |
| `accent2` coral | Danger and warnings, including a live SOS. |

Green was once doing all five of those jobs at once — the primary button, the
active tab, a star rating the traveller sets themselves, a hotel price
*forecast*, and the banner reading "SOS active". A colour that means five things
means none of them.

The traps, all enforced by tests rather than by memory:

- **`color.bg` is a tinted near-white, not white.** As a label on the green fill
  it measures 4.00:1 and fails AA; white measures 4.52:1. Use `onFill.<fill>`,
  which carries the measured pairing for every filled surface.
- **Two of those pairings are ink, not white.** White on `cta` is 3.16:1 and on
  `gold` is 2.03:1.
- **Thai needs its own line-height** (1.45). IBM Plex Sans Thai and Anuphan both
  carry Thai and Latin, so a sentence that switches language mid-line has no
  seam — but the vertical room is still needed for above- and below-line marks.
- **Never tint imagery.** Photography goes through `grayscale(1) contrast(1.08)`.

Every value lives in `packages/tokens`. If it is not a token, it does not belong
in a component.

---

## Next

Roughly in order of what unblocks the most:

1. **Open the third province.** Fieldwork, not code — the passport, the
   companions and the scoring already work for all 77. One more open province
   turns "77 provinces" from a promise into a pattern.
2. **Thai copy review** by a native speaker. Start from
   `node scripts/thai-review.mjs --json`.
3. **Someone to watch the SOS desk**, and an SMS provider. Both are decisions.
4. **A physical-device run.** Location, camera, background tracking and push
   have never met real hardware, and the SOS position stream in particular
   was wrong in two ways that only a device would have shown.
5. **Booking** — only against a partner's real inventory. Agoda-grade UX is
   reachable; Agoda-grade supply is contracts, availability and settlement, and
   a booking flow with nothing behind it would be the largest lie in an app
   whose whole argument is that it does not tell them.

The open questions from the original handoff are answered in
`docs/04-open-questions.md`, with what is still owed to a human on each.
