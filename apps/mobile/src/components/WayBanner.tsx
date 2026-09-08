/**
 * The route, said in words above the map that draws it.
 *
 * A line on a map is a shape; this is the sentence that makes it a claim -
 * where it goes, by which mode, how far along the road and how long. It also
 * carries the one thing a line cannot say for itself: WHETHER IT IS A ROAD.
 * When the router has not answered, the map draws the straight line dashed
 * and this says so in words, because a dashed line across a bay is a bearing
 * and a traveller who reads it as a road walks into the sea.
 *
 * Three states and none of them is an error screen. A free community server
 * (`packages/core/src/routing.ts`) going quiet is a normal afternoon, not a
 * fault worth a red box: the map still shows the place, the direction and
 * the distance it always did.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { Footprints, Route as RouteIcon, X } from 'lucide-react-native';
import { formatDistance, formatDuration, strings, type Route, type RouteMode, type ScoredPlace } from '@chivago/core';
import { color, gutter, onFill, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';

export function WayBanner({
  place, route, loading, failed, haveHere, mode, onMode, onClear,
}: {
  place: ScoredPlace;
  route: Route | null;
  loading: boolean;
  failed: boolean;
  /** Without a position there is no line to draw and nothing to route from. */
  haveHere: boolean;
  mode: RouteMode;
  onMode: (mode: RouteMode) => void;
  onClear: () => void;
}) {
  const summary = route
    ? t(strings.map.waySummary(t(formatDistance(route.metres)), t(formatDuration(route.seconds))))
    : loading
      ? t(strings.map.wayLoading)
      : haveHere
        ? t(strings.map.wayStraight)
        : t(strings.place.distanceUnknown);

  return (
    <View style={{ paddingHorizontal: gutter, paddingBottom: 10 }}>
      <View
        style={[shadow.card, {
          padding: 12, backgroundColor: color.surface, borderRadius: radius.md,
          borderLeftWidth: 4, borderLeftColor: color.ctaDeep,
        }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Heading size={15}>{t(strings.map.wayTo(t(place.name)))}</Heading>
            <Body
              size={13}
              colour={route ? color.neutral800 : color.neutral700}
              style={{ marginTop: 2 }}
            >
              {summary}
            </Body>
          </View>
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel={t(strings.map.wayClear)}
            hitSlop={10}
            style={{ padding: 4 }}
          >
            <X size={18} color={color.neutral700} strokeWidth={2} />
          </Pressable>
        </View>

        {/*
          Walking first, because walking is what this product pays for. Two
          modes and not five: the moto and the songthaew follow the same
          roads at roughly the same speed, and a third line labelled
          "songthaew" would be the car answer wearing a different name.
        */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <ModeChip
            label={t(strings.map.wayWalk)}
            icon={Footprints}
            active={mode === 'walk'}
            onPress={() => onMode('walk')}
          />
          <ModeChip
            label={t(strings.map.wayRide)}
            icon={RouteIcon}
            active={mode === 'ride'}
            onPress={() => onMode('ride')}
          />
        </View>
      </View>
    </View>
  );
}

function ModeChip({
  label, icon: Icon, active, onPress,
}: {
  label: string;
  icon: typeof Footprints;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.lg,
        backgroundColor: active ? color.brand : color.surface,
        borderWidth: 1, borderColor: active ? color.brand : color.neutral300,
      }}
    >
      <Icon size={14} color={active ? onFill.brand : color.neutral700} strokeWidth={2} />
      <Label size={10} tracking={0.08} colour={active ? onFill.brand : color.neutral700}>{label}</Label>
    </Pressable>
  );
}
