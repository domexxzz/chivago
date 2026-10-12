# Integrated Stays & Tours demo

This React Native feature appears **below the existing operator/inquiry cards** in `AskScreen`. It is not an iframe, external website link, real operator directory, or extension of the inquiry API. Open the mobile app → Stays & tours → scroll past Ask an operator.

## Boundaries

- All 18 listings, prices, ratings, reviews, and testimonials are fictional, labeled separately from operator declarations.
- Demo confirmation reserves nothing, charges nothing, and sends no inquiry. No authentication, backend, database, payments, or newsletter subscription were added.
- The original inquiry form, API endpoints, messages, history, and withdrawal behavior remain unchanged.
- Demo search/filter/sort state survives closing details but resets when leaving the screen. Dates do not establish availability. Base prices compare THB/person with THB/night, not trip totals.
- The native edition retains ChivaGo's existing header and bottom navigation rather than mounting a second website navigation bar.

## Structure and copied content

`mockData.ts`, `types/`, and `catalogue.ts` adapt the isolated `apps/travel-web/site` catalogue and pure selection/validation helpers. They do not import the Vite app or its React version. `data.ts` returns independent copies behind an async adapter; replace that implementation with validated API data later. `images.ts` handles bundled demo photos or remote URLs returned by a future adapter.

`assets/` contains copies of all six licensed WebP photos and `IMAGE-CREDITS.md` from the isolated marketplace. Metro static asset references bundle them for both native and web, without requiring an API asset server. Credits are also accessible from the demo UI. No existing mascot or inquiry mock data was changed/copied.

`TravelMarketplace.tsx` uses the app's native typography, brand colors, cards, controls, and modal. `Motion.tsx` and `viewport.ts` provide once-per-mount viewport reveals and frame-coalesced scroll checks. Hero image drift is bounded to 18px; existing reduced-motion preferences stop motion. Effects and subscriptions are cleaned up, and content stays visible if it cannot be measured.

## Checks

Run from `apps/mobile` with the repository's normal Node/pnpm setup:

```powershell
pnpm typecheck
pnpm test
pnpm web --port 8081
```

Reuse an already-running server rather than launching extra ports. The production web export is:

During the 13 October verification, Windows reserved ports 8065–8164, preventing 8081 from binding. The preview uses **http://127.0.0.1:8165/** instead, without changing Windows settings. Use `pnpm web --port 8165` and set `CHIVAGO_WEB_URL` to that URL before the browser check when this exclusion exists.

```powershell
pnpm exec expo export --platform web --output-dir dist-travel-check
```

In this local pnpm installation, Expo's transitive `expo-asset` was installed but not directly resolvable from the app. Verification used a process-local `NODE_PATH` pointing at Expo's dependency directory; no package manifest or lockfile was changed:

```powershell
$travelExpoModules = node -p "require('path').dirname(require('path').dirname(require.resolve('expo/package.json')))"
$env:NODE_PATH = $travelExpoModules
pnpm exec expo export --platform web --output-dir dist-travel-check
```

`test/travel-marketplace.test.ts` checks clone isolation, filters, sorting, date validation, real inquiry empty-state preservation, gallery/detail/confirmation behavior, and no demo network writes. Existing inquiry interaction tests now target the message field by name because this screen also has demo search inputs. The zero-price assertion matches a standalone zero instead of also matching the suffix of "500 THB".

`scripts/check-travel-marketplace.mjs` checks the running app at 375/768/1280px, mocks only the browser test's API, asserts actual photo loading, and saves screenshots under ignored `dist-travel-qa/`. It uses Playwright from the isolated app's dev dependencies:

```powershell
# Install test tooling in apps/travel-web/site with npm ci if not already present.
node scripts/check-travel-marketplace.mjs
```

Browser automation and React Native tests do not establish physical iOS/Android gesture, performance, or accessibility behavior; a physical-device check remains recommended before release. The desktop computer-use tool could not initialize in this session, so running-app visual checks used browser test screenshots.

The intentional price-boundary mutation (`<=` changed to `<`) made the new regression test fail and was restored. The React quality check led to clean animation teardown, a separate viewport utility, portable data cloning, and bundled image imports. No root lockfile, app dependency, API service, or standalone travel-web file was changed for this integration.

Final verification (13 October 2026): 42 source/logic tests and 631 screen/interaction tests passed; both mobile TypeScript configurations passed; non-fixing feature/test lint and general AskScreen lint passed. The existing screen's intentional listing-dependent date memo and helper exports were left intact, not refactored to satisfy the standalone Vite-specific refresh rules. Expo production web export passed with 34 bundled assets, including all six demo photos. Running-app browser flows passed at 375/768/1280px, including image loading and no demo network writes. Physical iOS/Android checks were not performed.
