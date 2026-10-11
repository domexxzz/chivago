# ChivaGo travel marketplace — front-end prototype

Independent React + TypeScript + Tailwind + Vite app. All business listings, prices, availability implications, reviews, and testimonials are fictional. **Nothing can be reserved or charged.** No auth, backend, payments, database, CMS, or tracking. This does not replace ChivaGo's existing inquiry-only marketplace.

## Run

Requires Node 24+ (tested with 24.19) and npm. From the repository root:

```powershell
cd apps/travel-web/site
npm ci --workspaces=false
npm run dev
```

Open **http://127.0.0.1:5173/travel-marketplace/**. Detail example: **http://127.0.0.1:5173/travel-marketplace/#/listing/samui-island-day**.

The runnable package lives in `site/`, with its own `package-lock.json` and `.npmrc`. This nesting keeps it outside the repository's `apps/*` pnpm workspace, so no root lockfile change is needed. Run npm inside `site/`, not pnpm at the repository root. No shared package or existing app changes are required. Port 5173 is strict: if occupied, stop the old preview rather than silently opening another server.

If your Windows npm launcher is broken, replace `npm` with:

```powershell
& 'C:/Program Files/nodejs/node.exe' 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run dev
```

Production: `npm run build`, then `npm run preview` (stop dev first; same port). Host the contents of `dist` at `/travel-marketplace/`; hash routes need no server-side listing rewrites. Static hosting is not deployed by this task.

## Structure

```text
site/src/
  components/layout/       Header, Footer
  components/home/         Search, destinations, testimonials, benefits, newsletter
  components/marketplace/  Listing cards and filters
  components/detail/       Gallery, fictional reviews, native confirmation dialog
  pages/                   Home, listing detail, not-found
  data/mockData.ts          All typed fictional content and photo provenance
  services/listings.ts      Async replaceable listing adapter
  types/                   Listing and search/filter contracts
  utils/                   Pure selection, validation, formatting, route parsing
  styles/                  Local design tokens and responsive styles
site/public/images/        Optimized local licensed WebP images
site/tests/                Browser flow checks at 375, 768, 1280px
```

## Replace mock data with an API

Components call `getListings(): Promise<Listing[]>` and `getListing(id): Promise<Listing | undefined>` from `src/services/listings.ts`; they do not import `MOCK_LISTINGS`. Replace only those adapter implementations with fetch calls to your future API. Validate/map its response to `src/types/listing.ts`; use `undefined` for an unknown listing and throw for request errors so existing retry states remain useful. The current adapter returns independent clones, not mutable references to mock records.

Search, filtering, and sorting remain client-side in `utils/catalogue.ts` for this small catalogue. An API needing server pagination/filtering will require a deliberate interface expansion; it is not silently supported. Home destinations/testimonials and image credits are presentation content in the mock-data file and can be migrated independently.

Dates are optional but, when supplied, must form a valid increasing arrival/departure range. They **do not filter availability**. Travelers must be integers from 1–20. Dates/travelers carry into the confirmation; all search/filter state lives in memory and resets on refresh. Base price is THB/person for tours/experiences and THB/night for stays; mixed-category sorting compares these base prices, not trip totals. Durations use hours internally, display natural labels, and split at <=4, >4–24, >24 hours.

Do not connect the demo booking button to production reservations without a separate product/legal decision. ChivaGo's established inquiry flow remains unchanged. The newsletter validates locally and clears its input without saving or sending anything. Sign-in is disabled.

## Verification

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run test:browser
```

Browser tests use installed Microsoft Edge, run sequentially at all three widths, and reuse the single dev server if present. Otherwise they start/stop one local Vite server. Screenshots go to ignored `artifacts/`; failure traces go to ignored `test-results/`. They test complete search/detail/confirmation/back flow, modal focus wrapping and Escape, validation, empty results, direct links, newsletter no-submit behavior, overflow, and lack of external requests. Unit tests also cover adapter errors/retries and asset integrity. jsdom stubs the native dialog API; real keyboard trapping is checked in the browser.

Use keyboard-only navigation and inspect at 375/768/1280px: main/landmark structure, visible focus, explicit labels/alt text, usable mobile menu and dates, gallery buttons, and prominent demo notices. Below-the-fold photos lazy-load; hero/detail main photos load eagerly. No web fonts, map renderer, carousel library, or icon package is required.

## Motion

The Fastwork-inspired motion treatment adapts interaction patterns only, not its code or assets: staggered hero entrance, once-per-mount section/card reveals, up to 18px of scroll-linked hero image drift, gentle hover effects, and sticky navigation that becomes a floating pill after 240px of scroll. Native IntersectionObserver, CSS transitions, and frame-throttled passive scroll listeners avoid an animation dependency or scroll hijacking. Navigation updates React only when crossing its threshold.

OS/browser reduced-motion preferences disable entrances, reveals, hover transforms, image drift, and smooth section scrolling, including live preference changes. Keyboard focus immediately reveals a card; unavailable enhancement APIs leave content visible. Filter-created cards are discovered without changing search logic. The floating header remains usable in reduced-motion mode but changes without animated transitions.

## Image rights

See [IMAGE-CREDITS.md](./IMAGE-CREDITS.md) and the footer's expandable image credits. Six Pexels photos are stored locally, licensed and credited, and explicitly illustrative; they do not depict a real listed operator. No mascot or existing mock data was copied. Hostinger served only as general layout inspiration; no template text/assets were copied.
