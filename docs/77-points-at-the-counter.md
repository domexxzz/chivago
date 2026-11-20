# 77 — Points at the counter

On 21 November the owner asked for the digital shop to start with one thing:
a traveller spends the points they earned at a real shop on the island, and
the shop checks it. This records what was built and the hole it closed.

## The hole

`POST /vouchers/:code/redeem` said "the merchant marks a voucher used" in
its comment and answered **any device key**. Every phone running the app has
one. So a traveller could mark their own voucher used without going near the
shop, or mark anybody's voucher used once they had seen its code. Nothing in
the app called the route, which is why nobody noticed.

It now sits behind the host secret, for partner offers settled outside the
app. A shop in the app uses its own counter.

## What a shop can do

A shop's owner (an operator account that owns the `local_shops` row) can:

- **Put rewards on the shop.** A reward is an ordinary `offers` row with
  `shop_id` set. The market, the redeem route, the voucher, the ledger debit
  and the backpack all work on it unchanged.
  - The price is in **Trip Points only**, 50 to 5,000. A request for Green is
    stored as Trip. Green Points are what an ESG auditor is asked to trust, and
    a shop setting its own Green price would be a shop deciding what
    host-verified work is worth.
  - The baht value is optional, from 0 to 5,000.
  - A shop can hold up to 10 rewards.
- **Hide a reward, or edit it.** A hidden reward leaves the market and its
  redeem answers `UNAVAILABLE`. The owner still sees it. A shop taken offline
  takes all its rewards with it. A partner offer that is switched off still
  shows greyed, as before.
- **Check a code, then mark it used.** These are two steps on purpose.
  - `GET /shops/:id/vouchers/:code` shows what the code is for, its value and
    its state.
  - `POST …/redeem` marks it used. It is idempotent and conditional: scanning
    twice answers `alreadyRedeemed`, and two staff tapping at once mark it once.
  - An expired code is written down as expired and refused with 410.
  - Codes are upper-cased and trimmed, so a code typed in lower case still
    matches.
  - **Another shop's voucher is a 404**, never a 403. A shop cannot even learn
    that a code exists elsewhere.

**The counter sees the voucher, not the person.** The preview never carries
the traveller's id, name, email or phone. A test checks this.

## What a traveller sees

- The shop's profile has a "Redeem your Trip Points here" list. It is empty
  for a guest, and absent when the shop has no rewards.
- Redeeming shows the code and a real QR. The voucher also goes into the
  backpack.
- The market's voucher view now shows a real QR of the code. Before, it drew
  a row of bars that looked like a barcode, which a shop would try to scan and
  get nothing from.

## Why this and not the box

There is no chance anywhere in it. A deed earns the points, and the points buy
a named thing at a named price. That is why a shop's coupons live here and not
in the gacha (docs/68, "Judge-proof").

## Not done

- **No in-app camera scanner.** The shop types the code, or scans the QR with
  the phone's camera app and pastes what it reads. A scanner needs a camera
  library this app does not ship yet.
- **No settlement report.** The shop can count what it handed over, but there
  is no monthly statement of redemptions per shop yet.

## What holds it

- `apps/api/src/shop-rewards.test.ts`: 13 tests over HTTP. They cover
  ownership, pricing bounds, Trip-only pricing, the per-shop limit, the
  two-step counter, the privacy of the preview, codes in other cases,
  cross-shop 404s, expiry, the closed traveller door, hidden rewards and
  offline shops.
- `apps/api/src/reset-demo.test.ts`: a demo reset removes a shop's rewards with
  the shop and keeps the partner offers.
