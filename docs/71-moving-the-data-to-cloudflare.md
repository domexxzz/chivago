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

**Reading the data back out is the section after this one.** Step 3 gets rows
IN, which is a migration and happens once; getting them OUT is a backup and
happens every week. They share the batch format on purpose.

### 3a. Make the batches (**owner**, on the snapshot)

```bash
cd apps/api
node --experimental-strip-types src/export-for-import.ts --db ../../snapshot.db --out ../../batches
```

Called directly rather than through `pnpm run export:import --`: pnpm passes
the `--` through to the script, `parseArgs` sees it as a positional argument
and refuses the whole command.

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

## The other half of step 3 — getting the data back OUT

**Not part of the migration sequence.** This is the counterpart to the import
and the thing you will use far more often: taking a backup of a database that
is already living inside a Durable Object.

**Unlike the rest of this document, this half has been run.** Measured on
15 November against a local deployment of the Worker's own routes: a seeded
database of 64 rows across five tables snapshotted over HTTP, checked, and
then replayed with the loop in step 3c into a second, empty deployment —
`inserted: 64`, no translation step anywhere. The tests run under both drivers,
the Durable Object adapter included. What has **not** been done is running it
against production, which needs the secret and a deploy and is the owner's
call.

### Why it needed writing at all

The sentence at the top of step 3 reads worse in the other direction. A Durable
Object's SQLite is not a file you can upload — and it is not a file you can
**download** either. There is no `wrangler do export`, nothing to `sftp get`,
and `export-for-import.ts` reads a local file, which the live database is not.

So from the cutover on 12 November until this was written, the pilot's only
copy of its data was the live object. The only backups in existence are the
ones pulled off the Fly volume that day:

```
C:\Users\DomeCB\chivago-migration-backup\   final-fly.db  snapshot.db
```

Everything after 12 November — every registration, every check-in, every
ledger row, and the five Koh Sichang quests opened on the 15th — existed in
exactly one place.

### What the export is

`GET /admin/export` and `GET /admin/export/batch`, built as the mirror of the
import rather than as a new idea:

| | |
|---|---|
| `GET /admin/export` | the manifest: every table, its row count **now**, in parents-first order, and the schema version |
| `GET /admin/export/batch?table=T&rows=N&after=R` | one page of one table, **as an `ImportBatch`** |

A page is byte-for-byte what `POST /admin/import` accepts — same table, same
columns, same values, same base64 for a BLOB — so a snapshot replays with the
loop in step 3c and there is no format in the middle to get wrong. That is
also why a page comes back **bare** rather than inside the `{ ok, data }`
envelope the rest of the API uses: the file on your laptop has to *be* the
batch.

Paging is by **rowid cursor**, not `LIMIT`/`OFFSET`, and that is the one place
this differs from `export-for-import.ts`. The CLI reads a snapshot file nothing
can write; this reads the pilot while it is serving, and the alarm runs six
sweeps every thirty seconds, expiring stories, sessions and link codes. A row
deleted *behind* an offset shifts every later offset down by one and the next
page silently skips a row — a backup that restores, passes every constraint,
and is missing somebody. The cursor cannot skip; `export-service.test.ts`
proves both halves of that claim, including that offset paging really does drop
a row.

**It reads.** Nothing on the path writes a row, a counter or a run record. The
import keeps `import_runs` because an interrupted import must be continuable;
an interrupted export costs a retry, so it earns no state.

### Arming it (**owner**)

```bash
wrangler secret put CHIVAGO_EXPORT_TOKEN      # something long and random; 32 characters minimum
pnpm --filter @chivago/api exec wrangler deploy
```

**Its own secret, not `CHIVAGO_IMPORT_TOKEN`.** Step 3d tells you to delete the
import token when the migration ends, because deleting it is what removes the
write route. A backup is not a migration — it happens again next week — and
sharing the secret would mean arming the write door every time somebody wanted
a copy.

Two things that have caught people here before: **a new secret needs a redeploy
before the running Worker sees it**, and `wrangler secret list` shows names
only, so an unset secret looks exactly like a set one. Without the secret the
route answers **404**, identical to a path that does not exist.

### Taking a snapshot (from a laptop)

```bash
cd apps/api
CHIVAGO_EXPORT_TOKEN=... node --experimental-strip-types src/snapshot-live.ts \
  --api https://chivargo.com --out "C:/Users/DomeCB/chivago-backups/2026-11-15"
```

Called directly rather than through `pnpm run`, for the same reason as step 3a:
pnpm passes `--` through and `parseArgs` refuses the command.

The token comes **from the environment, never from an argument** — `ps` shows
another user's command line and a shell keeps its history. Nothing prints it;
the run logs its length.

`--out` must be **outside this repository** and the script refuses otherwise
(`--force` overrides it). What it writes is 339 people, their wallets and a
ledger.

It writes numbered batch files in send order plus `manifest.json`, the same
layout step 3a produces — so a restore is step 3c unchanged:

```
0001-users.json  0002-wallets.json  …  manifest.json
```

`manifest.json` also records the live row counts **before** the read and
**after** it, which is what makes the snapshot checkable later.

The page size adapts: on a 413 it halves and retries the same cursor, because a
row of `wallets` is tens of bytes and a row of `stories` carries video. `--rows`
sets the starting size (500).

### Checking it — with numbers, against the live system

```bash
CHIVAGO_EXPORT_TOKEN=... node --experimental-strip-types src/snapshot-live.ts \
  --api https://chivargo.com --check "C:/Users/DomeCB/chivago-backups/2026-11-15"
```

It parses every batch file (a truncated download agrees with itself), counts
the rows it really holds, re-asks the live system for its counts, and prints a
line per table:

```
  table                          in snapshot   when taken   live now
  users                                  339          339        341
  stories                                 13        15→12         11
```

Exit status 0 means every table is consistent; 1 means it is not, and names
which. The rule is a **bracket, not a subtraction**, and it is worth
understanding before trusting the answer: the database does not hold still
while it is read, so a count that differs from the live one is the ordinary
case. What is a failure is a file holding fewer rows than the live system had
*both* before and after the read — that means rows were skipped. More than it
ever had means a page was read twice. Anything between the two is a database
that moved while it was copied, which is what a snapshot is.
`snapshot-check.ts` holds that rule and `snapshot-check.test.ts` holds the
cases.

**"live now" drifting is expected** and never decides the verdict: the pilot
gains users by the hour and expires stories after seven days.

### Two things to know before relying on it

- **A single row over 16 MB cannot be copied.** That is the batch ceiling on
  both halves, and `STORY_MAX_BYTES` is 25 MB with base64 adding a third on top
  — so one long clip can exceed it. Such a row could never have been imported
  either; this is a known hole, not a regression. The script says which table
  and exits non-zero rather than writing a file that pretends to be complete.
- **A snapshot costs one row read per row, against the free plan's daily
  budget.** On 12 November schema re-checking exhausted five million rows in a
  day and took the pilot down. A snapshot of this database is tens of thousands
  of rows, which is nothing — but do not put it in a loop.

### Shutting the door again

```bash
wrangler secret delete CHIVAGO_EXPORT_TOKEN
```

Which is what removes the route, with no deploy. Whether to leave it armed
between backups is the owner's call: armed, the length of the secret is the
only thing standing between a guesser and every row, because there is no
throttle on the route — exactly as on the import.

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
