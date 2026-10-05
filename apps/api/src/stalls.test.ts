import { strict as assert } from 'node:assert';
import { before, beforeEach, describe, test } from 'node:test';
import { SAFETY_PHRASES, SEED_PLACES, isOrderLink } from '@chivago/core';
import {
  RETRY_AFTER_MS, STALE_MAX_MS, STALLS_TTL_MS, __resetStalls, getStalls, sangkonBase,
} from './stalls.ts';

/**
 * The food court's stalls, as สั่งก่อน reports them (docs/65).
 *
 * Route-level coverage uses its own process and never opens the pilot DB, and
 * the real สั่งก่อน is never called: `fetch` is a stand-in that counts.
 */
delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const BASE = 'https://sangkon.example';
const T0 = Date.parse('2026-10-06T12:00:00+07:00');

const answer = (shops: unknown[]) => ({ ok: true, data: { shops, missing: [], now: T0 } });
const stall = (over: Record<string, unknown> = {}) => ({
  slug: 'demo', name: 'บะหมี่หน้าหอ (ร้านตัวอย่าง)', demo: true, openNow: true, nextOpenAt: null,
  accepting: true, payReady: true, waitMin: 5, url: 'https://elsewhere.example/s/demo', ...over,
});

/** A fake สั่งก่อน: answers what it is told, or fails, and counts the asks. */
function fakeService(reply: () => unknown | Error) {
  const asked: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    asked.push(String(url));
    inits.push(init);
    const r = reply();
    if (r instanceof Error) throw r;
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { asked, inits, fetchImpl };
}

const ask = (fetchImpl: typeof fetch, now = T0) => getStalls('rmutt-canteen', { now, base: BASE, fetchImpl });

describe('getStalls', () => {
  beforeEach(() => __resetStalls());

  test('the food court\'s stalls come live from สั่งก่อน, with the order page built here', async () => {
    const svc = fakeService(() => answer([stall()]));
    const r = await ask(svc.fetchImpl);
    assert.equal(svc.asked[0], `${BASE}/api/shop-status?slugs=demo`);
    assert.equal(svc.inits[0]?.redirect, 'error', 'a redirect is not followed to another host');
    assert.equal(r.provider, 'sangkon');
    assert.equal(r.provenance, 'live');
    assert.equal(r.observedAt, new Date(T0).toISOString());
    assert.equal(r.stalls[0]!.orderUrl, `${BASE}/s/demo`, 'never the link the answer carried');
    assert.equal(r.stalls[0]!.example, true);
    assert.equal(r.stalls[0]!.waitMin, 5);
  });

  test('a place without stalls asks nobody', async () => {
    const svc = fakeService(() => answer([]));
    for (const id of ['chaweng', 'constructor', '__proto__']) {
      const r = await getStalls(id, { now: T0, base: BASE, fetchImpl: svc.fetchImpl });
      assert.equal(r.provider, null, id);
      assert.deepEqual(r.stalls, []);
    }
    assert.equal(svc.asked.length, 0);
  });

  test('half a minute of answers comes from one request, then it asks again', async () => {
    let wait = 5;
    const svc = fakeService(() => answer([stall({ waitMin: wait })]));
    await ask(svc.fetchImpl);
    wait = 9;
    const cached = await ask(svc.fetchImpl, T0 + STALLS_TTL_MS - 1);
    assert.equal(cached.stalls[0]!.waitMin, 5);
    assert.equal(svc.asked.length, 1);
    const fresh = await ask(svc.fetchImpl, T0 + STALLS_TTL_MS);
    assert.equal(fresh.stalls[0]!.waitMin, 9);
    assert.equal(svc.asked.length, 2);
  });

  test('screens opening at the same moment share one request, failing or not', async () => {
    const ok = fakeService(() => answer([stall()]));
    const all = await Promise.all(Array.from({ length: 5 }, () => ask(ok.fetchImpl)));
    assert.equal(ok.asked.length, 1);
    assert.ok(all.every((r) => r.provenance === 'live'));

    __resetStalls();
    const down = fakeService(() => new Error('connect ECONNREFUSED'));
    const failed = await Promise.all(Array.from({ length: 5 }, () => ask(down.fetchImpl)));
    assert.equal(down.asked.length, 1);
    assert.ok(failed.every((r) => r.provenance === 'stale' && r.stalls.length === 0));
  });

  test('when สั่งก่อน does not answer, the last figures are served and called stale', async () => {
    let down = false;
    const svc = fakeService(() => (down ? new Error('connect ECONNREFUSED') : answer([stall()])));
    await ask(svc.fetchImpl);
    down = true;
    const r = await ask(svc.fetchImpl, T0 + STALLS_TTL_MS);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.observedAt, new Date(T0).toISOString(), 'when the figures are from, said plainly');
    assert.equal(r.stalls.length, 1);
  });

  test('figures more than a few minutes old are not served at all', async () => {
    let down = false;
    const svc = fakeService(() => (down ? new Error('timed out') : answer([stall()])));
    await ask(svc.fetchImpl);
    down = true;
    const r = await ask(svc.fetchImpl, T0 + STALE_MAX_MS);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.observedAt, null);
    assert.deepEqual(r.stalls, [], 'a wait from an hour ago says nothing about now');
  });

  test('with nothing known and the service down, the answer is no stalls - never invented ones', async () => {
    const svc = fakeService(() => new Error('timed out'));
    const r = await ask(svc.fetchImpl);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.observedAt, null);
    assert.deepEqual(r.stalls, []);
    // And it does not hammer a service that is down: the next quarter minute answers from memory.
    await ask(svc.fetchImpl, T0 + 1000);
    assert.equal(svc.asked.length, 1);
  });

  test('after the quarter minute it asks again, and a service that is back is live again', async () => {
    let down = true;
    const svc = fakeService(() => (down ? new Error('timed out') : answer([stall()])));
    await ask(svc.fetchImpl);
    down = false;
    assert.equal((await ask(svc.fetchImpl, T0 + RETRY_AFTER_MS - 1)).provenance, 'stale');
    const back = await ask(svc.fetchImpl, T0 + RETRY_AFTER_MS);
    assert.equal(back.provenance, 'live');
    assert.equal(back.stalls.length, 1);
    assert.equal(svc.asked.length, 2);
  });

  test('an error status, an answer that is not JSON and one that is not a shop list are all failures', async () => {
    for (const reply of [
      () => new Response('busy', { status: 503 }),
      () => new Response('<html>maintenance</html>', { status: 200 }),
      () => ({ ok: false, error: 'down' }),
    ]) {
      __resetStalls();
      const r = await ask(fakeService(reply).fetchImpl);
      assert.equal(r.provenance, 'stale');
      assert.deepEqual(r.stalls, []);
    }
  });

  test('an answer that changed shape keeps the last good figures instead of erasing them', async () => {
    let reply: unknown = answer([stall()]);
    const svc = fakeService(() => reply);
    await ask(svc.fetchImpl);
    reply = answer([{ slug: 'demo', title: 'renamed field' }]);
    const r = await ask(svc.fetchImpl, T0 + STALLS_TTL_MS);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.stalls.length, 1, 'the stall read a moment ago is still there');
    reply = { ok: true, data: { shops: 'not a list' } };
    const again = await ask(svc.fetchImpl, T0 + STALLS_TTL_MS + RETRY_AFTER_MS);
    assert.equal(again.stalls.length, 1);
  });

  test('a stall the service no longer has is an answer: live, and none listed', async () => {
    const svc = fakeService(() => ({ ok: true, data: { shops: [], missing: ['demo'], now: T0 } }));
    const r = await ask(svc.fetchImpl);
    assert.equal(r.provenance, 'live');
    assert.deepEqual(r.stalls, []);
  });

  test('an answer bigger than any real one is refused, not read', async () => {
    const huge = JSON.stringify(answer(Array.from({ length: 2000 }, () => stall({ name: 'ก'.repeat(40) }))));
    assert.ok(huge.length > 64 * 1024);
    const r = await ask(fakeService(() => new Response(huge, { status: 200 })).fetchImpl);
    assert.equal(r.provenance, 'stale');
    assert.deepEqual(r.stalls, []);
  });

  test('a service that never answers is given up on, not waited for', async () => {
    const hanging = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as typeof fetch;
    const r = await getStalls('rmutt-canteen', { now: T0, base: BASE, fetchImpl: hanging, timeoutMs: 20 });
    assert.equal(r.provenance, 'stale');
  });

  test('an answer that stops halfway is given up on too: the timeout covers reading it', { timeout: 5000 }, async () => {
    const stalled = ((_url: string | URL | Request, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(ctl) {
          ctl.enqueue(new TextEncoder().encode('{"ok":true,"data":{"shops":['));
          init?.signal?.addEventListener('abort', () => ctl.error(new Error('aborted')));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    }) as typeof fetch;
    const r = await getStalls('rmutt-canteen', { now: T0, base: BASE, fetchImpl: stalled, timeoutMs: 20 });
    assert.equal(r.provenance, 'stale');
  });

  test('a setting that is not a service to call turns the stalls off, quietly and without throwing', async () => {
    const svc = fakeService(() => answer([stall()]));
    for (const base of ['', 'sangkon.fly.dev', 'http://sangkon.fly.dev', 'https://user:pw@sangkon.fly.dev', 'javascript:alert(1)']) {
      const r = await getStalls('rmutt-canteen', { now: T0, base, fetchImpl: svc.fetchImpl });
      assert.equal(r.provenance, 'stale', base);
      assert.deepEqual(r.stalls, []);
    }
    assert.equal(svc.asked.length, 0);
  });
});

describe('sangkonBase', () => {
  test('https, or http on this machine, without the trailing slash', () => {
    assert.equal(sangkonBase('https://sangkon.fly.dev/'), 'https://sangkon.fly.dev');
    assert.equal(sangkonBase(' https://Example.org/sangkon/ '), 'https://example.org/sangkon');
    assert.equal(sangkonBase('http://localhost:8793'), 'http://localhost:8793');
    for (const bad of ['', 'sangkon.fly.dev', 'http://sangkon.fly.dev', 'https://a:b@sangkon.fly.dev', 'https://sangkon.fly.dev/?x=1', 'ftp://sangkon.fly.dev']) {
      assert.equal(sangkonBase(bad), null, bad);
    }
  });

  test('every base it allows makes order links the app will open', () => {
    for (const raw of ['https://sangkon.fly.dev', 'https://example.org/sangkon/', 'http://127.0.0.1:8793']) {
      assert.ok(isOrderLink(`${sangkonBase(raw)}/s/demo`), raw);
    }
  });
});

describe('GET /places/:id/stalls', () => {
  let key = '';
  let app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> };
  const realFetch = globalThis.fetch;

  before(async () => {
    const server = await import('./server.ts');
    app = server.app;
    const p = SEED_PLACES.find((x) => x.id === 'rmutt-canteen')!;
    const safety = SAFETY_PHRASES[p.id]!;
    server.db.prepare(`
      INSERT INTO places (id, name_en, name_th, short, layer, province, lat, lng, meta,
        blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
        crowd_density, aqi, safety_index, walkability, air_station)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      p.id, p.name.en, p.name.th, p.short, p.layer, p.province, p.lat, p.lng, p.meta,
      p.blurb.en, p.blurb.th, JSON.stringify(p.tags), safety.en, safety.th,
      p.metrics.crowdDensity, p.metrics.aqi, p.metrics.safetyIndex, p.metrics.walkability, null,
    );
    const reg = await (await app.request('/devices', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'stalls' }),
    })).json() as { data: { deviceKey: string } };
    key = reg.data.deviceKey;
  });

  test('answers the food court\'s stalls to a registered device', async () => {
    __resetStalls();
    globalThis.fetch = (async () => new Response(JSON.stringify(answer([stall({ waitMin: 6 })])), { status: 200 })) as typeof fetch;
    try {
      const res = await app.request('/places/rmutt-canteen/stalls', { headers: { 'x-chivago-device-key': key } });
      assert.equal(res.status, 200);
      const body = await res.json() as { data: { provider: string; provenance: string; stalls: { waitMin: number; orderUrl: string }[] } };
      assert.equal(body.data.provider, 'sangkon');
      assert.equal(body.data.provenance, 'live');
      assert.equal(body.data.stalls[0]!.waitMin, 6);
      assert.ok(isOrderLink(body.data.stalls[0]!.orderUrl));
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('a device the server does not know is refused, like every place route after it', async () => {
    const res = await app.request('/places/rmutt-canteen/stalls');
    assert.equal(res.status, 401);
  });

  test('an unknown place is a 404', async () => {
    const res = await app.request('/places/no-such-place/stalls', { headers: { 'x-chivago-device-key': key } });
    assert.equal(res.status, 404);
  });
});
