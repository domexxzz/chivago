/**
 * The Koh Samui map.
 *
 * WHICH TREATMENT SHIPS (handoff open question 1)
 * The prototype offers three: A isometric, B flat layers, C feed. The handoff
 * recommends A for launch identity with C as the accessibility fallback.
 *
 * Resolved for v1: ship B/A's flat-fill treatment with the layer chips, drawn
 * as real vector geography, and keep C available as a first-class fallback
 * (see `MapMode`).
 *
 * WHERE THIS STANDS NOW. On the web the real island ships: `TerrainMap.tsx`
 * is MapLibre GL over Terrarium elevation at pitch 60 / bearing -18, and this
 * file hands over to it (see `inBrowser` below). On a phone the SVG island
 * here is still what draws, because MapLibre native is a native module and
 * a dev build, and the app has never met one. The projection and the pin
 * layer are separate from the basemap so that swap, when it comes, replaces
 * <IslandShape> and keeps <PinChip>.
 */

import React from 'react';
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Polygon, Line } from 'react-native-svg';
import { isHighScore, type ScoredPlace } from '@chivago/core';
import { CHIP, layoutPins, tilt } from './map-geometry.ts';
import { color, layout, onFill, radius, shadow } from '../theme/index.ts';
import { Heading, Label } from './Type.tsx';
import { LayerChips, MapLegend, PinChip, PlaceFeedRow, type MapMode } from './map-parts.tsx';

// Re-exported so `MapScreen` and the tests keep importing the map's whole
// surface from one module, whichever implementation the platform resolves.
export { LayerChips, PinChip, PlaceFeedRow, type MapMode };

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

/**
 * Below this width the map is a phone, and five named pins overlap each other
 * and the basemap's labels. Score-only pins, no zoom buttons - see PinChip.
 */
const COMPACT_BELOW = 480;

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
 * The map viewport with its pins.
 *
 * `mode: 'feed'` is the accessibility / low-end fallback the handoff asks for -
 * the same data as a ranked list, which is also what a screen reader gets.
 */
/**
 * On web, hand over to the real thing.
 *
 * `TerrainMap` is loaded lazily and only when `Platform.OS` is web, so a phone
 * never evaluates MapLibre — it is 800 KB of browser code that would do nothing
 * but sit in the bundle. A `.web.tsx` platform extension would have been the
 * idiomatic switch, but Metro applies those only to extensionless imports and
 * this codebase imports with explicit `.tsx` so the node test harness resolves
 * the same files. Making the import extensionless broke every test that renders
 * MapScreen, so the branch is written out where it can be read.
 *
 * The test is for a DOM, not for the platform string. The node test harness
 * aliases react-native to react-native-web, so `Platform.OS` is 'web' there
 * too — and MapLibre needs a real `document` and a WebGL context, neither of
 * which node has. Asking whether a document exists is the question that
 * actually matters, and it covers server rendering for free.
 */
const inBrowser = Platform.OS === 'web'
  && typeof document !== 'undefined'
  && typeof window !== 'undefined';

const TerrainMap = inBrowser
  ? React.lazy(() => import('./TerrainMap.tsx').then((m) => ({ default: m.TerrainMap })))
  : null;

export interface SamuiMapProps {
  places: ScoredPlace[];
  onSelect: (place: ScoredPlace) => void;
  height?: number;
  /** Score-only pins, no zoom buttons. Decided here from the width unless a caller says. */
  compact?: boolean;
}

export function SamuiMap(props: SamuiMapProps) {
  const { width } = useWindowDimensions();
  const compact = props.compact ?? width < COMPACT_BELOW;
  if (TerrainMap) {
    return (
      <React.Suspense
        fallback={<View style={{ height: props.height ?? 344, backgroundColor: color.brandSoft }} />}
      >
        <TerrainMap {...props} compact={compact} />
      </React.Suspense>
    );
  }
  return <IslandMap {...props} compact={compact} />;
}

function IslandMap({
  places, onSelect, height = 344, compact = false,
}: SamuiMapProps) {
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
              <PinChip place={place} onPress={() => onSelect(place)} compact={compact} />
            </View>
          ))
        : null}

      {/* Legend: the island average today. */}
      <MapLegend places={places} />
      <ShapeNote />
    </View>
  );
}

/**
 * What the drawing is, and what it is not.
 *
 * The silhouette is traced from a design comp; the pins are projected from
 * true latitude and longitude. Both of those are fine, and a reader looking at
 * an authoritative-looking island is owed the difference — this map is a
 * diagram with real points on it, not survey data, and somebody should not
 * navigate a boat by the coastline.
 *
 * Bottom-left, small, and permanent. A disclosure behind a tap is a disclosure
 * for the people who already suspected.
 */
function ShapeNote() {
  return (
    <View style={{ position: 'absolute', left: 12, bottom: 12, maxWidth: 168 }}>
      <Label size={9} tracking={0.04} colour={color.neutral600} style={{ textTransform: 'none' }}>
        Stylised coastline. Pin positions are real coordinates.
      </Label>
    </View>
  );
}



