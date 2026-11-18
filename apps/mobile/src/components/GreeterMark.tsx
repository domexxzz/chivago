/**
 * The greeter, small, for the header.
 *
 * The card lower down (`GreeterCard`) is where ChangChang is introduced: it
 * has the name, what it is, and the line saying the art was made for this
 * project. This is the same character at a glance, standing in the hero
 * beside the island's name - which is the one place in the app where saying
 * hello is literally the job of the block.
 *
 * DECORATIVE ON PURPOSE. No label and no focus: a screen reader that
 * announced "ChangChang, a travelling squirrel" here would say it twice on
 * one screen, and the time it matters is the time it is next to the facts.
 * `Creature.tsx` hides its marks for the same reason.
 *
 * The small cut of the render, not the big one scaled down: 181 x 220 is the
 * size this is drawn at, and a phone should not fetch 484 KB to show 110
 * points of squirrel.
 */

import React from 'react';
import { Image, View } from 'react-native';
import { greeterFor, type AreaKey } from '@chivago/core';
import { photoUri } from '../api/photos.ts';
import { GreeterIdle } from './GreeterIdle.tsx';

/** Drawn at this height unless a caller says otherwise. */
const MARK_HEIGHT = 132;
/** The render's own aspect, 181 x 220, so the box is the character. */
const MARK_RATIO = 181 / 220;

export function GreeterMark({ area, height = MARK_HEIGHT }: { area: AreaKey; height?: number }) {
  const greeter = greeterFor(area);
  if (!greeter) return null;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: Math.round(height * MARK_RATIO), height, justifyContent: 'flex-end' }}
    >
      {/*
        Two thirds of the movement the card's portrait gets. The same five
        points of bob beside a 34-point headline is a mascot jumping about in
        somebody's reading line; at this size it should read as alive and go
        otherwise unnoticed.
      */}
      <GreeterIdle amount={0.65} style={{ width: '100%', height: '100%' }}>
        <Image
          source={{ uri: photoUri(greeter.mark) }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </GreeterIdle>
    </View>
  );
}
