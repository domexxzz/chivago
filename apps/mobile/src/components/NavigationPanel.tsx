/**
 * The trip panel: what is left, and the two controls that end or widen it.
 *
 * Three numbers and two buttons, and the restraint is the design. A
 * navigation screen is read in the gaps between looking at a road, so
 * everything that is not distance, time or arrival has been left off -
 * including everything the brief ruled out and would otherwise creep back
 * in here: no SOS, no audio, no mute, no alternative routes, no layer
 * pickers.
 *
 * The numbers are formatted by the same functions the rest of the app uses
 * (`formatDistance`, `formatDuration`), which round to the precision the
 * measurement deserves rather than the precision it arrives with - so the
 * panel cannot claim a four-metre accuracy the GPS does not have, and the
 * arrival time cannot claim a router's seconds are a promise.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { Layers, Square } from 'lucide-react-native';
import { formatDistance, formatDuration, strings } from '@chivago/core';

import { color, gutter, onFill, radius, shadow } from '../theme/index.ts';
import { Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';
import { formatTime } from '../i18n/format.ts';

export function NavigationPanel({
  remainingM, remainingSeconds, arriveAt, onOverview, onStop, overviewActive,
}: {
  remainingM: number;
  remainingSeconds: number;
  /** The wall clock the traveller is expected to reach the place at. */
  arriveAt: Date;
  onOverview: () => void;
  onStop: () => void;
  /** True while the whole route is framed, so the button reads as a toggle. */
  overviewActive: boolean;
}) {
  const distance = t(formatDistance(remainingM));
  const duration = t(formatDuration(remainingSeconds));
  const clock = formatTime(arriveAt);

  return (
    <View style={{ paddingHorizontal: gutter, paddingBottom: 10 }}>
      <View
        style={[shadow.card, {
          backgroundColor: color.surface, borderRadius: radius.sm, padding: 14, gap: 12,
        }]}
      >
        {/*
          One accessible label for the three figures. A screen reader
          announcing "2.4 km, Left, 30 min, Time, 14:35" reads as a form;
          the sentence reads as an answer.
        */}
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}
          accessible
          accessibilityRole="text"
          accessibilityLabel={t(strings.navigate.tripSummary(distance, duration, clock))}
        >
          <Figure value={distance} caption={t(strings.navigate.remaining)} strong />
          <Figure value={duration} caption={t(strings.navigate.timeLeft)} />
          <Figure value={clock} caption={t(strings.navigate.arrival)} />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={onOverview}
            accessibilityRole="button"
            accessibilityLabel={t(strings.navigate.overview)}
            accessibilityState={{ selected: overviewActive }}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              minHeight: 48, borderRadius: radius.sm,
              backgroundColor: overviewActive ? color.brand : color.surface,
              borderWidth: 1, borderColor: overviewActive ? color.brand : color.neutral300,
            }}
          >
            <Layers size={18} color={overviewActive ? onFill.brand : color.brand} strokeWidth={2} />
            <Label size={11} tracking={0.08} colour={overviewActive ? onFill.brand : color.brand}>
              {t(strings.navigate.overview)}
            </Label>
          </Pressable>
          <Pressable
            onPress={onStop}
            accessibilityRole="button"
            accessibilityLabel={t(strings.navigate.stopA11y)}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              minHeight: 48, borderRadius: radius.sm, backgroundColor: color.ctaDeep,
            }}
          >
            <Square size={14} color={onFill.ctaDeep} strokeWidth={3} />
            <Label size={11} tracking={0.08} colour={onFill.ctaDeep}>{t(strings.navigate.stop)}</Label>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * One figure and its caption.
 *
 * Not individually labelled: the row above is `accessible`, which makes it
 * one node carrying the whole sentence. Labelling each figure as well would
 * have a screen reader read every number twice, once as a fragment.
 */
function Figure({ value, caption, strong = false }: {
  value: string; caption: string; strong?: boolean;
}) {
  return (
    <View>
      <Heading size={strong ? 22 : 18} colour={strong ? color.text : color.neutral800}>{value}</Heading>
      <Label size={9} tracking={0.12} colour={color.neutral600} style={{ marginTop: 2 }}>{caption}</Label>
    </View>
  );
}
