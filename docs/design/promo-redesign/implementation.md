# ChivarGo promo redesign — 2026-11-24

## Scope and existing architecture

The promotional page lives in apps/mobile/public/th and is copied by Expo's web export. The existing product is Expo SDK 54 / React Native / React Native Web, with a Hono API, SQLite on Node and Durable Objects on Workers. Existing account/device authentication, area selection, locale persistence, reward services and host console remain the owners of product data. No tables or new authentication services were introduced.

Inspected the composition root, screen registry, account bootstrap, locale/area stores, public asset routing, Node server, API public route boundaries, database initialization, package scripts, worker asset tests and export checks.

## Implemented

- Full responsive landing page: sticky navigation, hero, 21 feature cards, six experience cards, two destinations, community impact, four steps, five partner categories, trust, FAQ, final CTA and footer.
- Existing photography/illustration assets, ChangChang mascot and installed Lucide icon library reused. Hero text, phone composition, buttons and cards are HTML/CSS; no generated screenshot is used as the website.
- Shared content dictionary uses the existing th/en/zh locale keys. Three server-readable HTML files are generated with metadata and alternate language links.
- Language selection also writes the existing chivago.locale preference. The app accepts explicit lang queries and persists them.
- Existing area queries select koh-sichang or samui.
- Allowlisted screen query integration takes visitors through existing authentication/onboarding into the requested product screen.
- Partner application and host links use /console/apply and /console. Privacy and About use existing routes.
- No aggregate counts are invented: member, reward and partner totals are omitted because no suitable public aggregate endpoint was found.
- No unconfigured app-store badges, social URLs, legal URLs or video buttons.
- Reduced motion, keyboard focus, Escape-close menu, native FAQ disclosure, offline notice and image fallback.

## Files and maintenance

- apps/mobile/public/th/content.mjs: marketing translations and feature definitions.
- apps/mobile/public/th/components.mjs: reusable section renderer using build-time Lucide nodes.
- apps/mobile/public/th/promo.css: tokens and responsive layouts.
- apps/mobile/public/th/promo.js: menu, language, section navigation and offline behaviour.
- apps/mobile/public/th/config.js: same-origin production configuration.
- scripts/build-promo.mjs: generates index.html, en.html and zh.html. Run pnpm promo:build after changing content/components.
- apps/mobile/scripts/export-live.mjs: runs the promo build before Expo export.
- apps/mobile/src/navigation/promo-link.ts: safe product screen allowlist.
- App.tsx / i18n/locale.ts: existing navigation and locale integration.
- scripts/start-promo.mjs, serve-promo.mjs, serve-promo-app.mjs: local launch helpers.

## Local operation

Run pnpm promo, or double-click Desktop/ChivarGo-Promo.cmd.

- Promo: http://127.0.0.1:4321/th/
- App: http://localhost:8081
- API/Host console: http://localhost:8787

The app preview uses apps/mobile/dist-live, which must exist. Rebuild with pnpm --filter @chivago/mobile export:live after app changes. The launcher reuses listening ports and starts missing services. It uses the local apps/api/data/chivago.db and the existing migrations; it does not run remote migrations or deploy. Closing the launcher terminates the child services it started. Existing separately started servers are not owned by it.

Production configuration uses the current origin. The local promo server overrides config.js with development origins, so localhost URLs are not embedded in the deployment.

## Verification

- pnpm -r typecheck: passed across core, tokens, API and both mobile configurations.
- worker-assets and promo-link tests: 7 passed.
- existing mobile locale screen tests: 16 passed. Existing React test renderer/act warnings remain.
- Headless installed Chrome: 320, 360, 390, 768, 1024, 1440 and 1920 pixels × TH/EN/ZH (21 combinations) passed overflow, feature count, FAQ and mobile menu checks.
- Language navigation, browser Back and offline banner passed; no page script errors.
- Thai visual captures are in qa/. Image requests and decoding checked.
- Real local integration using CHIVAGO_DB=:memory:: promo Adventure link → real registration endpoint → onboarding → Adventure empty state passed. No demo adapter was used.
- Full `pnpm --filter @chivago/mobile export:live` rerun passed (exit 0), including all five check-export checks. Initial final guard rejected a development URL in promo.js; development configuration now lives in the preview server. Node's existing shell-option deprecation warning remains.
- Final local smoke check: Thai, English and Chinese promo pages, exported app root and API health all returned HTTP 200.
- No lint script is defined in the relevant package manifests.

## Remaining limits

- Public landing page does not fetch private balances or expose the user's session. Account/profile controls are in the existing app.
- Aggregate statistics require a separately designed public endpoint before they can be displayed.
- Actual quest rewards, host approvals, AI provider calls, store purchases and every product screen were not exercised end-to-end in this redesign. Existing services are reused.
- AI, OAuth and external integrations require their existing environment credentials. Local launch does not automatically load production credentials.
- Empty unpublished adventure data is displayed honestly; this redesign does not create or publish adventures.
- Native Android/iOS and physical-device UAT were not performed. Responsive testing used desktop Chrome.
- No production push, commit or deploy performed.
