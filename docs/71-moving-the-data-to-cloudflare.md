# 71 — Moving the data, when the time comes

The runbook for taking the pilot's SQLite file and its uploaded files off the
Fly volume and onto Cloudflare. Written alongside the port (PRs #175–#180) so
it exists before anybody needs it under pressure, and deliberately **not
executed**.

## Read this first

**Nothing here is verified.** Every other claim in the port's PRs was measured;
these commands were not, and the reason is worth stating plainly:

- `fly.exe` is blocked by Smart App Control on the maintainer's machine, which
  is why deploys go through `.github/workflows/deploy.yml` at all. Nobody here
  can run a `fly` command or look at the volume.
- There is no Cloudflare account attached to this work, so no `wrangler`
  command below has been run either.

So treat this as a plan to check, not a script to paste. The steps marked
**owner** cannot be done by anyone without the accounts.

**And before any of it: read the invoice.** PR #173 let the Fly machine sleep
on 2 November, and the whole reason this migration exists is a $17.89 September
and a $34.46 October on a machine that ran 24/7 with no users. If November is a
few dollars, the cheapest correct action is to stop here and keep the machine.
`docs/70-cloudflare-in-front.md` has the argument; the port does not expire.

## What is actually being moved

Three things, and they are not equally hard.

| what | where it is now | where it goes | difficulty |
|---|---|---|---|
| the database | `/data/chivago.db`, one SQLite file | Durable Object SQLite | the hard one |
| proof photographs | `/data/uploads/<xx>/<uuid>.jpg` | R2 | easy |
| story clips and photographs | **already in the database** (`media_blob`, `poster_blob`) | moves with the database | free |

The third row is the pleasant surprise and it is worth knowing before planning:
story media has lived in the row since the blob columns landed, so there is no
story file to move. Only *pre-blob* story rows still read from disk.

Media **transcoding** does not move at all. ffmpeg cannot run on Workers, so it
stays in a container (PR #179, `Dockerfile.transcode`).

## Step 1 — get it off the volume (**owner**)

Nothing can start until the file and the uploads are on a machine a human
controls. From somewhere `fly` runs:

```bash
fly ssh console -a chivago -u node -C "sqlite3 /data/chivago.db '.backup /data/snapshot.db'"
```

`.backup` rather than copying the file: a live SQLite file copied byte-for-byte
while something is writing is a corrupt file that looks fine. If `sqlite3` is
not in the image, stop the machine first (`fly machine stop`) and copy
`/data/chivago.db` plus `-wal` and `-shm` together — **all three or none**, or
the copy loses whatever was in the write-ahead log.

Then pull it, and the uploads:

```bash
fly ssh sftp get /data/snapshot.db ./snapshot.db -a chivago
fly ssh console -a chivago -u node -C "tar -czf /data/uploads.tgz -C /data uploads"
fly ssh sftp get /data/uploads.tgz ./uploads.tgz -a chivago
```

Check what you have before going on — a truncated download is the failure that
wastes the most time later:

```bash
sqlite3 snapshot.db "PRAGMA integrity_check;"   # must say: ok
sqlite3 snapshot.db "SELECT COUNT(*) FROM users;  SELECT COUNT(*) FROM ledger;"
tar -tzf uploads.tgz | wc -l
```

Write those three numbers down. They are what Step 5 checks against.

## Step 2 — the uploads go to R2

The keys matter. PR #177 made stored values **keys** (`photos/ab/<uuid>.jpg`)
rather than absolute paths, precisely so the same value means the same object on
a disk or in a bucket. But **rows written before that PR hold an absolute
path**, and R2 has no `/data/uploads`.

So this is two actions, and the second is easy to forget:

```bash
# a) the bytes, under their new keys
tar -xzf uploads.tgz                       # -> ./uploads/<xx>/<uuid>.jpg
cd uploads && for f in */*; do
  wrangler r2 object put "chivago-uploads/photos/$f" --file "$f"
done
```

```sql
-- b) the rows, rewritten from paths to keys. Check the SELECT before the UPDATE.
SELECT storage_path FROM proof_files WHERE storage_path LIKE '/data/uploads/%' LIMIT 5;

UPDATE proof_files
   SET storage_path = 'photos/' || substr(storage_path, length('/data/uploads/') + 1)
 WHERE storage_path LIKE '/data/uploads/%';
```

Until (b) runs, those photographs answer `null` through the R2 backing — which
is deliberate and means "not migrated yet" rather than "does not exist". A
console photo request simply 404s; nothing is destroyed, and re-running (b) is
safe.

Pre-blob **story** rows have the same shape in `stories.media_path` /
`poster_path`. There may be none left — they expire after seven days — so check
before writing an UPDATE for them:

```sql
SELECT COUNT(*) FROM stories WHERE media_blob IS NULL;
```

## Step 3 — the database into a Durable Object

**This is the step with no tool.** A Durable Object's SQLite is not a file you
can upload: there is no `wrangler do import`, and the storage is reachable only
from inside the object. D1 has `wrangler d1 execute --file`; Durable Objects do
not, and this product uses a Durable Object on purpose, because its "one
machine, one database" rule is exactly what a single DO gives and what D1's
async API would have cost 536 call sites.

So the rows have to be *replayed through the object*. The shape that works:

1. Dump the snapshot as SQL, data only — the schema is built by the object's
   own constructor from `db.ts`, so importing a schema would fight it:

   ```bash
   sqlite3 snapshot.db .dump > dump.sql
   grep -c '^INSERT INTO' dump.sql
   ```

2. Add a one-time import route to the Worker, behind the console's existing
   host authentication **and an environment flag that is unset afterwards**. It
   should accept batches of statements, run each batch inside one
   `transactionSync`, and refuse to run at all if `users` is not empty — the
   same guard `seed-db.ts` already has, for the same reason: a second import
   on a live database is the accident that cannot be undone.
3. Push the batches in order. Foreign keys are **on** in DO SQLite (measured,
   PR #175), and `ON DELETE CASCADE` fires, so parents must go before children:
   `users` before `user_accounts`, `profiles`, `wallets`, `ledger`; `hosts` and
   `places` before `quests`; `quests` before `quest_progress` and `proofs`.
   `sqlite3 .dump` emits tables in creation order, which is *usually* that
   order but is not guaranteed — if a batch fails on a foreign key, that is
   why, and the fix is to reorder rather than to turn the constraint off.
4. Delete the route. Not disable — delete, in a commit of its own.

**Unverified, and the riskiest part of this whole plan.** Check the current
per-object SQLite size limit in Cloudflare's documentation against
`ls -l snapshot.db` before starting; if the database is anywhere near it, this
approach needs rethinking and not retrying.

## Step 4 — the deploy

- `wrangler.jsonc` with the Durable Object binding and migration tag, the R2
  bucket, and Workers Assets for the web build.
- `CHIVAGO_TRANSCODE_URL` and `CHIVAGO_TRANSCODE_TOKEN` pointing at the
  transcode container (PR #179). The token is a secret: `wrangler secret put`,
  never in `wrangler.jsonc`.
- A deploy workflow beside `deploy.yml`, `workflow_dispatch` only. **The reason
  that file never fires on a push applies here too**: one database, and a
  deploy on every merge is how a green build resets a pilot.

## Step 5 — check it, with numbers rather than by eye

Against the three numbers from Step 1:

```sql
SELECT COUNT(*) FROM users;      -- same as the snapshot
SELECT COUNT(*) FROM ledger;     -- same as the snapshot
SELECT SUM(trip_points), SUM(green_points), SUM(exp) FROM wallets;
```

Then the things that are not row counts:

- **A host can sign in.** Only the hash of a console key is stored and there is
  no way to read one back, so if host login fails the keys are gone and have to
  be reissued. Test this before the cutover, not after.
- **A traveller can sign in.** PR #176 keeps every existing password valid by
  computing the identical scrypt digest; the golden vectors prove the algorithm,
  but only a real login proves the rows arrived.
- **A console photograph loads** — that is Step 2(b) having run.
- **`ledger.source_ref` is still UNIQUE.** It is what makes a reward award
  idempotent. `PRAGMA integrity_check` on the source said the constraint held
  there; confirm the index exists on the far side.
- **Per-IP throttling still bites.** `CHIVAGO_REGISTRATIONS_PER_HOUR` is `0` in
  `fly.toml`, which switches the limit off, so this has to be tested with it
  temporarily set to something small or it proves nothing.

## Rollback

Keep the Fly machine and its volume **untouched** until all of Step 5 passes.
The whole rollback is then DNS: point `chivargo.com` back, and the machine wakes
on the next request.

Do not delete the volume for a month afterwards. It is the only copy of the
pilot that was never transformed by any of the above.

## What would make this unnecessary

Stated once more because it is cheap and this document is long: if the November
invoice is small, keeping one sleeping machine in Singapore is less work, less
risk and fewer moving parts than a Worker, a Durable Object, a bucket and a
transcode container. Everything built in PRs #175–#180 works on the current
deployment too — the scrypt change, the metadata fix, the blob store and the
sweep extraction are all improvements to the Fly machine as it stands. None of
it is wasted by deciding not to move.
