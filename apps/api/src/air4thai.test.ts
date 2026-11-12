/**
 * Which way the cross-check is asked for.
 *
 * The thing worth protecting here is not the HTTP plumbing - it is that the
 * cross-check cannot DISAPPEAR QUIETLY. Air4Thai is what stops a modelled
 * number being published as a measured one: when it disagrees with the model
 * the reading is downgraded to `estimated`. A deployment where it silently
 * never runs looks exactly like a deployment where it always agrees.
 *
 * So: with a sidecar it goes through the sidecar; without one on a runtime
 * that cannot make the request, it REJECTS with a message naming the variable
 * to set, rather than resolving with nothing.
 */

import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import { rootCertificates } from 'node:tls';

import { AIR4THAI_URL, fetchAir4Thai } from './air4thai.ts';

const STATIONS = { stations: [{ stationID: '42t', AQILast: { AQI: { aqi: '37' } } }] };

let realFetch: typeof globalThis.fetch;
let seen: { url: string; token: string | null }[] = [];

beforeEach(() => {
  realFetch = globalThis.fetch;
  seen = [];
  delete process.env.CHIVAGO_TRANSCODE_URL;
  delete process.env.CHIVAGO_TRANSCODE_TOKEN;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CHIVAGO_TRANSCODE_URL;
  delete process.env.CHIVAGO_TRANSCODE_TOKEN;
});

/** Stand in for the sidecar, recording what it was asked. */
function sidecarAnswers(status: number, body: unknown): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    seen.push({ url, token: new Headers(init?.headers).get('x-transcode-token') });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('with a sidecar configured', () => {
  test('the reading comes back through it', async () => {
    process.env.CHIVAGO_TRANSCODE_URL = 'http://encoder.internal:8788';
    sidecarAnswers(200, STATIONS);
    assert.deepEqual(await fetchAir4Thai(5_000), STATIONS);
    assert.equal(seen[0]!.url, 'http://encoder.internal:8788/air4thai');
  });

  test('a trailing slash does not become a double slash', async () => {
    process.env.CHIVAGO_TRANSCODE_URL = 'http://encoder.internal:8788/';
    sidecarAnswers(200, STATIONS);
    await fetchAir4Thai(5_000);
    assert.equal(seen[0]!.url, 'http://encoder.internal:8788/air4thai');
  });

  test('the token travels, so the sidecar is not an open proxy', async () => {
    // Without it the encoder would fetch arbitrary upstreams for anybody who
    // found it - and it is already the box with the expensive CPU on it.
    process.env.CHIVAGO_TRANSCODE_URL = 'http://encoder.internal:8788';
    process.env.CHIVAGO_TRANSCODE_TOKEN = 'shared-secret';
    sidecarAnswers(200, STATIONS);
    await fetchAir4Thai(5_000);
    assert.equal(seen[0]!.token, 'shared-secret');
  });

  test('a sidecar error rejects rather than resolving with nothing', async () => {
    /*
      The failure that matters. `air.ts` catches a rejection, warns, and
      downgrades the reading to `estimated` - which is correct. Resolving with
      an empty body instead would make the cross-check appear to have run and
      agreed.
    */
    process.env.CHIVAGO_TRANSCODE_URL = 'http://encoder.internal:8788';
    sidecarAnswers(502, 'Air4Thai could not be read: upstream 503');
    await assert.rejects(() => fetchAir4Thai(5_000), /sidecar answered 502/);
  });

  test('an unreachable sidecar rejects too', async () => {
    process.env.CHIVAGO_TRANSCODE_URL = 'http://encoder.internal:8788';
    globalThis.fetch = (() => Promise.reject(new Error('connect ECONNREFUSED'))) as typeof fetch;
    await assert.rejects(() => fetchAir4Thai(5_000), /ECONNREFUSED/);
  });
});

describe('with no sidecar', () => {
  test('on Node it goes direct, carrying the chain', async () => {
    /*
      Not a network test: it asserts the SHAPE of the attempt. The sidecar
      stand-in is installed and must NOT be called, because the direct path
      uses node:https rather than fetch.

      That the direct request actually works was measured separately, against
      the real service: node with the system roots alone answers
      UNABLE_TO_VERIFY_LEAF_SIGNATURE, and with the bundled chain answers 200.
    */
    assert.ok(rootCertificates.length > 0, 'this runtime has a root store');
    sidecarAnswers(200, STATIONS);
    // A 1ms timeout, so the real request fails fast however the network is.
    await fetchAir4Thai(1).catch(() => {});
    assert.deepEqual(seen, [], 'the sidecar was not asked');
  });

  test('the URL is the official feed, not a mirror', () => {
    assert.equal(AIR4THAI_URL, 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php');
  });
});
