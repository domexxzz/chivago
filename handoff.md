# Handoff — ChivaGo

Written 26 Nov 2026 · for the next session (another Claude)
Earlier versions are in git history: `git show a62c071:handoff.md` (23 Nov) · `git show 502354f:handoff.md` (17 Nov) · `git show c690a34:handoff.md` (15 Nov)

---

## 0. Do this first

### `main` is one pull request ahead of production

```
live:  7eb60a55-c354-4f0c-b188-621f4921d1f2   deployed 26 Nov 13:06 UTC
main:  49e5672                                merged   26 Nov 13:14 UTC  (#320)
```

#320 landed eight minutes after the last deploy, so ten commits are on `main` and not on the site: the RMUTT building directory and its map pins, the library-seat and queue counts, the ferry and marine model taken off a campus, and **`7c02477 fix(api): the schema digest is the same on every checkout`** — which is the one that matters, because a digest that differs per checkout is the kind of thing that fails in CI and nowhere else.

Find out whether that was deliberate before deploying. Eight minutes looks like someone merged and stopped for the night, not like a decision — but a deploy carries every merged commit forward, and the campus work is new and visible.

### Nobody can take a live story down

PR **#317** is open and unmerged. Production has `CHIVAGO_STORIES_AUTO_APPROVE=1`, so a story is public the moment it is posted and never waits for a host. `/console/stories` lists only `pending` rows — of which there are none — so the console shows an empty page while clips are live on the board. `POST /console/stories/:id/hide` has always worked; there was no button wired to it. The clip still expires by itself after seven days, which is the only thing standing in for moderation right now.

---

## 1. Context

- **ChivaGo** — a travel app built for **Spark Hack PTT Season 2**. The semi-final was 22 Nov 2026. The **final is 16 Jan 2027** — judged on Workable Prototype 50%, Change Validation 20%, Execution Readiness 30%.
- **Two pilot areas now.** Koh Sichang (the island, the one the pitch is about) and **RMUTT Thanyaburi** (a university campus, built out 24–26 Nov). They are not the same product: see §5.
- pnpm monorepo: `apps/mobile` (Expo / React Native Web), `apps/api` (Hono on a Cloudflare Worker + Durable Object + SQLite + R2), `packages/core`, `packages/sdk-*`
- Live: **https://chivargo.com** (+ `www.` and `chivago.dometeenlek.workers.dev`), with a Thai promo page at **`/th/`**
- GitHub: `domexxzz/chivago` — public
- Cloudflare account `dometeenlek@gmail.com` · `416e3cec13d835ff3b36d0d904dec8fc` · **Workers paid, $5/month**

---

## 2. Rules from the owner that still apply

1. **Billing / payments / card changes are the owner's job** — never do them yourself
2. **Never print token or key values** in chat, logs or files. Move them with a pipe, from a file into `wrangler secret put`, and log only lengths
3. **Never test leaked keys against production.** If you find one, recommend rotation
4. **This machine runs out of memory easily.** Never run two typechecks or the mobile suite in parallel. The mobile suite needs `--test-concurrency=2`; `pnpm typecheck` at the root dies ("Zone Allocation failed")
5. **The owner ships.** On 22 Nov, mid-event: *"ไม่ต้องเทสละเอียดขนาดนั้นต้องรีบใช้"* — do not hold a fix behind a long verification while the app is being used. Run the suite that covers what you changed, check it on a local Worker, ship, then keep auditing and report what turns up. That was an event-day instruction; for ordinary work, ask

---

## 3. Repo state

```
branch: main @ 49e5672   (clean, apart from the two untracked artifact folders)
live:   7eb60a55         — see §0, it is one PR behind
```

`artifacts/pitch/` and `artifacts/forecast/` are untracked on purpose: 72 MB of deck exports and forecast charts, including `ChivarGo-Sichang-motion.pptx`. Leave them out of git.

### What landed since the last handoff (23 → 26 Nov)

| PR | What | Why it was there |
| --- | --- | --- |
| #308 | **the fence closes again** — `CHIVAGO_FENCE_OFF` is gone from `wrangler.jsonc` and `/config` says `fenceOff: false` | §0 of the 23 Nov handoff |
| #309 | **an HEVC clip is refused, not published as a black box** | the first limit named in that handoff |
| #310 | the three-a-day story ceiling holds against a burst | |
| #311 | a ceiling on new device keys — `CHIVAGO_REGISTRATIONS_PER_HOUR` is **60**, not 0 | was unlimited |
| #312 | the sea is cached at the edge, the stories are not (`edge-cache.ts`) | |
| #313 | the console session cookie is HTTPS-only (`CHIVAGO_SECURE_COOKIES=1`) | |
| #314 | maplibre-gl 6.19.0 on Expo SDK 54 — clears the DOM.sanitize advisory | |
| #315 #316 | the Thai promo page at `/th/`, and a responsive redesign of the promo site | |
| #318 #319 #320 | **RMUTT phase one** — see §5 | |

Both things the last handoff asked for were done by someone else within a day. The pattern works: put the one thing that must happen at the top, and say what it costs to leave it.

---

## 4. Stories — where this stands now

Posting works on production. There is still **no ffmpeg**: `CHIVAGO_TRANSCODE_URL` has never been set, so a file is published without being decoded, after everything but the picture and the sound is removed (`jpeg-clean.ts`, `png-clean.ts`, `mp4-clean.ts`; a drawn cover from `story-poster.ts`). Bytes go to R2 and the row keeps the key; `GET /stories/:id/media` answers `Range`.

Since #309, `cleanMp4` also **reads the video codec** out of the sample description — `avc1` is H.264, `hvc1` / `hev1` is HEVC — four bytes deep, still without decoding anything. HEVC is refused at upload with a message telling the person to set the camera to "Most Compatible". A codec it cannot read is **not** refused: unknown is passed through exactly as before, because refusing everything unnamed would refuse working clips.

What is still true:

1. **Nothing is trimmed or scaled.** `STORY_MAX_SECONDS = 10` and `STORY_WIDTH = 720` are honoured only on the ffmpeg path. The only ceiling is `STORY_MAX_BYTES = 25 MB`, so a 4K clip is refused after about five seconds of footage
2. **The cover is not the clip** — every clip wears the same drawn card
3. **Still refused by name:** WebM clips, HEIC / WebP / AVIF photos
4. **The encoder container is still the fix for all of it.** `Dockerfile.transcode` and `apps/api/src/transcode-service.ts` already exist — the same ffmpeg behind two HTTP routes. Deploy it anywhere that runs Node, set `CHIVAGO_TRANSCODE_URL` and `CHIVAGO_TRANSCODE_TOKEN`, and 1–3 all disappear. The Air4Thai cross-check needs the same container for an unrelated reason (workerd cannot be given a certificate chain). **This is still the highest-value piece of infrastructure left**

### The review that never ran

A five-lens review of the three cleaners (clip privacy, image privacy, hostile input, storage and routes, Workers runtime) was started on 22 Nov and died with the session. No finder completed; there were never any findings. #309–#312 came from someone reading the handoff, not from that review.

```
Workflow({ scriptPath: "C:\\Users\\DomeCB\\.claude\\projects\\E--D-drive-rescue-Chivago\\272afc8c-acf8-467f-b8c6-767ccb62dbe0\\workflows\\scripts\\review-story-media-on-workers-wf_f5f8c7e0-fc7.js" })
```

Run it fresh — nothing is cached, and the script's `CONTEXT` block needs its "what the change does" section rewritten for today. It needs a local Worker on port 8798. These three parsers read a file from anybody and run inside the Worker that serves both pilot areas; they are covered by their own tests and by real-file checks, and by nobody else's eyes.

---

## 5. RMUTT Thanyaburi — the new area

Built 24–26 Nov across #318, #319 and #320: a building directory read from OpenStreetMap with pins on the map, campus booking and services on the university's own pages, a campus host that writes its own activities, a self-declared faculty and year (counted, never named), queue length and library seats from the people standing in them, and a campus bus link.

**A campus is not an island, and the code now says so** (`a72d092`, `77b11ae`): no sea, no ferry, no marine model, and it is not drawn as an island. If you add anything to an area, check which of the two it belongs to.

**It is blocked on the university.** `docs/80-asking-rmutt-for-data-th.md` is the ask, in Thai, in three parts — the campus minibus (A), the building list and floor plans (B), parking (C) — with a status table, what the data will and will not be used for, and a closing section naming what the document itself has not verified. Nothing more can be claimed about the campus until RMUTT hands something over. Do not fill the gaps with guesses; the whole evidence argument of this product is that a number on screen came from somewhere real.

---

## 6. Open

### Decisions for the owner
- **Stories are open and auto-approved on the live database.** Anyone who taps "Continue as a guest" can put a photo or a clip on a public screen with nobody reviewing it. Three posts per device per 24 h, seven-day expiry, and — once #317 lands — a Hide button. The owner chose this deliberately for the event; it is worth re-asking now
- **The encoder container** (§4) — it needs somewhere to run and a token

### Older open PRs
#317 (see §0) · #238 · **#194** (proof photographs reach the server as files — still reads like a live bug) · #174 · #151 · #99 · #98 · #97

### Stale remote branches
`fix/hevc-clips-are-refused-not-published`, `fix/the-fence-closes-again`, `fix/a-ceiling-on-new-keys`, `fix/the-console-cookie-is-https-only`, `chore/close-the-geofence`, `chore/open-the-geofence` — all squash-merged, so their heads look unmerged to `git branch --contains` and are not. Safe to delete; nothing is parked in them.

---

## 7. Deploying (the method that works — do not use the workflow)

An API-only change needs **no web export**. Check first — the export is the slow, memory-hungry half.

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

**Read the newest `wrangler deployments list` entry before shipping** — a deploy carries every merged commit forward, not just yours. That is exactly the situation in §0.

After deploying: `/config` answers, `/places` answers 401 (healthy — the router and the Durable Object are alive), and the bundle holds no `localhost:8787`. For 3D and animation use the chrome-devtools MCP — the built-in browser pane fires no `requestAnimationFrame`.

---

## 8. Where to look

| Topic | File |
| --- | --- |
| The fence, and everything it governs | `apps/api/src/fence.ts` (read the header first) · `apps/mobile/src/state/server-config.ts` (`locationOff`) |
| Story media cleaning | `apps/api/src/jpeg-clean.ts` · `png-clean.ts` · `mp4-clean.ts` (`videoCodec` for the HEVC check) · `story-poster.ts` · tests in `media-clean.test.ts`, `jpeg-clean.test.ts` |
| Which transcoder runs where | `apps/api/src/transcode.ts` — `transcoderFromEnv()`, `onWorkers()`, `workersTranscoder` |
| Story storage and permission | `apps/api/src/story-service.ts` — `submitStory`, `locateStoryMedia` (one permission rule, three readers), `expireStories` |
| Ranged reads from R2 | `apps/api/src/blob-store.ts` — `parseRange`, `resolveRange`, `openBlob` |
| What is cached at the edge | `apps/api/src/edge-cache.ts` — the sea yes, the stories no |
| The RMUTT campus | `docs/80-asking-rmutt-for-data-th.md` (the ask) · `packages/core/src/campus-buildings.ts` · `campus-services.ts` · `apps/api/src/student-service.ts` · `canteen-service.ts` · `host-quest-service.ts` · `console/quest-desk.ts` |
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
