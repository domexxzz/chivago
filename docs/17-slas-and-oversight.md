# Promises about time, and watching the watchers

Four gaps from `16-moderator-accountability.md`.

## A promise with no mechanism behind it

`quest_review_delayed` has existed as a notification template since the
notification work. **Nothing ever sent it.**

The design promises "verified by host within 24h". Going quiet past that is how
a volunteer decides the whole thing is a gimmick — so a template that describes
the apology, wired to nothing, is worse than never having promised. A reader of
the codebase would have concluded the promise was kept.

`sweepOverdue` is that mechanism, and it sweeps two things because they are the
same failure — a person waiting on a decision, hearing nothing, reasonably
concluding nobody is coming:

| | Window | Told |
|---|---|---|
| A proof still in `host_verification` | 24h | The volunteer |
| An appeal still unread | 48h | The author |

48h for an appeal because a second moderator has to be found, and not a week
because the person waiting has had their words removed and is being told
nothing.

**Chased once, not hourly.** The dedupe key carries the proof or appeal id, so a
ticker running every minute chases each exactly once however long it stays
overdue. A daily reminder that we are still late is nagging, not accountability
— and the desk, not the notification, is where a backlog belongs.

The sweep runs hourly and **never flushes**. Being told your appeal is still
waiting is not urgent enough to jump the dispatch queue, and quiet hours should
hold it like anything else.

## Watching the moderators

> **Superseded.** The fixed threshold described below was replaced by a
> baseline-relative watch — see `18-moderator-watch.md`. Kept here because the
> reasoning for wanting a watch at all still holds; the rule does not.

The desk shows a reporter's track record so a moderator can weigh their report.
Nothing watched the moderators. **A compromised or angry account looks exactly
like a busy one unless somebody is counting.**

The audit page now leads with who has done what:

```
Ploy · 17    Anan · 0
Ploy — High take-down count — not an accusation, but worth a second look
Ploy:  17 down · 0 back · 0 dismissed
Anan:  0 down · 1 back · 0 dismissed
```

The threshold is **half the take-down cap** — fifteen in a rolling window. Not an
accusation: a moderator clearing a genuine spam wave will trip it, and should,
because that is also something the desk ought to know is happening.

Aggregate only, like the reporter record, and visible only to other moderators.

The log gained filters by moderator and by action. Fine to skip at pilot volume;
useless to lack at scale, which is exactly when you need to answer a complaint
about one person.

## Quiet hours, per person

The island default of 22:00–07:00 is right for most people and wrong for a
night-shift worker, and wrong again for someone who would rather be woken than
miss a quest result.

`profiles.quiet_enabled`, `quiet_from`, `quiet_until`. NULL means the default, so
the setting costs nothing for everybody who never touches it — and **no profile
row means no preference expressed, which is the default, not "off"**. Reading it
as off would have woken everybody who never opened settings.

SOS ignores the setting entirely and always will. Nobody can mute an emergency,
including themselves.

## A real bug the tests caught

The first quiet-hours implementation assumed **every** window wraps midnight,
because the default one does:

```js
return hour >= fromHour || hour < untilHour;   // wrong for a custom window
```

For someone who sleeps 01:00–09:00 that reads `hour >= 1 || hour < 9`, which is
true for almost every hour of the day. **They would never have been notified at
all**, and the failure is silent — no error, no log, just an app that stopped
talking to them.

Which comparison applies is now decided by whether `from` is after `until`, and
`a custom window that does NOT wrap is a plain range` guards it.

## Still owed

- ~~No bulk action with a second approver.~~ **Built** — see
  `20-bulk-takedown.md`. The deferral reasoning stands; it was simply the
  next thing once the silent failures were closed.
- ~~The moderator watch has no history.~~ **Replaced** — it now compares
  against each moderator's own median, and adds an overturn rate that catches
  somebody doing nothing at all. See `18-moderator-watch.md`.
- **No settings screen** for quiet hours. The API is there; the app has no UI,
  so today only a client that calls `PUT /notifications/quiet` can change it.
- **The overdue sweep does not escalate.** It tells the person waiting and
  nobody else. A proof unreviewed for a week should reach a human at the host,
  not just apologise to the volunteer again.
- **Native Thai review** of the SLA and oversight copy.
