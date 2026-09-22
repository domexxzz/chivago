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
import { Creature, type CreatureKey } from './Creature.tsx';
import { MascotPortrait } from './MascotPortrait.tsx';
import { useReduceMotion } from './reduce-motion.ts';

const inBrowser = Platform.OS === 'web'
  && typeof document !== 'undefined'
  && typeof window !== 'undefined';

/**
 * The room, fetched AFTER this screen has been painted.
 *
 * `React.lazy` starts its import during render, which is the whole trouble:
 * React suspends on the first commit, and the screen's first paint is queued
 * behind a request for ~200 KB of three.js. Measured on the deployed demo,
 * cold, that request alone took 751 ms before a byte of it was evaluated -
 * and what a traveller looked at for that time was a screen with nothing on
 * it, whatever the Suspense fallback happened to contain.
 *
 * So the import is not made during render at all. `useRoom` asks for it from
 * an effect, behind two animation frames, which is the cheap and reliable way
 * to say AFTER THE BROWSER HAS ACTUALLY PAINTED: the first frame fires before
 * the paint that follows this commit, the second after it. Until the module
 * arrives the drawn animal is on screen, and it is on screen because it was
 * painted, not merely because it was rendered.
 *
 * The trade is one frame of the drawn mark on a warm cache, where the module
 * would otherwise have resolved almost at once. That is a fair price for
 * never showing an empty screen on the open that matters, which is the first.
 */
type RoomComponent = typeof import('./creature3d/Creature3D.tsx')['Creature3D'];

function useRoom(wanted: boolean): RoomComponent | null {
  const [room, setRoom] = React.useState<RoomComponent | null>(null);
  React.useEffect(() => {
    if (!wanted || !inBrowser) return undefined;
    let alive = true;
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        import('./creature3d/Creature3D.tsx')
          // A room that fails to arrive is not an error worth showing anybody:
          // the drawn animal stays, which is what a phone sees anyway.
          .then((m) => { if (alive) setRoom(() => m.Creature3D); })
          .catch(() => {});
      });
    });
    return () => { alive = false; cancelAnimationFrame(outer); };
  }, [wanted]);
  return room;
}

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

const KNOWN: readonly CreatureKey[] = ['coconut-macaque', 'red-junglefowl', 'day-octopus', 'green-turtle', 'water-buffalo'];
const isKnown = (s: string): s is CreatureKey => (KNOWN as readonly string[]).includes(s);

export function CreatureScene({
  species, mascot, stage, label, onTap,
}: {
  /** A species key. An unknown one falls back to the drawn egg, as `Creature` does. */
  species: string;
  /** Or a provincial mascot, which takes precedence: its room, its body. */
  mascot?: Mascot;
  stage: CompanionStage;
  /** Spoken name of what is on screen, e.g. "Water buffalo, grown". */
  label: string;
  onTap?: () => void;
}) {
  const { width } = useWindowDimensions();
  const breath = useBreath();
  const roomSuits = inBrowser && (mascot !== undefined || isKnown(species));
  const Room = useRoom(roomSuits);

  // Taller on a wide screen, where there is room; a phone gets a square.
  const height = Math.round(Math.min(360, Math.max(260, width * 0.62)));

  if (Room) {
    return mascot
      ? <Room mascot={mascot} stage={stage} height={height} label={label} onTap={onTap} />
      : <Room species={species as CreatureKey} stage={stage} height={height} label={label} onTap={onTap} />;
  }

  // Standing in for the room, so it holds the room's height; or standing on
  // its own on a phone, where it sets its own.
  return (
    <DrawnScene
      species={species}
      mascot={mascot}
      stage={stage}
      breath={breath}
      height={roomSuits ? height : undefined}
    />
  );
}

/**
 * The drawn animal, breathing. What a phone shows, and what the web shows
 * while three.js is still arriving.
 *
 * IT IS THE FALLBACK BECAUSE IT IS NOT A FALLBACK. This used to be an empty
 * coloured box, on the grounds that the room was a second away - and on a
 * warm cache it is. On the first open it is ~700 KB of three.js over whatever
 * signal a beach has, and what the traveller saw for that whole time was a
 * blank rectangle with nothing in it to say anything was coming. A spinner
 * would have been the obvious repair and the worse one: the right thing to
 * put in the space where the animal goes is the animal.
 *
 * `height` is passed on the web so the drawn mark occupies exactly the box
 * the room will occupy. Without it the page reflows under the reader's thumb
 * the moment the scene loads, which is its own small betrayal.
 */
function DrawnScene({
  species, mascot, stage, breath, height,
}: {
  species: string;
  mascot?: Mascot;
  stage: CompanionStage;
  breath: Animated.Value;
  /** The room's height, when standing in for one. Omitted on a phone. */
  height?: number;
}) {
  return (
    <View
      style={height === undefined
        ? { paddingVertical: 34, alignItems: 'center' }
        : { height, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={{
          transform: [
            { translateY: breath.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
            { scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) },
          ],
        }}
      >
        {mascot && stage !== 'egg'
          ? <MascotPortrait mascot={mascot} size={168} />
          : <Creature species={species} stage={stage} size={168} />}
      </Animated.View>
    </View>
  );
}
