/**
 * Polyfill for expo-location on Web (Expo SDK 52).
 *
 * In expo-location's web implementation, LocationSubscribers.ts calls:
 * `LocationEventEmitter.removeSubscription(this.eventSubscription)`
 * when all callbacks for a subscriber are unregistered (e.g. when unmounting
 * a screen that calls Location.watchPositionAsync, such as MapScreen or useHere).
 *
 * However, on Web (LocationEventEmitter.web.ts), LocationEventEmitter is instantiated
 * from expo-modules-core's modern `EventEmitter`, which does NOT implement `removeSubscription(sub)`.
 * It only returns `{ remove: () => ... }` from `addListener()`.
 *
 * Without this polyfill, calling `remove()` on a watchPositionAsync subscription on Web throws:
 * `TypeError: c.LocationEventEmitter.removeSubscription is not a function`
 * during React's commit-phase unmount (`commitHookEffectListUnmount`), crashing React Fiber
 * and unmounting the entire application root to a blank white screen ("จอขาว").
 */

import * as Location from 'expo-location';

function patchEmitter(emitter: any) {
  if (!emitter || typeof emitter !== 'object') return;

  const originalRemove = typeof emitter.removeSubscription === 'function' ? emitter.removeSubscription : null;

  // Ensure removeSubscription exists and safely delegates to subscription.remove()
  emitter.removeSubscription = (subscription: any) => {
    if (subscription && typeof subscription.remove === 'function') {
      try {
        subscription.remove();
      } catch {}
    }
    if (originalRemove && originalRemove !== emitter.removeSubscription) {
      try {
        originalRemove.call(emitter, subscription);
      } catch {}
    }
  };

  // Patch class prototype so all instances inherit it, but NEVER pollute Object.prototype
  const proto = Object.getPrototypeOf(emitter);
  if (proto && proto !== Object.prototype && typeof proto.removeSubscription !== 'function') {
    try {
      proto.removeSubscription = function (subscription: any) {
        if (subscription && typeof subscription.remove === 'function') {
          subscription.remove();
        }
      };
    } catch {}
  }
}

// 1. Patch Location.EventEmitter (which expo-location re-exports)
if (Location && (Location as any).EventEmitter) {
  patchEmitter((Location as any).EventEmitter);
}

// 2. Patch global expo EventEmitter if registered on web
const globalExpo = (globalThis as any)?.expo;
if (globalExpo?.EventEmitter?.prototype && globalExpo.EventEmitter.prototype !== Object.prototype) {
  const proto = globalExpo.EventEmitter.prototype;
  if (typeof proto.removeSubscription !== 'function') {
    try {
      proto.removeSubscription = function (subscription: any) {
        if (subscription && typeof subscription.remove === 'function') {
          subscription.remove();
        }
      };
    } catch {}
  }
}

export function ensureLocationEmitterPolyfill(): boolean {
  return true;
}
