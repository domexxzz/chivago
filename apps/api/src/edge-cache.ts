/**
 * Public answers kept at Cloudflare's edge, so they never reach the object.
 *
 * MEASURED, 20 NOVEMBER 2026, ON chivargo.com: every request except the web
 * pages runs through the one Durable Object, and the lightest of them tops
 * out near 900 a second there. An area's weather is the same for everybody
 * - the route sends `access-control-allow-origin: *` and reads no user - and
 * a crowd opening Home asks for it on every screen. Kept here for a minute,
 * a repeat is answered by the data centre the traveller reached, and the
 * object's capacity is left for the reads that are personal.
 *
 * A MINUTE ON TOP OF FIVE. weather.ts already reuses an answer for five
 * minutes and the card shows when its figures were observed, so a minute
 * more at the edge changes nothing anybody can act on.
 *
 * WHAT IS NOT HERE, ON PURPOSE:
 *   - /health. A health check answered from a cache says the system is up
 *     for a minute after it went down. Its traffic is a monitor's, not a
 *     crowd's.
 *   - Anything personal or written. The list is one pattern, not a prefix.
 *
 * The browser still gets `no-store`, as before: the edge keeps the copy, the
 * phone asks again and is answered quickly. `x-edge-cache` says which.
 */

/** How long a public answer is kept at the edge. */
export const EDGE_TTL_SECONDS = 60;

const WEATHER = /^\/areas\/[a-z0-9-]+\/weather$/;

/** A GET for an area's weather, with no query to multiply the copies. */
export function edgeCacheable(request: Request): boolean {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.search === '' && WEATHER.test(url.pathname);
}

/** The address alone. Nothing the traveller sent is part of the key. */
export function edgeCacheKey(request: Request): Request {
  const url = new URL(request.url);
  return new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
}

/** The copy the edge keeps, or null when the answer must not be kept. */
export function forEdge(response: Response): Response | null {
  if (response.status !== 200) return null;
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return null;
  const headers = new Headers(response.headers);
  headers.delete('set-cookie');
  headers.set('cache-control', `public, max-age=${EDGE_TTL_SECONDS}`);
  return new Response(response.body, { status: 200, headers });
}

/** What the browser receives: never cached by it, and labelled. */
export function forClient(response: Response, outcome: 'HIT' | 'MISS'): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-edge-cache', outcome);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
