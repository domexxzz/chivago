# The review moderation desk

`/console/reviews`. The screen `12-reviews.md` said was the largest gap in the
review feature.

## The permission decision

Moderation is a **ROLE**, not a widened scope. `hosts.role` is `'host'` by
default; only `'moderator'` reaches this desk.

The proof queue is host-scoped because the host is the party vouching for the
work — Samui Municipality reviewing Ocean Lab's submissions breaks the trust
model, so it is refused. Reviews are about **places**, which no host owns, so
there is nothing to scope by. That leaves two options and only one of them is
defensible:

- Let any console holder moderate any review — which hands a hotel partner the
  ability to bury a bad review of the beach beside a competitor. That is a
  sharper conflict than the SOS desk ever has, because the SOS desk has no
  incentive to abuse.
- Grant it separately, to operators with no commercial stake in what is said
  about a place.

The seeder grants it to the platform host only. Giving it to a real operator is
a deliberate `UPDATE`, not something that arrives with a console key.

The tab is **hidden**, not disabled, for a non-moderator. A control you can see
but not use invites the question "why not", and the answer is a boundary the
host cannot cross. Better it simply is not theirs.

Both halves are tested: a hotel partner gets 403 on the page *and* on a direct
POST at the hide route, and the tab does not appear in their nav HTML.

## The page states its own limits

At the top, in both languages:

> Every review here is from someone who checked in at that place. That makes a
> fake review expensive, not impossible — someone who really went can still
> write something that has to come down.

This is not throat-clearing. A moderator who reads "verified" as "true" will
under-moderate, and the whole reason this desk exists is that verification and
truth are different things.

## The low lens

One and two stars is the default view — **not** because a low rating is suspect.
Most are honest and the most useful thing on the page. It is where abuse, the
naming of staff and unverifiable accusations concentrate, and a moderator
reading every five-star review in order would never reach them.

A handled review leaves the lens, so the default view empties as work is done.

## Taking something down

The reason is a **required, keyed** select — the same mechanism as a proof
rejection, for the same reason: the moderator picks in their language and the
author reads it in theirs.

| Key | Shown to the author |
|---|---|
| `personal_data` | Identifies an individual by name or contact details |
| `abusive` | Abusive, threatening or discriminatory |
| `not_about_place` | Not about this place |
| `commercial` | Advertising, spam or a solicitation |
| `unverifiable_accusation` | A serious accusation we are not able to verify — please report it to the police |

That last one needs explaining. A review saying "the owner drugged my drink" may
be true and may be defamation, and a travel app cannot adjudicate which. Taking
it down while telling the author to report it to the police is the only honest
handling: we neither publish an unproven accusation nor pretend nothing was
said.

An **internal note** can be added alongside. It is never shown to the author — a
sentence typed in Thai by a moderator is no use to a German traveller, and the
operational record is not the author's business. Tested.

## The author is told

Always, in the same transaction as the take-down, with the reason rendered in
**their** language. Removing what someone wrote and saying nothing is how a
platform earns the reputation of censoring quietly, and under PDPA the subject
of a decision about their own content is owed the reason.

This needed a change to `renderNotification`: it substituted one string into
both languages, so the reason key would have reached the traveller as the literal
word `personal_data`. Parameters whose value is itself a key are now resolved per
language.

## Points are not clawed back

The visit really happened. What was wrong was the words, not the trip, and
turning a moderation decision into a fine adds a punitive dimension the pilot
does not need. `reverseMovement` is still there for a deliberate case, and it
leaves its own ledger row.

The form says this, next to the button. A moderator who does not know what
follows from pressing it will hesitate over the wrong decisions.

## Hiding is not cosmetic

A hidden review leaves the public list **and** the average, and the roll-up query
is the same one the place screen reads. A hidden one-star still dragging the mean
down would mean the visible list said one thing and the number another.

Verified live: three reviews averaging 3.3, one taken down for naming a member of
bar staff, average moves to 4.5 over two.

## Restoring clears everything

`hidden_at`, `hidden_by`, `hidden_reason_key` and the note all go. No "was
hidden" mark survives: a review that has been restored was, as far as the
platform is concerned, never validly removed, and leaving a scar on it would
follow the author around for a decision that was reversed.

## Two bugs the screen surfaced

Both only visible with the page open, which is the argument for opening it.

1. **The active tab vanished on its own page.** `moderationPage` set
   `activeNav: 'moderation'` but never `canModerate`, so the nav dropped the tab
   exactly where the user was standing.
2. **`all` is a SQL keyword.** `COUNT(*) AS all` is a syntax error, so the filter
   counts threw. Caught by a test, not by the page — but it would have been a
   500 on first load.

## Still owed

- ~~A report control for travellers.~~ **Built** — see `14-reporting.md`. The
  desk gained a `reported` lens that leads the filter row, and a third
  outcome, "Looked at it, it is fine".
- ~~Notification of a restore.~~ **Built** — see `15-accountability-loop.md`.
- ~~An audit log page.~~ **Built** — see `16-moderator-accountability.md`.
- ~~Rate limiting on take-downs.~~ **Built** — thirty per rolling hour per
  moderator. See `16-moderator-accountability.md`.
- **Native Thai review** of the five moderation reasons — these are the strings a
  traveller reads when their words are removed, and they are the ones where tone
  matters most.
