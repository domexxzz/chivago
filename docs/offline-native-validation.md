# Offline Lite native validation

Status: **Android API-failure validation completed; full native gate remains open.** Do not start Phase 2 until the remaining Android and iOS checks pass.

## Android emulator — 2026-10-31

- Device: Pixel 10 AVD, Android 17, Expo Go 2.32.19 (Expo SDK 52 app).
- Started a demo Metro server to populate public place snapshots. The cache panel reported 5 Samui places in 2 saved areas and a 7-day expiry. The service request failed, so this run did not validate cached businesses.
- Force-stopped Expo Go, launched the normal app, and removed the ADB reverse tunnel to the API. Map loaded its persisted place snapshot from native SQLite and displayed a cached-data warning with the last successful update and age.
- Searched for `Chaweng`; only its cached marker remained. Opened the place detail from that marker. The detail displayed its offline timestamp. A missing offline hero image rendered a placeholder. Live-only here-now, air-history, and stall cards are suppressed while using a snapshot.
- The test simulated **API unavailability**, not complete radio shutdown. Expo Go still needed Metro over the network. A standalone build is needed for airplane-mode validation.
- Android typecheck passed; mobile tests passed (91 source tests and 687 screen tests); Android Expo export passed after the detail-screen change.

## Remaining gate

1. On Android, load an actual business and cover image from a reachable API. Restart with the API unavailable, then confirm business detail, cached image, and absence of live opening-status claims.
2. Verify cache deletion for one area on the emulator: only that area's public snapshot disappears; another area and account state remain. Reconnect and refresh, then confirm fresh API data replaces the snapshot.
3. Validate a standalone Android build with Wi-Fi and mobile data disabled, and test storage failure behavior.
4. Repeat the complete checklist on an iOS simulator or device. iOS cannot be run from this Windows/Android Studio setup. A successful iOS bundle export does not substitute for device validation.

The demo fixture was used only to hydrate public place cache. The local API was unavailable during the fallback test, so this does not prove authenticated or production API behavior.
