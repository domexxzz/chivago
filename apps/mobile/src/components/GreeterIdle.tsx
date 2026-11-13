/**
 * What a greeter does while nothing is happening.
 *
 * A mascot that holds perfectly still reads as a sticker; the three-dimensional
 * one in the card does not, and the painted one beside it should not either -
 * a phone would otherwise get a visibly deader ChangChang than a laptop.
 *
 * TWO LOOPS, NOT ONE, AND DELIBERATELY OUT OF STEP. A bob every 2.2 seconds
 * and a sway every 3.4 seconds: the ratio is not a whole number, so the two
 * only line up again every 37 seconds and the motion never looks like a
 * three-frame GIF. One loop driving both - or two of the same length - is
 * what makes cheap mascot animation look cheap.
 *
 * The sway carries a small rotation with it, because a body that slides
 * sideways without leaning is a cut-out being dragged. Nothing here moves far:
 * five points up, three across, two and a half degrees over. The aim is a
 * character that is breathing, not one that is performing.
 *
 * TRANSFORMS ONLY. Nothing here touches layout, so nothing here can push a
 * word of the headline around while somebody is reading it, and the browser
 * can keep the whole thing on the compositor. Which driver carries it is a
 * separate question with a measured answer - see `NATIVE_DRIVER` below.
 *
 * REDUCE-MOTION MEANS STILL. Not slower - the app's one answer for every
 * moving thing, and `reduce-motion.ts` says why.
 */

import React from 'react';
import { Animated, Easing, Platform, View, type ViewStyle } from 'react-native';
import { useReduceMotion } from './reduce-motion.ts';

/**
 * The native driver on a phone, the JS one on the web, AND THIS IS MEASURED.
 *
 * `useNativeDriver: true` is the right answer on a device - transform-only
 * animation, off the JS thread, which is the whole reason this idle is built
 * out of transforms. On react-native-web it is the wrong answer in a way that
 * fails silently: the looped value never advances at all. Sampled in Chrome
 * on Home, the wrapper's computed transform held at `matrix(1,0,0,1,0,0)`
 * across seven reads half a second apart - a mascot that was mounted,
 * painted, and completely dead. With this flag false the same seven reads
 * were seven different matrices.
 *
 * NOTE FOR WHOEVER IS HERE NEXT: `CreatureScene.tsx` and `MascotRoom`'s
 * breathing marks pass `useNativeDriver: true` unconditionally, so they are
 * almost certainly still on the web. That is not fixed here because changing
 * how the five companions behave is not this change's business, but it is
 * the same bug and worth a look.
 */
const NATIVE_DRIVER = Platform.OS !== 'web';

/** Milliseconds for one full up-and-down. */
const BOB_MS = 2200;
/** And one full left-and-back. Not a multiple of the bob; that is the point. */
const SWAY_MS = 3400;

/**
 * A loop from 0 to 1, linear, so a three-point interpolation can shape it.
 *
 * Linear and not eased: the easing belongs in the interpolation, where a
 * caller can see the whole shape of the movement in one place. A 0-1-0
 * sequence with eased halves starts at an extreme instead of at rest, which
 * is a visible jolt on the frame a screen first paints.
 */
function useLoop(duration: number, still: boolean): Animated.Value {
  const value = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (still) { value.setValue(0); return undefined; }
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1, duration, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [value, duration, still]);
  return value;
}

export function GreeterIdle({
  children, amount = 1, style,
}: {
  children: React.ReactNode;
  /** Scales the whole movement. A header mark wants less than a tall portrait. */
  amount?: number;
  style?: ViewStyle;
}) {
  const still = useReduceMotion();
  const bob = useLoop(BOB_MS, still);
  const sway = useLoop(SWAY_MS, still);

  if (still) return <View style={style}>{children}</View>;

  // One out-and-back per loop, through rest at the halfway point, so the
  // first painted frame is the resting pose rather than an extreme.
  const QUARTERS = [0, 0.25, 0.5, 0.75, 1];
  const peak = 3 * amount;

  return (
    <Animated.View
      style={[style, {
        // The lean pivots on the feet, not the waist. A standing character
        // rotating about its own middle swings its feet out from under it,
        // which is a hanging ornament rather than a creature shifting its
        // weight. Ignored where the platform does not know the property, and
        // the centre pivot it falls back to is only a little less alive.
        transformOrigin: 'bottom center',
        transform: [
          // Twice the frequency of the sway, by having one rise and one fall
          // across the bob's own shorter loop.
          { translateY: bob.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -5 * amount, 0] }) },
          { translateX: sway.interpolate({ inputRange: QUARTERS, outputRange: [0, peak, 0, -peak, 0] }) },
          // The lean that comes with the sway. A body that slides sideways
          // without leaning is a cut-out being dragged.
          {
            rotate: sway.interpolate({
              inputRange: QUARTERS,
              outputRange: ['0deg', '2.5deg', '0deg', '-2.5deg', '0deg'],
            }),
          },
        ],
      }]}
    >
      {children}
    </Animated.View>
  );
}
