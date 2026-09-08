# 54 — The board on Home

Every phone here is its own account. There is no sign-up, no password and
nothing to link, which is the right trade for a pilot handed to strangers at
an event — and it meant a room full of people using the app at once was a
room full of private notebooks. Nobody could see that anybody else was there.

The board is the one screen where those separate accounts meet.

## What is on it

`GET /areas/:key/board` answers with one feed, newest first:

- **Approved stories.** A clip or a photograph somebody filmed at a place,
  once a host has approved it. Same rule the projector screen already ran on
  (docs/44, docs/45) — the board cannot show what nobody has looked at.
- **Visible reviews.** As written. A review already costs a geofenced
  check-in to write, and it carries the author's own words and the language
  they wrote in. A moderator's hide removes it here at the same moment it
  removes it everywhere else.

**A check-in is not an entry.** "Somebody was at a beach" is not something
anyone came to read, and a feed of them would bury the two things that are.
Check-ins are what buy the right to write a review; they are not content.

## How it is ordered

By when the thing HAPPENED, not by which query returned it, so a review
written between two clips sits between them. Ties break on id, so two entries
made in the same second do not swap places between two fetches and make the
board look like it is shuffling itself. Capped at forty: past that it is a
scroll nobody finishes.

The merge is `boardFeed` in `packages/core/src/board.ts`, which is pure and
tested. The route runs two queries and merges rather than doing a UNION in
SQL, because a story row and a review row share a timestamp and a place and
nothing else, and a SELECT pretending otherwise needs a column of nulls per
side.

## What it refuses

- **An empty board says it is empty**, in words, and is not padded with a
  placeholder card. A board that always looks busy tells a reader nothing
  about whether anybody is here, which is the only question it exists to
  answer.
- **A missing poster stays a grey box.** No stock photograph stands in for a
  clip whose frame did not load.
- **A board that fails to load does not take Home with it.** The places, the
  missions and the wallet are all still there.

## Where it sits

Under the measured places and above today's missions: what other people did
belongs after what is around you and before what you could do next. It is
keyed by area, because the board of a campus and the board of an island are
two different rooms.

Every card is a door into the place it came from, which is the loop the
screen is for: read what somebody left, open the place, go, check in, leave
your own.

## Tests

- `board.test.ts` (core): the order across both kinds, the tie-break, the
  cap, an empty area, and that the caller's list is not mutated.
- `home.test.ts` (mobile): a clip and a review both reach the board with
  their place; an empty board says so and invents nothing; a board that will
  not load leaves the rest of Home standing; each entry opens its place.
