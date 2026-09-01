/**
 * The Koh Samui map.
 *
 * WHICH TREATMENT SHIPS (handoff open question 1)
 * The prototype offers three: A isometric, B flat layers, C feed. The handoff
 * recommends A for launch identity with C as the accessibility fallback.
 *
 * Resolved for v1: ship B/A's flat-fill treatment with the layer chips, drawn
 * as real vector geography, and keep C available as a first-class fallback
 * (see `MapMode`). Reasoning:
 *  - The isometric board in the prototype is a CSS 3D trick over a fake island.
 *    Faking it in the app would be worse; doing it properly needs MapLibre with
 *    pitch 52 / bearing -38, which is a native module and a dev build.
 *  - This component draws the island as SVG from real coordinates, so it runs
 *    everywhere today AND is a straight swap for MapLibre later: the projection
 *    and the marker layer are already separated from the basemap.
 *
 * TO SWAP IN MAPLIBRE: replace <IslandShape> with the map view, keep
 * `project()` for nothing (the SDK projects), and keep <PinChip> as a
 * screen-space marker that ignores pitch.
 */

import React from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Polygon, Line } from 'react-native-svg';
import { isHighScore, type ScoredPlace } from '@chivago/core';
import { CHIP, layoutPins, tilt } from './map-geometry.ts';
import { color, layout, onFill, radius, shadow } from '../theme/index.ts';
import { Heading, Label } from './Type.tsx';

/**
 * The island silhouette, traced from the approved comp.
 * Kept in 0-100 plan space; the tilt turns it into the drawn ground plane.
 */
const ISLAND = '28,4 62,0 86,18 96,46 88,74 66,96 34,100 12,78 4,44 14,18';
/** The inland massif - the higher ground through the island's centre. */
const MASSIF = '42,30 64,26 74,44 66,62 46,66 34,50';

/**
 * The island is drawn into a slightly inset box so its southern tip does not
 * run off the bottom of the viewport, and so the legend has clear ground.
 */
const SHAPE_PAD = { x: 0.03, y: 0.04 };

/** Extrusion depths, as a fraction of the drawn height. */
const DEPTH = { coast: 0.075, massif: 0.13 } as const;

const parse = (points: string) =>
  points.split(' ').map((p) => {
    const [a, b] = p.split(',').map(Number);
    return { a: a!, b: b! };
  });

/**
 * The island, extruded.
 *
 * Real 3D would need a mesh, a camera and a renderer none of this screen can
 * carry. What it needs instead is the READING of depth, which two cheap tricks
 * give completely:
 *
 *  1. every point goes through the same ground-plane `tilt` the pins do, so
 *     the far (northern) coast is narrower and the plane recedes;
 *  2. each landmass is drawn twice - once dropped by its depth as a dark base,
 *     once at full height as the lit top - and the sliver between them reads
 *     as the thickness of the land.
 *
 * The pins ride the identical transform, so a chip stands ON the island rather
 * than beside it. That shared transform is the whole reason this holds
 * together; if the two ever drift apart the map is lying about where things are.
 */
function IslandShape({ width, height }: { width: number; height: number }) {
  const pt = (a: number, b: number) => {
    const t = tilt(a / 100, b / 100);
    return {
      x: (SHAPE_PAD.x + t.x * (1 - SHAPE_PAD.x * 2)) * width,
      y: (SHAPE_PAD.y + t.y * (1 - SHAPE_PAD.y * 2)) * height,
    };
  };
  const poly = (points: string, dy = 0) =>
    parse(points).map(({ a, b }) => {
      const { x, y } = pt(a, b);
      return `${x},${y + dy}`;
    }).join(' ');

  const coastDrop = height * DEPTH.coast;
  const massifDrop = height * DEPTH.massif;

  // A sea grid in the same perspective: lines converge toward the far edge, so
  // the water reads as a plane rather than as graph paper behind the island.
  const grid = [];
  for (let i = 0; i <= 10; i += 1) {
    const a = pt(-40 + i * 18, -20);
    const b = pt(-40 + i * 18, 130);
    grid.push(
      <Line key={`v${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke={color.neutral300} strokeWidth={1} opacity={0.55} />,
    );
  }
  for (let i = 0; i <= 8; i += 1) {
    // Squared spacing: rows bunch toward the horizon the way a real plane does.
    const b = -20 + 150 * (i / 8) ** 1.7;
    const l = pt(-40, b);
    const r = pt(140, b);
    grid.push(
      <Line key={`h${i}`} x1={l.x} y1={l.y} x2={r.x} y2={r.y}
        stroke={color.neutral300} strokeWidth={1} opacity={0.55} />,
    );
  }

  return (
    <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
      {grid}

      {/* Coast. Three stacked copies: the deepest reads as the cliff base, the
          middle as the wall catching some light, the top as the lit ground.
          The steps must differ clearly in value or the whole thing flattens. */}
      <Polygon points={poly(ISLAND, coastDrop)} fill={color.neutral900} />
      <Polygon points={poly(ISLAND, coastDrop * 0.55)} fill={color.neutral100} />
      <Polygon
        points={poly(ISLAND)}
        fill={color.neutral300}
        stroke={color.brand}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Massif: the same three steps again, standing on the coastal plate. */}
      <Polygon points={poly(MASSIF)} fill={color.neutral100} />
      <Polygon points={poly(MASSIF, -massifDrop * 0.5)} fill={color.neutral200} />
      <Polygon
        points={poly(MASSIF, -massifDrop)}
        fill={color.neutral400}
        stroke={color.brand}
        strokeWidth={1.5}
        strokeOpacity={0.55}
        strokeLinejoin="round"
      />

      {/* Two roads, on the lit top face. */}
      <Path
        d={`M ${pt(14, 30).x} ${pt(14, 30).y} Q ${pt(50, 12).x} ${pt(50, 12).y} ${pt(90, 38).x} ${pt(90, 38).y}`}
        stroke={color.neutral600} strokeWidth={1.5} fill="none" opacity={0.55}
      />
      <Path
        d={`M ${pt(20, 74).x} ${pt(20, 74).y} Q ${pt(55, 60).x} ${pt(55, 60).y} ${pt(86, 70).x} ${pt(86, 70).y}`}
        stroke={color.neutral600} strokeWidth={1.5} fill="none" opacity={0.55}
      />
    </Svg>
  );
}

/**
 * A map pin chip.
 * Score >= 85 inverts to an accent fill; everything else is bg with an ink
 * border. The threshold lives in @chivago/core so the map, the feed bar and the
 * place header can never disagree.
 */
export function PinChip({
  place, onPress,
}: { place: ScoredPlace; onPress: () => void }) {
  const high = isHighScore(place.healthyScore);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${place.name.en}, Healthy Score ${place.healthyScore}`}
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
        <Label size={9} tracking={0.1} colour={high ? onFill.accent : color.text}>{place.short}</Label>
      </View>
      {/* The 2x16 ink stem that pins the chip to its point. */}
      <View style={{ width: 2, height: 16, backgroundColor: color.text }} />
    </Pressable>
  );
}

export type MapMode = 'map' | 'feed';

/**
 * The map viewport with its pins.
 *
 * `mode: 'feed'` is the accessibility / low-end fallback the handoff asks for -
 * the same data as a ranked list, which is also what a screen reader gets.
 */
export function SamuiMap({
  places, onSelect, height = 344,
}: {
  places: ScoredPlace[];
  onSelect: (place: ScoredPlace) => void;
  height?: number;
}) {
  /**
   * The map is full-bleed, so the window IS its width.
   *
   * It used to wait for `onLayout` and render nothing until that arrived.
   * On web that callback comes from a ResizeObserver which, for an element
   * whose size never changes after it is observed, may never fire at all -
   * and when it did not, the map drew an empty box with a legend in it and
   * said nothing. No error, no missing data: five pins simply absent.
   *
   * The window dimension is the floor, and `onLayout` still refines it if it
   * ever arrives with something different (a tablet split view, a resize).
   * A map that depends on a callback that may not come is a map that
   * sometimes is not there.
   */
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = React.useState(0);
  const width = measured > 0 ? measured : windowWidth;

  return (
    <View
      onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}
      style={{
        height,
        backgroundColor: color.neutral200,
        borderBottomWidth: layout.ruleStrong,
        borderBottomColor: color.text,
      }}
    >
      {width > 0 ? <IslandShape width={width} height={height} /> : null}

      {width > 0
        ? layoutPins(places, width, height).map(({ place, left, top }) => (
            <View
              key={place.id}
              style={{
                position: 'absolute',
                left,
                top,
                // Anchor the chip's stem tip on the point.
                transform: [{ translateX: -CHIP.halfWidth }, { translateY: -40 }],
              }}
            >
              <PinChip place={place} onPress={() => onSelect(place)} />
            </View>
          ))
        : null}

      {/* Legend: the island average today. */}
      <MapLegend places={places} />
    </View>
  );
}

function MapLegend({ places }: { places: ScoredPlace[] }) {
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
            paddingHorizontal: 14,
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
      accessibilityLabel={`${place.name.en}, Healthy Score ${place.healthyScore}. ${place.meta}`}
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
        <Heading size={15}>{place.name.en}</Heading>
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
