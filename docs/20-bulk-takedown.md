# Bulk take-down, with a second approver

Deferred twice, and named both times as the proper answer. This is it.

## The problem the cap left behind

`16-moderator-accountability.md` capped take-downs at thirty per moderator per
hour, because a compromised account could otherwise clear every review on the
island. That worked, and it left a genuine spam wave of a hundred reviews taking
four hours to clear.

The wrong fix is to raise the cap: that removes the containment the cap exists
for. The right one is to make **two people** cheaper than four hours.

One moderator proposes a batch. A **different** one approves it. Only then does
it execute — without the individual limit.

Verified end to end on a 34-review wave, well past the hourly cap:

```
spam wave: 34 reviews published
proposed:  34 · still published: 34      ← proposing is not deciding
approved by Anan: 34 hidden · 0 left
```

## What this is not

**A procedural control, not a security one.** Two console keys and two invented
names would defeat it. What it buys is a speed bump and an audit trail with two
names on it.

That sentence is on the approval page, in both languages. A moderator who
believes this is an authentication boundary will trust it in situations where it
does not hold, and the honest version is more useful than the flattering one.

## The incentive detail that matters most

Hides made through an approved batch **do not count** toward the moderator
watch's volume rules, and **do not consume** the individual hourly allowance.

Both are the same point: a second human reviewed them. If using the safe path
made you look worse on the watch than acting alone — or silently disarmed you
for the rest of the hour — nobody would use it, and the mechanism would exist
only in the documentation.

They **do** still count toward the overturn rate. Being approved does not make a
bad call a good one, and if a batch was wrong that is precisely what should
surface.

**A test caught the allowance half of this.** Approving a batch of thirty was
consuming the proposer's cap, so the reward for taking the careful route was
being unable to act at all for an hour.

## Details that are load-bearing

**The id set is frozen at proposal time.** Resolving it at approval instead
would let the set drift between what was agreed and what was executed, which is
the one thing an approval must not allow. A review that arrives after the
proposal is not in the batch, and a test says so.

**Skipped ids are reported, not swallowed.** A review the author withdrew in
between is counted as skipped and the result says 2, not 3. "We removed 200"
when it was 197 is a small lie that erodes the record it exists to keep.

**Two hundred maximum.** Enough for a real wave; small enough that "approve" is
a decision a human can take responsibility for. A batch of five thousand is not
a decision, it is a signature on something nobody read.

**The approver sees a sample** — five reviews, with their text — above the
button, under the line *"approving a list nobody read is a signature, not a
decision"*.

**One reason for the whole batch.** That is what makes it a batch rather than a
hundred separate judgements sharing a button. If they need different reasons,
they are different batches.

**Proposals expire after 24 hours**, derived on read rather than swept: a
proposal that lapsed at 3am is expired at 3am, not whenever a ticker next looked.
A day-old proposal is a decision about a situation that has changed, and if
nobody approved it in a day the answer is that nobody was at the desk — a
different problem.

**Every author is still told individually.** A bulk decision is still a hundred
individual removals from a hundred people's point of view, and each of them is
owed the reason. Quiet hours hold them until morning like anything else.

**Execution is one transaction.** A half-applied batch is worse than none,
because nobody can tell from the outside which half.

## A routing bug the tests caught

`/reviews/batches/propose` must be registered **before** `/reviews/:id/...`.
Hono matches in registration order, so with the wrong order a proposal would
have tried to hide a review called `batches`. That is the kind of bug that never
appears in a unit test of the service and always appears with real traffic —
`"batches" is not swallowed as a review id` guards it.

## Still owed

- **No undo for a batch.** Restoring 200 reviews is 200 clicks. The reverse
  operation deserves the same mechanism, and needs the same second approver.
- **The proposer picks by checkbox**, one page at a time. A real wave arrives
  faster than a human can tick, and there is no "select all matching this text".
  That is the next thing to want, and it is also the next thing to be careful
  about: a selector that matches text is a selector somebody can get wrong at
  scale.
- **Nobody is notified that a proposal is waiting.** It shows on the desk with a
  count; if the second moderator is not looking at the desk, it sits until it
  expires. Same gap as the moderator watch, and the same missing role to send it
  to.
- **The `SameApprover` check trusts the reviewer name.** It is what the console
  has. Real accounts would fix it properly.
- **Native Thai review** of the batch copy — especially the honesty paragraph,
  which is the one an operator will decide how much to trust this by.
