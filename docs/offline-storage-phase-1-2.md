# Offline Lite persistent storage (Phase 1.2)

Public place and service lists pass through `public-cache.ts`. On a successful API response, the repository saves an area-scoped, seven-day snapshot. On a network, timeout, or server error, it reads a valid snapshot. Authorization errors never trigger a cache fallback. Details are reconstructed from cached list records; no review bodies are fabricated.

`storage.ts` selects IndexedDB (`storage-web.ts`) in browsers and SQLite (`storage-native.ts`) in React Native. SQLite uses a versioned schema (`PRAGMA user_version = 1`). Each record has an area, data type, version, download/expiry timestamps, and byte size. A single record is limited to 5 MiB. Storage failure does not prevent an online response.

On web, a valid Phase 1.1 `chivago.offline.public.v2.*` localStorage record is copied into IndexedDB when first read. The copy is read back and validated. The source remains in localStorage after successful migration to allow recovery; explicit cache deletion removes only the matching public cache keys. Corrupt and expired legacy records are ignored.

Shop cover images use a separate cache on demand: Cache API on web, app document directory on native. The cache accepts only public HTTPS URLs (or localhost HTTP), image MIME types and files up to 2 MiB. It keeps at most 30 images. A failed cache operation leaves the online URL and placeholder behavior intact. Other image types and place imagery are outside this phase.

The Map cache panel shows current area snapshots and total public data size, supports refresh, area deletion and confirmed deletion of all public records and covers. It never clears account, locale or outbox keys.

This does not cache map tiles, styles, fonts, sprites or terrain. A cold offline web launch still requires a separately installed app shell. Native SQLite and file operations must be verified on Android and iOS devices before Phase 2.
