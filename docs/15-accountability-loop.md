# Closing the accountability loop

Four gaps from `13-review-moderation.md` and `14-reporting.md`, built together
because they are one thing: **everybody who took part in a decision hears what
it was.**

## A reasoning correction

`14-reporting.md` deferred telling reporters the outcome, on the theory that
outcome notifications give someone probing the system a way to confirm whether
reports work.

That reasoning was wrong, and the argument against it is one line: **the outcome
is already observable.** Open the place and see whether the review is still
there. Withholding the notification hides nothing from an attacker and teaches
an honest reporter that nobody looked — which is exactly how a report button
dies.

Both outcomes are now sent, and both are stated plainly:

| Outcome | What the reporter reads |
|---|---|
| `removed` | it has been taken down |
| `kept` | a moderator read it and decided it can stay |

"We looked and left it up" is a real answer. Hiding it would let the reporter
assume nobody read it, which is worse than a decision they disagree with.

## The author hears about a restore

The other half of `review_hidden`. Telling someone their words were removed and
never telling them they are back is the wrong way round: the bad news travels
and the good news does not.

> Your review of Chaweng Beach is published again. Sorry for the interruption.

The author of a review whose *reports were dismissed* is deliberately **not**
told. Nothing happened to their review; telling them it had been reported and
cleared would hand them a grievance they did not have.

## Outcomes are recorded, not derived

`review_reports.outcome` is written at the moment a moderator decides, rather
than inferred later from whether the review is currently hidden.

The difference matters on appeal. A report upheld on Monday and reversed on
Friday was still upheld on Monday — deriving it would rewrite history and turn
"your report was acted on" retroactively false. `a resolved report keeps the
outcome it had at the time` is the test.

## Rate limiting

One report per reader per review already stops repeat-flagging a single target.
This is the other axis: nothing stopped one account reporting a hundred
different reviews in a minute and burying a moderator — the cheapest
denial-of-service a review system has.

**Ten reports per rolling hour, per reader.** Far above any honest use — a reader
who genuinely finds ten bad reviews in an hour has found a spam wave, and the
desk needs to see that — and far below what an attack needs. The window rolls,
so a diligent reader is not punished for ever, and the cap is per reader, so one
noisy account cannot silence everybody else. Returns 429 with a retry hint.

This does not solve one person with many device ids. Nothing device-scoped can;
accounts would.

## The reporter's track record

Each report on the desk carries how reliable that reader has been:

```
It names or identifies someone · 31 Aug 2026, 18:19
This reporter: 2 reports · 0 upheld · 1 dismissed
From the reporter: Somsak is my brother, he left that job
```

**Aggregate only** — counts, never a name and never a list of what they flagged.
A moderator weighing a report needs to know whether this reader is usually right,
and a reader whose reports are always dismissed is itself a signal. Anything more
identifying would be surveillance dressed as moderation.

A first-time reporter is said so in words rather than shown "1 · 0 · 0", which
reads as a bad record when it is no record at all.

## A note on a false alarm

An ad-hoc live run appeared to show a reporter being told "it can stay" after a
take-down. Re-running the same sequence on a clean database was correct at every
step, and the unit tests cover it. The bad output came from contaminated state in
the throwaway test database — a stray report filed by another test user between
two scripts — not from the code. Recorded here because "I could not reproduce it"
is a more useful note than silence.

## Still owed

- **No abuse signal on reporters at the account level.** The desk sees a record
  per report; nothing aggregates "this reader has filed thirty reports today and
  every one was dismissed" into an alert.
- ~~No appeal path for an author.~~ **Built** — see `16-moderator-accountability.md`.
- ~~No audit log page.~~ **Built** — append-only, and it survives the restore
  that erases the evidence from the review row. See
  `16-moderator-accountability.md`.
- ~~Quiet hours apply to none of these.~~ **Built** — 22:00-07:00 island time,
  with SOS exempt. See `16-moderator-accountability.md`.
- **Native Thai review** of the outcome and restore copy.
