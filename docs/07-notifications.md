# Notifications

Closes the last gap in the core loop. Before this, a municipality could approve
a beach cleanup and the volunteer would only find out if they happened to
reopen the app — which is what makes points feel imaginary.

---

## The pattern: outbox, not inline send

A decision writes a notification row **inside the same transaction that awards
the points**. Sending happens separately, afterwards.

```
POST /internal/verify  ─┐
                        │  ONE TRANSACTION
                        ├─ proofs.approved = 1
                        ├─ quest_progress.stage = 'complete'
                        ├─ wallets.balance += 150
                        ├─ ledger row  (source_ref unique)
                        └─ notifications row  (dedupe_key unique)
                        │
                        ▼
                    flushNotifications()   ← not awaited
                        │
                        ├─ render per device locale
                        ├─ one batched call to Expo
                        └─ mark sent / retry / prune dead tokens
```

Two properties fall out of that ordering, and both matter:

- **A municipal officer's approval never hangs on Expo.** If the push service is
  slow or down, the decision still commits. Sending is retried later.
- **A paid user is never an unnotified user.** Both rows are written together or
  neither is. There is a test named exactly that.

The dispatcher also runs on a 60-second timer, so a transient failure clears
without anyone touching anything.

---

## The rows are also the in-app inbox

The same table serves both jobs, deliberately.

A notification that exists *only* as a push is a notification that can be lost —
permission declined, token expired, phone in a bag for a day, Expo having an
outage. Recording it durably first means the news survives every delivery
failure, and someone who declined notifications entirely still finds out.

The inbox lives on the **wallet screen**, because "did my points arrive?" is the
question the notification answers.

| Surface | Languages | Why |
| --- | --- | --- |
| Push | **One** — the device's | A lock screen has no room for two, and the phone already knows which language its owner reads |
| Inbox | **Both** | Inside the app there is room, and the rest of the product works that way |

---

## Content is keyed, like everything else

```ts
NOTIFICATIONS.quest_approved.body
// en: '{host} approved {quest}. +{points} Green Points added.'
// th: '{host} อนุมัติ {quest} แล้ว ได้รับ {points} แต้มสีเขียว'
```

Stored as `kind` + `params`, rendered at send time. Same reasoning as the
rejection reasons: the event is created by a Thai municipal officer and read by
whoever the volunteer happens to be, so the language must not be frozen at write
time.

Substitution is **single-pass** — a quest name containing `{points}` cannot be
re-substituted. Quest names come from hosts and are not trusted input.

Templates live in `packages/core/src/strings.ts`, with the rest of the
volunteer-facing copy.

---

## Delivery, and what happens when it fails

| Expo says | We do |
| --- | --- |
| `ok` | Mark sent |
| `DeviceNotRegistered` | **Delete the token**, mark sent — the device is gone, retrying is pointless |
| `MessageTooBig`, `InvalidCredentials`, `DeveloperError` | Mark failed. It stays in the inbox |
| 429, 5xx, timeout, network | Retry with backoff |

Backoff is **1, 4, 15, 60, 240 minutes**, then give up after six attempts. The
head is short because most failures are a blip; the tail is long because a phone
in airplane mode on a boat to Koh Taen comes back hours later.

Other decisions worth knowing:

- **Any device succeeding counts as delivered.** Two phones and one stale token
  is not a failure.
- **A user with no device is marked sent, not retried forever.** They never
  granted permission; the inbox row is the delivery.
- **An unknown `kind` is retired immediately**, not retried six times — a
  notification from a future release cannot be rendered and never will be.
- **The dispatcher never throws.** One bad row must not stop delivery for
  everybody.

---

## Permission is asked *after* onboarding

Never on first launch. The OS lets you ask **once**, and asking before the user
knows what the app does is how you get a permanent no.

By the end of onboarding they have just answered "what should we watch for you?"
— air quality alerts, crowd warnings, live location. That is the moment the
request makes sense.

PDPA notes:

- The OS prompt **is** the consent step; the token only reaches the server after
  it is granted.
- Revoking is immediate. `disabled_at` is set rather than the row deleted, so a
  later re-grant is recognised as the same device rather than looking new.
- Deleting the user cascades to their tokens and notifications. Tested.

---

## Deep links

Every notification carries where it should land:

```json
{ "screen": "wallet", "questId": "q1", "notificationId": "…" }
```

Approvals open the **wallet** (see the points). Rejections open the **quest**
(read the reason, resubmit). Tapping marks it read.

Both entry points are handled: a tap while the app is running, **and a cold
start launched by the notification**. Missing the second is the classic bug —
the user taps "Quest verified", the app opens on the map, and the news is lost.

---

## Tokens

Keyed on the token, not the user. A shared or resold phone can move between
users, and re-registering must move the token rather than keep notifying the
previous owner. Tested.

Tokens are validated as `ExponentPushToken[…]` before storage — a malformed one
is a wasted send on every future notification.

---

## Why Expo Push

One endpoint for iOS and Android, with no APNs certificate or FCM project to
stand up first. For a pilot that needs to be running on Koh Samui rather than
waiting on an Apple developer account, that is the difference between shipping
and not.

Swapping to raw APNs/FCM later touches one file: `src/push/expo.ts`. The
transport is an interface, and the tests use a fake.

---

## Still owed

- **Receipt checking.** Expo returns a ticket immediately and a *receipt* later;
  we act on the ticket only. A push accepted by Expo but dropped by APNs is
  currently invisible to us.
- **Quiet hours.** A verification finishing at 03:00 will wake someone up.
- **The delayed-review notification exists but nothing schedules it.**
  `quest_review_delayed` is written and tested; a cron to fire it past the 24h
  SLA is not.
- **Per-kind preferences.** Consent is currently all-or-nothing. A volunteer who
  wants verification results but not voucher reminders cannot say so.
- **A dedicated inbox screen.** Today it is the top five on the wallet.
