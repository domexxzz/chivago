# SOS dispatch

**Read this first: ChivaGo cannot send an ambulance.**

Thailand's emergency medical service is **1669**. The tourist police line, with
English-speaking operators, is **1155**. Nothing in this system replaces either,
and the most important design constraint here is that the app must never become
the reason somebody did not call one.

What this can honestly do is get a person's live location in front of people who
can act, through every channel that actually works, and then report truthfully
which of those channels succeeded.

---

## The rule: never claim a delivery that did not happen

The prototype's dispatch panel reads *"Live location shared with 2 contacts"* as
fixed copy, and the first version of the API stored `contacts_notified = 2`
regardless of what was sent.

In a wellness app that would be a harmless placeholder. In a safety feature it
tells someone in trouble that help was reached when nothing was sent — and a
person who believes their family has been alerted behaves differently from one
who knows they have not.

Every number the app now shows is **counted from a real delivery attempt**. Each
attempt is a row in `sos_dispatch` with a channel, a target, and an outcome.

```
contacts    : 1 of 2 reached
channels:
  share_link  Live location link     delivered    Ready to share…
  sms         Mae (mum)              unavailable  No SMS provider configured — send the link yourself
  push        Somchai (brother)      sent         Push queued to their ChivaGo app
  operator    ChivaGo duty desk      sent         Visible in the operator console. Not yet acknowledged
```

That "unavailable" row is the point of the whole design. The alternative —
skipping the contact silently — leaves the user believing their mother was told.

---

## Four channels, in order of how well they actually work

### 1. The share link — always works, needs nothing

A public, unguessable, expiring URL showing live position. The user sends it
themselves through **LINE, WhatsApp or SMS from their own phone**.

This is the strongest channel available, and it needs no provider account, no
integration, and no app installed on the other end. In Thailand LINE reaches
further than anything we could buy.

The receiving page:

- shows position, their note, and whether anyone has picked it up;
- **leads with 1669 / 1155 / 191** as one-tap dial buttons, above everything
  optional;
- refreshes itself every 15 seconds (polling, not a websocket — a family member
  on roaming data in another country is exactly who cannot hold a socket open);
- is entirely self-contained: inline CSS, no fonts, no analytics, no external
  request. It is opened in an emergency on a weak connection, and every extra
  request is another chance for it not to load.

**Security is the URL.** 32 bytes of CSPRNG, `noindex`, `no-store`,
`no-referrer`, and the page **stops reporting position the moment the alert
ends** — it showed where someone was during an emergency, it is not a permanent
tracker sitting in a family group chat. Tested.

It exposes only what a family member needs: name, position, their note, status,
nearest hospital. No user id, no contacts, no points, no trip history. There is
a test asserting the exact field list, so nothing can be added by accident.

### 2. Push to contacts who also use ChivaGo

Instant, and free. For a domestic traveller whose family is also on the app this
is the fastest channel there is. For an international tourist it usually is not
available, which is why it is not the primary one.

### 3. SMS — **not configured**

The code path exists and the interface is defined. There is no provider account,
so every SMS contact is recorded `unavailable` and the app says so.

**This needs a business decision, not more code:** an SMS provider with Thai
reach (Twilio, or a local aggregator), and someone to pay for it.

### 4. The duty desk — needs a human

`/console/sos` shows every live alert, self-refreshing every 20 seconds, with
per-channel delivery state and one button: **"I have this — tell them."**

Acknowledging sends the traveller a push naming **the operator**, not "an
operator". Being told a specific human has you is the most reassuring thing this
system can send, and it is the only point at which the app stops saying "nobody
has picked this up yet".

**The desk is not host-scoped**, unlike the rest of the console. An emergency
does not belong to whichever municipality posted the quest someone happened to
be doing at the time, and scoping it would produce alerts nobody is looking at.

That is a deliberate widening of access and it carries an operational rule:
**only issue console keys to organisations that have agreed to watch this
screen.** Software can put an alert there in under a second. It cannot make
anyone look.

---

## Live position

The alert follows the person, not the firing point. Someone in trouble may be
walking to a road or on the back of a pickup, and a panel frozen at the moment
the button was pressed sends help to where they *were*.

The app posts a position every 20 seconds while an alert is live — often enough
to follow someone moving, rarely enough not to drain the battery they may need.
A failed update is swallowed: the last known position stands, and an error
message is the last thing that person needs.

---

## Other behaviour worth knowing

- **Panic taps produce one alert.** Re-firing while one is live returns the same
  alert. Two dispatches for one emergency splits whatever attention exists.
- **Acknowledging twice does not re-notify** or overwrite the first responder.
- **Contacts are scoped to their owner.** An id alone is not enough to edit
  someone else's emergency list.
- **A linked contact is only pushed with their say-so.** Anyone can type
  anyone's user id into a contact; a push goes to that user only if they have
  listed the traveller on their own list. Otherwise the row is recorded as
  `unavailable` — "they have not added you as a contact" — so the traveller
  knows to send the link. Mutual listing is the consent this pilot can record.
- **No fix is recorded as no fix.** An alert fired by a phone that could not
  get a position has `lat`/`lng` null and the label *Position unknown*. The
  desk and the live page say so instead of drawing a pin; the first version
  substituted Bophut, and nothing on the desk could tell that pin from a real
  one. A later fix still updates it.
- **PDPA erasure reaches the emergency list.** Deleting a user removes their
  contacts and their alerts. Tested.
- **The banner no longer says "help is on the way."** It says the location is
  being shared, because that is what is true.

---

## Escalation: what happens when nobody looks

Before this, a desk nobody watched failed **silently**. The traveller's app said
"nobody has picked this up yet" indefinitely, and the system kept waiting.

The instinct is to escalate *inwards* — find another operator, page harder, try
more of our own channels. That is the wrong instinct, and it is worth being
explicit about why: **ChivaGo cannot send help**, so a ladder that only searches
inside ChivaGo is a ladder that leads nowhere.

The most valuable thing this system can do when its own channel has demonstrably
failed is **tell the person, so they use the one that works.**

| Rung | When | What happens |
| --- | --- | --- |
| `nudge_1` | **2 min** unacknowledged | Traveller: *"No one has picked up your alert after 2 min. Call 1669 now if anyone is hurt."* Contacts who use the app are re-alerted. |
| `oncall` | **5 min** | On-call webhook paged with position, live link and desk link. Alert flagged **ESCALATED** on the desk. |
| `nudge_2` | **10 min** | Blunter and final: *"ChivaGo cannot send help — call 1669 or 1155."* |

All three intervals are env-overridable (`CHIVAGO_ESCALATE_NUDGE_1`, `_ONCALL`,
`_NUDGE_2`), because a desk staffed round the clock by three people can
reasonably wait longer than one covered by a single duty phone.

**Two minutes is deliberately short.** In an ordinary product it would be
impatient. In an emergency, two minutes of silence is a long time, and the cost
of nudging early is one notification.

### It stops the moment it should

Escalation exists to break silence. Once a **named human** has the alert, or it
is cancelled, the ladder stops — including rungs that were already due. Tested
both ways.

### Idempotency is the whole guard

The sweep runs every 30 seconds. `sos_escalations` has `UNIQUE (alert_id, rung)`
and the row is **claimed before the work is done**, so a rung fires exactly once
however many ticks overlap.

Without that, a rung due at T+120s would re-fire on every tick for the rest of
the emergency — burying the person in trouble under identical notifications at
the worst possible moment. There is a test that sweeps ten times and asserts one
notification.

### Failure of the pager does not stop the ladder

- **No webhook configured** → recorded as *"no on-call webhook configured"*, not
  as success. Those are different facts and the desk shows which.
- **Webhook returns an error** → recorded as `FAILED`, and the traveller is
  **still** notified. Telling the person in trouble matters more than telling us.
- **Webhook throws** → the sweep survives and the other rungs still fire.

### The pager is a generic webhook

A JSON POST carrying `text` (which Slack and Discord both read) alongside
structured fields. Deliberately not tied to a vendor: whoever runs the pilot
already has a group chat, and asking them to adopt a new tool to receive an
emergency page is how the page ends up going nowhere.

```
CHIVAGO_ONCALL_WEBHOOK=https://hooks.slack.com/services/…
```

Verified end to end against a stand-in receiver:

```
PAGE: SOS unacknowledged for 5 min — Lamai, 400 m.
      Nobody has picked it up on the ChivaGo desk.
  live: https://…/sos/live/nTAtrwlk…
```

---

## What still needs a human decision

Ordered by how much it matters:

1. **Somebody has to watch the desk — and somebody has to answer the pager.**
   Escalation now makes an unwatched desk *visible* rather than silent, which is
   a real improvement, but it does not staff it. Point
   `CHIVAGO_ONCALL_WEBHOOK` at a channel a human actually reads.
2. **An SMS provider.** Until then a contact without the app is only reachable
   if the user shares the link themselves — which requires them to be conscious
   and holding their phone.
3. **What the hospital relationship actually is.** The panel names Bangkok
   Hospital Samui. Today that is a label, not an integration. Either make it an
   agreement or soften the wording.
4. **A real device test of background location.** Implemented and documented in
   `docs/09-background-location.md`; the task firing on a locked phone needs a
   development build and hardware.
5. **Legal review of the wording.** Everything user-facing has been written to
   avoid implying emergency-service capability. That judgement should be checked
   by someone qualified before launch.
