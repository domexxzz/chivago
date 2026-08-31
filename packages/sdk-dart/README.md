# `chivago` — Dart client

A typed client for the ChivaGo API, for a Flutter front end or any other Dart
program.

Written against `contract/api-contract.json` at the repository root, which is
captured from the running API by `pnpm --filter @chivago/api contract` and
guarded by `contract.test.ts`. When the API changes shape, that test fails and
names the path that moved — which is the only thing standing between two
hand-written clients and silent drift.

```dart
final client = ChivagoClient(baseUrl: 'http://localhost:8787', userId: deviceId);

final wallet = await client.wallet();
print('${wallet.balances.green} green, level ${wallet.progression.level}');

await client.checkIn('chaweng', lat: 9.5357, lng: 100.0617);
await client.writeReview('chaweng', rating: 5, body: 'Quiet at 7am.');
```

## What it does not do

- **No caching, no retries, no offline queue.** Those are decisions for the app,
  not the transport, and the mobile app's own queue is deliberately different
  from what a desktop tool would want.
- **No auth.** The pilot identifies a caller by a device-scoped
  `x-chivago-user` header and has no accounts. When accounts land this is where
  the token goes.
