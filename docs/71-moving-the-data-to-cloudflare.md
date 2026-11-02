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

**This step had no tool. It has one now.** A Durable Object's SQLite is still
not a file you can upload - there is no `wrangler do import`, D1's
`--file` does not apply, and the storage is reachable only from inside the
object - so the rows are replayed THROUGH the object. What changed is that the
replaying is written, tested and not improvised at two in the morning:

- `apps/api/src/export-for-import.ts` reads the snapshot and writes batches.
- `POST /admin/import` applies one batch, and is off unless armed.
- `apps/api/src/import-service.ts` is the half that validates and inserts, and
  it is tested under BOTH drivers - including through the Durable Object
  adapter, which is where it will run.

### 3a. Make the batches (**owner**, on the snapshot)

```bash
pnpm --filter @chivago/api export:import -- --db ./snapshot.db --out ./batches
```

It prints a line per table and writes `manifest.json` with the row counts -
**keep that file**, it is what Step 5 checks against. Files are numbered in the
order they must be sent, because tables come out parents-first, derived from
the snapshot's own foreign keys (63 tables, 74 keys between them). Foreign keys
are enforced in Durable Object SQLite, so a child sent before its parent is
simply refused.

Empty tables get no file. On a pilot most of the schema is empty, and the run
lists which ones it skipped so that is visible rather than assumed.

`--chunk` sets rows per batch (500 by default). The number that matters is
bytes, and `stories` carries media blobs while `wallets` carries tens of bytes
a row, so lower it if a request is too big.

### 3b. Arm the importer

```bash
wrangler secret put CHIVAGO_IMPORT_TOKEN      # something long and random
```

**Without that secret the route answers 404, not 403** - an unarmed deployment
does not admit the door is there. That is also what makes closing it afterwards
something somebody will actually do: unset the secret, no deploy needed.

### 3c. Send them, in order

```bash
for f in batches/[0-9]*.json; do
  curl -fsS -X POST "https://<worker>/admin/import"     -H "x-import-token: $CHIVAGO_IMPORT_TOKEN"     -H "content-type: application/json"     --data-binary "@$f" || { echo "FAILED on $f"; break; }
done
```

`-fsS` and the `break` are deliberate: stop at the first failure rather than
pressing on and leaving a database that is partly one thing and partly another.
Each batch is one transaction, so a failed batch inserted nothing and can be
retried once the cause is fixed.

**An interrupted import can be continued.** The first batch records a row in
`import_runs`, and the guard asks "did this import begin on an empty database"
rather than "is the database empty now" - which it is not, after batch one.
(That distinction is the bug this step had when it was first written: the
`users` batch succeeded and the `wallets` batch was refused with a 409.)

### 3d. Close it, and shut the door

```bash
curl -fsS -X POST "https://<worker>/admin/import/finish"   -H "x-import-token: $CHIVAGO_IMPORT_TOKEN"
wrangler secret delete CHIVAGO_IMPORT_TOKEN
```

Finishing is explicit, by you, once Step 5's counts match - it is not inferred,
because an import that stopped halfway must stay open so the rest can be sent.
Once it is closed and the database has users in it, a further import is refused
exactly as it would be against the live pilot.

Deleting the secret is what removes the route.

### What a batch can and cannot do

Worth knowing before pointing this at anything real: a batch names a table and
carries VALUES, never SQL. Table and column names are checked against the live
schema before they reach a statement and every value is bound, so a batch
cannot create, alter or drop anything, and cannot reach a table that does not
exist. `sqlite3 .dump` and replaying statements would have been easier to write
and would have put arbitrary DDL on a wire into a live database behind one
secret.

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
