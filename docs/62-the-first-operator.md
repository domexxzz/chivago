# 62 — The first operator

`docs/61` built the inquiry marketplace in three stages, and on 28 September
all three were live on `chivago.fly.dev`. The list on it is empty, as it
should be until a real business lists. This is what it takes to add the first
one, and the thing that had to change before that could be done safely.

## What had to change first

A console login used to reach the whole console. For the partners it was
built for, that is the design: a municipality or an NGO is the party that
verifies volunteer work, and some of them watch the SOS desk. The SOS desk
shows a traveller's live alert and the trail of positions behind it, and any
signed-in host could acknowledge or resolve it. Any host could also issue a
public statement under its own name.

A boat co-op signed up to answer questions about a longtail trip is none of
those parties. Giving it the same login would have handed a business a
stranger's emergency and a place on the public board of who verifies work.
So an operator is now **its own account type**, and the console treats it as
one:

- **An allowlist, not a blocklist.** An `operator` login reaches its listings,
  the questions about them, and the way out. Every other page answers 403 with
  one sentence saying what the account is for. A page added next month is
  closed to operators until somebody decides otherwise, rather than open until
  somebody notices.
- **It opens on its questions.** The console's front page is the review
  queue; an operator lands on *Inquiries* instead.
- **It is not on the host board.** `/standing` ranks hosts by the work they
  verified. An operator verifies nothing, and listing it there, even at zero,
  would present it as a party that vouches for work.
- **Its badge counts questions.** The console already polled the review
  queue once a minute and could raise a browser notification. For an operator
  the same code counts questions waiting on it. A question left for three
  days reads as expired to the traveller, and the first operator will not sit
  in the console all day, so a notification is how the first question gets
  answered in time.
- **What a host *is* decides this, not what it has.** A hotel partner that
  also lists a room keeps the whole console. The restriction belongs to the
  operator type, and it is read on every request: re-typing a host as an
  operator closes the rest of the console at once, without waiting for a new
  sign-in.

## The runbook

Steps 1 and 2 are the owner's, and no software can do them.

1. **Choose the operator.** A real business whose owner you have spoken to,
   and who agrees to answer questions within three days. The listing is a
   claim in their name, which is why none is seeded.
2. **For a tour, get the licence number first.** The listing refuses a tour
   without a stated Department of Tourism licence number, and shows it as
   *stated, not verified*. Seeing the licence yourself is recommended; the app
   will not.
3. **Create the account on the server — only once this change is
   deployed.** On a server without it, an operator's key opens the whole
   console, the SOS desk included. From the machine that deploys:

   ```
   fly ssh console -a chivago
   ```

   and inside it:

   ```
   node --experimental-strip-types apps/api/src/add-host.ts --id op-<short-name> --name "<Business name>" --type operator
   ```

   The key prints **once** and only its hash is stored. Hand it over in
   person, or by whatever channel you would trust with a password.
4. **They sign in** at `https://chivago.fly.dev/console` with the key and
   their own name. They land on *Inquiries*.
5. **They add their first listing**: kind, a title in Thai and English, where
   it is in their own words, a "from" price only if they want to state one,
   and the licence number for a tour.
6. **They press *Notify me of new questions*** in the browser they will keep
   open, on a phone or at a desk.
7. **Walk it once, end to end.** As a traveller: *Plan my day → Ask a local
   operator*, send a question. As the operator: the badge moves, answer it.
   As the traveller: the answer and the operator's quote arrive, with a
   notification. That test answer counts towards their response time, which
   only appears after five answers anyway.

## What an operator's login can and cannot do

| can | cannot |
|---|---|
| add a listing, pause or resume it | open the review queue or decide on any work |
| read the questions about its own listings | see or act on an SOS alert |
| answer, with a quote in baht, or decline with a reason | issue or countersign a statement |
| see how long it usually takes to answer (after five answers) | open ESG, sponsor, evidence or quest pages |
| be notified of a new question while the console is open | appear on the host board |

## What is still missing

These are decisions, and each is named so that it gets made on purpose:

- **An operator hears of a question only while the console is open** in a
  browser with notifications allowed. Email or LINE would reach them anywhere.
  Either one means choosing a provider and paying for it, and deciding which
  contact detail we hold. `hosts.contact_email` exists, but nothing sends to
  it.
- **Nobody verifies the licence number.** It is shown as stated. Whether to
  check it, and against what, is part of the lawyer question `docs/61`
  already names.
- **There is no "close this account".** An operator can pause every listing;
  removing the login is a database change. The same is true of every host
  today.
- **No billing.** `docs/61` notes the honest models: a fee per answered
  inquiry, or a listing subscription, settled directly with the operator. Not
  built, and not needed for the first one.
- **A lost key** is rotated as for any host: clear `hosts.api_key_hash` for
  it, and run `add-host.ts` again.

## What holds it

`console/routes.test.ts` covers the operator:

- it opens on its questions;
- it is refused on every other page;
- it cannot decide on work, issue a statement or acknowledge an SOS, even with
  a valid token, and the refusal lands before anything is written;
- its nav names only its questions, and its badge polls questions, not the
  queue.

The same file holds that a municipality keeps the whole console.
`standing-service.test.ts` keeps operators off the host board without taking
the quiet host with them. `add-host.test.ts` checks that an operator's key
opens a session that knows what it is: a session that forgot its type would
open the whole console to a boat co-op.
