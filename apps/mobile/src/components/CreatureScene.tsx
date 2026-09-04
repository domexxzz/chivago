/**
 * The companion's room, in whichever dimension this platform can draw it.
 *
 * On the web: the real-time scene in `creature3d/Creature3D.tsx` - the
 * animal lit by the island's clock, breathing, blinking, looking at the
 * pointer, answering a tap. On a phone, and in the node harness: the drawn
 * mark, breathing, which is what shipped before and is still honest.
 *
 * The same switch as the map (`SamuiMap.tsx`), for the same reasons: a
 * lazy `import()` gated on a real document, because Metro's `.web.tsx`
 * resolution only works for extensionless imports and the harness cannot
 * follow those. three.js is ~600 KB of browser code; a phone never
 * evaluates it. It is still in the native bundle, as MapLibre is, until a
 * `.web.tsx` split the tests can follow exists.
 */

import React from 'react';
import { Animated, Easing, Platform, View, useWindowDimensions } from 'react-native';
import type { CompanionStage, Mascot } from '@chivago/core';
import { color } from '../theme/index.ts';
import { Creature, type CreatureKey } from './Creature.tsx';
import { MascotMark } from './MascotMark.tsx';
import { useReduceMotion } from './reduce-motion.ts';

const inBrowser = Platform.OS === 'web'
  && typeof document !== 'undefined'
  && typeof window !== 'undefined';

const Creature3D = inBrowser
  ? React.lazy(() => import('./creature3d/Creature3D.tsx').then((m) => ({ default: m.Creature3D })))
  : null;

/** A slow breath for the drawn mark. Stops under reduce-motion. */
function useBreath(): Animated.Value {
  const breath = React.useRef(new Animated.Value(0)).current;
  const still = useReduceMotion();
  React.useEffect(() => {
    // The comment above said this for a while before it was true.
    if (still) { breath.setValue(0); return undefined; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, still]);
  return breath;
}

const KNOWN: readonly CreatureKey[] = ['dusky-langur', 'pied-hornbill', 'brahminy-kite', 'green-turtle', 'fiddler-crab'];
const isKnown = (s: string): s is CreatureKey => (KNOWN as readonly string[]).includes(s);

export function CreatureScene({
  species, mascot, stage, label, onTap, grown,
}: {
  /** A species key. An unknown one falls back to the drawn egg, as `Creature` does. */
  species: string;
  /** Or a provincial mascot, which takes precedence: its room, its body. */
  mascot?: Mascot;
  stage: CompanionStage;
  /** Spoken name of what is on screen, e.g. "Dusky langur, grown". */
  label: string;
  onTap?: () => void;
  grown: boolean;
}) {
  const { width } = useWindowDimensions();
  const breath = useBreath();

  if (Creature3D && (mascot || isKnown(species))) {
    // Taller on a wide screen, where there is room; a phone gets a square.
    const height = Math.round(Math.min(360, Math.max(260, width * 0.62)));
    return (
      <React.Suspense fallback={<View style={{ height, backgroundColor: grown ? color.accent100 : color.surface }} />}>
        {mascot
          ? <Creature3D mascot={mascot} stage={stage} height={height} label={label} onTap={onTap} />
          : <Creature3D species={species as CreatureKey} stage={stage} height={height} label={label} onTap={onTap} />}
      </React.Suspense>
    );
  }

  return (
    <View style={{ paddingVertical: 34, alignItems: 'center' }}>
      <Animated.View
        style={{
          transform: [
            { translateY: breath.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
            { scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) },
          ],
        }}
      >
        {mascot && stage !== 'egg'
          ? <MascotMark mascot={mascot} size={168} />
          : <Creature species={species} stage={stage} size={168} />}
      </Animated.View>
    </View>
  );
}
