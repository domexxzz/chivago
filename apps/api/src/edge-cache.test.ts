import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { EDGE_TTL_SECONDS, edgeCacheKey, edgeCacheable, forClient, forEdge } from './edge-cache.ts';

/*
  Measured on chivargo.com, 20 Nov 2026: every request but the web pages runs
  through the one Durable Object, whose ceiling is around 900 requests/s, and
  the weather - identical for everybody in an area - was a large share of
  what a crowd opening Home sends. Kept at Cloudflare's edge for a minute, it
  no longer reaches the object at all.
*/

const req = (path: string, init: RequestInit = {}) => new Request(`https://chivargo.com${path}`, init);
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('what may be kept at the edge', () => {
  test('an area\'s weather, read with GET', () => {
    assert.ok(edgeCacheable(req('/areas/koh-sichang/weather')));
    assert.ok(edgeCacheable(req('/areas/samui/weather', { headers: { 'x-chivago-device-key': 'k' } })),
      'the answer is the same whoever asks, signed in or not');
  });

  test('nothing personal, nothing written, nothing else', () => {
    assert.ok(!edgeCacheable(req('/areas/koh-sichang/weather', { method: 'POST' })));
    assert.ok(!edgeCacheable(req('/places')));
    assert.ok(!edgeCacheable(req('/impact/community')));
    assert.ok(!edgeCacheable(req('/areas/koh-sichang/stories')));
    assert.ok(!edgeCacheable(req('/areas/koh-sichang/weather/extra')));
    assert.ok(!edgeCacheable(req('/health')), 'a health check answered from a cache would hide an outage');
  });

  test('a query string is not cached, so it cannot fill the cache with copies', () => {
    assert.ok(!edgeCacheable(req('/areas/koh-sichang/weather?t=1')));
  });

  test('the key is the address alone, never who asked', () => {
    const key = edgeCacheKey(req('/areas/koh-sichang/weather', { headers: { 'x-chivago-device-key': 'secret' } }));
    assert.equal(key.url, 'https://chivargo.com/areas/koh-sichang/weather');
    assert.equal(key.headers.get('x-chivago-device-key'), null);
  });
});

describe('what is stored and what is served', () => {
  test('a good answer is stored for a minute, without cookies', async () => {
    const stored = forEdge(json(200, { ok: true, data: { provenance: 'live' } }, { 'cache-control': 'no-store', 'set-cookie': 'a=b' }));
    assert.ok(stored);
    assert.equal(stored.headers.get('cache-control'), `public, max-age=${EDGE_TTL_SECONDS}`);
    assert.equal(stored.headers.get('set-cookie'), null);
    assert.deepEqual(await stored.json(), { ok: true, data: { provenance: 'live' } });
  });

  test('a failure is never stored', () => {
    assert.equal(forEdge(json(404, { ok: false })), null);
    assert.equal(forEdge(json(500, { ok: false })), null);
    assert.equal(forEdge(new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })), null);
  });

  test('the browser still gets no-store, and is told where the answer came from', () => {
    const served = forClient(json(200, { ok: true }, { 'cache-control': 'public, max-age=60' }), 'HIT');
    assert.equal(served.headers.get('cache-control'), 'no-store');
    assert.equal(served.headers.get('x-edge-cache'), 'HIT');
  });
});
