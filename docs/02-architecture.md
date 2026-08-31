# Architecture

## Shape

```
                    ┌──────────────────────┐
                    │   Expo React Native  │  10 screens, EN/TH
                    │      apps/mobile     │
                    └──────────┬───────────┘
                               │ HTTP, one client module
                    ┌──────────▼───────────┐
                    │      Hono API        │
                    │      apps/api        │
                    └──┬──────────────┬────┘
                       │              │
              ┌────────▼─────┐  ┌─────▼──────────────┐
              │ node:sqlite  │  │ Open-Meteo (CAMS)  │  live air
              │  (WAL mode)  │  │ Air4Thai (check)   │
              └──────────────┘  └────────────────────┘

        packages/core    types · Healthy Score · wallet rules · strings
        packages/tokens  Modernist design tokens
```

Both shared packages ship **raw TypeScript** (`main: src/index.ts`). One fewer
build step, and Metro transpiles them anyway.

---

## The one rule that shapes everything

**Points, quest stages and the ledger are server-owned.**

The prototype awards points on the client (`points: s.points + 150`) so the demo
runs standalone. That must never ship — a client-side award is a client-side
exploit. Concretely:

- `POST /internal/verify` is the **only** endpoint that awards points, and it is
  guarded by a shared secret, not the user header, because the caller is the
  host console rather than the traveller.
- Every point movement is one transaction containing both the balance change and
  its ledger row. A debit without its ledger row is money the user cannot
  account for; a ledger row without its debit is a balance nobody can reconcile.
- Every award is idempotent on `ledger.source_ref`, which is `UNIQUE`. Host
  verification arrives over a network, and networks retry. Paying twice for one
  beach cleanup is the failure mode that ends a points economy.

The mobile app mirrors server state for rendering and **never** mutates a balance
locally to look responsive. A fake balance that later corrects itself is worse
than a spinner.

---

## State split

The handoff asks for the prototype's single component to be split into
navigation / session / wallet / quests / safety. `apps/mobile/src/state/store.tsx`
is the composition root; each slice is a plain hook.

| State | Owner | Note |
| --- | --- | --- |
| `screen`, `stack` | client | Tab tap resets the stack; `place`/`quest`/`market`/`trip` push |
| `placeId`, `questId` | route params | Belong to the route, not the app |
| wellness profile | server, mirrored | Optimistic locally — a preference is not money |
| points, ledger, tier | **server only** | Never written by the client |
| quest stage | **server only** | Client may request a transition, server decides |
| SOS alert | **server only** | Polled, so it survives restart |
| map layer filters | client | Personal and ephemeral |
| toast | client | 2200 ms |

---

## Database

`node:sqlite`, built into Node 22+, so the API has no native build step and runs
anywhere Node runs — a Windows laptop and a small VPS on the island alike. The
schema is plain SQL, so Postgres later is a dump-and-load rather than a rewrite.

Constraints doing real work:

```sql
ledger.source_ref  UNIQUE          -- the idempotency guarantee
wallets.balance    CHECK (>= 0)    -- a wallet cannot go negative
quest_progress     PRIMARY KEY (user_id, quest_id)  -- re-joining is a no-op
ON DELETE CASCADE  everywhere      -- PDPA erasure is one DELETE
```

### `transact` is re-entrant

Services compose: redeeming an offer opens a transaction and calls
`spendOnVoucher`, which opens its own. SQLite has no nested `BEGIN`, so the
outermost call owns `BEGIN`/`COMMIT` and inner calls use `SAVEPOINT`s.

This is not theoretical — the first working build threw
`cannot start a transaction within a transaction` on the very first redemption.
`db.test.ts` covers it.

---

## Air quality pipeline

```
getAir(lat, lng, fallback)
  ├─ cache hit and fresh? ──────────────► return (provenance: live)
  ├─ fetch Open-Meteo (4s timeout)
  │    ├─ ok    ─► write cache ─────────► return (provenance: live)
  │    └─ fail
  │         ├─ stale cache exists ──────► return (provenance: stale)
  │         └─ nothing ────────────────► return fallback (provenance: stale)
  └─ never throws
```

Air is a nice-to-have on a map screen and a hard dependency on nothing. A dead
feed degrades the score's confidence — the Healthy Score downweights anything
not marked `live` — rather than emptying the screen.

The cache key snaps to **0.1°**, the model's own resolution. Caching finer would
invent 100 entries per model cell and fire 100 upstream requests to get the same
number back. See `docs/05-research.md` for why this matters to the product.

---

## The map, and the seam for MapLibre

`apps/mobile/src/components/map-geometry.ts` holds two pure functions:

- **`project(lat, lng)`** — equirectangular, inset into the drawn island. Accurate
  to well under a pixel across 0.2°; do not carry it to a country-scale map.
- **`layoutPins(places, w, h)`** — label de-collision. Places in priority order
  (highest score first, because that is the pin the product most wants read) and
  pushes colliding chips **away in the direction that preserves north/south
  order**.

  That last clause is load-bearing. A naive "always push up" put Chaweng (south)
  above Fisherman's Village (north) — on a map that is not a cosmetic flaw, it is
  wrong information. Caught in review, fixed, and now covered by a test.

Swapping in MapLibre means replacing `IslandShape` and deleting `project` — the
SDK projects. `layoutPins` still applies, because screen-space label collision is
a problem every map has.

---

## Error handling

Typed errors map to codes the app can act on:

| Thrown | HTTP | Code | The app shows |
| --- | --- | --- | --- |
| `OutsideGeofence` | 403 | `OUTSIDE_GEOFENCE` | "You need to be within 250 m… you are about 11,370 m away" |
| `InvalidTransition` | 409 | `INVALID_TRANSITION` | Refreshes the quest |
| `InsufficientPoints` | 402 | `INSUFFICIENT_POINTS` | "You need 140 more points" |
| anything else | 500 | `INTERNAL` | A generic message; the detail is logged server-side |

An error string is an information leak, and the user cannot act on a stack trace.

On the client, a dropped connection is normal — the app is used on a beach and in
a mangrove. `client.ts` turns it into a typed `NETWORK` / `TIMEOUT` result rather
than an unhandled rejection, and there is no silent retry loop: on one bar of
signal that drains the battery and the user never learns why the screen is empty.
Show the error, offer the retry.
