# ChivaGo

**Smart Wellness & Sustainable Tourism.** Pilot region: Koh Samui, Thailand.

Shifts travel from *เที่ยวให้สนุก* (travel for fun) to **เที่ยวอย่างสุขภาพดี**
(travel healthily) — wellness, safety and measurable environmental impact in one
app, bilingual EN/TH throughout.

One idea holds the whole product together:

> **A point is only worth something if somebody had to check it.**

Green Points are issued when a **named host** approves a geotagged submission.
Trip Points are self-verified and are never allowed to look like the other kind.
Everything downstream — the leaderboard, the sponsor's report, the ESG filing,
the companions, the passport — is derived from that one ledger, and refuses to
report a number it cannot trace back to it.

---

## Run it

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

**1,174 tests** — 273 core, 623 API, 253 mobile, 25 tokens — plus 10 in the Dart
SDK (`pnpm test:dart`). `pnpm typecheck` covers all four packages.

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
| `packages/tokens/src/contrast.test.ts` | Every filled surface has a measured label colour. Four claimed ratios were wrong when this was written. |
| `apps/mobile/test/palette.test.ts` | A Trip-Point reward is never painted in the verified green. |
| `apps/mobile/test/reachable.test.ts` | Every screen in the navigator has a case in `App`. The passport once shipped complete and unreachable. |
| `apps/mobile/src/components/map-geometry.test.ts` | Pins paint far-to-near, and every real coordinate lands on the drawn coastline. |

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

**Seventy-seven provinces.** Two are open — real places, measured air and
crowding, a licensed photograph, a host who can verify. The other seventy-five
are *listed*: real, findable, and not yet built. The passport's denominator is
always 77.

**A companion per province.** Grown on the same evidence ladder — checked in,
came back, a host verified work. Seventy-five of them are **sealed eggs that
name no species**, because you cannot say what lives somewhere nobody has
surveyed.

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
- **Thai copy has not been read by a native speaker.** Two files:
  `packages/core/src/strings.ts` and `apps/api/src/console/i18n.ts`.
- **The app has never run on a physical device.** Web and simulator only.
- **`POST /devices` is not rate-limited.** A script can mint accounts. It costs a
  row and buys nothing today, and it is a real hole.
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
2. **Thai copy review** by a native speaker. Two files, named above.
3. **A rate limit on account registration**, before anyone real uses it.
4. **Someone to watch the SOS desk**, and an SMS provider. Both are decisions.
5. **A physical-device run.** Location, camera and push have never met real
   hardware.
6. **Booking** — only against a partner's real inventory. Agoda-grade UX is
   reachable; Agoda-grade supply is contracts, availability and settlement, and
   a booking flow with nothing behind it would be the largest lie in an app
   whose whole argument is that it does not tell them.

The open questions from the original handoff are answered in
`docs/04-open-questions.md`, with what is still owed to a human on each.
