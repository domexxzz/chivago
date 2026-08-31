# The last six screens

`24-whole-screen-tests.md` covered five screens and left six: place, quest
detail, safety, trip, onboarding, and reviews. All six are covered now — 30
tests — and the pass turned up a third instance of the same bug the previous
one found twice.

## A third swallowed failure

`ReviewsBlock` did this:

```ts
void api.reviews(placeId).then((res) => {
  if (!res.ok) return;
  ...
});
```

An explicit `return` on failure, recording nothing. Two consequences, and the
second is the bad one:

1. The list renders empty, which is indistinguishable from a place nobody has
   reviewed.
2. `canReview` stays `false` — so a traveller who **had** checked in here
   silently lost the ability to write a review, with no way to tell why.

It now records the error, shows it with a retry, and suppresses the
"no reviews yet" line so an empty list and a broken one never look the same.
Reverting the fix fails the test.

That is three for three: `ImpactScreen`, `MapScreen`, `ReviewsBlock`. All the
same shape — a fetch whose failure had nowhere to go — and none of them
reachable by a test that hands a component its data.

## What the harness needed

**A steerable native stub.** Checking in and arriving at a quest both ask for
location permission, and the Expo stub answered `undefined`, so `perm.granted`
threw. `test/stubs/native.mjs` now exports a shared `control` object with the
happy path as the default — permission granted, standing on Chaweng Beach — and
`resetControl()` to put it back. A test only says something when it wants the
unhappy path:

```ts
control.permission = { granted: false, status: 'denied' };
```

**A frame clock.** `Animated` schedules through `requestAnimationFrame`, which
node does not have, so the quest verification sweep and the SOS pulse threw
`ReferenceError` on mount. `test/register.mjs` now defines it. The timers are
`unref()`'d, because a running `Animated.loop` would otherwise hold the process
open after the last test finished.

**Stateful routes.** Joining a quest reloads it rather than trusting the POST's
own reply, so the route table has to answer differently the second time:

```ts
let joined = false;
const net = server({
  'GET /quests/q1': () => detail(joined ? progress({ stage: 'joined' }) : null),
  'POST /quests/q1/join': () => { joined = true; return progress({ stage: 'joined' }); },
});
```

## What the 30 hold down

- **Place** (6) — three fetches, not two, because the screen carries the
  reviews block; a place already visited today says so rather than offering the
  check-in again; checking in sends coordinates and lets the **server** judge
  the geofence; a refused location never reaches the server at all; a too-far
  refusal shows the server's distance, not a client guess.
- **Reviews** (5) — the verification leads; a past visitor is offered the write
  control and a stranger is not; a failed fetch says so; a taken-down review is
  still shown to its own author with the reason rendered from its **key**, and
  the reader never sees the literal `personal_data`.
- **Quest detail** (6) — an unjoined quest shows reward, host and one way in,
  and does not offer "I'm at the site" before you have joined; joining posts and
  advances; arriving sends the position; a quest awaiting the host names who is
  deciding; a rejection shows its reason in the reader's language; a quest that
  will not load renders no CTA behind the error.
- **Safety** (4) — every service with its own state; "2 of 3 contacts reached"
  counted from real attempts; the shield list failing does **not** take the SOS
  control with it; and — the single most important sentence in the app — that
  it never implies ChivaGo is the ambulance, with 1669 on screen.
- **Trip** (3) — the only screen that fetches nothing; stats, itemised times,
  and back reaching the caller.
- **Onboarding** (6) — it starts on step one; walking all three hands back
  exactly what was picked; activity level is single-select, so a second pick
  replaces rather than adds; a purpose picked twice is unpicked; skipping
  answers **nothing** rather than fabricating a profile the Healthy Score would
  then be weighted from; and the PDPA notice is on screen before `onFinish`
  fires, with the right to erasure stated.

## Two things I did not change

**`nearestHospital` is fetched, typed, and never rendered on mobile.** My first
draft of the safety test asserted it was on screen; it is not. The screen points
at 1669 and the direct numbers instead, which is the more honest handling, so
this is a product decision and not mine to reverse. Recording it because a
field that no screen reads is worth someone deciding about deliberately.

**The PDPA notice sits on step three, not step one.** The traveller answers two
questions before seeing it. Nothing is stored until `onFinish` fires after
step three, so consent does precede collection — but it is a judgement call,
and it is now pinned by a test either way.

## One unreproducible run

While assembling these, one run reported 67 tests with 1 failure. Ten
consecutive runs since — during and after — have reported 85 with 0. I could not
reproduce it and I am not going to claim it did not happen. If it returns, the
first suspects are the unref'd `requestAnimationFrame` timers and the
`Animated.loop`s they drive.

## Still owed

- **No layout**, still. Every one of these passes with the words in the
  wrong place.
- **The `Modal` and `TextInput` shims** still model none of focus, the
  keyboard, IME composition, or platform `maxLength`.
- **No screen is tested against a slow network** — every fake reply resolves
  immediately, so nothing covers two fetches racing or a screen unmounting
  mid-flight.
- **Still nothing on a real device.**
