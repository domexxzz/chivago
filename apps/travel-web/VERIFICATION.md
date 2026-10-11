# Travel marketplace verification

Verified 11 October 2026 on `yoshi/travel-marketplace`, based on main commit `8ac40b1`.

## Final checks

- `npm test`: 19 tests passed in seven files.
- `npm run typecheck`: passed.
- `npm run lint`: passed with zero warnings; no automatic fixes.
- `npm run build`: passed. JavaScript bundle 260.75 kB / 81.30 kB gzip; CSS 25.65 kB / 6.28 kB gzip.
- `npm run test:browser`: six tests passed in installed Microsoft Edge at 375, 768, and 1280px.
- Manually inspected the running app in the Codex browser: responsive discovery, gallery, retained search context, focus-wrapped confirmation, demo testimonials, benefits, newsletter, and footer.
- Core text/button contrast pairs checked: brand/white 9.58:1, muted/cream 5.81:1, ink/white 11.77:1, lime/brand 8.27:1, error/white 8.03:1. This is not a formal accessibility certification.

Browser assertions cover search validation, combined category/destination/price filtering, sorting selection, empty results/reset, direct listing links, missing listings, retained filters on back navigation, gallery selection, dialog Tab/Shift+Tab/Escape and focus restoration, newsletter validation without submission, no external requests, no page errors, and horizontal overflow. Unit tests additionally cover combined filter/sort logic and adapter error/retry states.

## Regression checks

Each phase included an intentional break followed by restoration and a passing test run:

1. Remove a mock listing: catalogue-size test fails.
2. Exclude the exact maximum-price boundary: filter test fails.
3. Remove dialog focus wrapping: keyboard test fails.
4. Reject valid newsletter emails: validation and signup tests fail.

None of these intentional mutations remain in the implementation.

## Isolation

The runnable app is nested under `apps/travel-web/site` because root pnpm discovers `apps/*`. There is no package manifest directly under `apps/travel-web`, so existing workspace membership and the root lockfile remain unchanged. Run commands from `site/`.

Only files within `apps/travel-web` changed. No existing application, backend, inquiry flow, authentication, payment, root configuration, or root lockfile was modified. Existing ChivaGo suites were not rerun as part of the final isolated-app verification. No deployment or PR is part of this delivery.

All business content and ratings are fictional. Dates do not establish availability. Demo confirmations reserve nothing and charge nothing; newsletter entries are neither stored nor sent. Six locally stored Pexels photos are illustrative and credited in `IMAGE-CREDITS.md` and the UI.
