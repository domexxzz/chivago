# `ChivaGo` — Swift client

A typed client for the ChivaGo API, for a SwiftUI app or any other Swift
program.

## ⚠ This package has never been compiled

It was written on a Windows machine with **no Swift toolchain** — no `swiftc`,
no Xcode. Every other package in this repository is built and tested before it
is described as working; this one is not, and saying otherwise would be the
plainest kind of lie.

What that means in practice:

- **Syntax and type errors are likely.** Nothing has checked them.
- The models are a line-by-line mirror of `packages/sdk-dart`, which **is**
  compiled and tested against real captured responses. Where the two differ,
  the Dart one is the one that has been proven.
- `Tests/ChivaGoTests/DecodeTests.swift` decodes the same captured payloads the
  Dart tests use. On a machine with Swift, `swift test` is one command and will
  tell you the truth in seconds.

**First thing to do on a Mac:**

```bash
cd packages/sdk-swift && swift test
```

## Using it

```swift
let client = ChivagoClient(baseURL: URL(string: "http://localhost:8787")!,
                           userID: deviceID)

let wallet = try await client.wallet()
print("\(wallet.balances.green) green, level \(wallet.progression.level)")

let result = try await client.checkIn(placeID: "chaweng", lat: 9.5357, lng: 100.0617)
if !result.awarded { /* here, but already checked in today. Not an error. */ }
```

## The contract

Written against `contract/api-contract.json` at the repository root, captured
from the running API by `pnpm --filter @chivago/api contract` and guarded by
`contract.test.ts`. When the API changes shape that test fails and names the
path that moved — which is the only thing standing between three hand-written
clients and silent drift.

Writing this package found two real bugs in the API, both invisible to the
existing TypeScript client: `/vouchers` answered in snake_case while claiming a
camelCase type, and every air reading's `observedAt` was seven hours out. See
`docs/19-client-sdks.md`.
