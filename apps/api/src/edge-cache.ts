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
 * THE SEA JOINED THE WEATHER on 23 November, for the same reason and on the
 * same terms: one fetch from Open-Meteo that already carries its own TTL,
 * reading nobody, identical for everybody, and asked for by every phone that
 * opens Home.
 *
 * `/areas/:key/transit` LOOKS LIKE IT BELONGS HERE AND DOES NOT, which is
 * worth recording so nobody adds it later. It is registered AFTER the
 * app-wide `cors()` middleware, so its `access-control-allow-origin` is the
 * caller's own origin - one value for chivargo.com and another for www. The
 * key below is the address alone, by design, so a single stored copy would
 * hand one of those two a header naming the other and the browser would
 * refuse the answer. Weather and the coastal reading are registered BEFORE
 * that middleware and set `*` themselves, which is what makes one copy
 * correct for everybody. Moving transit above the middleware would make it
 * cacheable; until somebody does that, it is not.
 *
 * WHAT IS NOT HERE, ON PURPOSE:
 *   - /health. A health check answered from a cache says the system is up
 *     for a minute after it went down. Its traffic is a monitor's, not a
 *     crowd's.
 *   - Anything personal or written. The list is patterns, not prefixes.
 *   - ANYTHING CARRYING A STORY, and this one is worth spelling out because
 *     it is the route that would most repay caching and the one that must
 *     not be cached. `/stories/:id/media`, `/areas/:key/stories` and
 *     `/areas/:key/board` all answer with something a host can hide, and
 *     Hide has to be immediate - the board is on a projector in a room. A
 *     minute of edge copy is a minute of a hidden story still on the wall,
 *     or a tile in a list whose bytes already 404. The cost of leaving them
 *     uncached is real: a 25 MB clip is fetched through the object every
 *     time, by anybody, with no key. That bill belongs to a rate limit in
 *     front of this Worker, not to a cache that would break the one promise
 *     the review queue makes.
 *
 * The browser still gets `no-store`, as before: the edge keeps the copy, the
 * phone asks again and is answered quickly. `x-edge-cache` says which.
 */

/** How long a public answer is kept at the edge. */
export const EDGE_TTL_SECONDS = 60;

const WEATHER = /^\/areas\/[a-z0-9-]+\/weather$/;
const COASTAL = /^\/areas\/[a-z0-9-]+\/coastal-intelligence$/;

/**
 * Every public answer that is the same for everybody.
 *
 * Each entry has to earn its place one at a time: a prefix would sweep in
 * the next route somebody adds under `/areas/`, which is how a personal
 * answer ends up in a shared cache without anybody deciding that it should.
 */
const SHARED = [WEATHER, COASTAL];

/** A GET for one of those, with no query to multiply the copies. */
export function edgeCacheable(request: Request): boolean {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.search === '' && SHARED.some((pattern) => pattern.test(url.pathname));
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
