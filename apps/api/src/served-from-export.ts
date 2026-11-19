/**
 * Which paths the exported web app serves, and which belong to the API.
 *
 * ITS OWN FILE SO IT CAN BE TESTED. `worker.ts` imports `cloudflare:workers`,
 * a scheme the node test runner cannot load at all, so anything that lives
 * beside the fetch handler is unreachable from a test. This rule is exactly
 * the kind that has to be checkable: see `worker-assets.test.ts`.
 *
 * NAMED RATHER THAN INFERRED, and that is the design. Everything not on this
 * list reaches the API, which is what lets `/media/<id>` be a database row
 * rather than a file on disk - the export carries place photographs under the
 * same prefix, and a miss falls through.
 *
 * The cost of a list is that a file added to `apps/mobile/public/` is
 * invisible until somebody adds it here too. That is not hypothetical. On the
 * first Workers deployment, measured against the Node one:
 *
 *   /robots.txt          node 200   workers 401
 *   /icons/icon-192.png  node 200   workers 401
 *   /favicon.ico         node 200   workers 200
 *
 * On Node the static handler is handed a directory and tries it; on Workers
 * there is no directory to try. The 401 is the device-authentication
 * middleware answering a request that was never meant to reach it.
 */
/**
 * The two plain pages outside the app: `public/privacy.html` and
 * `public/about.html`. Workers Assets answers `/privacy` with privacy.html
 * and redirects `/privacy.html` and `/privacy/` to `/privacy` (measured
 * locally, 307), so all three spellings are listed: an unlisted one would
 * reach the API and answer 401 instead of redirecting.
 * They are what Google's OAuth consent screen links to as the privacy policy
 * and the home page, and both must be readable without a device key - a 401
 * there is a sign-in screen that cannot be published.
 */
const PAGES = new Set(['/privacy', '/privacy.html', '/privacy/', '/about', '/about.html', '/about/']);

export const servedFromExport = (pathname: string): boolean =>
  pathname === '/'
  || pathname === '/favicon.ico'
  || pathname === '/robots.txt'
  || PAGES.has(pathname)
  || ['/_expo/', '/assets/', '/icons/', '/islands/', '/media/', '/shops/media/', '/shops/guide-photos/', '/vendor/']
    .some((p) => pathname.startsWith(p));
