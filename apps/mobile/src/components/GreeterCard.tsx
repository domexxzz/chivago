/**
 * The island's greeter, on Home.
 *
 * WHERE IT SITS AND WHY IT IS NOT AT THE TOP. Home's header says the order is
 * the argument: what is true here now, then where to go, then what you can do.
 * It also says, in its own words, that opening with a hero image is "showing
 * you a beach you are not on". A mascot above the measured conditions would be
 * the same mistake in a costume. So ChangChang comes after the conditions and
 * the doors and before the places - at the point where the screen stops
 * reporting and starts suggesting, which is the one moment a guide belongs.
 *
 * ONLY WHERE THERE IS ONE. `greeterFor` returns null for four of the five
 * areas and this renders nothing for them, so a campus Home is byte for byte
 * what it was. Nothing is waiting on art for the others.
 *
 * IT SAYS WHAT IT IS. The card carries `made` - that this is a character made
 * for ChivaGo, not a species and not a claim about the animals of the island.
 * Every other creature surface in this app can point at a Red List entry or a
 * provincial seal; this one cannot, so it says so instead of staying quiet and
 * letting the reader assume.
 */

import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { greeterFor, type AreaKey } from '@chivago/core';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Label } from './Type.tsx';
import { GreeterScene } from './GreeterScene.tsx';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { photoUri } from '../api/photos.ts';
import { t } from '../i18n/locale.ts';

/**
 * The backdrop, under `/media/` with the app's other illustrations.
 *
 * Not on the greeter record in core: a `Greeter` describes the CHARACTER -
 * its name, what it is, who made it - and what a card chooses to stand it in
 * front of is this screen's decision, not a fact about the animal.
 */
const SHORE = '/media/illustrations/koh-sichang-shore-v1.jpg';

export function GreeterCard({ area }: { area: AreaKey }) {
  const greeter = greeterFor(area);
  // Whether what is on screen is the live model, which answers a tap, or the
  // painted portrait, which does not. `GreeterScene` reports it.
  const [live, setLive] = React.useState(false);
  const onLive = React.useCallback((value: boolean) => setLive(value), []);
  if (!greeter) return null;

  const name = t(greeter.name);
  const creature = t(greeter.creature);

  return (
    <View style={{ paddingHorizontal: gutter, marginTop: 14 }}>
      <View
        style={[shadow.card, {
          backgroundColor: color.surface,
          // md, not lg: lg is 999, the pill radius, and on a box this tall it
          // rounds the card into a circle and eats the corners of the text.
          borderRadius: radius.md,
          overflow: 'hidden',
          paddingBottom: 16,
        }]}
      >
        {/*
          THE SHORE HE IS ACTUALLY ON.

          This was a flat slab of a blue that appears nowhere else in the app,
          then the app's own wave graphic, and now the owner's picture of the
          island - which is the version that finally stops him floating,
          because the other two gave him a surface and this one gives him a
          PLACE. The pavilion on the headland is the shape anybody who has
          been to Ko Sichang recognises.

          WHAT IT IS NOT: a photograph, and not evidence. It is a decorative
          illustration the owner supplied, recorded as such beside the file in
          media/illustrations/README.md, and nothing on this card says the
          picture is of anywhere. The card's own provenance line already says
          the mascot is made rather than found; the backdrop is held to the
          same standard.
        */}
        <View style={{ overflow: 'hidden' }}>
          <Image
            source={{ uri: photoUri(SHORE) }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            // Decorative. The card says in words what it is; a screen reader
            // announcing a beach between the name and the description would
            // be noise.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <GreeterScene greeter={greeter} label={`${name}, ${creature}`} onLive={onLive} />
          {/*
            A short fade into the panel below, so the picture does not end on
            a hard horizontal line across the card. It also lifts the sand
            right where his feet and shadow cross the edge.
          */}
          <View style={[StyleSheet.absoluteFillObject, { pointerEvents: 'none' }]}>
            <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
              <Defs>
                <LinearGradient id="greeter-foot" x1="0" y1="0" x2="0" y2="1">
                  {/*
                    SHORT AND WEAK, because the first version of this fade
                    reached a fifth of the way up at nearly full opacity and
                    wiped out his feet and his shadow with them. He went
                    straight back to floating - the one thing the backdrop
                    was added to fix. A fade only has to soften the card's
                    edge; it must not touch the ground he stands on.
                  */}
                  <Stop offset="0.9" stopColor={color.surface} stopOpacity="0" />
                  <Stop offset="1" stopColor={color.surface} stopOpacity="0.55" />
                </LinearGradient>
              </Defs>
              <Rect width="100" height="100" fill="url(#greeter-foot)" />
            </Svg>
          </View>
        </View>

        {/*
          Pulled up under him so he overlaps the panel he stands above.

          A character wholly inside its own rectangle is a photograph of a
          character. Letting his feet and shadow cross the edge breaks the
          frame, and breaking the frame is most of what makes something read
          as present in a page rather than pasted onto one.
        */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14, marginTop: -18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <Label size={10} tracking={0.12}>{name}</Label>
            {/*
              Only where there is something to tap. On a phone the card shows
              the painted portrait and nothing answers a tap, so an invitation
              to tap would be a small lie - and `GreeterScene` is the only
              thing that knows which of the two is on screen.
            */}
            {live ? (
              <Label size={9} tracking={0.04} colour={color.neutral600} style={{ textTransform: 'none' }}>
                {t({
                  en: 'Tap ChangChang',
                  th: 'แตะชังชังสิ',
                  zh: '点一下昌昌',
                })}
              </Label>
            ) : null}
          </View>
          <Body size={13} colour={color.neutral700} style={{ marginTop: 4 }}>{creature}</Body>
          <Body size={13} colour={color.neutral800} style={{ marginTop: 8 }}>{t(greeter.blurb)}</Body>
          <Label
            size={9}
            tracking={0.04}
            colour={color.neutral600}
            style={{ marginTop: 10, textTransform: 'none' }}
          >
            {t(greeter.made)}
          </Label>
        </View>
      </View>
    </View>
  );
}
