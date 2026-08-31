# Interaction tests

`22-screen-tests.md` ended with an admission: the screen tests render and read,
and nothing presses anything. `ComposeSheet`, `ReportSheet` and `AppealSheet` —
the three places where a traveller actually types something that reaches the
API — were the whole of the untested surface.

There are now 17 tests that press, type and submit. They run in the same
`node --test` process as the render tests, with no Jest and no simulator.

## What a press needs that a render does not

`react-test-renderer` was already a dependency of the render harness, but the
render helper calls `.toJSON()` and throws the tree away. Pressing needs the
tree kept, and needs every state update wrapped in `act()` so React flushes
before the next assertion reads.

`test/interact.ts` is that: `mount()` returns

```
{ root, renderer, text(), labels(), press(label), type(label, value), find(label), unmount() }
```

`press` and `type` both go through `act()`, and both are `async` on the way out
so a handler that awaits a fetch has somewhere to land.

`fakeFetch()` replaces `globalThis.fetch`, not the `api` module. That choice
matters: it means the tests exercise the real request-building code in
`src/api.ts` — the path, the method, the JSON body, the headers — instead of
trusting a mock of it. Each call is recorded as `{ method, path, body }` and
answered with `{ ok: true, data }`. Assertions read the recording.

## Two things react-native-web cannot do without a DOM

`test/stubs/react-native.mjs` re-exports `react-native-web` and substitutes two
components. Both substitutions exist for exactly one reason: the real component
touches `document`, and `react-test-renderer` has no DOM.

- **`Modal`** renders through a portal into `document.body`. Under the test
  renderer the mounted tree came back completely empty — `text()` was `""` and
  `labels()` was `[]` — which is a confusing way to be told a sheet did not
  open. The replacement honours `visible` and passes children through.
- **`TextInput`** reaches for `document` in a mount effect and throws
  `ReferenceError: document is not defined`. The replacement keeps `value`,
  `onChangeText` and `accessibilityLabel`, and renders the current value as
  text so an assertion can see what is in the field.

What neither models: focus, the keyboard, IME composition, selection, the
Android back-button dismiss, or `maxLength` being enforced by the platform. A
test here can type 5,000 characters into a field the phone would have capped.
That is a real gap and it is the shim's, not the app's.

## What the 17 hold down

**Writing a review** (6) — that you cannot post without a rating; that picking
one both enables the control and changes what the sheet says; that posting
sends the rating and the body to the right place; that a rating with no words
tells you *why* it earned nothing rather than silently earning nothing; that an
edit opens with the existing review in the field; that a review you have not
written yet offers no delete.

**Reporting** (4) — that the sheet says what a report does *before* you send
one; that a reason is required; that the request carries the reason **key** and
not the human sentence; that the note is optional.

**Appealing** (2) — that a bare "this is wrong" is not enough to send, and that
a real appeal reaches the right review id.

**The controls on a row** (2) — that your own review offers no report control,
and that reporting fires once and is not offerable again afterwards.

**Rows that lead somewhere** (3) — an offer row redeems; an unaffordable offer
stays pressable so the toast can explain rather than a disabled control
explaining nothing; a quest row opens its quest.

## Proving the tests can fail

A suite that has never failed has not been shown to test anything. I changed
`ReportSheet` to send `REPORT_REASONS[reason].en` — the English sentence —
instead of the key, which is the most plausible way that line breaks, and which
the API would reject:

```
✖ it sends the reason KEY, not the sentence
✖ the note is optional
```

Two tests, immediately, for a one-token change no render test could see. The
change was reverted.

## Still owed

- ~~**Still no whole screen.**~~ Done — see `24-whole-screen-tests.md`.
- **No layout.** A sheet can put the right words in the wrong order, or off
  the bottom of the phone, and all 17 pass.
- ~~**Nothing tested against a dead API.**~~ Done — `server()` in
  `24-whole-screen-tests.md` answers refusals, dropped connections and aborts,
  though only for the screens, not for these sheets.
- **Still nothing on a real device.**
