# 70 — Cloudflare in front, and why not Cloudflare instead

On 2 November the owner asked whether the pilot could move to Cloudflare. The
question came out of a bill: $17.89 for a part-month in September, $34.46 for
a full October, on an app with no real users yet.

There are two different things called "use Cloudflare" and they are not
close to each other in cost. This records which one is worth doing, what it
needs, and — measured rather than guessed — why the other one is a rewrite.

## What the bill actually was

Fly charges for the reserved machine by the hour, not for traffic. `fly.toml`
had `min_machines_running = 1` with `auto_stop_machines = false`, so one
`shared-cpu-2x` with 1GB stayed awake in Singapore around the clock whether or
not anybody visited. That was the bill.

That is fixed separately (the machine may now sleep and wakes on the next
request), so **the November invoice is the number to judge any of this
against**. Everything below may turn out to be unnecessary.

## Cloudflare IN FRONT: no code changes at all

DNS and CDN in front of the Fly app. The web is served by the Fly machine
itself (`CHIVAGO_WEB_DIR`), so a cache in front takes most of the static
traffic off it.

Two things usually have to be fixed before a CDN helps. Both were already
right here, which is the finding worth recording:

- **Cache headers are already correct.** `server.ts` gives hashed Expo bundles
  and fonts `public, max-age=31536000, immutable`, unhashed photographs
  `public, max-age=3600`, `index.html` `no-cache` so a deploy is visible at
  once, and the favicon a day. The comment there already worked out why: the
  bundle is 681 KB and venue wifi, not CPU, is what falls over first. A CDN
  can cache all of that as it stands.
- **The client IP survives a second proxy.** `clientAddress()` in `server.ts`
  and in `console/routes.ts` reads `x-forwarded-for` and takes the FIRST hop.
  Cloudflare puts the real client first in that header, so per-IP registration
  throttling and console login throttling keep working. This is the thing that
  usually breaks silently behind a new proxy, and here it does not.

So this is entirely a dashboard and registrar job. Nobody needs to touch the
repository.

### The runbook, and what it cannot skip

Steps 1 and 3 need accounts, so they are the owner's; no software here can do
them.

1. **Add `chivargo.com` to Cloudflare** and let it import the existing DNS.
   Check the imported records against what is there now before continuing: the
   apex currently resolves to Fly's `66.241.124.199` (and the matching AAAA),
   the same address as `chivago.fly.dev`.
2. **Decide the SSL mode before switching anything.** Fly already terminates
   TLS for `chivargo.com` with its own certificate, so Cloudflare must be
   **Full (strict)**. "Flexible" would have Cloudflare talk to Fly over plain
   HTTP, which with `force_https = true` in `fly.toml` is a redirect loop, and
   is in any case an unencrypted hop for a product that carries SOS positions.
3. **Change the nameservers at the registrar.** Propagation is the part nobody
   controls; until it finishes some visitors are on Cloudflare and some are
   straight to Fly, and both work.
4. **Leave the orange cloud ON for the apex and `www`**, which is the whole
   point, and leave any record Fly uses for certificate renewal alone.
5. **Check afterwards, with the headers rather than by eye.** A cached hit
   returns `cf-cache-status: HIT`; a request that reached Fly still carries
   `server: Fly/...` and `fly-request-id`. If `cf-cache-status` is never
   anything but `DYNAMIC`, the cache is not doing the one job it was added
   for, and nothing has been gained.
6. **Then re-check the client IP in anger.** Register twice from one address
   and confirm the hourly limit still bites. `CHIVAGO_REGISTRATIONS_PER_HOUR`
   is currently `0` in `fly.toml`, which switches the limit OFF, so this has
   to be tested with it temporarily set to something small or it proves
   nothing.

### What it does not fix

Nothing about the machine bill, which is per-hour and not per-byte. It saves
bandwidth and adds a cache and DDoS cover. If the invoice turns out to be
almost all machine time, this is the wrong lever and the sleep change was the
right one.

## Cloudflare INSTEAD: a rewrite, and here is the size of it

Workers would host the HTTP layer happily — the API is Hono, which runs there
natively, so routing would move nearly unchanged. That is the only easy part.

Counted in this repository on 2 November, excluding tests:

| what | count |
|---|---|
| `prepare(` call sites in `apps/api/src` | **536** across **58 files** |
| files importing `node:sqlite`, or using `scrypt`, `node:fs`, `node:crypto` | **116 occurrences** across **75 files** |
| `server.ts` | 2,708 lines |

- **`node:sqlite` is synchronous and D1 is not.** `db.prepare(sql).get()`
  returns the row; D1 returns a promise. Converting means every one of those
  536 sites, and every function that calls them becoming `async` all the way
  up the service layer. Durable Objects' SQLite storage has a synchronous API
  and suits the one-machine-one-database rule this product already keeps, but
  it is still a different API at all 536 sites.
- **Password hashing is scrypt**, from `node:crypto` (`user-account-service.ts`
  and `host-auth.ts`). Workers' WebCrypto offers PBKDF2, not scrypt. Either
  ship a WASM scrypt, or change the hash — and changing it invalidates every
  existing password unless a rehash-on-next-login path is written first.
- **Uploads** at `/data/uploads` would go to R2. This part really is easy.

That is weeks, on a pilot with no users, to fix a bill that may already be
fixed. The recommendation is to do none of it until the November invoice says
the bill is still the problem.

**Not checked:** Cloudflare Containers runs real containers and might be close
to a lift-and-shift. Whether it offers the persistent disk a single SQLite file
needs, and at what price, was not researched. If this question comes back,
start there rather than with Workers.

## Before any of this, read the invoice

The Fly dashboard also offers Managed Postgres, Tigris Object Storage and
Upstash Redis. If one of those was ever switched on it is a separate line that
neither sleeping nor a CDN touches. Open the October invoice and look at what
the $34.46 is made of. The same goes for `fly.ha.toml`, which describes a
second app, `chivago-ha`: if it was deployed and left running, that is a second
bill for something nobody uses, and `fly apps list` would say so.
