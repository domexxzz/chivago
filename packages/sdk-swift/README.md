# `ChivaGo` — Swift client

A typed client for the ChivaGo API, for a SwiftUI app or any other Swift
program.

## Compiled, and tested in CI

This package was written on a Windows machine with no Swift toolchain and
went its first forty commits uncompiled, and the earlier version of this
README said so in a warning box. It now builds under Swift 6.3, its decode
tests pass against both the original capture and a fresh one, and
`.github/workflows/ci.yml` runs `swift build` and `swift test` on macOS on
every push. The three defects removed by inspection before any compiler saw
the code (a self-recursive `AnyEncodable`, a shadowed `decoder`, default
generic arguments) turned out to be the only ones.

`Tests/ChivaGoTests/DecodeTests.swift` decodes the same captured payloads the
Dart tests use: `api-samples.json` here is a copy of the tracked
`contract/api-samples.json` at the repository root.

```bash
cd packages/sdk-swift && swift test
```

## Accounts

`ChivagoClient.registerDevice(baseURL:)` returns a device key **once**; build
the client you keep with `deviceKey:` set. Without it the server answers 401
to everything except registration the moment any account exists. Where the
key is stored (Keychain, in practice) is the app's decision, not the
transport's.

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
