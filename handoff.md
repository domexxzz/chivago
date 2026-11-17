# Handoff — ChivaGo

Written 15 Nov 2026, evening · for the next session (another Claude)
Earlier versions are in git history: `git show c690a34:handoff.md` (15 Nov, morning) and `git show 25d43d8:handoff.md` (6 Nov)

---

## 1. Context

- **ChivaGo** — a travel app pitched at the **Spark Hack PTT Season 2** finals on **21–22 Nov 2026**. Six days away. Pilot area: Koh Sichang. Team: GFD Venture.
- pnpm monorepo: `apps/mobile` (Expo / React Native Web), `apps/api` (Hono on a Cloudflare Worker + Durable Object + SQLite), `packages/core`, `packages/sdk-*`
- Live: **https://chivargo.com** (+ `www.` and `chivago.dometeenlek.workers.dev`)
- GitHub: `domexxzz/chivago` — **public** since 14 Nov (so Actions run free)
- Cloudflare account `dometeenlek@gmail.com` · `416e3cec13d835ff3b36d0d904dec8fc` · **Workers free plan, chosen deliberately**

---

## 2. Rules from the owner that still apply

1. **Billing / payments / card changes are the owner's job** — never do them yourself
2. **Never print token or key values** in chat, logs or files. Move them with a pipe, from a file into `wrangler secret put`, and log only lengths
3. **Never test leaked keys against production.** If you find one, recommend rotation. This came up for real today — see §5
4. Push / PR / merge / deploy have all been done with the owner's agreement this week — if unsure, ask
5. This machine runs out of memory easily. Build the web export with `--max-workers 2`, and do not run the mobile test suite beside a typecheck

---

## 3. Repo state

```
branch: main @ 9f212ff   (working tree clean)
live:   version bfe230e2-9414-4855-bcf8-d36aed06a3b3
CI:     green on main (checks / test / typecheck / workers)
```

### Merged and deployed the night of 15 November

| PR | What |
| --- | --- |
| #231 | `GET /admin/export` — the backup half, and the first copy of the pilot since 12 Nov |
| #232 | the backup check answers 0 when it is sound (it was aborting with 127) |
| #233 | Solution Connect on Local Picks, with Sentiara AI |
| #234 | the picks moved into the left column — the gap beside Solution Connect |
| #235 | Sentiara's link is `sentiaratech.com` |
| #236 | **Fanta**: the seven Home doors are drawings now |
| #237 | Koniix Garden Cottage as a stay pick, under Accommodation |
| #238 | every door carries its own drawing, tested |
| #239 | Koniix on the Koh Sichang map — the island's seventh place |
| #240 | `/internal/*` answers for itself, instead of the traveller gate answering for it |

Three deploys: `461b8762`, `fb19aae7`, then `378ee8a7` → `bfe230e2`.

### Merged and deployed earlier (15 Nov, afternoon)

| PR | What |
| --- | --- |
| #214 | `POST /internal/open-area` — the only way content reaches the Durable Object |
| #230 | docs/72 says what the screen says: 800 EXP, SG codes, and the offer nobody can reach |

**The deploy carried 87 commits forward.** The live Worker had been running 13 Nov code; it now runs main, which includes the 3D Chivar Bot, ChangChang, Fanta's gacha/backpack and place stories. Checked after deploying: every static path 200 with the right cache headers, `/wallet` 401, `/console/apply` 200, the bundle free of `localhost:8787`, and the Durable Object alarm firing every 30 s.

### Koh Sichang is open

`POST /internal/open-area` was run against production for the first time. Measured afterwards through `GET /quests?area=koh-sichang`:

```
SG-01 นักสำรวจเกาะสีชัง      150 EXP
SG-02 ตามล่ารสชาติสีชัง      150 EXP
SG-03 ฮีโร่พิทักษ์เกาะ        200 EXP
SG-04 ตามล่าของดีสีชัง       150 EXP
SG-05 เที่ยวเกาะอย่างใส่ใจ    150 EXP        5 quests · 800 EXP · 0 Green
```

The two superseded quests are **kept, not deleted** — both had been started, and `q-sc-beach` carries the certificate the speaker opens on stage. Their codes moved to `X-SC-01` / `X-SC-02` and `GET /quests` filters retired codes, so the screen shows five.

Running it again is safe: the second run reported `questsAdded: 0`.

---

## 4. ✅ The live database can be backed up (done, 15 Nov evening)

This was the open item at the top of this page. It is closed: PR #231 is merged and deployed, the secret is set, and **a copy of the pilot was taken from production and checked**.

```
C:\Users\DomeCB\chivago-migration-backup\
  2026-11-15-live\        ← 6,826 rows · 36 tables · taken from chivargo.com, --check exit 0
  final-fly.db  snapshot.db  fly.toml.bak  rollback-to-fly.md
  handoff-2026-11-12.md   ← the migration's own notes, not in git
```

A Durable Object's SQLite is reachable only from inside the object, so the rows come out over HTTP the way they went in: `GET /admin/export` (the manifest — every table, its row count now, parents-first) and `GET /admin/export/batch?table=…&rows=…&after=…`, whose body **is** an `ImportBatch`, so a restore is the loop already in docs/71 step 3c.

To take another one:

```bash
cd apps/api
CHIVAGO_EXPORT_TOKEN=... node --experimental-strip-types src/snapshot-live.ts \
  --api https://chivargo.com --out "C:/Users/DomeCB/chivago-migration-backup/<date>-live"
# and later, against the live counts:
... src/snapshot-live.ts --api https://chivargo.com --check "<that directory>"
```

The token is in `apps/api/.env` (gitignored) and on Cloudflare as `CHIVAGO_EXPORT_TOKEN`. **Unset the secret and the route answers 404**, identical to a path that does not exist — that is how it closes, with no deploy.

Three things not to undo, all explained in `docs/71` and in the code:

- paging is a **rowid cursor**, not `LIMIT`/`OFFSET` — the sweeps delete rows every 30 s, and an offset taken behind a deletion skips a row silently
- the export **writes nothing**, not even a run record
- it has **its own secret**, not the import token, which is meant to be deleted after a migration

Known hole: a single row over 16 MB cannot be copied, on either half (`STORY_MAX_BYTES` is 25 MB and base64 adds a third). The snapshot names the table and exits non-zero rather than writing a file that pretends to be complete. Nothing hit it tonight — `stories` was empty.

---

## 5. Secrets

```
vars     CHIVAGO_ORIGINS · CHIVAGO_OPENING_TRIP · CHIVAGO_OPENING_GREEN
         CHIVAGO_REGISTRATIONS_PER_HOUR · CHIVAGO_STORIES_AUTO_APPROVE
         CHIVAGO_PUBLIC_URL
secrets  CHIVAGO_HOST_SECRET · CHIVAGO_LINE_CHANNEL_ID · CHIVAGO_LINE_CHANNEL_SECRET
```

**`CHIVAGO_HOST_SECRET` was rotated today.** The previous value was committed to `README.md` in the first commit (`24d4248`, 1 Sep) and has been readable by anybody since the repo went public on 14 Nov. Removing it from the README never removed it from the history. The new value was generated, written to `apps/api/.env` (gitignored — verified) and piped into `wrangler secret put` without being printed.

Anything still holding the old value now gets 403, including callers of `/internal/verify`.

**A new secret needs a redeploy before the running Worker sees it.** Setting it is not enough.

**`wrangler secret list` shows names only.** That is how three secrets went missing unnoticed during the Fly cut: an unset secret looks exactly like a set one.

---

## 6. Deploying (the method that works — do not use the workflow)

```bash
cd apps/mobile
rm -rf dist-live
EXPO_PUBLIC_API_URL=same-origin NODE_OPTIONS=--max-old-space-size=8192 \
  npx expo export --platform web --output-dir dist-live --clear --max-workers 1
node scripts/flatten-assets.mjs dist-live
node scripts/check-export.mjs dist-live          # refuses an empty export
cd ../.. && pnpm --filter @chivago/api exec wrangler deploy
```

**`--max-workers 1`, not 2.** On 17 November two workers ran this machine out of memory on this bundle ("Data cannot be cloned, out of memory"), and the demo build died the same way. Raise it only on a machine that has been measured.

**Never pipe a build through `tail` or `head`.** A pipeline reports the exit status of its LAST command, so `pnpm … | tail -5` succeeds while the build fails. That hid a failed demo export on the 17th: the directory was checked by eye instead. Write the log to a file and read the file.

The five checks are now `scripts/check-export.mjs` — the demo build runs it on itself, and the line above runs it for the live one. Read them anyway, because knowing what each is for is the point:

1. `dist-live/_expo/static/js/web/` exists
2. `index.html` has a `<script>` tag
3. the file count is in the hundreds (174 on the night of the 15th — 166 before Fanta's seven menu drawings and the Sentiara mark)
4. `grep -rl "localhost:8787" dist-live` finds nothing
5. `dist-live/_headers` is there

**Why 1–3:** a plain export was once killed mid-transform (`jest worker … SIGTERM`) and still **exited 0**, leaving a deployable website with no application in it.

**Why 4:** without `EXPO_PUBLIC_API_URL=same-origin` the bundle calls `http://localhost:8787` — the site loads, looks perfect, and sends every request to the visitor's own machine. It fails as a page of empty states, never as an error. `--clear` matters too: Metro's cache keeps the old value and the hashed filename does not change.

**Why 5:** cache rules live in `apps/mobile/public/_headers`, which Workers Assets reads. A `headers` key in `wrangler.jsonc` is silently ignored.

After deploying, check 3D and animation with the chrome-devtools MCP — the built-in browser pane fires no `requestAnimationFrame`.

---

## 7. Open, and what is left

### For the owner, outside this repo
- **The deck and the field guide still say "540 Green".** The screen says 800 EXP. Somebody has to change them before the 21st. docs/72 now carries the correct figures and the answer to *"where do the points come from"*
- **Rotate the host keys** that were in `docs/` before #223 — same reasoning as §5, the repo is public
- **The geofence is ON, and the stage demo needs it off.** Measured on the night of the 15th, all three against a Koh Sichang database: check-in works (20 Trip Points at Tha Lang pier, and refused from Bangkok — "74,089 m away"), a community post works, a story posts and reaches the island feed. None of it works **from a stage**, because the fence is real: `/config` says `fenceOff: false`. `CHIVAGO_FENCE_OFF=1` opens it for the whole deployment and the app then wears a band saying presence is not being checked, with `fence_enforced` recorded per row so the evidence layer does not count those arrivals. Turn it on for the 21st–22nd and **off again afterwards** — left on, every real traveller's check-in after the event is unguarded
- **Stories are open in the live database** (`settings.stories_open = '1'`, auto-approve on). Measured on the 15th: both `/areas/samui/stories` and `/areas/koh-sichang/stories` return `open: true`. Anyone who taps "Continue as a guest" can post to any place and it goes public immediately. The owner chose to leave it open; the console hides a story in one click and clips expire in seven days

### Decided today, do not reopen without reading why
- **Quests do not pay Green.** `seed.ts` says the five SG quests come from the 12 Nov field-trial pack and pay EXP only — paying Green would create a payment the pack never promised
- **An offer cannot be priced in EXP.** `progression.ts`: EXP is lifetime, monotonic, never spent, granted alongside the spendable currencies. `Offer.currency` is `'trip' | 'green'`
- So the island's 200 Green sample offer **cannot be reached by island work**, and the answer is not to demo redemption from it. It is already labelled "ตัวอย่าง · ร้านยังไม่ได้ร่วมโครงการ" with a null `valueTHB`

### Small and clearly right
- ~~**`.dev.vars` is not in `.gitignore`.**~~ Done in #231, with `backups/` and `snapshot-*/` beside it
- ~~**`/internal/*` sits behind the traveller device middleware.**~~ Done in #240. It was measured again that night: with the right operator secret, `POST /internal/open-area` answered 401 and the pin could not be planted. `/internal/` is now on the no-traveller list, so the route refuses with its own 403 instead of the gate refusing on its behalf. **The two accounts are still there** — "Operator probe" and "Operator", and nothing deletes them. Nobody needs to make a third one now
- **A place cannot be deleted.** Noticed while putting Koniix on the map: `seedArea` inserts, nothing removes. A place planted by mistake stays until somebody writes a route or restores a backup — and there is a backup now, which is the only reason this is a note rather than a warning
- Every alarm — every 30 s — logs `[chivago] migrated:` and 27 table names. Nothing is re-migrated; they are `CREATE TABLE IF NOT EXISTS` blocks pushing their name unconditionally. It is also the only place a real migration would announce itself

### Older open PRs
#194 (proof photographs reach the server as files — sounds like a live bug) · #174 · #151 · #99 · #98 · #97

---

## 8. Where to look

| Topic | File |
| --- | --- |
| Opening an area on a live DB | `apps/api/src/area-opening.ts` · tests in `area-opening.test.ts`, `open-area-routes.test.ts` |
| Quest content, active vs historical | `packages/core/src/seed.ts` — `ACTIVE_QUESTS` is the published five, `SEED_QUESTS` is the catalogue, `RETIRED_CODE_PREFIX` is `X-` |
| Why EXP is never spent | `packages/core/src/progression.ts` |
| What the Worker serves vs the API | `apps/api/src/served-from-export.ts` · `worker-assets.test.ts` walks `public/` |
| Judge Q&A, with today's measurements | `docs/72-judge-qa-th.md` |
| The Fly → Cloudflare move | `docs/71-moving-the-data-to-cloudflare.md` · `docs/74-the-move-to-workers.md` |
| 3D Chivar Bot / ChangChang | `apps/mobile/src/components/chivarbot3d/` · `greeter3d/` |
| Mobile error messages | `apps/mobile/src/i18n/api-errors.ts` — every new backend code needs an entry or `test:scripts` fails |
| DB schema | `apps/api/src/db.ts` + `migrations.ts` — **schema change = bump `SCHEMA_VERSION` + update `PINNED` in `db-schema-version.test.ts`** |

### Before every PR
```bash
pnpm --filter @chivago/mobile exec tsc --noEmit -p .
pnpm --filter @chivago/api exec tsc --noEmit -p .
pnpm --filter @chivago/api test
pnpm test:scripts
```

CI's `typescript` job hung for over a day once. Local runs were the real signal for most of this week's merges. The full suite run all at once sometimes fails 4–6 mobile files under memory pressure; they pass alone — check before believing a failure.
