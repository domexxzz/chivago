/**
 * The one line a traveller reads at forty kilometres an hour.
 *
 * Everything else on the navigation screen is reference; this is the
 * instruction, and it is designed for a glance taken while something else
 * has the attention. Hence the shape:
 *
 *   - an ARROW first, left of the text, because a shape is recognised
 *     before a word is read and in three languages the shape is the same;
 *   - the DISTANCE in the largest type on the screen, because "120 m" is
 *     the part that decides whether to brake;
 *   - the road's name UNDER it, small, and only when the router gave one.
 *     Never invented, never borrowed from the previous maneuver: an empty
 *     line is honest and a wrong road name is how somebody turns into a
 *     private driveway.
 *
 * Dark navy on a bright map, which is the one combination that survives
 * both midday glare and the night palette - and the colour the rest of the
 * app already uses for an inverted surface.
 */

import React from 'react';
import { View } from 'react-native';
import {
  ArrowUp, ArrowUpLeft, ArrowUpRight, CornerLeftUp, CornerRightUp, CornerUpLeft, CornerUpRight,
  Flag, Navigation, RotateCcw, RotateCw,
  type LucideIcon,
} from 'lucide-react-native';
import {
  formatDistance, maneuverArrow, maneuverInstruction, maneuverStreet, strings,
  type Maneuver, type ManeuverArrow,
} from '@chivago/core';

import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';

/**
 * One picture per maneuver, chosen once.
 *
 * `maneuverArrow` in core decides WHICH arrow; this file only decides what
 * that arrow is drawn with. The split is what lets the map's own document -
 * which cannot import a React component - mark the same turn the same way.
 */
const ARROWS: Record<ManeuverArrow, LucideIcon> = {
  start: Navigation,
  straight: ArrowUp,
  left: CornerUpLeft,
  right: CornerUpRight,
  'slight-left': ArrowUpLeft,
  'slight-right': ArrowUpRight,
  // The corner that turns through more than a right angle, which is what a
  // sharp turn is and what distinguishes it from the one above.
  'sharp-left': CornerLeftUp,
  'sharp-right': CornerRightUp,
  'u-turn': RotateCcw,
  roundabout: RotateCw,
  flag: Flag,
};

/**
 * Close enough that a distance would be read after the junction.
 *
 * Under thirty metres a rider reading "turn left in 20 m" has already
 * passed it. The banner stops counting and says now.
 */
export const MANEUVER_NOW_M = 30;

export function NavigationBanner({
  maneuver, metres, note,
}: {
  /** The turn being announced. Null when the route carried no instructions. */
  maneuver: Maneuver | null;
  /** Metres to its junction. */
  metres: number;
  /**
   * A state worth saying out loud, under the instruction: rerouting, a weak
   * signal, a stale route. Null in the ordinary case, which is most of them.
   */
  note?: string | null;
}) {
  const arrow = maneuver ? maneuverArrow(maneuver.type) : 'straight';
  const Arrow = ARROWS[arrow];
  const instruction = maneuver ? t(maneuverInstruction(maneuver)) : t(strings.navigate.finding);
  const close = metres <= MANEUVER_NOW_M;
  const line = !maneuver
    ? instruction
    : close
      ? t(strings.navigate.now(instruction))
      : t(strings.navigate.inDistance(instruction, t(formatDistance(metres))));
  const street = maneuverStreet(maneuver);

  return (
    <View style={{ paddingHorizontal: gutter }}>
      <View
        style={[shadow.md, {
          flexDirection: 'row', alignItems: 'center', gap: 14,
          backgroundColor: color.text, borderRadius: radius.sm, paddingVertical: 14, paddingHorizontal: 16,
        }]}
        accessibilityRole="text"
        accessibilityLabel={street ? `${line} · ${street}` : line}
      >
        <Arrow size={38} color={color.surface} strokeWidth={2.4} />
        <View style={{ flex: 1 }}>
          {/*
            IT WRAPS, and nothing here clamps it. Thai and Chinese set a turn
            instruction with a road name considerably longer than the
            English, and a clipped line loses the road rather than the verb -
            so the banner grows by a line instead, which the layout below it
            has room for at every width this app is read at.
          */}
          <Heading size={20} colour={color.surface}>{line}</Heading>
          {street ? (
            <Body size={13} colour={color.brandSoft} style={{ marginTop: 2 }}>{street}</Body>
          ) : null}
          {note ? (
            <Label size={10} tracking={0.08} colour={color.gold} style={{ marginTop: 6 }}>{note}</Label>
          ) : null}
        </View>
      </View>
    </View>
  );
}
