/**
 * The map's furniture, shared by both implementations.
 *
 * The native map draws a tilted SVG island; the web map draws real terrain
 * through MapLibre. What sits ON either of them — the score chips, the layer
 * filter, the ranked feed, the island average — is the same product in both,
 * so it lives here rather than being written twice and drifting.
 */

import React from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { isHighScore, nearestFirst, strings, wayThere, type ExploredPlace, type ScoredPlace } from '@chivago/core';
import { color, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { API_BASE } from '../api/client.ts';
import { TALE_H, TALE_W } from './map-geometry.ts';
import { Body, Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';
import { ChivarIcon, placeIconName } from './ChivarIcon.tsx';

/**
 * A map pin chip.
 * Score >= 85 inverts to an accent fill; everything else is bg with an ink
 * border. The threshold lives in @chivago/core so the map, the feed bar and the
 * place header can never disagree.
 */
export function PinChip({
  place, onPress, storied = false, tale = null, onOpenStory,
}: {
  place: ScoredPlace;
  onPress: () => void;
  storied?: boolean;
  /**
   * The newest story's poster at this place, as a path on the API. When one
   * is here the pin WEARS the photograph instead of only hinting at it.
   */
  tale?: string | null;
  onOpenStory?: () => void;
}) {
  const high = isHighScore(place.healthyScore);
  const showTale = tale !== null && onOpenStory !== undefined;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t(place.name)}, ${t(strings.place.healthyScore)} ${place.healthyScore}`}
      style={{ alignItems: 'center' }}
    >
      {/*
        Top-aligned, not centred.

        Centred looked right and was not: the row's other child is the chip
        AND its 16 px stem, so centring hung the bubble eight pixels below
        the chip - far enough for its lower edge to cross into the top of the
        chip below it, measured in a browser. Aligned to the top edge it
        matches the chip it belongs to, which is what the eye reads anyway.
      */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: TALE_GAP }}>
        {showTale ? <TaleBubble place={place} poster={tale} onPress={onOpenStory} /> : null}

        {/*
          The stem belongs to the CHIP, not to chip-plus-poster.

          The bubble hangs off the left in the same row, so a stem centred
          under the whole row would sit about twenty pixels east of the point
          it claims to mark - which on a map of one island is a different
          beach. This column holds the chip and its stem alone; the caller
          shifts the pin left by TALE_W to make room for the bubble.
        */}
        <View style={{ alignItems: 'center' }}>
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
                // Gold: the ring a place wears when it has a story (docs/45).
                borderColor: storied ? color.gold : high ? color.accent : color.text,
              },
            ]}
          >
            <Heading size={13} colour={high ? onFill.accent : color.text}>{place.healthyScore}</Heading>
            {/*
              The name rides with the score at every width.

              It was dropped on a phone for a fortnight because the five names
              overlapped each other, Fisherman's covering Chaweng entirely. The
              collision was real and the answer was wrong: a chip reading "81"
              over a coastline says the air is good SOMEWHERE, and leaves you to
              tap five pins to find out where. Room is what was missing, and
              `layoutPins` has always reserved a NAMED chip's footprint -
              CHIP.halfWidth is 46, which is score plus name, not score alone.
              So the names go back and the de-collision does its job.
            */}
            <Label size={9} tracking={0.1} colour={high ? onFill.accent : color.text}>{place.short}</Label>
          </View>
          {/* The 2x16 ink stem that pins the chip to its point. */}
          <View style={{ width: 2, height: 16, backgroundColor: color.text }} />
        </View>
      </View>
    </Pressable>
  );
}

/**
 * The poster's diameter and the gap to the chip; together they are TALE_W,
 * and the diameter is TALE_H. Sized in map-geometry.ts, where the reason
 * lives: on a 344 px island with five places on one coast, a bigger bubble
 * is a better photograph and a worse map.
 */
const TALE_SIZE = TALE_H;
const TALE_GAP = TALE_W - TALE_H;

/**
 * The photograph somebody took here, on the pin.
 *
 * A gold ring said a place HAD a story and never showed one, which on a map
 * is most of the point. Its own press, because it opens something else: the
 * chip goes to the place, the bubble goes to the clip.
 */
function TaleBubble({
  place, poster, onPress,
}: { place: ScoredPlace; poster: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t(strings.place.stories)}: ${t(place.name)}`}
      style={[
        shadow.sm,
        {
          width: TALE_SIZE, height: TALE_SIZE, borderRadius: TALE_SIZE / 2,
          borderWidth: 2, borderColor: color.gold, padding: 1.5,
          backgroundColor: color.bg,
        },
      ]}
    >
      <Image
        source={{ uri: `${API_BASE}${poster}` }}
        resizeMode="cover"
        style={{
          width: '100%', height: '100%', borderRadius: TALE_SIZE / 2,
          backgroundColor: color.neutral200,
        }}
      />
    </Pressable>
  );
}

export type MapMode = 'map' | 'feed';

/** How many of the places on screen this traveller has been to. */
export const exploredCount = (places: readonly { id: string }[], explored: readonly ExploredPlace[]): number => {
  const been = new Set(explored.map((e) => e.placeId));
  return places.filter((p) => been.has(p.id)).length;
};

export function MapLegend({ places, explored = [] }: { places: ScoredPlace[]; explored?: ExploredPlace[] }) {
  if (places.length === 0) return null;
  const avg = Math.round(places.reduce((a, p) => a + p.healthyScore, 0) / places.length);
  const reached = exploredCount(places, explored);
  return (
    <View
      /*
        Named for the terrain map's declutter, which treats this panel as
        ground already taken and steps its quest marks around it rather than
        behind it - see `spreadTheMarks`. The class names react-native-web
        generates are hashes, so `nativeID` - which reaches the DOM as a
        plain `id` - is the one thing here a selector can hold on to.
      */
      nativeID="cg-legend"
      style={{
        position: 'absolute',
        // Bottom-RIGHT: the island's southern tip and the Thong Krut pin both
        // sit bottom-left, and the design's original placement collided with
        // them once the pins carried real coordinates.
        right: 12,
        bottom: 12,
        borderWidth: layout.ruleHair,
        borderColor: color.neutral300,
        backgroundColor: color.bg,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: radius.sm,
      }}
    >
      <Label size={9} tracking={0.12}>{t(strings.map.legend(avg))}</Label>
      <View style={{ width: 64, height: 6, backgroundColor: color.neutral300, marginTop: 6 }}>
        {/* Green only when the average has earned it - see ImpactScreen. */}
        <View style={{ width: `${avg}%`, height: '100%', backgroundColor: isHighScore(avg) ? color.accent : color.neutral600 }} />
      </View>
      {/*
        The chart's own count: places reached, of the places shown. Zero is
        printed, not hidden - an unexplored island is the truthful start.
      */}
      <Label size={9} tracking={0.12} colour={color.neutral700} style={{ marginTop: 6 }}>
        {t(strings.map.explored(reached, places.length))}
      </Label>
    </View>
  );
}

/**
 * The layer chips. Each place carries exactly one layer key, so the filter is a
 * straight predicate rather than a set intersection.
 *
 * The KEY is state and stays English; what the chip says is the layer's name in
 * the reader's language. They used to be the same string, so a Thai reader got
 * a row of English on the first screen they see.
 */
/** A layer's name in the reader's language, or its key if it is not a known layer. */
const layerName = (key: string): string => {
  const named = (strings.map.layers as Record<string, { en: string; th: string } | undefined>)[key];
  return named ? t(named) : key;
};

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
          accessibilityLabel={`${layerName(key)} layer`}
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
            paddingHorizontal: 12,
            borderWidth: 1.5,
            borderRadius: 22,
            // A layer switch is a map control, not a measurement.
            borderColor: on ? color.brand : '#CBE7F0',
            backgroundColor: on ? color.brand : color.surface,
          }}
        >
          <Label size={11} tracking={0.06} colour={on ? onFill.brand : color.neutral700}>{layerName(key)}</Label>
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
      accessibilityLabel={`${t(place.name)}, ${t(strings.place.healthyScore)} ${place.healthyScore}. ${place.meta}`}
      style={[
        shadow.card,
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          marginHorizontal: 18,
          marginTop: 10,
          paddingVertical: 14,
          paddingHorizontal: 16,
          backgroundColor: color.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: '#DCEFF5',
        },
      ]}
    >
      <ChivarIcon name={placeIconName(place)} size={42} />
      <View style={{ width: 38 }}>
        <Heading size={24} colour={color.accent700}>{place.healthyScore}</Heading>
      </View>
      <View style={{ flex: 1 }}>
        <Heading size={15}>{t(place.name)}</Heading>
        <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 2 }}>{place.meta}</Label>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: color.neutral200, marginTop: 8, overflow: 'hidden' }}>
          <View
            style={{
              width: `${place.healthyScore}%`,
              height: '100%',
              borderRadius: 3,
              backgroundColor: high ? color.accent : color.brand,
            }}
          />
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Which way, and how far — the question the drawn map cannot answer.
 *
 * WHAT WAS WRONG. On a phone the map is a traced outline with a score on
 * each pin, and on Samui nothing under it at all. The biggest number on the
 * screen, the one the eye lands on first, is the Healthy Score: a judgement
 * about a place's air and quiet, and the one fact a traveller who does not
 * know where they are has no use for. Somebody lost read "81" and learned
 * nothing about getting anywhere. The island shape is traced coastline with
 * no roads, no scale and no north, so it could not help them either.
 *
 * The app already knew all of this. `wayThere` returns the distance, the
 * compass point and the walk in minutes, and `nearestFirst` orders by it -
 * both pure, both in core, both already translated. They were only ever
 * read on the PLACE screen, which is one tap PAST the screen where somebody
 * is asking "where am I and what is near me".
 *
 * NEAREST FIRST, because that is the order the question is asked in. The
 * score stays on the right, quieter: it is still why this app exists, and
 * it is no longer the only thing a map can tell you.
 *
 * NO PERMISSION DIALOG. With no position this says what is missing and
 * stops. `state/here.ts` is explicit that a check-in is what asks for
 * location, because an app that raises the dialog for a convenience teaches
 * people to tap Deny by reflex and then loses the request that mattered.
 */
export function NearYou({
  places, here, onSelect, limit = 4,
}: {
  places: ScoredPlace[];
  here: { lat: number; lng: number } | null;
  onSelect: (place: ScoredPlace) => void;
  /** Four fills a thumb's reach without turning the map into a list. */
  limit?: number;
}) {
  if (places.length === 0) return null;
  const near = nearestFirst(places, here).slice(0, limit);
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 14 }}>
      <Label size={10} tracking={0.14} colour={color.brand}>
        {here
          ? t({ en: 'Nearest to you', th: 'ใกล้คุณที่สุด', zh: '离你最近' })
          : t({ en: 'Places in this area', th: 'สถานที่ในพื้นที่นี้', zh: '该区域的地点' })}
      </Label>

      {/* Said once, above the rows, rather than as a blank beside each one. */}
      {here ? null : (
        <Body size={13} colour={color.neutral700} style={{ marginTop: 4 }}>
          {t(strings.place.distanceUnknown)}
        </Body>
      )}

      {near.map((place) => {
        const way = here ? wayThere(here, place) : null;
        /*
          The walk is quoted only when walking is a real choice - the same
          rule `GettingThere` follows, and for the same reason: "about 105
          min on foot" beside eight kilometres is not information anybody
          can act on, on this island in this heat.
        */
        const line = way
          ? way.arrived
            ? t(strings.place.arrived)
            : `${t(strings.place.away(t(way.distance), t(way.direction)))}`
              + (way.walkable ? ` · ${t(strings.place.onFoot(way.minutesOnFoot))}` : '')
          : null;
        return (
          <Pressable
            key={place.id}
            onPress={() => onSelect(place)}
            accessibilityRole="button"
            accessibilityLabel={line ? `${t(place.name)}. ${line}` : t(place.name)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44,
              paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.neutral300,
            }}
          >
            <View style={{ flex: 1 }}>
              <Heading size={15}>{t(place.name)}</Heading>
              {line ? <Body size={13} colour={color.neutral700}>{line}</Body> : null}
            </View>
            <Label
              size={11}
              tracking={0}
              colour={isHighScore(place.healthyScore) ? color.accent700 : color.neutral600}
              style={{ textTransform: 'none' }}
            >
              {String(place.healthyScore)}
            </Label>
          </Pressable>
        );
      })}
    </View>
  );
}
