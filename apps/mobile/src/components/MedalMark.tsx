/**
 * A medal, drawn.
 *
 * A ring, a disc and one mark, in the gold of the game layer once it is
 * earned and in the neutrals with a small lock until then. Drawn from the
 * same primitives as the rank path rather than from a picture, because the
 * app has no pictures it did not make - and a medal that looked like a
 * photograph of somewhere would be claiming a photograph of somewhere.
 */

import React from 'react';
import { View } from 'react-native';
import {
  Compass, Footprints, GraduationCap, Lock, Route, TreePalm, Trees, Waves,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { MedalMark as MarkKey } from '@chivago/core';
import { color } from '../theme/index.ts';

const MARKS: Record<MarkKey, LucideIcon> = {
  footprints: Footprints,
  compass: Compass,
  waves: Waves,
  trees: Trees,
  palm: TreePalm,
  campus: GraduationCap,
  route: Route,
};

export function MedalMark({ mark, earned, size = 64 }: { mark: MarkKey; earned: boolean; size?: number }) {
  const Mark = MARKS[mark];
  const lock = Math.round(size * 0.34);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size, height: size, borderRadius: size / 2, padding: Math.round(size * 0.07),
          borderWidth: 2.5, borderColor: earned ? color.gold : color.neutral400,
          borderStyle: earned ? 'solid' : 'dashed',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: '100%', height: '100%', borderRadius: size,
            backgroundColor: earned ? color.goldSoft : color.neutral100,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Mark size={Math.round(size * 0.4)} color={earned ? color.goldDeep : color.neutral500} strokeWidth={2} />
        </View>
      </View>
      {earned ? null : (
        <View
          style={{
            position: 'absolute', right: -2, bottom: -2, width: lock, height: lock, borderRadius: lock / 2,
            backgroundColor: color.surface, borderWidth: 1, borderColor: color.neutral300,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Lock size={Math.round(size * 0.18)} color={color.neutral600} strokeWidth={2} />
        </View>
      )}
    </View>
  );
}
