/**
 * Whether this person asked their system for less motion.
 *
 * One answer for every moving thing in the app - the breathing mark, the
 * drift of the map, the swell, the cloud shadows - so nobody has to remember
 * to ask, and nobody asks differently. On a phone it is the accessibility
 * setting; on the web it is the media query; in a test it is whatever the
 * environment says, which is "no".
 *
 * Reduce-motion means STILL, not slower. A slow bob is still a bob to someone
 * who asked for none.
 */

import React from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

function fromMedia(): boolean {
  return Platform.OS === 'web'
    && typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useReduceMotion(): boolean {
  const [still, setStill] = React.useState<boolean>(fromMedia);
  React.useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => { if (live && v) setStill(true); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setStill(v));
    return () => { live = false; sub?.remove?.(); };
  }, []);
  return still;
}
