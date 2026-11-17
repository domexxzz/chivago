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
export const servedFromExport = (pathname: string): boolean =>
  pathname === '/'
  || pathname === '/favicon.ico'
  || pathname === '/robots.txt'
  || ['/_expo/', '/assets/', '/icons/', '/islands/', '/media/', '/shops/media/', '/shops/guide-photos/']
    .some((p) => pathname.startsWith(p));
