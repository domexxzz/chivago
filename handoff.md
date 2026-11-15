# Handoff — ChivaGo

Written 15 Nov 2026 · for the next session (another Claude)
The previous version of this file (6 Nov) is in git history: `git show 25d43d8:handoff.md`

---

## 1. Context

- **ChivaGo** — a travel app pitched at the **Spark Hack PTT Season 2** finals on **21–22 Nov 2026**. Pilot area: Koh Sichang. Team: GFD Venture.
- pnpm monorepo: `apps/mobile` (Expo / React Native Web), `apps/api` (Hono on a Cloudflare Worker + Durable Object + SQLite), `packages/core`, `packages/sdk-*`
- Live: **https://chivargo.com** (+ `www.` and `chivago.dometeenlek.workers.dev`)
- GitHub: `domexxzz/chivago` — **now public** (made public 14 Nov so Actions would run; free for public repos)

---

## 2. Rules from the owner that still apply

1. **Billing / payments / card changes are the owner's job** — never do them yourself
2. **Never print token or key values** in chat, logs or files
3. **Never test leaked keys against production** (a safety classifier has already stopped this once — don't try again in any form). If you find a leaked key, recommend that the owner rotate it
4. Push / PR / merge / deploy have been done regularly this session with the owner's agreement — if unsure, ask
5. This machine runs out of memory easily (Metro worker killed) → avoid running the mobile test suite in parallel with typecheck. If the dev server dies, restart it

---

## 3. Repo state (current)

```
branch: main @ 50c1624   (working tree clean)
live:   version 073dcc06-8ba2-4699-82f0-481266f3a6b6
CI:     green on main (typecheck / test / checks / workers)
```

### Merged + deployed in this session
| PR | What |
| --- | --- |
| #222 | GitHub Actions: SDK workflows run only when their own paths change |
| #223 | replace real `chv_` keys in docs with placeholders · create empty `dist-live` before `test:import` |
| #224 | Chivar Bot as SVG with 9 moods (`ChivarBot.tsx`) |
| #225 | 3D Chivar Bot (three.js built from primitives, `chivarbot3d/`) — drag to turn, tap to hop |
| #226 | 3D Chivar Bot in the Concierge header and on the floating door (`Shell.tsx`) |
| #227 | **Fanta's work**: two gacha banners (mascot/fashion) + idempotency, backpack, navigation, place stories. I fixed 3 things before merging (below) |
| #228 | ChangChang: tablets get the detailed build |
| #229 | **ChangChang sharp on every screen**: meshopt-compressed GLB 7.8→3.2 MB + `dequantize.ts` |

### What I fixed in #227 (Fanta's PR)
- `Shell.tsx` merge conflict brought back the old PNG import while the code calls `<ChivarBotScene>` → web Home would have thrown a ReferenceError
- `storiesOpen()` back to **closed by default** (Fanta had made it open by default). Posting no longer needs GPS/geofence/event token, and production sets `CHIVAGO_STORIES_AUTO_APPROVE=1` → open by default = anyone could post to any place and it goes public immediately. Fanta's tests changed to match
- Added Thai/English/Chinese messages for 3 new error codes (`NO_ELIGIBLE_REWARDS`, `INVALID_REWARD_POOL`, `IDEMPOTENCY_CONFLICT`) to `apps/mobile/src/i18n/api-errors.ts`

---

## 4. Deploying (the method that works — don't use the workflow)

```bash
cd apps/mobile
rm -rf dist-live
EXPO_PUBLIC_API_URL=same-origin npx expo export --platform web --output-dir dist-live --clear
grep -c "localhost:8787'" dist-live/_expo/static/js/web/index-*.js   # must print 0
node scripts/flatten-assets.mjs dist-live
cd ../..
pnpm --filter @chivago/api exec wrangler deploy
```

**Traps that have bitten before:**
- Without `EXPO_PUBLIC_API_URL=same-origin` → the bundle calls `http://localhost:8787` and the live site drops into demo-only mode
- Without `--clear` → Metro's cache keeps the old env value (`index-<hash>.js` keeps the same hash = still broken)
- `.github/workflows/deploy-worker.yml` is broken — don't use it
- After deploying, check with the chrome-devtools MCP (the app's built-in browser pane fires no `requestAnimationFrame`, so it can't check 3D/animation)

---

## 5. Unfinished work / to decide

### For the owner to decide
- **Stories are open in the live database** (`settings.stories_open = '1'`, set earlier from the console). The code default is closed, but this value overrides it. With auto-approve on, anyone signed in can post to any place and it goes public immediately. Close it from the moderator console if it's not needed yet
- **Rotate the host keys** that were in `docs/` before #223 (the repo is public now; the keys were in git history) — the owner's job
- `verifySummon` checks v3 receipts against **today's** `gacha_reward_pool` → if an operator changes weights or deactivates a reward, old receipts may fail to verify. Should store the pool snapshot/version per pull

### Leftovers (not urgent)
- `origin/feat/permanent-qr` — a permanent QR into the site + poster with ChangChang (`artifacts/qr/`, `scripts/make-qr.py`), **not merged**
- Dead code from #227: `eventTokenOk` / `WrongEventToken` in `apps/api/src/story-service.ts` and `http.ts`
- `POST /summon` now requires `category` + `idempotencyKey` → old app builds sending only `{pulls}` get 400 (fine if app and API deploy together)
- Orphan file `apps/mobile/assets/chivargo-ai-robot-v1.png` (no longer used since the 3D bot)
- Old open PRs: #214, #194, #174, #151, #99, #98, #97

---

## 6. Where to look

| Topic | File |
| --- | --- |
| 3D Chivar Bot | `apps/mobile/src/components/chivarbot3d/` (`bot-rig.ts` is pure logic + tests), `ChivarBotScene.tsx` (SVG fallback until 3D is ready) |
| ChangChang 3D | `apps/mobile/src/components/greeter3d/Greeter3D.tsx`, `build-choice.ts`, `dequantize.ts`, `GreeterScene.tsx` |
| ChangChang model + how it was made | `apps/mobile/public/media/mascots/README.md` (gltf-transform command at the bottom) |
| Gacha | `apps/api/src/summon-service.ts`, `apps/mobile/src/screens/SummonScreen.tsx` |
| Stories | `apps/api/src/story-service.ts`, `apps/mobile/src/components/Stories.tsx` |
| DB schema | `apps/api/src/db.ts` + `migrations.ts` — **change the schema = bump `SCHEMA_VERSION` + update `PINNED` in `db-schema-version.test.ts`** |
| Wrangler config / env | `apps/api/wrangler.jsonc` |
| Mobile error messages | `apps/mobile/src/i18n/api-errors.ts` (every new backend error code must be added, or `test:scripts` fails) |

### Commands to check before every PR
```bash
pnpm --filter @chivago/mobile exec tsc --noEmit -p .
pnpm --filter @chivago/api exec tsc --noEmit -p .
pnpm --filter @chivago/api test
pnpm test:scripts
```
