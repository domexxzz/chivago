# The nine open questions, answered

The design handoff closes with nine questions "to close before coding". Each is
answered below with what was decided, why, and what is still owed to a human.

Where a decision goes **against** the design, that is called out explicitly.
None of these should be treated as final without the named owner signing off —
they are defensible defaults that unblock the build, not a substitute for the
client's call.

---

## 1. Which map treatment ships?

**Design asked:** isometric board (A), flat layer-toggle (B), or map-plus-feed (C)?
Recommendation was A for launch identity, C as the accessibility fallback.

**Decided:** ship **B's flat treatment drawn from real geography**, with **C as a
first-class peer** the user can switch to from the header, not a hidden fallback.

**Why:**
- The prototype's isometric board is a CSS 3D transform over a *fake* island
  outline. Reproducing that in the app would look identical and mean nothing —
  the pins would not be anywhere in particular.
- Doing A properly needs MapLibre GL with `pitch ≈ 52`, `bearing ≈ -38` and a
  custom flat style. That is a native module, which means a dev build and an EAS
  pipeline before anyone can see a screen.
- What ships now draws the island as SVG from the **real** bounding box, with
  every pin at its true coordinate. It runs everywhere today, and the seam for
  MapLibre is already cut: `project()` and `layoutPins()` in
  `apps/mobile/src/components/map-geometry.ts` are pure and separate from the
  basemap. Swapping in MapLibre means replacing `IslandShape` and deleting
  `project` — `layoutPins` still applies, because label collision is a problem
  every map has.

**Still owed:** the design owner's confirmation, and a tile budget if A is
wanted for launch. MapTiler's free tier caps at 5k sessions/month and is
non-commercial; Protomaps self-hosted PMTiles is the cheap path at scale.

---

## 2. Healthy Score formula and weighting

**Design asked:** undefined. The prototype hard-codes 74 / 91 / 82 / 88 / 79.

**Decided:** defined in full in `packages/core/src/healthy-score.ts`.

```
score = Σ (subScore_i × weight_i)   over air, crowd, safety, walkability
```

- **Sub-scores** are piecewise-linear normalisers, each bounded to 0–100 and
  monotone in the good direction. The air curve is anchored on the **US EPA AQI
  category boundaries** rather than invented, so it is defensible to a
  regulator. The crowd curve follows pedestrian level-of-service research
  (Fruin), tightened because "quiet, away from crowds" is an explicit onboarding
  answer.
- **Weights** start at air 0.30 / crowd 0.25 / safety 0.25 / walkability 0.20 and
  are nudged by the user's wellness profile. Deltas are capped so two very
  different profiles never disagree by more than ~8 points on the same place —
  enough to tilt a ranking, not enough to stop places being comparable.
- **Staleness** is handled: a reading flagged `estimated` or `stale` is
  downweighted and its weight redistributed, so a dead feed degrades confidence
  instead of silently reporting yesterday as today.

**Calibration:** the five seed places reproduce the approved comps **exactly**
(74 / 91 / 82 / 88 / 79) through the real formula. The synthetic inputs are
`crowdDensity` and `safetyIndex` — the design gives a word ("High") and a phrase
("Patrolled") but no number. Guarded by tests in `healthy-score.test.ts`.

**Explainability:** every score returns its full breakdown, and the place screen
renders it behind "How is this calculated?". A wellness score aimed at tourists
that nobody can interrogate is a trust problem and, in some markets, a
consumer-protection one.

**Still owed:** the data owner must confirm the breakpoints against real Samui
observations before public launch. The curves are calibrated, not validated.

---

## 3. Community impact targets

**Design asked:** the bar percentages (83 / 67 / 74 / 50 / 40) are placeholders.

**Decided:** targets live in the `community_metrics` table; the client computes
`actual / target` and never sees a percentage. Correcting a target is an
`UPDATE`, not an app release.

Seeded provisionally at 3,000 kg / 1,500 trees / 1,620 hr / 1,000 people /
50 activities — the values implied by the design's percentages.

**Still owed:** the real pilot-year targets from the ESG owner. These numbers
end up in a report partner hotels and sponsors rely on; publishing invented
targets under an ESG banner is the kind of thing that becomes a story.

---

## 4. Voucher mechanics for redemption

**Design asked:** QR? expiry? merchant settlement? The prototype stops at a toast.

**Decided:** a redemption issues a real `Voucher` — code, 30-day expiry,
merchant, cost, status — inside the same transaction as the point debit and its
ledger row. The merchant confirms it via `POST /vouchers/:code/redeem`, which is
idempotent, so a double-scan is harmless.

Two details worth keeping:
- **The debit runs before the voucher is written.** If the balance is short it
  throws and no voucher exists, so there is never an unpaid voucher to
  reconcile. (This is what surfaced the nested-transaction bug — see
  `apps/api/src/db.ts`.)
- **The code is shown as text, not only as a QR.** A merchant with a cracked
  camera or a flat battery still has to be able to honour it. A QR that is the
  only path to redemption is a single point of failure in a beachfront café.

**30 days** is long enough for a two-week holiday plus a change of plan, short
enough that the merchant's liability does not run indefinitely.

**Still owed:** how money actually moves to the merchant. The API records the
settlement obligation; it does not pay anyone. Thailand's PromptPay is the
obvious rail, and that is a finance and compliance decision, not an engineering
one.

---

## 5. Does a live SOS persist across navigation?

**Design says:** no — `sosActive` is cleared on every navigation.

**Decided: the design is wrong, and this was changed.** A fired alert lives on
the server, survives navigation, backgrounding, a crash and a reinstall, and
shows a global banner on every screen until it is cancelled.

The prototype's behaviour would mean a user who fires SOS and then taps "Map" —
which is exactly what a frightened person does — sees the alert silently vanish
while dispatch is still running. That is a safety defect, not a UI preference.

Also added, because they follow from taking the alert seriously:
- Re-firing while an alert is live returns the **same** alert. Two dispatches
  for one emergency is worse than none.
- A visible ring-fill during the 1200 ms hold, plus a haptic tick at 600 ms and
  a heavy impact on fire. The prototype has no feedback at all during the hold.
- **The official Thai emergency numbers on the screen**: 1669 (EMS), 1155
  (Tourist Police, English-speaking, 24h), 191 (police). All free to call, no
  airtime credit needed. ChivaGo dispatch runs *alongside* them, never instead
  of them — an app-mediated dispatch can fail, and the user must never be left
  with only our button.

**Still owed:** a product owner's sign-off, and a real dispatch integration. The
API currently records the alert; nobody is actually notified.

---

## 6. Green Points in a mono-red system

**Design asked:** keep the mono palette, or carve out one `--color-eco` token?

**Decided:** keep mono for v1. The `eco` token is declared in
`packages/tokens/src/index.ts` and deliberately unused, so switching is a
one-line change rather than a redesign.

If it is ever enabled, it applies to exactly three things — the points numeral,
the verified fill, and the score-≥85 pin. Never a second full ramp.

---

## 7. Badge marks

**Design asked:** numerals, or commissioned monochrome icons? Emoji are not an option.

**Decided:** numerals, as the design already renders. The prototype's data array
carries emoji (🌱🌿🐢🪸👑) but displays the index instead; the emoji field simply
does not exist in `packages/core/src/seed.ts`, and a test asserts no badge
carries one.

**Still owed:** nothing blocking. Commissioning five monochrome marks is a
straight upgrade whenever there is budget.

---

## 8. Thai copy review

**Design says:** all Thai strings were authored for design and need a native
review pass.

**Decided:** Thai strings live in **two files**, and nowhere else:

| File | Covers |
| --- | --- |
| `packages/core/src/strings.ts` | The whole app, plus the rejection reasons a volunteer reads |
| `apps/api/src/console/i18n.ts` | Host console chrome and check explanations |

No Thai string is inlined in a component or a route. The split is deliberate:
volunteer-facing copy stays in `core` where the app renders it, while admin
chrome stays out of the mobile bundle.

**Status: NOT DONE.** The strings are still design draft. This is the one open
question that has not moved, because it cannot be closed by an engineer.

**Still owed:** a native speaker. Particular attention to the safety and quest
copy, where a mistranslation has consequences beyond awkwardness.

> **Update.** "Two files" was true of the strings tables and false of the
> product: the copy is 447 pairs across 23 files. What was missing was not a
> reviewer but a way for one to work without reading a codebase. `pnpm
> thai:review` now writes a single page with every pair, its context line and
> an editable Thai field; the reviewer exports a JSON block and `pnpm
> thai:apply` writes it back, refusing any correction whose original has
> moved. The question is still open, but it is now a morning's work for the
> right person rather than a reason nobody starts.

---

## 9. Bonus: things the design does not cover that production needs

Not on the handoff's list, but they surfaced while building:

- **Quest rejection.** The design has five stages and no failure path. Real host
  review rejects submissions. Implemented: rejection returns the user to
  `arrived` with a reason, keeps their arrival timestamp (they *were* there),
  and lets them resubmit.
- **Offline proof capture.** Beach and mangrove sites have poor signal — which is
  exactly where proof gets taken. A failed submit is queued and reported as
  saved, not lost.
- **Loading, error and empty states.** The prototype is self-contained and has
  none. A real app on one bar of signal spends real time in all three.
- **The tier progress bar.** The prototype computes `points / 2500`, which pins
  at 100% forever once a user passes Nature Guardian. Replaced with progress
  *within* the current tier.
- **Air quality resolution.** See `docs/05-research.md` — this one is
  significant and is not an engineering problem.
