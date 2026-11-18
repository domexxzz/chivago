import { strict as assert } from 'node:assert';
import { before, beforeEach, describe, test } from 'node:test';
import { SAFETY_PHRASES, SEED_PLACES, isCourtStatusLink } from '@chivago/core';
import {
  COURTS_TTL_MS, RETRY_AFTER_MS, STALE_MAX_MS, __resetCourts, courtsBase, getCourts,
} from './courts.ts';

/**
 * How many courts are free at แบดมินตัน@สินธานี, as its own booking system
 * reports them (courts.ts).
 *
 * Route-level coverage uses its own process and never opens the pilot DB, and
 * the real booking system is never called: `fetch` is a stand-in that counts.
 */
delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const BASE = 'https://booking.example';
const T0 = Date.parse('2026-10-24T18:30:00+07:00');

const answer = (over: Record<string, unknown> = {}, courts: Record<string, unknown> = {}) => ({
  ok: true,
  data: {
    courts: { total: 4, free: 2, busy: 2, ...courts },
    openNow: true, nextOpenAt: null, observedAt: T0, ...over,
  },
});

/** A fake booking system: answers what it is told, or fails, and counts the asks. */
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

const ask = (fetchImpl: typeof fetch, now = T0) => getCourts('sinthani-badminton', { now, base: BASE, fetchImpl });

describe('getCourts', () => {
  beforeEach(() => __resetCourts());

  test('the court count comes live from the venue\'s own booking system', async () => {
    const svc = fakeService(() => answer());
    const r = await ask(svc.fetchImpl);
    assert.equal(svc.asked[0], `${BASE}/api/court-status`);
    assert.equal(svc.inits[0]?.redirect, 'manual', 'a redirect is not followed to another host (and never as error, which workerd refuses)');
    assert.equal(r.provider, 'badminton-booking');
    assert.equal(r.provenance, 'live');
    assert.equal(r.observedAt, new Date(T0).toISOString());
    assert.deepEqual(r.count, { total: 4, free: 2, openNow: true, opensAt: null });
  });

  test('a place without a court service asks nobody', async () => {
    const svc = fakeService(() => answer());
    for (const id of ['chaweng', 'rmutt-canteen', 'constructor', '__proto__']) {
      const r = await getCourts(id, { now: T0, base: BASE, fetchImpl: svc.fetchImpl });
      assert.equal(r.provider, null, id);
      assert.equal(r.count, null);
    }
    assert.equal(svc.asked.length, 0);
  });

  test('half a minute of answers comes from one request, then it asks again', async () => {
    let free = 2;
    const svc = fakeService(() => answer({}, { free }));
    await ask(svc.fetchImpl);
    free = 1;
    const cached = await ask(svc.fetchImpl, T0 + COURTS_TTL_MS - 1);
    assert.equal(cached.count?.free, 2);
    assert.equal(svc.asked.length, 1);
    const fresh = await ask(svc.fetchImpl, T0 + COURTS_TTL_MS);
    assert.equal(fresh.count?.free, 1);
    assert.equal(svc.asked.length, 2);
  });

  test('screens opening at the same moment share one request, failing or not', async () => {
    const good = fakeService(() => answer());
    const all = await Promise.all(Array.from({ length: 5 }, () => ask(good.fetchImpl)));
    assert.equal(good.asked.length, 1);
    assert.ok(all.every((r) => r.provenance === 'live'));

    __resetCourts();
    const down = fakeService(() => new Error('connect ECONNREFUSED'));
    const failed = await Promise.all(Array.from({ length: 5 }, () => ask(down.fetchImpl)));
    assert.equal(down.asked.length, 1);
    assert.ok(failed.every((r) => r.provenance === 'stale' && r.count === null));
  });

  test('when the booking system does not answer, the last figures are served and called stale', async () => {
    let down = false;
    const svc = fakeService(() => (down ? new Error('connect ECONNREFUSED') : answer()));
    await ask(svc.fetchImpl);
    down = true;
    const r = await ask(svc.fetchImpl, T0 + COURTS_TTL_MS);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.observedAt, new Date(T0).toISOString(), 'when the figures are from, said plainly');
    assert.equal(r.count?.free, 2);
  });

  test('figures more than a few minutes old are not served at all', async () => {
    let down = false;
    const svc = fakeService(() => (down ? new Error('timed out') : answer()));
    await ask(svc.fetchImpl);
    down = true;
    const r = await ask(svc.fetchImpl, T0 + STALE_MAX_MS);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.observedAt, null);
    assert.equal(r.count, null, 'a count from an hour ago says nothing about now');
  });

  test('with nothing known and the service down, the answer is no count - never a confident zero', async () => {
    const svc = fakeService(() => new Error('timed out'));
    const r = await ask(svc.fetchImpl);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.observedAt, null);
    assert.equal(r.count, null, 'not { free: 0 }, which would read as "the venue is full"');
    // And it does not hammer a service that is down: the next quarter minute answers from memory.
    await ask(svc.fetchImpl, T0 + 1000);
    assert.equal(svc.asked.length, 1);
  });

  test('after the quarter minute it asks again, and a service that is back is live again', async () => {
    let down = true;
    const svc = fakeService(() => (down ? new Error('timed out') : answer()));
    await ask(svc.fetchImpl);
    down = false;
    assert.equal((await ask(svc.fetchImpl, T0 + RETRY_AFTER_MS - 1)).provenance, 'stale');
    const back = await ask(svc.fetchImpl, T0 + RETRY_AFTER_MS);
    assert.equal(back.provenance, 'live');
    assert.equal(back.count?.free, 2);
    assert.equal(svc.asked.length, 2);
  });

  test('an error status, an answer that is not JSON and one that is not a count are all failures', async () => {
    for (const reply of [
      () => new Response('waking up', { status: 503 }),
      () => new Response('<html>Render is starting</html>', { status: 200 }),
      () => ({ ok: false, error: 'court status could not be read' }),
    ]) {
      __resetCourts();
      const r = await ask(fakeService(reply).fetchImpl);
      assert.equal(r.provenance, 'stale');
      assert.equal(r.count, null);
    }
  });

  test('the service\'s own 503 does not become a zero on anybody\'s screen', async () => {
    const svc = fakeService(() => new Response(JSON.stringify({ ok: false, error: 'unreadable' }), { status: 503 }));
    const r = await ask(svc.fetchImpl);
    assert.equal(r.count, null);
  });

  test('an answer that changed shape keeps the last good figures instead of erasing them', async () => {
    let reply: unknown = answer();
    const svc = fakeService(() => reply);
    await ask(svc.fetchImpl);
    reply = { ok: true, data: { courts: { available: 3 }, openNow: true } };
    const r = await ask(svc.fetchImpl, T0 + COURTS_TTL_MS);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.count?.free, 2, 'the count read a moment ago is still there');
    // A count that does not add up is the same kind of failure, not a clamped figure.
    reply = answer({}, { free: 9, total: 4 });
    const again = await ask(svc.fetchImpl, T0 + COURTS_TTL_MS + RETRY_AFTER_MS);
    assert.equal(again.count?.free, 2);
  });

  test('a full venue is a live answer: nought free, and said so', async () => {
    const r = await ask(fakeService(() => answer({}, { free: 0 })).fetchImpl);
    assert.equal(r.provenance, 'live');
    assert.deepEqual(r.count, { total: 4, free: 0, openNow: true, opensAt: null });
  });

  test('a shut venue carries when it opens again', async () => {
    const opens = T0 + 10 * 3_600_000;
    const r = await ask(fakeService(() => answer({ openNow: false, nextOpenAt: opens }, { free: 4 })).fetchImpl);
    assert.equal(r.count?.openNow, false);
    assert.equal(r.count?.opensAt, new Date(opens).toISOString());
  });

  test('an answer bigger than any real one is refused, not read', async () => {
    const huge = JSON.stringify({ ok: true, data: { courts: { total: 4, free: 2 }, openNow: true, pad: 'x'.repeat(9000) } });
    assert.ok(huge.length > 8 * 1024);
    const r = await ask(fakeService(() => new Response(huge, { status: 200 })).fetchImpl);
    assert.equal(r.provenance, 'stale');
    assert.equal(r.count, null);
  });

  test('a service that never answers is given up on, not waited for', async () => {
    const hanging = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as typeof fetch;
    const r = await getCourts('sinthani-badminton', { now: T0, base: BASE, fetchImpl: hanging, timeoutMs: 20 });
    assert.equal(r.provenance, 'stale');
    assert.equal(r.count, null);
  });

  test('an answer that stops halfway is given up on too: the timeout covers reading it', { timeout: 5000 }, async () => {
    const stalled = ((_url: string | URL | Request, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(ctl) {
          ctl.enqueue(new TextEncoder().encode('{"ok":true,"data":{"courts":'));
          init?.signal?.addEventListener('abort', () => ctl.error(new Error('aborted')));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    }) as typeof fetch;
    const r = await getCourts('sinthani-badminton', { now: T0, base: BASE, fetchImpl: stalled, timeoutMs: 20 });
    assert.equal(r.provenance, 'stale');
  });

  test('a setting that is not a service to call turns the counts off, quietly and without throwing', async () => {
    const svc = fakeService(() => answer());
    for (const base of ['', 'booking.example', 'http://booking.example', 'https://user:pw@booking.example', 'javascript:alert(1)']) {
      const r = await getCourts('sinthani-badminton', { now: T0, base, fetchImpl: svc.fetchImpl });
      assert.equal(r.provenance, 'stale', base);
      assert.equal(r.count, null);
    }
    assert.equal(svc.asked.length, 0);
  });
});

describe('courtsBase', () => {
  test('https, or http on this machine, without the trailing slash', () => {
    assert.equal(courtsBase('https://badminton-booking-ihw1.onrender.com/'), 'https://badminton-booking-ihw1.onrender.com');
    assert.equal(courtsBase(' https://Example.org/booking/ '), 'https://example.org/booking');
    assert.equal(courtsBase('http://localhost:3000'), 'http://localhost:3000');
    for (const bad of [
      '', 'booking.example', 'http://booking.example', 'https://a:b@booking.example',
      'https://booking.example/?x=1', 'https://booking.example/#x', 'ftp://booking.example',
    ]) {
      assert.equal(courtsBase(bad), null, bad);
    }
  });

  test('every base it allows makes a status route the app will ask for', () => {
    for (const raw of ['https://badminton-booking-ihw1.onrender.com', 'https://example.org/booking/', 'http://127.0.0.1:3000']) {
      assert.ok(isCourtStatusLink(`${courtsBase(raw)}/api/court-status`), raw);
    }
  });
});

describe('GET /places/:id/courts', () => {
  let key = '';
  let app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> };
  const realFetch = globalThis.fetch;

  before(async () => {
    const server = await import('./server-node.ts');
    app = server.app;
    const p = SEED_PLACES.find((x) => x.id === 'sinthani-badminton')!;
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
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'courts' }),
    })).json() as { data: { deviceKey: string } };
    key = reg.data.deviceKey;
  });

  test('answers the venue\'s court count to a registered device', async () => {
    __resetCourts();
    globalThis.fetch = (async () => new Response(JSON.stringify(answer({}, { free: 3 })), { status: 200 })) as typeof fetch;
    try {
      const res = await app.request('/places/sinthani-badminton/courts', { headers: { 'x-chivago-device-key': key } });
      assert.equal(res.status, 200);
      const body = await res.json() as { data: { provider: string; provenance: string; count: { free: number; total: number } } };
      assert.equal(body.data.provider, 'badminton-booking');
      assert.equal(body.data.provenance, 'live');
      assert.equal(body.data.count.free, 3);
      assert.equal(body.data.count.total, 4);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('a device the server does not know is refused, like every place route after it', async () => {
    const res = await app.request('/places/sinthani-badminton/courts');
    assert.equal(res.status, 401);
  });

  test('an unknown place is a 404', async () => {
    const res = await app.request('/places/no-such-place/courts', { headers: { 'x-chivago-device-key': key } });
    assert.equal(res.status, 404);
  });
});
