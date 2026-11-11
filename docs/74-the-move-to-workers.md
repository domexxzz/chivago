# 74 — The move to Workers, measured again

On 11 November the owner decided to move the whole system to Cloudflare, with
`docs/70`'s recommendation against it in front of them. This document does not
re-argue that. It records what the move actually costs **today**, because two
of the three things `docs/70` called blockers have since stopped being
blockers, and a plan built on that document would be sized wrong in both
directions.

`docs/70` (open as a pull request, never merged) measured on 2 November. What
follows was measured on the 11th.

## What is no longer true

**"536 `prepare(` sites must each change."** They must not. On 2 November —
the same day `docs/70` was written — `db.ts` changed `export type DB` from the
concrete `DatabaseSync` class to the structural type `SyncDatabase`, and
`do-storage.ts` arrived beside it with an adapter that presents Durable Object
SQLite through that same surface. The commit says it plainly: *present Durable
Object SQLite through the DB surface*. Every one of what is now **543 call
sites across 60 files** already goes through the interface. They do not change.
One adapter does.

> The whole surface is `prepare`, `exec`, `close`, and on a statement
> `get`/`run`/`all`. `db.ts` says so, and says it was counted.

**"scrypt has to be replaced, and that invalidates every password."** It does
not. `apps/api/src/scrypt.ts` computes scrypt with `@noble/hashes`, in pure
JavaScript, and its docstring answers this exact paragraph of `docs/70`:
scrypt is a specification, so the digest is the same byte for byte. The test
holds it three ways — fixed vectors from the old `node:crypto` path, agreement
with `node:crypto` on fresh random input, and RFC 7914 vectors 2 and 3 checked
against this implementation directly, so a bug common to both would still be
caught. No password changes. No rehash-on-login path is needed.

## What is still true, and what closed

**Cloudflare Containers is closed.** `docs/70` left it as the unresearched
hope — "start there rather than with Workers". Cloudflare's own FAQ says all
container disk is **ephemeral**: when an instance sleeps, the next start gets
a fresh disk from the image. Snapshots (beta, September 2026) are immutable
point-in-time copies, and FUSE to object storage is offered with an explicit
warning not to expect SSD-like performance. A live SQLite file is exactly the
workload none of that suits, and `fly.toml` already records what happens when
the database is not on a real disk: every deploy silently resets the pilot.
So the route is Workers, and the store is Durable Object SQLite — 10 GB per
object on the paid plan, which is the shape this product already keeps: one
machine, one database.

## What is actually left

| left to do | size | known unknown |
|---|---|---|
| Worker entry point and a Durable Object class that opens the DB | small — `openDurableDatabase(storage)` already exists and runs the schema and migrations | the DO calls it inside `blockConcurrencyWhile`; nothing has run that for real yet |
| `wrangler.toml`, build, deploy pipeline | small | none; no wrangler config exists in the repo today |
| **Transcoding** — `transcode.ts` spawns ffmpeg, and `story-service.ts` runs it on every clip and photograph | **the one capability Workers does not have** | Cloudflare Stream and Images are paid products; nobody has priced them for this |
| Uploads — `uploads.ts`, `story-service.ts` write to `/data/uploads` | medium, and genuinely easy | R2 |
| `node:fs` elsewhere — `server.ts` serves the web build, `console/routes.ts`, `air.ts` | medium | what serves the Expo bundle instead: Workers Assets, or R2 |
| `db.ts`, `primary.ts`, `litefs-import.ts` | none — these are the Node driver and the LiteFS primary check. They are not ported, they are left behind | the Worker imports the DO path, never this file |

`node:crypto` is **not** on that list. Of its uses in the serving path,
`randomUUID` (26), `randomBytes` (9) and `randomInt` (2) all exist on Workers
through WebCrypto. `createHash` (5) becomes `crypto.subtle.digest`, which is
async and so needs its callers checked; `timingSafeEqual` (3) needs a
constant-time compare written by hand. That is a morning, not a blocker.

## The order, so production never stops working

1. **`wrangler.toml` and a Worker entry that serves `/health` and `/config`
   only**, on a workers.dev subdomain, against a Durable Object. Nothing
   points at it. This proves the toolchain and the `blockConcurrencyWhile`
   path, which are the two things no test in this repo can prove.
2. **Decide transcoding before porting anything that depends on it**, because
   the answer changes what stories are. The three options are: Cloudflare
   Stream/Images and its bill; keep one small box for transcoding and accept
   that the move is not complete; or stop accepting video. The third is a
   product decision and not ours to take quietly.
3. **R2 for uploads**, behind the same functions `uploads.ts` exposes now.
4. **The rest of the routes**, which are Hono already and move nearly
   unchanged.
5. **The data.** The live database is a file on a Fly volume; the destination
   is a Durable Object. Export and import has to be written, and rehearsed
   against a copy, before anything is cut over.
6. **Cut over at the DNS**, with Fly still running and able to take the
   traffic back.

## What this costs, stated once

`chivago-ha` still runs two always-on machines nothing points at, at about
฿2,274 a month. `chivago` itself now sleeps and costs ฿190–760 depending on
use. **Completing this move saves the second number, not the first**, and the
first is three clicks in a dashboard. That is not an argument against the
move — the owner has made that decision — it is the number that should be in
the room when the work is scheduled against everything else.

## What could not be verified

- **Whether Durable Object SQLite's API is synchronous in the way the adapter
  assumes.** `do-storage.ts` is written as if it is, and its tests pass
  against a node:sqlite stand-in. Nothing here has run against a real Durable
  Object, so the stand-in is currently the only thing that has ever agreed
  with it.
- **What Stream and Images cost** at this pilot's volume.
- **Whether 10 GB per object is enough.** Photographs are stored as BLOBs in
  SQLite (`local_shop_media.bytes`), so the database grows with the media
  unless that moves to R2 in step 3 as well.
- **How long a cut-over takes with the database copied**, and therefore how
  much of it can be done without the pilot being down.
