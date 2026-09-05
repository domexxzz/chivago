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
import { Animated, Easing, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Line, Mask, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { isHighScore, type Area, type ExploredPlace, type Quest, type QuestProgress, type ScoredPlace } from '@chivago/core';
import { t } from '../i18n/locale.ts';
import { CHIP, REVEAL_FEATHER, layoutPins, mistCircles, tilt } from './map-geometry.ts';
import { cloudField } from './terrain-style.ts';
import { useReduceMotion } from './reduce-motion.ts';
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
 * A loop from 0 to 1 over `ms`, forever, on the native driver; or held at 0
 * for anyone who asked for less motion. What the drawn island's weather and
 * water ride on.
 */
function useDrift(ms: number, still: boolean): Animated.Value {
  const v = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (still) { v.setValue(0); return undefined; }
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [v, ms, still]);
  return v;
}

/** The crest marks' tile, in pixels, and how long one tile's worth of drift takes. */
const SWELL_TILE = 96;
const SWELL_MS = 7000;

/**
 * The water on the drawn island: small crests scattered on a tile, the tile
 * repeated, the whole sheet drifting one tile's width and height per loop
 * so the wrap is invisible. Behind the island; the island paints over it.
 */
function DrawnSwell({ width, height, still }: { width: number; height: number; still: boolean }) {
  const drift = useDrift(SWELL_MS, still);
  const cols = Math.ceil(width / SWELL_TILE) + 2;
  const rows = Math.ceil(height / SWELL_TILE) + 2;
  // Six crests to a tile, placed once. Not random: the same sea every time.
  const crests = [[8, 14], [52, 30], [26, 58], [74, 70], [60, 6], [12, 84]] as const;
  const marks: React.ReactElement[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      for (const [x, y] of crests) {
        const px = c * SWELL_TILE + x;
        const py = r * SWELL_TILE + y;
        marks.push(
          <Path key={`${r}-${c}-${x}`} d={`M${px} ${py} q 5 -3 10 0`} stroke={color.brand}
            strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.45} />,
        );
      }
    }
  }
  const tx = drift.interpolate({ inputRange: [0, 1], outputRange: [-SWELL_TILE, 0] });
  const ty = drift.interpolate({ inputRange: [0, 1], outputRange: [-SWELL_TILE, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, transform: [{ translateX: tx }, { translateY: ty }] }}
    >
      <Svg width={cols * SWELL_TILE} height={rows * SWELL_TILE}>{marks}</Svg>
    </Animated.View>
  );
}

/** One crossing of the island by a cloud shadow. */
const CLOUD_MS = 110_000;

/**
 * Cloud shadows on the drawn island: the same seeded field the web map
 * drifts, drawn twice side by side and slid one width per loop, so a shadow
 * leaving the east is already arriving from the west. Over the island,
 * under the mist and the pins.
 */
function DrawnClouds({ width, height, still }: { width: number; height: number; still: boolean }) {
  const drift = useDrift(CLOUD_MS, still);
  const clouds = React.useMemo(() => cloudField(0), []);
  const tx = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -width] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, transform: [{ translateX: tx }] }}
    >
      <Svg width={width * 2} height={height}>
        <Defs>
          {clouds.map((c, i) => (
            <RadialGradient key={i} id={`cloud-${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={color.brandDeep} stopOpacity={c.depth * 0.34} />
              <Stop offset="0.6" stopColor={color.brandDeep} stopOpacity={c.depth * 0.2} />
              <Stop offset="1" stopColor={color.brandDeep} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {[0, 1].map((copy) => clouds.map((c, i) => (
          <Ellipse
            key={`${copy}-${i}`}
            cx={(c.x + copy) * width}
            cy={c.y * height}
            rx={c.rx * width}
            ry={c.ry * height * 1.6}
            fill={`url(#cloud-${i})`}
          />
        )))}
      </Svg>
    </Animated.View>
  );
}

/**
 * The mist on the drawn island: a parchment haze over the whole map, cleared
 * in a feathered circle around every place the traveller has reached - the
 * same circles the web map clears, through the same transform as the pins.
 * A mask, so two circles that overlap simply overlap.
 */
function DrawnMist({
  width, height, explored, places,
}: { width: number; height: number; explored: ExploredPlace[]; places: ScoredPlace[] }) {
  const circles = mistCircles(explored, places, width, height);
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
      <Defs>
        <RadialGradient id="reveal" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#000000" stopOpacity={1} />
          <Stop offset={REVEAL_FEATHER} stopColor="#000000" stopOpacity={1} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
        <Mask id="mist" maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />
          {circles.map((c, i) => (
            <Ellipse key={i} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill="url(#reveal)" />
          ))}
        </Mask>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="#efe4c9" opacity={0.34} mask="url(#mist)" />
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

/**
 * `?map=drawn` on the web shows the phone's island instead of the terrain:
 * for looking at what a phone draws without a phone, which is how the drawn
 * weather was checked.
 */
const drawnByChoice = inBrowser
  && new URLSearchParams(window.location.search).get('map') === 'drawn';

const TerrainMap = inBrowser && !drawnByChoice
  ? React.lazy(() => import('./TerrainMap.tsx').then((m) => ({ default: m.TerrainMap })))
  : null;

export interface SamuiMapProps {
  places: ScoredPlace[];
  onSelect: (place: ScoredPlace) => void;
  /**
   * Today's quests, marked where the work is. Drawn by the web map only:
   * the native island is a diagram with real points on it, and a quest's X
   * on a traced coastline would claim a precision the drawing does not have.
   * On a phone the quests are the card under the map, as they were.
   */
  quests?: Quest[];
  progress?: Record<string, QuestProgress>;
  onOpenQuest?: (id: string) => void;
  /**
   * Where this traveller has been. The web map lifts its mist from these;
   * both maps count them in the legend.
   */
  explored?: ExploredPlace[];
  height?: number;
  /** Score-only pins, no zoom buttons. Decided here from the width unless a caller says. */
  compact?: boolean;
  /**
   * Which area is framed. The web map draws either; the drawn island is
   * Samui's silhouette and nothing else, so on a phone the campus is its
   * list until a campus drawing exists (docs/43).
   */
  area?: Area;
  /** Places with an approved story on them, drawn with a gold ring (docs/45). */
  storied?: ReadonlySet<string>;
}

/**
 * How tall the hero is, for a width.
 *
 * A fixed 344 was a phone's number: on a wide screen it was a letterbox with
 * an island squeezed into it, the mountain cropped by the header. The hero
 * grows with the width, a little less than square, and stops where a
 * desktop still has the list in view below it.
 */
export const heroHeight = (width: number): number =>
  Math.round(Math.min(560, Math.max(344, width * 0.36)));

export function SamuiMap(props: SamuiMapProps) {
  const { width } = useWindowDimensions();
  const compact = props.compact ?? width < COMPACT_BELOW;
  const height = props.height ?? heroHeight(width);
  if (TerrainMap) {
    return (
      <React.Suspense
        fallback={<View style={{ height, backgroundColor: color.brandSoft }} />}
      >
        <TerrainMap {...props} height={height} compact={compact} />
      </React.Suspense>
    );
  }
  if (props.area && props.area.map !== 'island') {
    return <CampusList places={props.places} onSelect={props.onSelect} height={height} />;
  }
  return <IslandMap {...props} height={height} compact={compact} />;
}

/**
 * The campus on a phone, until it has a drawing: the places, as rows, under
 * a line that says why. Not the island silhouette with campus pins on it -
 * that would put the library in the Gulf of Thailand.
 */
function CampusList({
  places, onSelect, height,
}: { places: ScoredPlace[]; onSelect: (place: ScoredPlace) => void; height: number }) {
  return (
    <View style={{ minHeight: Math.min(height, 200), backgroundColor: color.neutral200, paddingHorizontal: 18, paddingVertical: 14 }}>
      <Label size={10} tracking={0.12} colour={color.neutral700}>
        {t({ en: 'The campus map is on the web for now. Every place is listed here.', th: 'แผนที่แคมปัสมีบนเว็บก่อน ทุกสถานที่อยู่ในรายการนี้' })}
      </Label>
      {places.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => onSelect(p)}
          accessibilityRole="button"
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.neutral300 }}
        >
          <Heading size={15}>{t(p.name)}</Heading>
          <Label size={11} colour={isHighScore(p.healthyScore) ? color.accent700 : color.neutral700}>{String(p.healthyScore)}</Label>
        </Pressable>
      ))}
    </View>
  );
}

function IslandMap({
  places, onSelect, explored = [], height = 344, compact = false, storied,
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
  const still = useReduceMotion();

  return (
    <View
      onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}
      style={{
        height,
        backgroundColor: color.neutral200,
        borderBottomWidth: layout.ruleStrong,
        borderBottomColor: color.text,
        overflow: 'hidden',
      }}
    >
      {/*
        Paint order, back to front: the water, the island, the weather over
        it, the mist over that, then the pins - which stand on top of all of
        it, because a chip under mist is a place you cannot find.
      */}
      {width > 0 ? <DrawnSwell width={width} height={height} still={still} /> : null}
      {width > 0 ? <IslandShape width={width} height={height} /> : null}
      {width > 0 ? <DrawnClouds width={width} height={height} still={still} /> : null}
      {width > 0 ? <DrawnMist width={width} height={height} explored={explored} places={places} /> : null}

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
              <PinChip place={place} onPress={() => onSelect(place)} compact={compact} storied={storied?.has(place.id) ?? false} />
            </View>
          ))
        : null}

      {/* Legend: the island average today, and how much of it they have reached. */}
      <MapLegend places={places} explored={explored} />
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



