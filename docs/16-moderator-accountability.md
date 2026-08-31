# Moderator accountability

Four things, built together because they are one idea: **the power to remove
somebody's words has to be bounded, recorded, and answerable.**

## The appeal

`15-accountability-loop.md` closed the loop for reporters. It left the author
with none: we tell them their review came down, and they have no way to reply.

Now they do. Only the author, only while the review is actually hidden, one open
at a time.

The message is **free text and stays as typed**. Every other reason in this
system is a key so it can be translated for whoever reads it — but a person
defending their own words cannot be made to pick from a list, and the moderator
reading it is the one who wrote the reason they are arguing with.

There is deliberately **no "uphold" button**. Upholding an appeal is Restore,
which already exists, already notifies the author and already logs. Two controls
that both restore would be two chances to forget one of them. Declining is its
own action, and it tells the author:

> A second moderator read your appeal about Chaweng Beach and the decision
> stands.

Silence after an appeal is worse than the original take-down, because it says
the answer was never going to be read.

A declined appeal does not silence anyone for ever: the review is still hidden,
the appeal is closed, and they may file one more.

## The author can see their own hidden review

`myReview` never filtered hidden rows, but the app had no way to say *why* one
was not public. A review that silently vanishes from your own screen is the
worst version of moderation — you cannot tell whether it was removed, lost, or
never saved.

The author now sees it, marked **Taken down**, with the reason in their own
language and the appeal control. Nobody else sees it at all.

## The audit log

Append-only, in its own table, and **not derivable from the review rows**.

`restoreReview` clears `hidden_at` and `hidden_by` on purpose, so no scar
follows an author around after a decision was reversed — see
`13-review-moderation.md`. But that also erased the record that a moderator ever
acted. Both things are wanted: the review carries no mark, and the operator
record is complete. Only a separate log gives you both.

Verified live — Na Muang's review is currently published, and the log still
knows who took it down:

```
BACK  Restored        · namuang   Ploy · 31 Aug 2026, 18:37
DOWN  Took down       · namuang   Anan · 31 Aug 2026, 18:37 · not_about_place
DOWN  Took down       · chaweng   Ploy · 31 Aug 2026, 18:37 · personal_data
                                  names bar staff
```

`review_id` is deliberately **not** a foreign key. An audit trail that a subject
can erase by withdrawing their review is not an audit trail.

## The take-down cap

Reporting was rate limited in `15-accountability-loop.md`. Moderating is the
more dangerous of the two, and was not: a compromised moderator account could
clear every review on the island.

**Thirty take-downs per rolling hour, per moderator.** Restoring and dismissing
are **not** capped — rate limiting the safe actions would push a moderator at
their cap toward the dangerous one, or leave them unable to undo their own
mistake.

This is a real trade, stated plainly: a genuine spam wave of a hundred reviews
takes four hours to clear instead of one, which is survivable because they are
already published and another hour changes little. An attacker needs ten hours
to do serious damage, which is long enough for someone to notice. The proper
answer is a bulk action with a second approver; this is the blast-radius cap
until that exists.

A refused take-down leaves **no trace** — nothing hidden, nothing logged — so a
moderator at their cap sees a limit rather than a silent failure.

## Quiet hours

Non-urgent pushes are held between **22:00 and 07:00 island time**, and released
in the morning.

The island clock, not the device's: a traveller still set to Europe would
otherwise be woken at 03:00 Samui time by the rule meant to spare them.

Two kinds are exempt, and the list is short on purpose:

- `sos_contact_alerted` — an emergency at 03:00 is exactly when it matters most
- `sos_acknowledged` — being told a human has you cannot wait until morning

Everything else waits. Waking somebody at three in the morning to say a
moderator hid a review is how an app gets its notifications turned off for ever.

Nothing is dropped and no retry attempt is consumed — the row simply is not
eligible yet. **The in-app inbox has had it all along**, so someone who wakes and
opens the app at 04:00 finds their news waiting.

## A defect this introduced, and the fix

Quiet hours made the entire notification test suite **time-of-day dependent**:
it read the wall clock, so it passed all day and would have failed overnight.
The worst kind of flake, because at 2am it looks like an unrelated regression.

Fixed by pinning a clock — the service already accepted an injected `now`, the
tests simply were not using it. `dispatch` and `pending` in the suite now run at
a fixed 13:00 Bangkok, and quiet hours have their own tests at 02:00.

## Still owed

- ~~No bulk action with a second approver.~~ **Built** — see
  `20-bulk-takedown.md`.
- ~~No alert on a moderator's own pattern.~~ **Built** — see
  `17-slas-and-oversight.md`. Compares against a fixed threshold, not against
  that moderator's own normal.
- ~~The audit log has no filters.~~ **Built** — by moderator and by action.
- ~~Quiet hours are not per-user.~~ **Built** — see `17-slas-and-oversight.md`.
  The API exists; the app has no settings screen yet.
- ~~An appeal has no deadline.~~ **Built** — 48h, and the quest 24h SLA is now
  wired too. It never was. See `17-slas-and-oversight.md`.
- **Native Thai review** of the appeal, audit and quiet-hours copy.
