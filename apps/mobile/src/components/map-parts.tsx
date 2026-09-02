/**
 * The map's furniture, shared by both implementations.
 *
 * The native map draws a tilted SVG island; the web map draws real terrain
 * through MapLibre. What sits ON either of them — the score chips, the layer
 * filter, the ranked feed, the island average — is the same product in both,
 * so it lives here rather than being written twice and drifting.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { isHighScore, type ScoredPlace } from '@chivago/core';
import { color, layout, onFill, radius, shadow } from '../theme/index.ts';
import { Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';

/**
 * A map pin chip.
 * Score >= 85 inverts to an accent fill; everything else is bg with an ink
 * border. The threshold lives in @chivago/core so the map, the feed bar and the
 * place header can never disagree.
 */
export function PinChip({
  place, onPress, compact = false,
}: { place: ScoredPlace; onPress: () => void; compact?: boolean }) {
  const high = isHighScore(place.healthyScore);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t(place.name)}, Healthy Score ${place.healthyScore}`}
      style={{ alignItems: 'center' }}
    >
      <View
        style={[
          shadow.sm,
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingVertical: 3,
            paddingHorizontal: 6,
            borderWidth: 2,
            borderRadius: radius.sm,
            backgroundColor: high ? color.accent : color.bg,
            borderColor: high ? color.accent : color.text,
          },
        ]}
      >
        <Heading size={13} colour={high ? onFill.accent : color.text}>{place.healthyScore}</Heading>
        {/*
          On a phone-width map the five names overlapped each other and the
          basemap's own labels; Fisherman's covered Chaweng entirely. Narrow
          maps show the score alone - the name is one tap away, and the
          screen reader still gets it from the label above.
        */}
        {compact ? null : (
          <Label size={9} tracking={0.1} colour={high ? onFill.accent : color.text}>{place.short}</Label>
        )}
      </View>
      {/* The 2x16 ink stem that pins the chip to its point. */}
      <View style={{ width: 2, height: 16, backgroundColor: color.text }} />
    </Pressable>
  );
}

export type MapMode = 'map' | 'feed';

export function MapLegend({ places }: { places: ScoredPlace[] }) {
  if (places.length === 0) return null;
  const avg = Math.round(places.reduce((a, p) => a + p.healthyScore, 0) / places.length);
  return (
    <View
      style={{
        position: 'absolute',
        // Bottom-RIGHT: the island's southern tip and the Thong Krut pin both
        // sit bottom-left, and the design's original placement collided with
        // them once the pins carried real coordinates.
        right: 12,
        bottom: 12,
        borderWidth: layout.ruleStrong,
        borderColor: color.text,
        backgroundColor: color.bg,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: radius.sm,
      }}
    >
      <Label size={9} tracking={0.12}>{`Healthy Score · ${avg} avg today`}</Label>
      <View style={{ width: 64, height: 6, backgroundColor: color.neutral300, marginTop: 6 }}>
        {/* Green only when the average has earned it - see ImpactScreen. */}
        <View style={{ width: `${avg}%`, height: '100%', backgroundColor: isHighScore(avg) ? color.accent : color.neutral600 }} />
      </View>
    </View>
  );
}

/**
 * The layer chips. Each place carries exactly one layer key, so the filter is a
 * straight predicate rather than a set intersection.
 */
export function LayerChips({
  layers, onToggle,
}: {
  layers: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingVertical: 10 }}
      style={{ borderBottomWidth: 1, borderBottomColor: color.neutral300 }}
    >
      {Object.entries(layers).map(([key, on]) => (
        <Pressable
          key={key}
          onPress={() => onToggle(key)}
          accessibilityRole="switch"
          accessibilityState={{ checked: on }}
          accessibilityLabel={`${key} layer`}
          style={{
            // 44 is not decoration. At paddingVertical 6 these came out 28px
            // tall - a third under the iOS floor - and they are the primary
            // control on the first screen, pressed one-handed on a boat, on a
            // scooter, with wet hands. minHeight rather than more padding, so
            // the target is guaranteed whatever the font metrics do.
            minHeight: 44,
            justifyContent: 'center',
            paddingVertical: 6,
            // 10, not 14: at 14 the five chips came to 396px and QUEST was cut
            // off at the edge of a 390px phone, which reads as broken rather
            // than scrollable. At 10 they fit with room on a 375px one.
            paddingHorizontal: 10,
            borderWidth: 2,
            borderRadius: radius.sm,
            // A layer switch is a map control, not a measurement.
            borderColor: on ? color.brand : color.neutral400,
            backgroundColor: on ? color.brand : 'transparent',
          }}
        >
          <Label size={11} tracking={0.06} colour={on ? onFill.brand : color.neutral700}>{key}</Label>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/**
 * Variant C - the ranked feed.
 * Kept as a peer of the map, not a degraded mode: on a low-end phone or with
 * reduce-motion on, this is the better experience, and it is what assistive
 * technology reads either way.
 */
export function PlaceFeedRow({
  place, onPress,
}: { place: ScoredPlace; onPress: () => void }) {
  const high = isHighScore(place.healthyScore);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t(place.name)}, Healthy Score ${place.healthyScore}. ${place.meta}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 13,
        paddingHorizontal: 18,
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
      }}
    >
      <View style={{ width: 38 }}>
        <Heading size={24} colour={color.accent700}>{place.healthyScore}</Heading>
      </View>
      <View style={{ flex: 1 }}>
        <Heading size={15}>{t(place.name)}</Heading>
        <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 2 }}>{place.meta}</Label>
        <View style={{ height: 4, backgroundColor: color.neutral300, marginTop: 8 }}>
          <View
            style={{
              width: `${place.healthyScore}%`,
              height: '100%',
              backgroundColor: high ? color.accent : color.text,
            }}
          />
        </View>
      </View>
    </Pressable>
  );
}
