import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { ensureLocationEmitterPolyfill } from '../src/polyfills/location-emitter.ts';
import * as Location from 'expo-location';

describe('LocationEventEmitter web polyfill', () => {
  test('ensureLocationEmitterPolyfill returns true', () => {
    assert.equal(ensureLocationEmitterPolyfill(), true);
  });

  test('Location.EventEmitter has removeSubscription method', () => {
    const emitter = (Location as any).EventEmitter;
    assert.ok(emitter, 'Location.EventEmitter must exist');
    assert.equal(typeof emitter.removeSubscription, 'function', 'removeSubscription must be defined on Location.EventEmitter');
  });

  test('Calling removeSubscription invokes subscription.remove() cleanly', () => {
    const emitter = (Location as any).EventEmitter;
    let removed = false;
    const fakeSubscription = {
      remove: () => {
        removed = true;
      },
    };

    emitter.removeSubscription(fakeSubscription);
    assert.equal(removed, true, 'subscription.remove() must have been called');
  });

  test('Calling removeSubscription with null, undefined or empty object does not throw', () => {
    const emitter = (Location as any).EventEmitter;
    assert.doesNotThrow(() => {
      emitter.removeSubscription(null);
      emitter.removeSubscription(undefined);
      emitter.removeSubscription({});
    });
  });
});
