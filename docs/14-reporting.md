# The report control

A reader can send a review to a moderator. `13-review-moderation.md` named this
as the largest remaining gap: the low-star lens was the only thing that ever
surfaced a review, so someone who spotted one naming their child had no way to
say so.

## The rule everything else follows from

**A report is a signal, never an action.**

No count in this system hides anything. There is no threshold, no auto-removal,
no number that trips a switch. The only thing that takes a review down is a
moderator pressing a button and recording a reason.

That is not caution, it is the whole design. A report count that removed content
at some threshold would be a censorship tool, and the first business to work that
out would use it on a rival — twenty coordinated reports being cheaper than one
lawyer. `reporting hides NOTHING, at any number of reports` is the test that
guards it.

The app says this to the reporter, in both languages, before they send:

> This sends the review to a moderator to look at. It does not remove it — only
> a moderator can do that.

Someone who presses Report expecting the review to vanish, then watches it stay
up, concludes the button is decorative and stops using it for the one that really
matters.

## Anyone may report

No check-in required. This is the opposite of the rule for *writing* a review,
and deliberately so.

Writing is a claim about a place, so it needs presence. Reporting is a claim
about a **text**, and the person most likely to spot a review naming their child
is a local reading it — not a tourist who happened to be on that beach. Requiring
a visit would silence exactly the right reporter.

Verified live: a user who has never checked in at Chaweng reported a review
there, with the note *"Somsak is my brother, he does not work there any more"* —
context no automatic lens would ever have found.

The two guards that make open reporting safe are the signal-not-action rule above
and `UNIQUE (review_id, reporter_id)`: one voice per reader, so twenty reports
means twenty people rather than one person twenty times.

You cannot report your own review. Withdraw it instead.

## The reporter's vocabulary is not the moderator's

| Reader reports | Moderator takes down for |
|---|---|
| It names or identifies someone | Identifies an individual by name or contact details |
| It is abusive or threatening | Abusive, threatening or discriminatory |
| It is not about this place | Not about this place |
| It is an advert or spam | Advertising, spam or a solicitation |
| **I believe it is untrue** | *(no equivalent)* |
| | A serious accusation we are not able to verify |

A traveller does not think "unverifiable_accusation"; they think "that is not
true". Making them pick from the moderator's list would get the wrong reason or
no report at all.

The asymmetry at the bottom is intentional and worth being plain about: **you may
report something as untrue, and we will not take it down for being untrue.** We
cannot adjudicate what happened between a traveller and a bar. What the report
does is put it in front of a human who can judge whether it breaks a rule we can
actually apply.

## Three outcomes, not two

The desk gained **"Looked at it, it is fine"** alongside take down and restore.

A moderator who can only hide or ignore will, faced with a report they disagree
with, leave it — and the row then sits at the top of the queue for ever until
somebody hides it to make it go away. That turns a report into a slow removal.
Dismissing closes the reports and leaves the review published.

Acting on a review also closes its reports. Hiding, restoring and dismissing all
resolve, so the lens empties as work is done and a genuinely new report is not
lost in a backlog of ones already handled.

## The desk opens on what a human flagged

`reported` leads the filter row and is the default lens whenever anything is
reported, falling back to the low-star view when nothing is — so the desk never
opens on an empty page, and never buries a human flag under an automatic one.

The report block renders **above** the take-down form: a moderator should read
why people flagged this before reaching the control that removes it.

## The control in the app

Quiet, and only on other people's reviews. A small text link at the end of the
row, not a button competing with the review itself. Reporting is rare, and every
idle press is a moderator's minute.

Once you have reported something the control reads "You have already reported
this" and stops responding — including after a moderator resolves it, so nobody
is invited to report the same thing twice.

## Still owed

- ~~The reporter is not told the outcome.~~ **Built, and the reasoning above was
  wrong** — the outcome is already observable by opening the place. See
  `15-accountability-loop.md`.
- ~~The author is not told when a review is restored.~~ **Built** — see
  `15-accountability-loop.md`.
- ~~No rate limit on reporting.~~ **Built** — ten per rolling hour per reader.
  Still does not solve one person with many device ids; nothing device-scoped
  can.
- **No abuse signal on reporters at the account level.** The desk now shows a
  track record per report, but nothing aggregates "thirty today, all
  dismissed" into an alert.
- **Native Thai review** of the five report reasons and the sheet copy.
