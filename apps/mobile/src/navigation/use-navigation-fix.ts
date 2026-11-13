/**
 * The position watcher a navigator needs, which is not the one every other
 * screen needs.
 *
 * `state/here.ts` is deliberately polite: it READS the permission rather
 * than asking for it, because showing how far away a beach is does not
 * justify a system dialog, and an app that raises one for every convenience
 * teaches people to tap Deny by reflex. That reasoning is still right, and
 * it is exactly why this file is separate rather than a flag on that hook.
 *
 * Navigation is the case the politeness was protecting. The traveller has
 * just pressed Start on a screen that says it will navigate; a dialog now is
 * explained by the thing they did a second ago, which is the only moment a
 * permission request is ever welcome. So this one ASKS, and it asks once.
 *
 * WHAT ELSE IS DIFFERENT, and why each costs something:
 *
 *   - `BestForNavigation` accuracy, not `Balanced`. It is the expensive
 *     setting, and it is the one that tells a lane from the road beside it.
 *   - every fix, not every five metres. `distanceInterval: 0` with a one
 *     second floor: the dot's bearing and the distance to the next turn both
 *     come from fixes, and a watcher that only speaks when the traveller has
 *     moved five metres stops speaking at a traffic light, where the camera
 *     then drifts off whatever heading it last had.
 *   - it runs only while the navigator is running. `active` is not an
 *     optimisation; it is the whole battery argument for this feature. The
 *     watcher is torn down on Stop, on arrival, and on unmount.
 *
 * NO BACKGROUND LOCATION. Not asked for, not declared, not used. The screen
 * has to be open for this to run, which is the honest shape of a navigator
 * that has no audio: there is nothing to hear from a pocket anyway.
 */

import React from 'react';
import * as Location from 'expo-location';
import type { NavFix } from '@chivago/core';

import '../polyfills/location-emitter.ts';

export type FixPermission = 'asking' | 'granted' | 'denied';

export interface NavigationFix {
  fix: NavFix | null;
  permission: FixPermission;
  /** How many fixes this watcher has delivered. Drives nothing; proves a lot. */
  count: number;
}

/**
 * One fix per second at most.
 *
 * Android delivers as fast as the chip will go if asked for zero, and every
 * one of them re-runs the matcher and moves the camera. A second is faster
 * than a traveller can act on and slow enough to leave the main thread for
 * the map.
 */
export const FIX_INTERVAL_MS = 1_000;

/**
 * How old a fix may be, measured against when this watcher started.
 *
 * ANDROID'S FUSED PROVIDER ANSWERS IMMEDIATELY, and its first answer is
 * usually the LAST KNOWN position rather than a new one - which can be
 * where the phone was when it was last outdoors, hours ago and kilometres
 * away. Taken as the opening fix of a trip it would route the traveller
 * from somewhere they are not, and the route would look plausible all the
 * way to the first junction.
 *
 * So a fix measured more than a minute before this watcher started is
 * dropped. Both numbers come from the same device clock, so a phone whose
 * clock is wrong is still consistent with itself and nothing is lost.
 */
export const STALE_FIX_MS = 60_000;

const asFix = (position: Location.LocationObject): NavFix | null => {
  const { latitude, longitude, accuracy, heading, speed } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const number = (v: number | null | undefined): number | null =>
    (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    lat: latitude,
    lng: longitude,
    accuracyM: number(accuracy),
    // A phone that cannot tell which way it is pointing reports -1 rather
    // than null, and -1 degrees is a bearing that reads as north-ish.
    headingDeg: (() => { const h = number(heading); return h === null || h < 0 ? null : h; })(),
    speedMps: (() => { const s = number(speed); return s === null || s < 0 ? null : s; })(),
    // The OS stamp when there is one: two fixes delivered in one batch share
    // a wall-clock arrival but not a measurement time, and the camera's turn
    // rate is computed from the gap between them.
    timestamp: Number.isFinite(position.timestamp) ? position.timestamp : Date.now(),
  };
};

/**
 * @param active  Whether a trip is running. The watcher exists only while
 *                this is true; it is the whole battery argument for this
 *                feature.
 * @param attempt Bumped by the caller to tear the watcher down and build a
 *                new one. A platform can retire a subscription without
 *                telling anybody - a browser run of this feature caught one
 *                doing exactly that - and a navigator with no way to ask
 *                for another is a navigator that freezes for the rest of
 *                the trip.
 */
export function useNavigationFix(active: boolean, attempt = 0): NavigationFix {
  const [state, setState] = React.useState<NavigationFix>({ fix: null, permission: 'asking', count: 0 });
  /** Which watcher is the current one. See the generation note in the effect. */
  const sessionRef = React.useRef(0);

  React.useEffect(() => {
    if (!active) {
      // Not a reset to `asking`: a traveller who has already granted it and
      // pressed Stop should not meet the dialog again on the next trip.
      setState((was) => ({ ...was, fix: null, count: 0 }));
      return undefined;
    }

    let live = true;
    let subscription: Location.LocationSubscription | null = null;
    /*
      THIS WATCHER'S OWN GENERATION, and the newest fix it has accepted.

      `live` alone is not enough once the watcher can be rebuilt. A platform
      callback already in flight when a new watcher is created would be
      delivered against the new session - and because it is an OLDER
      position, it would move the arrow backwards, and worse, a fix from a
      dead watcher would be enough to clear `gps-lost` and make the screen
      claim a signal it does not have. The generation is captured here and
      compared inside the callback, so a stale callback is dropped rather
      than believed.
    */
    const session = ++sessionRef.current;
    const startedAt = Date.now();
    let newest = 0;

    void (async () => {
      try {
        // Asked for, not merely read - see the file header.
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!live) return;
        if (!permission?.granted) { setState({ fix: null, permission: 'denied', count: 0 }); return; }
        setState((was) => ({ ...was, permission: 'granted' }));

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation ?? Location.Accuracy.High,
            timeInterval: FIX_INTERVAL_MS,
            distanceInterval: 0,
          },
          (position) => {
            if (!live || session !== sessionRef.current) return;
            const next = asFix(position);
            if (!next) return;
            // A cached last-known position from before this watcher existed.
            if (next.timestamp < startedAt - STALE_FIX_MS) return;
            // Out of order. Platforms do deliver these, and a navigator that
            // accepts one walks the arrow backwards down the road.
            if (next.timestamp < newest) return;
            newest = next.timestamp;
            setState((was) => ({ fix: next, permission: 'granted', count: was.count + 1 }));
          },
        );

        /*
          THE WATCHER MAY OUTLIVE THE EFFECT THAT ASKED FOR IT.

          `watchPositionAsync` is a promise, and React can run the cleanup
          below before it settles - on a fast unmount, or on a second render
          in development's strict mode. The subscription would then exist
          with nobody holding it, which is a GPS radio left on for the rest
          of the session. Re-checking `live` after the await is what closes
          that, and it is the same guard `state/here.ts` carries.
        */
        if (!live) {
          try { subscription?.remove(); } catch { /* already gone */ }
          subscription = null;
        }
      } catch {
        // A simulator with no location service, a browser that refuses, a
        // permission module that threw. One answer for all of them: the
        // screen says it cannot see the sky, which is true in each case.
        if (live) setState({ fix: null, permission: 'denied', count: 0 });
      }
    })();

    return () => {
      live = false;
      try { subscription?.remove(); } catch { /* the screen is going anyway */ }
      subscription = null;
    };
  }, [active, attempt]);

  return state;
}
