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

export interface Here {
  lat: number;
  lng: number;
  /**
   * The fix's own error radius in metres, as the OS reported it, or null
   * when it did not say.
   *
   * Carried because a map draws it. Consumer GPS is 30-50 m out under trees,
   * and a tight dot on a map claims to be standing somewhere it might be
   * fifty metres from - the same overclaim `formatDistance` refuses when it
   * rounds 182 m to 180.
   */
  accuracyM: number | null;
}

const asHere = (pos: Location.LocationObject): Here | null => {
  const { latitude, longitude, accuracy } = pos.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: latitude, lng: longitude, accuracyM: Number.isFinite(accuracy as number) ? accuracy as number : null };
};

/**
 * The device position, or null.
 *
 * Null covers every case a screen cannot act on and does not need to tell
 * apart: permission never granted, permission refused, no fix, a browser
 * with no Permissions API, a simulator. One `catch` for all of them, because
 * the screen's answer to each is the same sentence.
 *
 * `watch` is for the ONE screen that draws the traveller: a dot on a map
 * that does not move while somebody walks is worse than no dot, because a
 * dot is read as current. Everywhere else takes a single fix per mount - a
 * distance to a beach does not change while somebody reads a card, and a
 * position watcher left running is a battery cost nobody asked for.
 */
export function useHere({ watch = false }: { watch?: boolean } = {}): Here | null {
  const [here, setHere] = React.useState<Here | null>(null);

  React.useEffect(() => {
    let live = true;
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm?.granted || !live) return;
        if (watch) {
          // Five metres, because the dot is read against pins tens of metres
          // apart; a finer interval would redraw the map for GPS jitter.
          subscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Balanced, distanceInterval: 5 },
            (pos) => { if (live) setHere((was) => asHere(pos) ?? was); },
          );
          if (!live) { subscription?.remove(); subscription = null; }
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!live) return;
        const next = asHere(pos);
        if (next) setHere(next);
      } catch {
        // Nothing to report and nothing to retry: the caller renders the
        // no-position case, which is a complete screen in its own right.
      }
    })();

    return () => {
      live = false;
      subscription?.remove();
    };
  }, [watch]);

  return here;
}
