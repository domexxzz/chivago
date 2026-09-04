# 38 — Offline, and the leg on foot

## Saved means written

"Saved — will upload when you have signal" was a toast and nothing else for
fifty commits: a proof taken at the mangrove with no signal was gone the
moment the screen closed. It is an outbox now (`state/outbox.ts`): a
submission that fails for want of a network is written to the keystore (or
localStorage on the web) and tried again when the app comes to the front,
when the browser says it is online, and once a minute while anything waits.
A flush stops at the first network failure — thirty timeouts in a row is a
minute of nothing — and a proof the server *refuses* is not retried forever:
it is dropped with its reason kept, and the app says so. The quest screen
says how many proofs are waiting for it. Four tests hold the queue, the
order, the stop-at-first-failure and the drop.

The place photographs are prefetched while there is signal, so the place
screen at the mangrove opens off the cache.

## The leg on foot

The deck promised Green Points for low-carbon travel. They are not paid,
on purpose: green means a host verified it, and nobody verified this — the
phone did. What the phone *can* say is that two geofenced check-ins on the
same island day were far enough apart to have been a journey (800 m) and
close enough in time that only a walk fits (under 6 km/h, within four
hours). That is a measured leg, and it pays 30 Trip Points, the
self-verified currency, as a ledger row of its own kind — `walk`, "Walked ·
Chaweng Beach → Fisherman's Village", host "ChivaGo · measured leg on foot"
— once per pair per day. The bounds are walking, not cycling: a songthaew
in Chaweng traffic does fifteen kilometres an hour too, and a rule that
could not tell a bicycle from a bus would be paying for the bus.

`packages/core/src/low-carbon.ts` is pure and has seven tests; the check-in
service pays it and has three more. The SDKs decode `kind` as a string, so
the new kind breaks no decoder. Trip Points now have four of the deck's
sources; Green Points still have one, and will until a host verifies a
journey.
