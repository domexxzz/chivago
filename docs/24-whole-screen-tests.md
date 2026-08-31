# Whole-screen tests

The interaction tests mount components and hand them props. A screen is not a
component with props — it is a component that **fetches**, and it has three
states a props-driven test can never reach: still loading, loaded, and the
server said no. Two of those three were untested everywhere in this repo.

There are now 19 tests that mount five real screens, give them a network, and
let them fetch. They found two bugs of the same kind.

## Giving a screen a network

`test/interact.ts` gained a route table:

```ts
const net = server({
  'GET /offers': [offer({ id: 'o1' })],
  'GET /wallet': wallet(),
  'POST /offers/o1/redeem': { voucher, balances: { trip: 140, green: 1240 } },
});
```

Keyed `"METHOD /path"`, or just `"/path"` for any method. A value can be a
function of the request body, so a route can answer differently the second time
— which is how the retry test works.

Three replies model failure rather than data:

- `refuses(code, error)` — the server answered, and said no. This is the
  `{ ok: false }` envelope the API really sends.
- `offline()` — `fetch` itself rejects. The client should turn this into
  "You appear to be offline."
- `timedOut()` — produces the `AbortError` the client's own 8-second timer
  would have produced. **Not a real timer**: no test should wait 8 seconds. It
  exercises the *handling* of a timeout, not the timing of one.

A path the table does not cover is answered with a refusal that names it, and
recorded in `net.missing`. A screen that quietly fetches something the test
forgot then says so on screen instead of rendering an unexplained blank.

`mountScreen()` is `mount()` plus a settle step, so assertions run against the
loaded screen rather than the spinner. One test deliberately skips the settle,
because the spinner is a state a traveller on a weak beach signal actually sees
and it should not be blank.

Nothing here fakes the `api` module. Every request goes through the real
`src/api/client.ts`, so the path a screen asks for is **asserted**, not assumed:

```ts
assert.deepEqual(net.calls.map((c) => `${c.method} ${c.path}`), ['GET /wallet']);
```

## Two bugs, both the same bug

**`ImpactScreen` swallowed a failed community fetch.** It rendered
`mine.error` and never `community.error`. When the ESG totals failed, the whole
community block simply was not there — no message, no retry. A traveller cannot
tell that apart from *Samui has done nothing this year*, which is a worse lie
than an error message.

Finding it prompted an audit of every `useAsync` in the app, which turned up the
second:

**`MapScreen` swallowed a failed quest fetch.** It rendered `places.error` but
not `quests.error`. On failure the "Quests near you" strip rendered its heading
and a "See all" button over empty space — indistinguishable from an island with
nothing on today. A traveller who believes that closes the app.

Both now render the app's one `ErrorState`, with a retry. Both were written as
failing tests first, and both fail again if the fix is reverted:

```
✖ when the community half fails, it says so instead of vanishing
✖ quests failing does not read as "nothing on today"
```

The remaining seven `useAsync` call sites were checked and all render their
error.

## A test of mine that passed for the wrong reason

The first map test asserted `/Chaweng Beach/` and went green — but not because
the map rendered the place. In map mode the place names live inside the SVG,
which the harness stubs out; the string came from the *quest* fixture's
`where: 'Chaweng Beach'`. The test would have passed with the places fetch
returning nothing at all.

It now asserts on the header average, which is **computed** from the places that
arrived, then presses "Switch to list view" and asserts the name in the feed.
Worth recording: a green test proves nothing until you know which line makes it
green.

## What the 19 hold down

- **Wallet** — that it asks for `/wallet` and nothing else; that both purses
  arrive; that an unsettled mount says "loading" rather than showing blank;
  that a refusal shows the reason *and* a retry; that retry actually refetches
  and a recovered server replaces the error with the wallet; that a dead
  connection says "offline" and never leaks a stack trace.
- **Quests** — that every quest that arrives is listed; that an empty island
  explains itself; that switching the filter reads the list already fetched
  rather than hitting the network, which is the design and was worth pinning.
- **Marketplace** — that two fetches fill one screen; that redeeming posts to
  the right path, shows the voucher code, toasts the merchant and tells the
  rest of the app to refresh; that an unaffordable offer names the shortfall
  *and which purse* and spends nothing; that a refused redemption shows no code.
- **Impact** — that both halves render; that either half failing leaves the
  other intact; that a failed half says so.
- **Map** — that both fetches land; that either failing leaves the other usable.

## Still owed

- **No layout.** Every one of these passes if the words are in the wrong place.
- **`timedOut()` is a shape, not a timer.** The 8-second abort path is
  simulated. Nothing proves the timer fires at 8 seconds.
- ~~**Six screens still have no whole-screen test.**~~ Done — see
  `25-remaining-screens.md`. Every screen in the app is now covered.
- **Nothing tests a slow network** — every fake reply resolves immediately, so
  no test covers two fetches racing or a screen unmounting mid-flight.
- **Still nothing on a real device.**
