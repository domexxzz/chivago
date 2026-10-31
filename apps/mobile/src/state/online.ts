/**
 * Whether the device thinks it has a network, as React state.
 *
 * WHY THIS EXISTS. The map already dropped to the drawn 2D island when the
 * PLACES REQUEST fell back to cache, which is the right signal for "the API
 * is unreachable" and the wrong one for "this phone has no network". The two
 * come apart in both directions and the map was wrong in both:
 *
 *   - Offline with nothing cached. The fallback has no snapshot to return,
 *     so no stamp is set, so the terrain map mounts - and MapLibre then
 *     spends the session failing to fetch tiles it was never going to get.
 *     A traveller with no signal and no cache got a blank rectangle where
 *     the drawn island would have shown them the coastline and their own dot.
 *
 *   - Signal lost while the map is open. Places are fetched once per area,
 *     so nothing re-ran and the 3D map stayed up over tiles that had stopped
 *     arriving, with no way back short of changing area.
 *
 * `navigator.onLine` answers the second question, and it answers it as an
 * EVENT, which is what makes the switch live. It is famously optimistic -
 * true means "attached to a network", not "the internet is reachable" - so
 * nothing here is trusted to say the network is FINE, only that it is gone.
 *
 * WHAT IT DRIVES NOW. Not which map is drawn: both platforms keep the real
 * map offline and serve it from saved tiles, which is the whole point of
 * caching them. What it still answers is what the screen SAYS - the banner
 * that tells a traveller the data came from a snapshot, and that the map
 * reaches only as far as the areas they have opened.
 *
 * On native there is no `navigator.onLine` to read, so this reports online
 * and the cache fallback carries the weight instead; reaching for a native
 * connectivity module the app has never shipped would be a bigger change
 * than the question deserves.
 *
 * The question asked is whether there is a window that emits these events,
 * not what `Platform.OS` says - the same reasoning `SamuiMap` gives for its
 * own browser test, and it keeps this module free of react-native so the
 * plain `src` test runner can load it.
 */

import React from 'react';

/** A real window to listen to. React Native and the test harness have none. */
const listenable = (): boolean =>
  typeof window !== 'undefined'
  && typeof window.addEventListener === 'function'
  && typeof window.removeEventListener === 'function';

/**
 * Optimistic by design: anything other than an explicit `false` is online.
 *
 * A missing `navigator`, a browser that does not implement `onLine`, or a
 * server render all answer "online", because the cost of being wrong that
 * way is the behaviour this app already had, and the cost of being wrong the
 * other way is hiding the real map from somebody who could see it.
 */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return (navigator as { onLine?: unknown }).onLine !== false;
}

/** Subscribe to the two events that change the answer. Shaped for `useSyncExternalStore`. */
export function subscribeOnline(listener: () => void): () => void {
  if (!listenable()) return () => {};
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

/** The current answer, as state. Whoever calls this re-renders when it changes. */
export function useOnline(): boolean {
  // The server snapshot is `true` for the same reason `isOnline` is
  // optimistic, and because a render with no window cannot be offline.
  return React.useSyncExternalStore(subscribeOnline, isOnline, () => true);
}
