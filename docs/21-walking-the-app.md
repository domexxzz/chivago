# Walking the app

I changed five mobile screens across this project and never rendered one of
them. This is what happened when I opened it.

The mobile suite is 13 tests and every one of them covers `map-geometry.ts` —
pin arithmetic. Nothing touched a screen. `pnpm typecheck` passing meant the
types agreed with each other, which is not the same as the app working.

Five bugs in one pass. Four were mine, from this project. One was older.

## 1. Unhandled rejection on every subscribe

```
Uncaught (in promise) ERR_UNAVAILABLE:
  ExpoNotifications.getLastNotificationResponseAsync is not available
```

Five times, repeating, and the renderer stopped responding to input.

```ts
void Notifications.getLastNotificationResponseAsync().then(...)
```

`void` silences the floating-promise lint and **catches nothing**. Anywhere the
native module is missing — web, and any build without notifications — this
rejects unhandled. `setBadge`, twenty lines below, already had a `try/catch` and
a comment saying why. This did not.

Fixing it exposed a second defect in the same function: the cold-start lookup
ran on **every** subscribe. Any re-render that re-ran the effect would replay
the notification that launched the app, navigating the traveller away from
wherever they had got to, for a tap they made once. Now guarded at module scope.

## 2. Onboarding replayed on every single launch

The worst of the five, and the first thing a returning traveller hits.

The profile saved correctly — the server had `completedAt` set. The app never
looked. `useNav('onboarding')` hard-coded the first screen and nothing asked
whether this person had already answered.

So every launch, forever: the three-step wellness questionnaire again, and
their previous answers silently overwritten by whatever they picked to get past
it.

`useProfile` had no loading flag, so the app could not tell *"has not
onboarded"* from *"has not been asked yet"*. It guessed onboarding. Now it waits
for the profile alongside the fonts and skips straight to the map — because
rendering onboarding and snapping away a moment later is worse than a beat of
loading.

## 3. "GREEN POINTS" captioned both currencies

The map header showed `1,240` and `320 T` under a single caption reading
**GREEN POINTS** — describing one figure and lying about the other. I added the
second currency to that header this session and left the caption alone.

Now `1,240 G` / `320 T` under **BALANCE**, with the letter riding on each
number the way the marketplace already did it.

## 4. Quest rewards did not say which currency

`+150`, everywhere — map card, quest list, quest detail. Unambiguous when there
was one currency; meaningless the moment there were two. Now `+150 G`, and the
screen-reader label says "150 Green Points" rather than "150 points".

## 5. Every map pin was labelled with its layer

The oldest bug here, and the most embarrassing to look at:

```
82 FOOD     75 BEACH     87 WELLNESS     89 GREEN     79 QUEST
```

Four of the five seeded places had the **layer name** in `short`, which is what
the pin chip renders. So the map showed Green / Food / Wellness / Quest —
repeating the filter chips directly above it and naming no place at all.

The sharpest detail: the accessibility label was correct the whole time. A
screen reader announced *"Na Muang Waterfall, Healthy Score 89"* while the
sighted user saw **"89 GREEN"**. The assistive path was more informative than
the visible one, which is exactly backwards.

Now:

```
82 FISHERMAN'S   75 CHAWENG   87 LAMAI SHALA   89 NA MUANG   79 THONG KRUT
```

The `short` field's doc comment now says what it is *for*, since it went wrong
by being vague.

## What was right

Worth saying, because it is most of it:

- Onboarding, all three steps, both languages, PDPA notice in place.
- The wallet: two purses with their notes, Level 3 · NEWCOMER · 60/1,200 EXP,
  the Thai rank name, "EXP IS NEVER SPENT", the five-rank ladder, and G/T on
  every ledger row.
- The marketplace priced per currency, and the cross-currency guard working
  through the real UI: **"Not enough points yet — 180 more Trip Points"** while
  holding 1,240 Green.
- `PlaceReviews.tsx` — 600 lines, three modals, never rendered before today —
  correct on first sight, including the locked state telling a traveller to
  check in before reviewing.

## A correction

Mid-walk I reported that the map pins were absent from the accessibility tree.
They were not. The query ran before the map had mounted, and re-querying found
all five with correct roles and labels. Recorded because a wrong finding
announced confidently is worse than no finding.

## What this says about the test suite

Five real bugs, none of which any test could have caught, because no test
renders a screen. The API has 509. The app has 13, all about pin geometry.

That imbalance is the finding underneath the other five.

## Still owed

- **No screen tests at all.** Even a render-and-assert-text pass over each of
  the ten screens would have caught three of these five.
- **Nothing checks the app against a dead API.** Every walk here had a healthy
  server.
- **Geolocation was never exercised** — the check-in and arrive flows depend on
  it and browser permission was never granted in this pass.
- **Never seen on a real device.** Web is a good proxy for layout and logic and
  a poor one for gestures, safe areas, keyboard behaviour and fonts.
