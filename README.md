# ChivaGo

**Smart Wellness & Sustainable Tourism.** Pilot region: Koh Samui, Thailand.

Shifts travel from *เที่ยวให้สนุก* (travel for fun) to **เที่ยวอย่างสุขภาพดี**
(travel healthily) — wellness, safety and measurable environmental impact in one
app.

Built from the `ChivaGo mobile app design` handoff: 10 screens, Modernist design
system, bilingual EN/TH.

---

## Run it

Two processes. The API must be up before the app.

```bash
pnpm install
```

```bash
pnpm --filter @chivago/api seed
```

```bash
pnpm api
```

```bash
pnpm mobile
```

The host console is at **http://localhost:8787/console** — the seed prints one
access key per host, once.

The API listens on `http://localhost:8787`. Expo prints a QR code — scan it with
Expo Go, or press `w` for the browser.

**On a physical phone**, `localhost` is the phone, not your laptop. Set the LAN
address:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.42:8787 pnpm mobile
```

To exercise the host-verification endpoint (the only path that awards points):

```bash
CHIVAGO_HOST_SECRET=dev-secret pnpm api
```

---

## Tests

```bash
pnpm test
```

668 tests across the workspace — 61 core, 509 API, 98 mobile — plus 10 in the Dart SDK (`pnpm test:dart`). The ones worth knowing about:

- **`packages/core/src/healthy-score.test.ts`** — proves the scoring formula
  reproduces the five approved design comps (74 / 91 / 82 / 88 / 79) exactly,
  and that every normaliser stays bounded and monotone.
- **`apps/api/src/wallet-service.test.ts`** — proves a repeated host callback
  pays once, a failed debit leaves no orphan ledger row, and a reversal never
  double-refunds.
- **`apps/api/src/quest-service.test.ts`** — proves the client cannot award
  itself points, arrival is geofence-verified, and a rejected proof can be
  resubmitted.
- **`apps/mobile/src/components/map-geometry.test.ts`** — proves no two pin
  labels overlap and that de-collision never puts a southern place above a
  northern one.
- **`apps/api/src/console/routes.test.ts`** — proves a signed-in reviewer with a
  valid CSRF token still cannot decide another host's submission.
- **`apps/api/src/host-auth.test.ts`** — regression guard for an authentication
  bypass where a corrupt stored hash would have accepted every key.
- **`apps/api/src/notification-service.test.ts`** — proves a paid user is never
  an unnotified user, that a retried callback notifies once, and that a dead
  device token is pruned rather than retried forever.

---

## Layout

```
packages/tokens    Modernist design tokens, ported verbatim from styles.css
packages/core      Domain types · Healthy Score engine · wallet rules · all EN/TH strings
apps/api           Hono + node:sqlite. Server-owned points, quests, vouchers, SOS
apps/mobile        Expo React Native. All 10 screens
docs/              Architecture, the answered open questions, research findings,
                   host console, notifications, SOS dispatch, background location
```

---

## What is real, and what is not

**Real and working:**
- Live air quality per coordinate (Open-Meteo / Copernicus CAMS), cached, with
  the official Thai ground network as a cross-check.
- The Healthy Score, computed server-side from four normalised signals and
  weighted by the user's wellness profile. Explainable in the UI.
- The full quest loop: join → geofence-verified arrival → camera proof with EXIF
  geotag → host verification → points. Points are **server-owned and idempotent**.
- Real vouchers with codes, expiry and merchant redemption.
- SOS that persists across navigation, backgrounding and restart, with haptics
  and the official Thai emergency numbers.
- Personal impact derived from verified quests; community bars computed as
  actual/target.
- **SOS dispatch that reports the truth, and escalates when nobody answers** — a public live-location link the user
  shares through LINE or WhatsApp, push to contacts who use the app, and a duty
  desk where a named operator acknowledges. Every count is measured, never
  asserted, and the app never claims a delivery that did not happen. If nobody
  picks an alert up, the system tells the traveller so and points them at 1669
  rather than waiting silently. Location keeps flowing while the phone is
  locked, queueing offline and reporting honestly when it goes quiet.
- **Push notifications and an in-app inbox** — a host's decision reaches the
  volunteer within seconds, bilingually, and survives every delivery failure
  because the same rows are the app's inbox.
- **A working host console** at `/console`, **bilingual Thai / English** —
  municipalities, NGOs and hotels sign in with their own key, review geotagged
  photo proof, and approve or reject. Scoped so no host can see or decide
  another host's submissions.

**Stubbed, deliberately:**
- **SMS to emergency contacts.** The channel exists and is recorded, but no
  provider is configured, so a contact without the app is reachable only if the
  user shares the live link themselves.
- **Nobody is obliged to watch the SOS desk.** The console shows live alerts in
  under a second; whether a human is looking is an operational commitment, not
  something software can assert.
- **No money moves.** A redemption records the merchant's settlement obligation;
  it does not pay them.
- **No photography.** Every image is a `neutral-300` placeholder, as in the design.
- **Thai copy is design draft**, not natively reviewed. Two files:
  `packages/core/src/strings.ts` (app + rejection reasons) and
  `apps/api/src/console/i18n.ts` (console chrome).

---

## Where the build departs from the design

Five deliberate changes. Each is a judgment call, and each is reversible.

| # | Design says | Build does | Why |
| --- | --- | --- | --- |
| 1 | SOS clears on navigation | SOS **persists** globally with a banner | A user who fires SOS then taps "Map" would watch a live alert silently vanish. Safety defect, not a preference. |
| 2 | Verification auto-advances after 2.6 s | Screen is **leavable** and says so | Host review can take 24h. The prototype trains people to wait at a screen that will not resolve. |
| 3 | "I'm at the site" trusts the tap | Real GPS, **server-side geofence** | Arrival is what makes the later proof credible. |
| 4 | No rejection state exists | Rejection returns to `arrived` with a reason | Real host review rejects submissions. |
| 5 | Tier bar is `points / 2500` | Progress **within the current tier** | The original pins at 100% forever past 2,500 points. |

Plus one thing the design does not mention and the app now states plainly:
**air quality is an ~11 km area reading, not a per-place measurement.** Thailand
has no monitoring station on Koh Samui. See `docs/05-research.md` — this is the
most consequential finding of the build.

---

## Design system

Modernist: flat, architectural, Archivo, near-mono red on a light ground,
**0px radius**, 2px rules.

The rules that are easy to break by accident:

- **Never round a corner.** The SOS button is the single documented exception,
  because it must read as a physical emergency control.
- **Button labels are flush left**, never centred, whenever the button is wider
  than its label. This is baked into `components/Button.tsx` rather than left to
  each caller.
- **`--color-accent` at paragraph size is not contrast-safe.** Use
  `--color-accent-700` for text, `--color-accent` for fills, icons and large
  display numerals.
- **Thai needs its own font and a looser line-height** (Noto Sans Thai, 1.45).
  Archivo has no Thai glyphs. Never share a line-height token across scripts.
- **Never tint imagery.** Photography goes through `grayscale(1) contrast(1.08)`.
- **No emoji.** Badges render as numerals.

Every value lives in `packages/tokens`. If it is not a token, it does not belong
in a component.

---

## Next

Roughly in order of what unblocks the most:

1. **Thai copy review** by a native speaker — two files, named above.
2. **Someone to watch the SOS desk**, and an SMS provider. Both are decisions,
   not code.
3. **Air sensors on the island** (~3), if per-place air claims are going to be
   made in marketing.
4. **Photography.** The design is built for it; every placeholder is sized.
5. **MapLibre**, if the isometric hero is wanted for launch identity.

The nine open questions from the handoff are answered in
`docs/04-open-questions.md`, with what is still owed to a human on each.
