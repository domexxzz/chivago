/**
 * `POST /integrations/sentiara/incident`, over HTTP.
 *
 * `camera-incident-service.test.ts` proves what an incident does to a
 * database. This proves the part that is only true through the route, and the
 * part Sentiara's outbox actually reads: THE STATUS CODES ARE THE CONTRACT.
 * Their sender treats 2xx and 409 as delivered, retries 5xx/408/429 for 24
 * hours and drops anything else as refused (answer 4 in
 * docs/sentiara-integration-questions.md), so a 400 where we meant 409 throws
 * an incident away and a 404 where we meant 503 throws away a day of them.
 *
 * The app is imported, not spawned - `server-node.ts` only listens when it is
 * the entry point, so `app.request()` drives the real chain.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

/** Its own database, set before server-node.ts is imported and opens one. */
process.env.CHIVAGO_DB = ':memory:';
/** 24 characters, the floor `incident-signature.ts` treats as armed. */
process.env.CHIVAGO_SENTIARA_SECRET = 'incident-secret-for-tests';

const { app } = await import('./server-node.ts');
const { signatureFor, unixSeconds } = await import('./incident-signature.ts');

const PATH = '/integrations/sentiara/incident';
const SECRET = process.env.CHIVAGO_SENTIARA_SECRET!;

/** Post a body signed the way their sender signs it. */
function post(body: string, opts: { secret?: string; timestamp?: string } = {}) {
  const timestamp = opts.timestamp ?? String(unixSeconds());
  return app.request(PATH, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sentiara-timestamp': timestamp,
      'x-sentiara-signature': signatureFor(opts.secret ?? SECRET, timestamp, body),
    },
    body,
  });
}

let serial = 0;
/** A distinct incident each call, so one test cannot collide with another. */
const incident = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    incidentId: `sen-routetest${String(serial += 1).padStart(12, '0')}`,
    source: 'sentiara',
    kind: 'test',
    observedAt: new Date().toISOString(),
    camera: { id: 'pier_01', owner: 'เทศบาล', lat: 13.15, lng: 100.81 },
    confidence: 0.8,
    description: 'กล้อง pier_01 ส่งเหตุทดสอบ',
    evidence: [],
    ...over,
  });

describe('POST /integrations/sentiara/incident', () => {
  test('accepts a signed test incident and claims nothing more', async () => {
    const res = await post(incident());

    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.reviewState, 'unreviewed');
    assert.equal(data.mergedInto, null);
    // The first thing their deployment can actually prove is a `kind=test`
    // with no evidence, because the proxy that makes their links reachable
    // does not exist yet (answer 8). The reply says so rather than implying
    // a picture is on file.
    assert.equal(data.evidence, 'none');
  });

  test('refuses an unsigned request, and says nothing about why', async () => {
    const res = await app.request(PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: incident(),
    });

    assert.equal(res.status, 401);
    const failure = await res.json();
    assert.equal(failure.code, 'UNAUTHORIZED');
    // Telling an unauthenticated caller that the secret was right and only the
    // clock was wrong is a free oracle. The reason goes to the log.
    assert.doesNotMatch(JSON.stringify(failure), /timestamp|signature|secret|clock/i);
  });

  test('refuses a signature made with another secret', async () => {
    const res = await post(incident(), { secret: 'a-different-secret-entirely' });
    assert.equal(res.status, 401);
  });

  test('refuses a replay from outside the five-minute window', async () => {
    const body = incident();
    const stale = String(unixSeconds() - 601);
    const res = await post(body, { timestamp: stale });
    assert.equal(res.status, 401);
  });

  test('refuses a body edited after it was signed', async () => {
    const body = incident();
    const timestamp = String(unixSeconds());
    const res = await app.request(PATH, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sentiara-timestamp': timestamp,
        // Signed over the original, sent with a different kind.
        'x-sentiara-signature': signatureFor(SECRET, timestamp, body),
      },
      body: body.replace('"kind":"test"', '"kind":"fire"'),
    });
    assert.equal(res.status, 401);
  });

  test('answers 409 for an incident it already holds', async () => {
    const body = incident();
    assert.equal((await post(body)).status, 200);

    const again = await post(body);
    // 409 is the one non-2xx their outbox reads as delivered. Any other 4xx
    // here would have it retry for 24 hours and then give up.
    assert.equal(again.status, 409);
    assert.equal((await again.json()).code, 'INCIDENT_ALREADY_STORED');
  });

  test('answers 422 for a detection ChivarGo will not hold', async () => {
    const res = await post(incident({ kind: 'license_plate' }));
    assert.equal(res.status, 422);
    assert.equal((await res.json()).code, 'FORBIDDEN_INCIDENT_KIND');
  });

  test('answers 400 for a body that is not JSON', async () => {
    const res = await post('not json at all');
    assert.equal(res.status, 400);
  });

  test('answers 400 for a payload that would be just as wrong next time', async () => {
    const res = await post(incident({ observedAt: 'yesterday' }));
    assert.equal(res.status, 400);
  });

  test('folds a second report on the same camera into the open one', async () => {
    const first = await post(incident({ kind: 'vehicle_obstruction' }));
    const firstId = (await first.json()).data.incidentId;

    const second = await post(incident({ kind: 'vehicle_obstruction' }));
    assert.equal(second.status, 200);
    assert.equal((await second.json()).data.mergedInto, firstId);
  });

  test('is not announced by its own refusal when unarmed', async () => {
    const armed = process.env.CHIVAGO_SENTIARA_SECRET;
    delete process.env.CHIVAGO_SENTIARA_SECRET;
    try {
      const res = await post(incident(), { secret: 'does-not-matter-either-way' });
      // A distinctive refusal says "this route exists and is switched off".
      // Falling through to the ordinary not-found says nothing at all, which
      // is what /admin/import does and for the same reason.
      assert.equal(res.status, 404);
    } finally {
      process.env.CHIVAGO_SENTIARA_SECRET = armed;
    }
  });
});
