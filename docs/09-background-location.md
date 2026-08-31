# Background location

Position updates stopped the moment the app was backgrounded — which is exactly
what happens when someone puts their phone in a pocket to deal with an
emergency. The trail on the duty desk froze at the moment they stopped looking
at the screen.

---

## The constraint that shapes everything

**This runs only while an SOS alert is live. Never at any other time.**

That is not a courtesy. It is the only justification that survives App Review,
and the only one that is honest to the user. Tracking starts when an alert goes
live, stops when it resolves or is cancelled, and stops again on app start if no
alert is running — so a tracker left behind by a crash or a force-quit does not
outlive the emergency it belonged to.

A tracker that survives its emergency is a surveillance bug, not a feature.

---

## This cannot be tested in Expo Go

Background location requires a **development build** (`npx expo run:ios` /
`run:android`, or EAS Build). Expo Go does not include the native module.

**Verified here:** the server side in full — batch ingest, offline flush,
deduplication, accuracy filtering, trail analysis, desk rendering — plus
TypeScript across the client.

**Not verified:** the background task firing on a locked device. That needs
hardware and a dev build. The code degrades to a no-op wherever the capability
is absent, and `backgroundAvailability()` reports `unsupported` rather than
pretending.

---

## Permission is requested from the Safety screen, ahead of time

Not at onboarding, and not during an emergency.

- **iOS requires "When In Use" before "Always"**, and shows its own upgrade
  prompt. Asking cold at first launch gets a permanent no, and the OS only lets
  you ask once.
- **Asking mid-emergency** requires taps from someone who has other problems.

The screen explains what it is for before the dialog appears. A permission
prompt with no context is a permission prompt that gets declined.

**Android** shows a persistent foreground-service notification while tracking.
Required, and also correct: the user should be able to see that tracking is on.

---

## Battery is part of the lifeline

| Setting | Value | Why |
| --- | --- | --- |
| Accuracy | `Balanced` (~100 m) | A phone that dies at 10 m accuracy is worse than one that survives at 100 m |
| Interval | 30 s | Enough to follow someone walking |
| Distance filter | 25 m | No fix while stationary |
| Deferred updates | 60 s / 50 m | Batches on iOS so the radio wakes less often |

---

## Offline queueing

Beach and mangrove sites are exactly where signal fails and exactly where
someone needs finding. A dropped fix is a gap in the trail.

Failed sends are held in `SecureStore` and flushed as a **batch** when the
connection returns. The queue caps at 120 and drops the **oldest** — the newest
points say where the person is now.

A re-sent queue is harmless: `UNIQUE (alert_id, recorded_at)` makes the server
idempotent. Verified live:

```
first flush   recorded: 4  duplicates: 0
re-sent       recorded: 0  duplicates: 2   <- no double-counting
```

Queued fixes are marked `source: 'queued'`, so a twenty-minute-old point is
never read as current.

---

## The trail, not the pin

A single "last known position" tells a searcher where a phone *stopped
transmitting*. The trail tells them which way the person was heading, how fast,
and whether they had stopped before the signal went — the difference between
searching a road and searching a hillside.

The desk shows:

```
Updating · last fix 29s ago
5 fixes · 447 m travelled · 446 m from where they started · via background
```

And when it goes quiet:

```
No signal for 8 min
The phone has stopped reporting. The pin is where they were, not
necessarily where they are.
```

**That warning is the most important line on the desk.** A confident dot for a
phone that died ten minutes ago is worse than an honest gap.

---

## Two defects found by driving the live desk

Both were visible only once real data flowed through the rendering, which is why
it was worth opening the page rather than trusting the tests.

### 1. A bad fix polluted the movement maths

```
5 fixes · 20139 m travelled · 19374 m from where they started
```

A rejected 2 km-accuracy fix, 19 km away, was correctly kept out of the
displayed pin — but was still counted in the distance totals. A 400 m walk read
as 20 km, which would send a searcher to the wrong side of the island.

Fixed: distance is measured between **usable** fixes only, while every fix stays
in the trail. Nothing is silently discarded, and nothing inaccurate reaches the
maths. Falls back to the full set when nothing is usable, so a trail of poor
fixes still reports something rather than a confident zero.

### 2. Negative time

```
Updating · last fix -176s ago
```

A device with a skewed clock reports a fix stamped in the future. Beyond reading
as nonsense, a negative age would keep `hasGoneQuiet()` false **forever** — the
one warning that matters most would never fire.

Fixed: clamped at zero, with a regression test.

---

## Accuracy filtering

A fix worse than **500 m** never becomes the displayed position. At that
accuracy the "position" is a neighbourhood, and drawing it as a point invites a
searcher to trust it.

It is still stored and still appears in the trail, flagged. Verified live: a
2.5 km fix arriving after a good one leaves the pin where it was.

The pin also **never moves backwards in time**. A queued point from twenty
minutes ago must not overwrite a fresh one that arrived while it was in flight.

---

## Still owed

- **A real device test.** Everything above is verified server-side; the task
  firing on a locked phone is not.
- **App Review justification.** Apple scrutinises `UIBackgroundModes: location`
  closely. The usage string is specific and truthful — SOS only, until cancelled
  — but a first-submission rejection is still plausible, and the reviewer notes
  should say plainly that tracking cannot start any other way.
- **A map on the desk.** The trail is numbers and a Maps link today. Drawing the
  polyline needs a tile provider decision (`docs/04-open-questions.md`).
- **Significant-change monitoring as a fallback.** If background permission is
  refused, iOS still allows coarse significant-location-change updates. Worth
  offering as a lesser option rather than nothing.
- **Battery telemetry.** The desk should know the phone was at 6% when it went
  quiet. That changes how a searcher reads the silence.
