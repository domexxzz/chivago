import { strict as assert } from 'node:assert';
import { test, describe, beforeEach, afterEach } from 'node:test';
import React from 'react';

import { control, resetControl } from './stubs/native.mjs';
import { mount, server, settle } from './interact.ts';
import { progress, quest } from './fixtures.ts';
import { __setCachedKeyForTests } from '../src/api/account.ts';
import { sendFixes } from '../src/location/background.ts';
import { useSos } from '../src/state/store.tsx';
import { QuestDetailScreen } from '../src/screens/QuestDetail.tsx';

/**
 * Three bugs a deep read found in the safety and quest loops, each pinned by
 * a test that fails on the code as it was.
 *
 * All three are the same shape: something that runs from an effect or a
 * background task believed a value that was not true - a callback that was
 * a new function every render, an alert object that was new on every poll,
 * a request that carried no credential. None showed in a render test,
 * because a render test hands a screen its props once and never re-renders
 * the parent.
 */

const h = React.createElement;
const noop = () => {};

beforeEach(() => { resetControl(); __setCachedKeyForTests(null); });
afterEach(() => { __setCachedKeyForTests(null); });

describe('a finished quest tells the app ONCE that points moved', () => {
  /**
   * The parent as App really is: `onPointsChanged` is a new arrow function on
   * every render, and calling it re-renders the parent. Keyed on the callback,
   * the effect in QuestDetail fired on every render it had itself caused.
   */
  function Parent({ onCount }: { onCount: (n: number) => void }) {
    const [count, setCount] = React.useState(0);
    React.useEffect(() => { onCount(count); }, [count, onCount]);
    return h(QuestDetailScreen, {
      questId: 'q1',
      onBack: noop,
      onOpenWallet: noop,
      onToast: noop,
      onPointsChanged: () => setCount((c) => c + 1),
    });
  }

  test('with a parent that re-renders on the callback, it is called exactly once', async () => {
    const net = server({
      'GET /quests/q1': { quest: quest({ id: 'q1' }), progress: progress({ stage: 'complete' }) },
    });
    let seen = 0;
    try {
      const ui = mount(h(Parent, { onCount: (n: number) => { seen = n; } }));
      await settle();
      await settle();
      await settle();
      ui.unmount();
    } finally { net.restore(); }
    assert.equal(seen, 1, 'the effect re-fired on every render the callback caused');
  });

  test('a quest that is not finished does not report a change at all', async () => {
    const net = server({
      'GET /quests/q1': { quest: quest({ id: 'q1' }), progress: progress({ stage: 'arrived' }) },
    });
    let seen = 0;
    try {
      const ui = mount(h(Parent, { onCount: (n: number) => { seen = n; } }));
      await settle();
      await settle();
      ui.unmount();
    } finally { net.restore(); }
    assert.equal(seen, 0);
  });
});

describe('the position stream during a live alert', () => {
  const liveAlert = {
    id: 'a1', status: 'dispatching', lat: 9.5357, lng: 100.0617, locationLabel: 'Chaweng',
    firedAt: '2026-09-01T10:00:00.000Z', nearestHospital: 'Bangkok Hospital Samui',
    contactsReached: 0, contactsTotal: 0, interpreterJoining: false,
    shareUrl: 'http://x/sos/live/t', acknowledgedAt: null, acknowledgedBy: null,
    lastPositionAt: null, note: null, dispatches: [],
  };

  /** A component that only exists to run the hook. */
  function Probe() { useSos(noop); return null; }

  /**
   * A network that answers on the NEXT macrotask, not the same one. The bug
   * was a loop driven by the poll's own reply, so a fetch that resolved
   * synchronously would either hide it or hang the test. One macrotask per
   * reply makes each turn of the loop cost one `settle()`, and the count
   * after a few settles says whether there was a loop at all.
   */
  function slowNet() {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input);
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${path}`);
      await new Promise((r) => setTimeout(r, 0));
      const data = path === '/sos' ? { ...liveAlert } : { recorded: 1, duplicates: 0 };
      return { ok: true, status: 200, json: async () => ({ ok: true, data }) } as Response;
    }) as typeof fetch;
    return { calls, restore: () => { globalThis.fetch = original; } };
  }

  test('posts one fix on going live, then waits for the interval - it does not chase its own poll', async () => {
    control.permission = { granted: true, status: 'granted' };
    // A real fix carries the time it was taken; the stub's default does not,
    // and `new Date(undefined)` cannot be serialised, which the stream would
    // swallow as "a missed update" and post nothing at all.
    control.position = { ...control.position, timestamp: Date.now() } as typeof control.position;
    const net = slowNet();
    try {
      const ui = mount(h(Probe));
      // Enough turns for the old loop to have posted several times: each
      // turn of it cost two replies, and there are eight here.
      for (let i = 0; i < 8; i += 1) await settle();
      ui.unmount();
    } finally { net.restore(); }
    const posts = net.calls.filter((c) => c === 'POST /sos/position').length;
    assert.equal(posts, 1, `expected one fix before the 20 s interval, saw ${posts}: ${net.calls.join(', ')}`);
  });
});

describe('fixes sent during an emergency carry the device key', () => {
  test('the header the server actually checks is on the request', async () => {
    __setCachedKeyForTests('chvg_dev_test-key');
    let headers: Record<string, string> | undefined;
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      headers = init?.headers as Record<string, string>;
      return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) } as Response;
    }) as typeof fetch;
    try {
      const sent = await sendFixes('u_1', [{ lat: 9.5, lng: 100.0, accuracyM: 20, recordedAt: '2026-09-01T10:00:00.000Z' }]);
      assert.equal(sent, true);
    } finally { globalThis.fetch = original; }
    assert.ok(headers, 'nothing was sent');
    assert.equal(headers!['x-chivago-device-key'], 'chvg_dev_test-key',
      'without the key every fix during an emergency is refused with 401');
    assert.equal(headers!['x-chivago-user'], 'u_1');
  });

  test('a phone with no key still sends, so an unregistered pilot phone is not silenced', async () => {
    let headers: Record<string, string> | undefined;
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      headers = init?.headers as Record<string, string>;
      return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) } as Response;
    }) as typeof fetch;
    try {
      await sendFixes('demo-user', [{ lat: 9.5, lng: 100.0, accuracyM: 20, recordedAt: '2026-09-01T10:00:00.000Z' }]);
    } finally { globalThis.fetch = original; }
    assert.ok(headers);
    assert.equal('x-chivago-device-key' in headers!, false);
  });
});
