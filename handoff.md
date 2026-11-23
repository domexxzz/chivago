# Handoff — ChivaGo

Written 23 Nov 2026 · for the next session (another Claude)
Earlier versions are in git history: `git show 502354f:handoff.md` (17 Nov) · `git show c690a34:handoff.md` (15 Nov)

---

## 0. Do this first

**The geofence is still OFF on production, and the event it was opened for is over.**

```
live now:  GET https://chivargo.com/config → {"fenceOff": true, …}
```

It was opened on 22 Nov for the Spark Hack semi-final, where the testers were in a hall in Bangkok rather than on Ko Sichang. The semi-final has happened. While it stays open:

- anybody can check in at any place from anywhere, and is paid Trip Points for it
- a quest arrival is taken on trust, and its row is written `fence_enforced = 0`
- the ten-minute wait between arriving and submitting quest proof does not run
- a leg between two check-ins pays the walking award at any speed
- the app stops reading the GPS at all for quests, check-ins, adventure stops, the map dot and the navigator
- every screen wears a band saying presence is not being checked

To close it: delete the `CHIVAGO_FENCE_OFF` line from `apps/api/wrangler.jsonc` and deploy (§6). All five behaviours above come back together — they are one switch on purpose, so nobody can half-close it. Anyone with the app open needs one refresh to pick the change up.

**Ask the owner before closing it.** They may want it open for more testing. What must not happen is for it to stay open silently: every real traveller's check-in made in the meantime is unguarded, and the evidence layer records those arrivals as unfenced, which is the honest outcome but not the one the product is for.

---

## 1. Context

- **ChivaGo** — a travel app built for **Spark Hack PTT Season 2**. The **semi-final was 22 Nov 2026** (pitch 5 min + Q&A 5 min; the deck went in before 06:00). The **final is 16 Jan 2027** — judged on Workable Prototype 50%, Change Validation 20%, Execution Readiness 30%. Pilot area: Koh Sichang. Team: GFD Venture.
- pnpm monorepo: `apps/mobile` (Expo / React Native Web), `apps/api` (Hono on a Cloudflare Worker + Durable Object + SQLite + R2), `packages/core`, `packages/sdk-*`
- Live: **https://chivargo.com** (+ `www.` and `chivago.dometeenlek.workers.dev`)
- GitHub: `domexxzz/chivago` — public
- Cloudflare account `dometeenlek@gmail.com` · `416e3cec13d835ff3b36d0d904dec8fc` · **Workers paid, $5/month** since 13 Nov

---

## 2. Rules from the owner that still apply

1. **Billing / payments / card changes are the owner's job** — never do them yourself
2. **Never print token or key values** in chat, logs or files. Move them with a pipe, from a file into `wrangler secret put`, and log only lengths
3. **Never test leaked keys against production.** If you find one, recommend rotation
4. **This machine runs out of memory easily.** Never run two typechecks or the mobile suite in parallel. The mobile suite needs `--test-concurrency=2`; `pnpm typecheck` at the root dies ("Zone Allocation failed")
5. **The owner ships.** On 22 Nov the instruction was *"ไม่ต้องเทสละเอียดขนาดนั้นต้องรีบใช้"* — do not hold a fix behind a long verification when the app is being used right now. Run the suite that covers what you changed, check it on the local Worker, ship, then keep auditing in the background and report what turns up. That preference was for an event day; for ordinary work, ask

---

## 3. Repo state

```
branch: feat/clips-and-png-on-workers @ 49d9091   (merged into main as #307 — SWITCH TO main)
main:   95cc05d
live:   version 3cb5fc98-7ea7-4369-bd9d-8a7ee1684ae8   (deployed 22 Nov 02:41 UTC, from main)
```

Two things in the working tree that are **not** part of any PR:

- **`.claude/launch.json` is modified** — a temporary `worker-dev` entry that runs `wrangler dev` on port 8798 against a scratch `--persist-to` directory. It was how everything below was tested. Keep it if you are still testing stories; `git checkout -- .claude/launch.json` when you are done. Do not commit it: it points at a path in this machine's Temp
- **`artifacts/pitch/` and `artifacts/forecast/` are untracked** (71 MB and 1.4 MB). The pitch deck exports, including `ChivarGo-Sichang-motion.pptx`. Deliberately not committed

### Shipped on 22 Nov, in order

| PR | What | Deploy |
| --- | --- | --- |
| #303 | the fence switch reaches the whole app: no GPS read for quests, check-ins, adventure stops, the map or the navigator; routes accept a request with no position **only** while it is open | `0bfa9f8b` |
| #304 | the two clock rules open with it: no ten-minute dwell before quest proof, no walking-pace cap on a leg | `64a95a37` |
| #305 | JPEG photo stories post on Workers (`jpeg-clean.ts`) — the first attempt at the bug below | `5416a0a7` |
| #306 | **the actual cause**: `submitStory` called `mkdirSync` for a folder nothing writes to, and a Worker may not create directories (EPERM). Every story had been failing there since the move to Cloudflare | `c05f22fd` |
| #307 | clips (MP4/MOV) and PNG photos post too; story bytes go to R2; `Range` support on the media route | `3cb5fc98` |

#305 alone did **not** fix posting. It looked right and the tests passed; the real failure only showed up when a story was posted to a local `wrangler dev`. That is the lesson from the day: **for anything that runs on Workers, test it on workerd, not on Node.**

---

## 4. Stories on Workers — what now works, and what does not

The live site has no ffmpeg (`CHIVAGO_TRANSCODE_URL` has never been set, and a Worker cannot spawn a process). Until 22 Nov that meant every story failed. Now the file is published **without being decoded**, after everything but the picture and the sound is removed:

| | File | What it does |
| --- | --- | --- |
| JPEG | `apps/api/src/jpeg-clean.ts` | copies the picture, drops every metadata segment, keeps orientation as a one-tag EXIF block, walks **every** scan (a progressive JPEG can carry metadata between scans) |
| PNG | `apps/api/src/png-clean.ts` | allow-list of chunks; drops text, eXIf, tIME, unknown chunks and everything after IEND |
| MP4/MOV | `apps/api/src/mp4-clean.ts` | **in place.** A box that must go is renamed `free` and zeroed, so no sample offset moves. Deny by default at the top level and inside `moov`/`trak`/`mdia`; tracks that are not video or sound are dropped **and their samples zeroed in `mdat`**; creation times zeroed. Refuses a file it cannot be sure about |
| cover | `apps/api/src/story-poster.ts` | a drawn 360×640 card with a play mark — cutting a real frame needs a decoder |

Storage: on Workers the bytes go to **R2** (`chivago-uploads`) and the row keeps the key in `stories.media_path` / `poster_path`; `media_blob` stays NULL. A Durable Object row holds 2 MB and a clip is up to 25. Off Workers (plain Node, ffmpeg present) nothing changed — bytes stay in the row. `GET /stories/:id/media` answers `Range` (206/416) and streams from R2; iOS will not play a clip from a server that ignores `Range`. Expiry queues the objects on `media_deletions`, which `drainMediaDeletions` empties from the alarm.

### Limits, in the order they will bite

1. **HEVC is passed through, and this is untested.** An iPhone set to "High Efficiency" records HEVC in a `.mov`. ffmpeg used to convert it to H.264; nothing does now. Safari plays it, **Chrome on Android and most desktop browsers do not**. Every clip tested on 22 Nov was H.264. If someone reports a clip that posts but shows a black box, this is the first thing to check — and the fix is either the encoder container (§5) or refusing HEVC at upload with a message telling them to switch the camera to "Most Compatible"
2. **Nothing is trimmed or scaled.** `STORY_MAX_SECONDS = 10` and `STORY_WIDTH = 720` are only honoured on the ffmpeg path. A clip is published at the length and size it arrived. The only ceiling is `STORY_MAX_BYTES = 25 MB`, so a 4K clip is refused after about five seconds of footage, and a 1080p one gets 10–20 s
3. **The cover is not the clip.** Every clip on the board and the pin wears the same drawn card
4. **Still refused by name:** WebM clips, and HEIC / WebP / AVIF photos. An iPhone set to "High Efficiency" also writes HEIC stills — the refusal says to switch to "Most Compatible"
5. **Nobody has posted from a real phone on production yet.** Everything below was proved on a local workerd. Ask the owner to post one photo and one clip, or do it yourself if they give you a device

### What was proved, and how

- `apps/api` suite **2321/2321**, api + worker typecheck clean
- `media-clean.test.ts` (new, 16 tests), `jpeg-clean.test.ts`, the object-store block in `story-service.test.ts`
- Real files built with ffmpeg and Pillow — Android-style MP4, faststart MP4, iPhone-style MOV with Apple `keys` metadata, a subtitle track and a timecode track, a 21 MB clip, JPEGs with GPS + make + orientation, PNGs with tEXt/iTXt/eXIf. After cleaning: ffmpeg decodes every one with no error and the same frame counts, and none of the tags or track payloads is left anywhere in the bytes
- On a local workerd: a 3 MB JPEG, a 4 MB PNG and all three clips post and read back byte-identical; `Range` gives 206 with the right `Content-Range` and 416 past the end; a browser `<video>` plays all three; the app's own story viewer plays a 1920×1080 clip
- **The test fixtures were in `%TEMP%` and are probably gone.** Rebuilding them is a few ffmpeg and Pillow commands — see the PR body of #307

---

## 5. Unfinished

### The independent review never finished

A five-lens review of the cleaners (clip privacy, image privacy, hostile input, storage and routes, Workers runtime), each finding then reproduced and challenged, was started on 22 Nov and was still running when the session ended. **No finder completed, so there are no findings — not even partial ones.** The cleaners are covered by their own tests and by the real-file checks above, but they have **not** been audited by anyone other than the author.

```
Workflow({ scriptPath: "C:\\Users\\DomeCB\\.claude\\projects\\E--D-drive-rescue-Chivago\\272afc8c-acf8-467f-b8c6-767ccb62dbe0\\workflows\\scripts\\review-story-media-on-workers-wf_f5f8c7e0-fc7.js" })
```

Run it fresh rather than resuming — nothing is cached. It needs a local Worker on port 8798 (the `worker-dev` launch entry) and it writes only to a scratch directory. Worth doing: these three parsers read a file from anybody and run inside the Worker that serves the whole island.

### Worth deciding with the owner

- **The encoder container.** `Dockerfile.transcode` + `transcode-service.ts` already exist: the same ffmpeg behind two HTTP routes. Deploy it anywhere that runs Node, set `CHIVAGO_TRANSCODE_URL` and `CHIVAGO_TRANSCODE_TOKEN`, and clips go back to being trimmed to 10 s, scaled to 720, converted to H.264 and given a real poster frame — HEVC, WebM and HEIC all start working, and limits 1–4 above disappear. The Air4Thai cross-check needs the same container for an unrelated reason (workerd cannot be given a certificate chain). This is the single highest-value piece of infrastructure left
- **Stories are open and auto-approved on the live database.** Anyone who taps "Continue as a guest" can put a photo or clip on a public screen with nobody reviewing it first. Three posts per device per 24 h, every clip expires in 7 days, and the console hides one in a click. The owner chose this deliberately; it is worth re-asking now the event is over

### Older open PRs

#238 · **#194** (proof photographs reach the server as files — still sounds like a live bug) · #174 · #151 · #99 · #98 · #97

---

## 6. Deploying (the method that works — do not use the workflow)

The API-only changes above needed **no web export**: `wrangler deploy` from `apps/api` was enough, because nothing in `apps/mobile` changed. Check before building — the export is the slow, memory-hungry half.

```bash
# only when apps/mobile or packages/* changed:
cd apps/mobile
rm -rf dist-live
EXPO_PUBLIC_API_URL=same-origin NODE_OPTIONS=--max-old-space-size=8192 \
  npx expo export --platform web --output-dir dist-live --clear --max-workers 1
node scripts/flatten-assets.mjs dist-live
node scripts/check-export.mjs dist-live          # refuses an empty export

# always:
cd apps/api && npx wrangler deploy > /tmp/deploy.log 2>&1; echo "EXIT $?" >> /tmp/deploy.log
grep -E "Current Version ID|custom domain|EXIT" /tmp/deploy.log
```

**Never pipe a build or a deploy through `tail` or `head`** — a pipeline reports the exit status of its last command, and a failed deploy has twice been read as a success that way. Write the log to a file, append the real `$?`, read the file.

`--max-workers 1`, not 2: two workers ran this machine out of memory on this bundle on 17 Nov.

**Read the newest `wrangler deployments list` entry before shipping.** A deploy carries every merged commit forward, not just yours.

After deploying, check: `/config` answers, `/places` answers 401 (that is healthy — it means the router and the Durable Object are alive), and the bundle holds no `localhost:8787`. For 3D and animation use the chrome-devtools MCP — the built-in browser pane fires no `requestAnimationFrame`.

---

## 7. Where to look

| Topic | File |
| --- | --- |
| The fence switch, and everything it governs | `apps/api/src/fence.ts` (read the header first) · `apps/mobile/src/state/server-config.ts` (`locationOff`) |
| Story media cleaning | `apps/api/src/jpeg-clean.ts` · `png-clean.ts` · `mp4-clean.ts` · `story-poster.ts` · tests in `media-clean.test.ts`, `jpeg-clean.test.ts` |
| Which transcoder runs where | `apps/api/src/transcode.ts` — `transcoderFromEnv()`, `onWorkers()`, `workersTranscoder` |
| Story storage and permission | `apps/api/src/story-service.ts` — `submitStory`, `locateStoryMedia` (one permission rule, three readers), `expireStories` |
| Ranged reads from R2 | `apps/api/src/blob-store.ts` — `parseRange`, `resolveRange`, `openBlob` |
| Quest and check-in rules | `apps/api/src/quest-service.ts` · `checkin-service.ts` · `packages/core/src/low-carbon.ts` |
| Mobile error messages | `apps/mobile/src/i18n/api-errors.ts` — every new backend code needs an entry or `test:scripts` fails |
| DB schema | `apps/api/src/db.ts` + `migrations.ts` — **schema change = bump `SCHEMA_VERSION` + update `PINNED` in `db-schema-version.test.ts`** |

### Before every PR

```bash
pnpm --filter @chivago/api typecheck
pnpm --filter @chivago/api typecheck:worker
pnpm --filter @chivago/mobile typecheck
cd apps/api && node --test --test-concurrency=2 --experimental-strip-types "src/*.test.ts" "src/console/*.test.ts"
cd apps/mobile && node --test --test-force-exit --experimental-strip-types --test-concurrency=2 --import ./test/register.mjs "test/*.test.ts"
```

One at a time. Running them together is what exhausts this machine's memory, and a memory failure reads exactly like a test failure.
