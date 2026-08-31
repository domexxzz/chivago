# Watching the moderators, properly

`17-slas-and-oversight.md` shipped a watch that compared everybody against one
fixed number. This replaces it.

## Why one number fails in both directions

- A moderator who genuinely handles twenty a day **trips it every single day**.
  A flag that is always on is a flag nobody reads, and the next real one is
  invisible inside the noise.
- A moderator whose normal is two, who suddenly does twelve, **never trips it at
  all** — and that is the case actually worth catching.

Verified against four profiles on the same data:

```
Ploy   today  20 | normal  20 | overturned  0/180 | absolute
Fresh  today  15 | normal   0 | overturned   0/15 | no_baseline
Anan   today  12 | normal   2 | overturned   0/28 | spike
Nok    today   0 | normal   6 | overturned    4/6 | overturned
```

Under the old rule, **Ploy was the only one flagged** — every day, routinely,
until nobody looked. Anan and Nok were both invisible.

## Four rules, and each says which one fired

| Reason | Fires when | Means |
|---|---|---|
| `spike` | recent ≥ 3× their own median, and ≥ 5 | Unusual **for them** |
| `absolute` | ≥ 15 in 24h, with a baseline | A lot in absolute terms, even if routine |
| `no_baseline` | ≥ 15 in 24h, with too little history | We have no basis to judge |
| `overturned` | ≥ 30% of ≥ 5 take-downs later reversed | Their calls do not stand |

**A warning that cannot explain itself is an accusation.** Every flag prints the
rule and the numbers behind it — "usually 2 a day, 12 today", "4 of 6 take-downs
later reversed" — because the reader has to know whether it means *unusual for
them* or *a lot in absolute terms* before acting on it.

## The signal that matters most is not volume

`overturned` is the least obvious rule here and the strongest. **Volume says a
moderator is busy; reversals say they are wrong.**

Nok, above, did nothing at all today. No volume rule could ever have found her,
and four of her six take-downs were put back by somebody else. That is the
profile you actually want to catch, and it is invisible to every threshold on
activity.

An earlier restore of the same review does **not** count: ordering is respected,
or every review that has been hidden twice makes its second moderator look bad.

## Three concessions to how little data a pilot has

1. **A baseline needs enough days behind it** — five. A ratio from three data
   points is noise wearing the costume of statistics. Below that the absolute
   rule applies instead, and the flag says `no_baseline` rather than inventing a
   comparison.
2. **The baseline is a MEDIAN, not a mean.** One legitimate bulk-cleanup day of
   forty would raise a mean to about seven and swallow a later spike of eight
   entirely. Tested.
3. **A spike needs a floor as well as a multiple.** Somebody whose normal is one
   a day would otherwise be flagged for doing two, which is not news about
   anything.

The baseline also **excludes the recent window**, so a spike cannot raise the
very number it is being measured against.

## A known tension, stated rather than tuned away

The `absolute` rule fires **every day** for a genuinely busy desk. That is the
alert fatigue this work set out to fix, returning through the back door.

It is kept anyway, because somebody whose normal is already very high never
spikes, and twenty take-downs in a day is worth knowing about even when it is
routine. The mitigation is the reason line — *"a lot in absolute terms, even if
it is routine for them"* — which tells a reader at a glance that this one is
expected.

The page said the opposite until it was opened and read: the blurb promised a
busy moderator would not be flagged, while the code flagged them. Copy that
contradicts the behaviour standing next to it is worse than no copy.

## Where it is visible

On the audit page in full, and as a count on the **moderation desk itself** —
`Audit log · 2 moderators worth a look` — because a watch that lives only on a
page somebody has to remember to open is the same silent failure it exists to
prevent.

## Still owed

- **Nobody is notified.** The flag is on two screens and reaches no inbox. There
  is no head-moderator role to send it to, and inventing one to carry a
  notification would be building an org chart to solve a plumbing problem.
- **No seasonality.** A desk that is quiet on weekdays and busy at weekends will
  spike every Saturday. A day-of-week baseline would fix it and needs more data
  than a pilot has.
- **`overturned` is all-time.** A moderator who was poor in month one and good
  since carries the flag for ever. It should decay.
- **Nothing watches the watchers of the watchers.** A moderator can see these
  numbers about themselves and adjust to stay under every rule.
- **Native Thai review** of the four reason strings — they are the ones an
  operator reads about a colleague, and tone matters most there.
