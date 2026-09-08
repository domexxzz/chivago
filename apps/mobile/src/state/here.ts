/**
 * Where the phone is, for screens that would merely LIKE to know.
 *
 * Distinct from the fix a check-in takes, and the difference is the whole
 * point of the file: a check-in REQUESTS the permission, because a check-in
 * without a position cannot happen and the traveller understands why the
 * dialog appeared. Showing how far away a beach is is a convenience, and a
 * convenience that raises a system permission dialog is how an app teaches
 * people to tap Deny by reflex - which then costs it the one request that
 * actually mattered.
 *
 * So this asks `getForegroundPermissionsAsync`, the variant that reads the
 * answer without prompting for it, and gives up quietly on anything else.
 * Null is a normal outcome here, not an error, and every caller has to have
 * something to show for it.
 */

import React from 'react';
import * as Location from 'expo-location';

export interface Here { lat: number; lng: number }

/**
 * The device position, or null.
 *
 * Null covers every case a screen cannot act on and does not need to tell
 * apart: permission never granted, permission refused, no fix, a browser
 * with no Permissions API, a simulator. One `catch` for all of them, because
 * the screen's answer to each is the same sentence.
 *
 * Taken once per mount, not watched. A distance to a beach does not need to
 * update while somebody reads the page, and a position watcher left running
 * on a screen is a battery cost nobody asked for.
 */
export function useHere(): Here | null {
  const [here, setHere] = React.useState<Here | null>(null);

  React.useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm?.granted) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!live) return;
        const { latitude, longitude } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        setHere({ lat: latitude, lng: longitude });
      } catch {
        // Nothing to report and nothing to retry: the caller renders the
        // no-position case, which is a complete screen in its own right.
      }
    })();
    return () => { live = false; };
  }, []);

  return here;
}
