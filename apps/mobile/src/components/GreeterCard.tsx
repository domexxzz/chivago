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
import { View } from 'react-native';
import { greeterFor, type AreaKey } from '@chivago/core';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Label } from './Type.tsx';
import { GreeterScene } from './GreeterScene.tsx';
import { t } from '../i18n/locale.ts';

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
          A band behind the greeter rather than a plain white box: the model
          is lit, has a ground shadow under it and is cut out to its own
          alpha, and all three of those read as a mistake against nothing.
        */}
        <View style={{ backgroundColor: '#E4F3F7' }}>
          <GreeterScene greeter={greeter} label={`${name}, ${creature}`} onLive={onLive} />
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
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
                  th: 'แตะช้างช้างสิ',
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
