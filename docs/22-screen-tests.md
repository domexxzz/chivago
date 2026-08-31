# Screen tests

`21-walking-the-app.md` ended on the finding underneath the other five: the API
had 509 tests and the app had 13, all of them about pin arithmetic. Five real
bugs reached a running app, three of them plain wrong text, and nothing could
have caught them because nothing rendered a screen.

**19 screen tests now, against real rendered components.**

## Why there were none

Not neglect — there was no way. `react-native` ships Flow-typed source node
cannot parse, and node strips TypeScript types but does not transform JSX, so a
`.tsx` screen would not even load. Testing a screen meant adopting Jest and the
React Native preset, which is a large dependency change for a repository that
runs everything on `node --test`.

It turns out three small hooks are enough.

## The harness

| Problem | Answer |
|---|---|
| `react-native` will not parse | Resolve it to `react-native-web` — already a dependency, renders through `react-dom/server` with no DOM, same component tree the device runs |
| Node does not transform JSX | `.tsx` through **sucrase** in a `load` hook |
| Native modules do not exist off-device | Four small stub files: icons, native view libraries, Expo modules |

Two registrations, and the second is not optional: `register()` covers ESM,
`registerHooks()` is synchronous and is the **only** one that sees CommonJS
`require` — and the app reaches `react-native` through a CJS require inside
`react-native-svg`. With the async hook alone the real Flow-typed package loads
and fails.

Three things I got wrong on the way, each worth the comment they now carry:

- **A catch-all `Proxy` for the native stubs.** An ES namespace is built by
  static analysis, so a Proxy is invisible to `import * as Notifications` and
  every call is `undefined is not a function`. The stubs enumerate their names,
  and an unexpected one now fails *by name*.
- **Custom URL schemes** (`chivago-stub:`) break node's package-scope lookup.
- **`data:` URLs** cannot resolve bare specifiers, so a stub that imports
  `react` dies. The stubs are real files.

## What it tests, and what it cannot

It tests **what a screen says**, which is exactly where the five bugs lived.

It does not test gestures, layout, fonts, safe areas, native modules, or
anything a device does differently. It is not a replacement for opening the app;
it is what makes opening the app worth doing, by taking the boring failures off
the list first.

## Proof it works

The caption bug reintroduced, deliberately:

```
✖ the caption names the pair, not one of them
```

That is the exact defect found by hand — `GREEN POINTS` captioning two figures,
describing one and lying about the other.

## What the 19 cover

- **The wallet**: both purses with their notes, level and EXP, "EXP is never
  spent", the full five-rank ladder, the top-rank case, and a currency letter on
  every ledger row.
- **The map header**: a letter on each figure, and a caption that names the pair
  rather than one of them.
- **Reward badges**: `+150 G` and `+120 T`, and the screen reader hearing
  "150 Green Points" rather than "150 points".
- **The marketplace**: per-offer currency, both purses in the header, and an
  unaffordable offer staying reachable rather than disabled.
- **Reviews**: the verification leading instead of a name, your own review
  marked as yours and unreportable, an already-reported one saying so.
- **The seed data**: no place labelled with its own layer, every pin label a
  real shortening of its place name, and — the one that stung — what a pin
  **shows** agreeing with what it **announces**.

## A test bug of my own, while writing these

The shortening assertion stripped punctuation from the label and not from the
name, so `Fisherman's` failed against `Fisherman's Village` on an apostrophe.
Both sides are normalised now. Worth recording because a test that fails for its
own reasons is how a suite gets switched off.

## Still owed

- **Nothing renders a whole screen**, only its presentational parts. The screens
  fetch on mount, so a static render shows a loading state; asserting the loaded
  state needs a fake `api` module.
- ~~**No interaction.**~~ Done — see `23-interaction-tests.md`. Seventeen
  tests now press, type and submit, and the three sheets are covered.
- **No snapshot of layout.** A screen can say the right words in the wrong
  place and every one of these passes.
- **Still nothing against a dead API**, and still nothing on a real device.
