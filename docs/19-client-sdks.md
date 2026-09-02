# Client SDKs: Swift and Dart

Two more clients for the same API, so a SwiftUI app or a Flutter front end can
be built without re-deriving the contract from the TypeScript one.

## The problem two more clients create

A hand-written client drifts. Not loudly — a field is renamed in the API, the
Expo app is updated because it lives in the same repository and the same
typecheck, and the Swift client keeps compiling perfectly while decoding
nothing. The failure surfaces on a traveller's phone, in another language,
weeks later.

So the contract is **captured, not assumed**.

```bash
pnpm --filter @chivago/api dev      # in one terminal
pnpm contract                        # in another
```

That writes two files at the repository root:

| File | What it is | Who reads it |
|---|---|---|
| `contract/api-contract.json` | The **shape** of every response — field names and types, no values | `contract.test.ts`, and a human on review |
| `contract/api-samples.json` | One **real response** per endpoint | The Dart and Swift decode tests |

`contract.test.ts` re-checks the samples against the shapes and fails naming the
path that moved. Shapes catch drift; samples let the other clients prove they
can actually decode, rather than proving each author's models agree with what
that author imagined the server sends.

**Null is a wildcard.** A nullable field that was null when the fixture was
taken must not fail the day it holds a string — that is the field working. What
breaks a decoder is a field vanishing or changing type.

**An added field is not a break.** An old decoder ignores it. Recorded as a
note, never a failure.

**What is NOT covered is written down.** Endpoints that returned an empty
collection guard nothing about their elements, so the capture lists them under
`uncovered`. An uncovered shape that *looks* covered is worse than a known gap.
The capture warms the account up first — a check-in, a review, a redemption, an
emergency contact — precisely so most collections have something in them.

## Two real bugs this found

Both were invisible to the existing TypeScript client, and both would have been
runtime failures in a strict decoder.

**1. `/vouchers` answered in snake_case.** The route did `SELECT *` and returned
raw database rows: `cost_points`, `offer_id`, `redeemed_at`. The mobile client
declared the result as `Voucher[]`, whose fields are `costPoints` and `offerId`.
TypeScript believed the annotation, nothing ever read a field, and the lie
survived until a second client was written against it.

**2. Every air reading's `observedAt` was seven hours out.** The Open-Meteo
request asks for `timezone=Asia/Bangkok`, so `time` comes back as local Bangkok
time with no offset and no seconds — `2026-08-31T19:00` — and was passed
straight through as if it were ISO-8601 UTC.

That is wrong twice. Seven hours out, and `observedAt` is what the staleness
weighting reads, so a fresh reading could present as half a day old or the
reverse. And *ambiguous*: a client parsing it as device-local gets a different
instant on every phone. Swift decodes dates strictly, and one malformed value
throws away the entire response.

Neither would have been found by adding a third screen to the app. They were
found by asking a different language to read the same bytes.

## `packages/sdk-dart`

**Compiled and tested here.** `dart analyze` clean, `dart test` green — 10 tests
decoding the real captured payloads, including the one that matters most:

> `spending granted no EXP, and the ledger says so`

The invariant of the whole point economy, checked from a second language against
the server's own output.

Failure is a **value**, not an exception, for ordinary refusals: a geofence
rejection and an already-checked-in-today are normal traffic, and forcing a
`try/catch` around them makes callers write worse code. Transport failures still
throw — a socket that never opened is not the API declining.

## `packages/sdk-swift`

**Compiled now.** For its first forty commits this package had never met a
compiler — written on a Windows machine with no Swift toolchain — and this
document said so. It builds under Swift 6.3, its nine decode tests pass, and
CI runs `swift test` on macOS on every push. The paragraphs below are kept
because the three defects they describe were real and were found by reading.

It was written on a Windows machine with no Swift toolchain — no `swiftc`, no
Xcode. Every other package here is built and tested before being described as
working. This one was not, and saying otherwise would have been the plainest
kind of lie.

Three defects were removed by inspection, because there was no compiler to catch
them:

1. **`AnyEncodable` recursed for ever.** The stored closure and `encode(to:)`
   were both called `encode`, so `try encode(encoder)` resolved to the method
   and called itself until the stack ran out. Renamed to `write`.
2. **The custom date strategy shadowed `decoder`** — a `JSONDecoder` outside, a
   `Decoder` inside. Legal, and a trap for the next reader. Renamed to `inner`.
3. **Default generic arguments** (`as type: T.Type = T.self`) removed in favour
   of an explicit type at every call. More verbose, and one fewer thing that has
   to be right without a compiler to say so.

There is certainly more. `Tests/ChivaGoTests/DecodeTests.swift` decodes the same
captured payloads the Dart tests use, so on a Mac:

```bash
cd packages/sdk-swift && swift test
```

settles it in seconds.

One trap worth naming, because it is the kind that fails on the first response
and is obvious only with a compiler: **`.iso8601` does not parse fractional
seconds**, and every timestamp this API sends has them. The client installs a
custom `dateDecodingStrategy` that tries both forms.

## What neither SDK does

- **No caching, retries or offline queue.** Those are decisions for the app, not
  the transport, and the mobile app's own queue is deliberately different from
  what a desktop tool would want.
- **No key storage.** Accounts landed (`ca0ccfa`) and, for a while, nobody
  told the SDKs: the server refuses the bare `x-chivago-user` header the
  moment any device key exists, so both clients returned 401 to everything on
  any real database. Both now have `registerDevice()` and send
  `x-chivago-device-key`. Where that key is kept is the app's decision.
- **No console endpoints.** The host console is server-rendered HTML on purpose;
  there is no client-side API for it and there should not be one.

## Still owed

- **The Swift package needs one run on a Mac.** Everything else here is claimed
  because it was observed. That is not.
- **The contract capture needs a running server.** It should be able to drive
  the app in-process — `server.ts` no longer binds a port on import, so the
  remaining work is small and worth doing before this reaches CI.
- **Four shapes stay uncovered**: `profile.purposes`, `profile.watch`,
  `notifications.items`, `reviews.reported`. Each needs a warm-up step that
  populates it.
- **No SOS or notification methods in either SDK.** Deliberate: the SOS flow is
  more than a request — it is a foreground service, a background task and a
  lifecycle — and half of it in a transport library would invite somebody to
  ship the other half badly.
- **Nothing generates these from a schema.** The API publishes no OpenAPI
  document, so all three clients are hand-written and the contract test is what
  stands between them. A generator would be better and is a larger decision.
