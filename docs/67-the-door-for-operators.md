# 67 — The door for operators

`docs/62` took on the first operator, and the runbook it wrote is still the
right one: a real business whose owner you have spoken to, the licence seen
with your own eyes for a tour, and the console key handed over in person. What
it did not have was a way in. An operator account existed only at the end of
this:

```
fly ssh console -a chivago
node --experimental-strip-types apps/api/src/add-host.ts --id op-… --type operator
```

which means a business can only join if somebody who holds a deploy key is
sitting at a laptop. There was nothing a hotel manager at Chaweng could do
with the knowledge that this exists. That is the gap this closes — and only
that gap. **Nothing about who gets taken on has changed.**

## What was built

**A form a stranger can reach**: `/apply` (it redirects to `/console/apply`,
which is where the stylesheet and the queue already live — a link you hand to
a trader should not have the word *console* in it). Business name, kind, where
they operate, who to ask for, a phone number, an email if they have one, a
licence number, and a box for anything else.

**A queue behind it**: `/console/applications`, moderator only, with the two
decisions on each row — approve with an operator id, or decline with a reason.

**One write at the end**: approving calls the same `addHost` the CLI calls,
with `type: 'operator'`, so the account that comes out is the account
`docs/62` describes and the console's allowlist closes the SOS desk and the
review queue to it from its first request. The key prints once, on that one
response, and only its scrypt hash is stored.

## What the form deliberately is not

**It is not a sign-up.** A submission creates a row in
`operator_applications` and nothing else: no login, no listing, no presence in
any screen of the app. `APPLICATION_NOT_A_YES` is printed above the fields
rather than under the button, because somebody who thinks they are opening an
account should find out while they can still stop.

**It is not a verification.** Every field is typed by the applicant and
checked by nobody. The licence number is held exactly as a listing's is — as
*stated* — with `LICENCE_STATED` beside it on both the form and the queue.

**It does not let software do the owner's two steps.** `docs/62` steps 1 and 2
are a phone call and a look at a licence, and no form can make either happen.
So the sentence that says so is printed on the row, next to the Approve
button, instead of living in a document somebody has to remember:

> ก่อนกดอนุมัติ: โทรคุยกับเจ้าของให้แล้ว และถ้าเป็นทัวร์ ขอดูใบอนุญาตด้วยตาตัวเอง

## Decisions, and why

**Thai and English together, not the console's one-language switcher.**
`console/i18n.ts` explains why the console picks one language: its users are
known staff working a queue, and doubling every label halves their scanning
speed. The form's reader is not that person. They followed a link, they may be
a trader at a pier or a manager in Singapore, and asking them to find a
switcher before they can read the first field is asking too much. So the form
and the thank-you page carry both, Thai first, the way the app does. The queue
behind it carries both for a different reason: it quotes the form.

**The operator id is typed by the moderator, not generated.** It becomes the
account's id for good, appears in URLs, and is read aloud when a key is handed
over. A Thai business name transliterates several ways and none of them is the
owner's choice, so `op-thong-krut-boats` is typed by the person looking at the
application. The shape is enforced (`op-` + lower-case ASCII), an id already
taken is refused, and the application stays waiting when either check fails.

**The approval renders; it does not redirect.** Every other decision on this
console ends in a 303 so a reload cannot repeat it. This one cannot: the key
exists only in that response. A redirect would mean either losing it or
putting a live credential in a URL, where it lands in the browser's history,
the proxy's log and the next screenshot. The response is `no-store`, and a
reload of the queue shows the account's id and no key — which the page says
before you need to find out.

**A refusal requires a reason.** A business that filled in a form is owed a
sentence either way. It is also the only thing that makes the record worth
keeping: a queue of refusals with no reasons cannot be audited for the thing
worth auditing, which is whether businesses are being turned away for reasons
anybody would defend.

**Six submissions an hour from one address.** A public form that writes rows
needs a limit, and the thing being protected here is not CPU (as it is on the
sign-in form) but a moderator's attention: a queue with four hundred invented
businesses in it is a queue the real one at the bottom never gets read out of.
Every submission counts towards it, not only the refused ones — a bot that
fills the fields correctly is the case worth slowing down. `CHIVAGO_APPLY_LIMIT`
overrides it.

**A table of its own, not a flag on `hosts`.** A pending application must be
invisible to every query in the app. As a column on `hosts` that would be a
property of forty `WHERE` clauses, one of which somebody forgets. Nothing
outside the moderator's queue joins `operator_applications`, so there is no
clause to forget.

## What the database refuses on its own

As with `listings` and `inquiries`, the invariants that matter are `CHECK`s and
a trigger, so no path — this form, a script, a migration nobody read — can get
round them:

- a tour row cannot exist without a stated licence number;
- an approved row cannot exist without the `host_id` it created;
- a rejected row cannot exist without a reason;
- an application **leaves `pending` once**, by trigger. A second approval would
  mint a second key for a business that already has one, and the applicant
  would have no way to know which of the two is live.

## What holds it

`packages/core/src/operator-application.test.ts` — every problem is returned
rather than the first, a tour is refused by the *same function* a listing is,
an overlong field is refused and never truncated, and both languages are on
every sentence.

`apps/api/src/operator-application-service.test.ts` — a submission creates no
host; the key verifies against the stored hash and appears in plaintext in
neither table; a second approval is refused and mints nothing; a taken or
badly-shaped id writes nothing; a decided row cannot be moved back by SQL.

`apps/api/src/console/applications.test.ts` — the form opens with no session
and hands out no key or cookie; a refused form comes back with what they
typed; the limit bites on the seventh; the queue is 404 for a plain host, 403
for an operator (the queue that admits operators is not reachable by one); the
key is shown once, is not in a URL, and does not return on a reload.

That file has a fixture of its own rather than joining `console/routes.test.ts`,
and the comment at the top says why: every sign-in costs one scrypt derivation
per keyed host, deliberately, and seventeen more sign-ins in that file were
enough to make scrypt fail to derive on an ordinary laptop — the exact failure
`host-auth.ts` warns about — taking three unrelated tests red with it.

## What is still missing

Named so that each gets decided on purpose rather than drifting:

- **Nobody is told their application was refused.** The reason is recorded and
  shown in the queue, and then a person has to ring them. `hosts.contact_email`
  still sends nothing (`docs/62`), and an applicant has no account to notify.
  Email or LINE means choosing a provider, paying for it, and deciding what we
  hold — the same decision `docs/62` already names, now with a second caller.
- **The applicant cannot check on it.** The reference id is shown once and
  reaches nothing. A status page would mean a credential for somebody who is
  not a user yet.
- **Nobody verifies anything.** Not the licence, not that the person filling in
  the form speaks for the business. Unchanged from `docs/62`, and still part of
  the lawyer question `docs/61` names.
- **No way to close an account** once approved, as for every host today.
- **The queue has no notification.** A moderator sees waiting applications when
  they open the tab. The console already polls and can raise a browser
  notification for proofs and for questions; this is not wired to it, because
  a business that waited a day is not the emergency a three-day-old question
  is.
