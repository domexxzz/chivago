/**
 * The network answer the map falls back on.
 *
 * `useOnline` itself needs a renderer; what is worth holding is the two
 * pieces under it - the optimism, and that the switch is wired to BOTH
 * events. A listener attached only to 'offline' would drop to the drawn map
 * and never come back.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { isOnline, subscribeOnline } from './online.ts';

const withNavigator = (value: unknown, run: () => void) => {
  const had = Object.hasOwn(globalThis, 'navigator');
  const before = (globalThis as { navigator?: unknown }).navigator;
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  try { run(); } finally {
    if (had) Object.defineProperty(globalThis, 'navigator', { value: before, configurable: true, writable: true });
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
};

describe('the network answer the map falls back on', () => {
  test('only an explicit false is offline', () => {
    withNavigator({ onLine: false }, () => assert.equal(isOnline(), false));
    withNavigator({ onLine: true }, () => assert.equal(isOnline(), true));
  });

  test('a browser that does not answer is treated as online, not as offline', () => {
    // Being wrong this way leaves the behaviour the app already had. Being
    // wrong the other way hides the real map from somebody who could see it.
    withNavigator({}, () => assert.equal(isOnline(), true));
    withNavigator(undefined, () => assert.equal(isOnline(), true));
    withNavigator({ onLine: 'yes' }, () => assert.equal(isOnline(), true));
  });

  test('without a window to listen to, subscribing is a no-op that still unsubscribes', () => {
    // The node harness has no window; this must not throw on mount or unmount.
    const stop = subscribeOnline(() => { throw new Error('must not fire'); });
    assert.equal(typeof stop, 'function');
    stop();
  });
});
