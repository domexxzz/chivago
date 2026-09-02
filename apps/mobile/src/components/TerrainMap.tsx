/**
 * The web map: real terrain, real coastline, no key, no bill.
 *
 * Reached only from `SamuiMap.tsx`, and only on web, through a lazy import that
 * native never triggers. It is NOT named `.web.tsx`: Metro resolves platform
 * extensions only for extensionless imports, and this codebase imports with
 * explicit `.tsx` everywhere because the node test harness resolves the same
 * files. Trying it the idiomatic way broke every test that renders MapScreen,
 * so the switch is explicit instead of implicit.
 *
 * What the map is drawn with, and where the camera sits, live in
 * `terrain-style.ts` so the tests can hold them to their rules. This file is
 * the part that needs a browser: the canvas, the markers, the one animated
 * moment.
 *
 * THE COASTLINE IS REAL HERE, which is why this file draws no "stylised
 * coastline" note. The native map still carries one, and still should: it is
 * still a traced decagon. Two implementations, two different truths, each
 * saying its own.
 */

import React from 'react';
import { View } from 'react-native';
import {
  AttributionControl, Map as MapLibreMap, Marker, NavigationControl,
} from 'maplibre-gl';
// MapLibre's own stylesheet. Without it the zoom/pitch control renders as
// three unstyled buttons stacked in the corner.
import 'maplibre-gl/dist/maplibre-gl.css';
import { isHighScore, type ScoredPlace } from '@chivago/core';
import { color, onFill } from '../theme/index.ts';
import { Label } from './Type.tsx';
import { MapLegend } from './map-parts.tsx';
import {
  HERO, SAMUI_BOUNDS, chivagoStyle, heroPose, introPose, settleEasing,
} from './terrain-style.ts';

/**
 * Whether this person asked their system for less motion.
 *
 * MapLibre honours the same preference for its own animations, but the map
 * is CONSTRUCTED at the intro pose, before any animation runs; somebody who
 * asked for stillness should never see the low, flat opening frame at all.
 */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Fold the attribution to its (i).
 *
 * MapLibre's compact attribution opens itself on first load and stays open
 * until tapped, and open it is a 500-pixel line of credits across the bottom
 * of the hero, under the legend. Folding it the way a tap would leaves the
 * licence met - the button is there and the credits are one tap away - and
 * the island unobstructed.
 */
function foldAttribution(m: MapLibreMap): void {
  m.getContainer()
    .querySelector<HTMLElement>('.maplibregl-compact-show .maplibregl-ctrl-attrib-button')
    ?.click();
}

export function TerrainMap({
  places, onSelect, height = 344,
}: {
  places: ScoredPlace[];
  onSelect: (place: ScoredPlace) => void;
  height?: number;
}) {
  const holder = React.useRef<HTMLDivElement | null>(null);
  const map = React.useRef<MapLibreMap | null>(null);
  const markers = React.useRef<Marker[]>([]);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!holder.current || map.current) return;

    const still = prefersReducedMotion();
    const m = new MapLibreMap({
      container: holder.current,
      style: chivagoStyle(),
      // Fitted to the island's own bounding box - the same one the native
      // map projects through, so both implementations frame the same place.
      // Flat, first: the flat fit is the one thing that scales honestly with
      // the width of the screen, and the pose is lifted from it below.
      bounds: SAMUI_BOUNDS,
      fitBoundsOptions: { padding: HERO.fitPadding, bearing: HERO.bearing, pitch: 0 },
      // The hero is a view of one island, not a world map. Locking the frame
      // stops a stray scroll landing somebody in the Gulf of Thailand with no
      // way back.
      maxBounds: [
        [SAMUI_BOUNDS[0][0] - 0.14, SAMUI_BOUNDS[0][1] - 0.14],
        [SAMUI_BOUNDS[1][0] + 0.14, SAMUI_BOUNDS[1][1] + 0.14],
      ],
      minZoom: 9,
      maxZoom: 14,
      // Added by hand below, so it can be folded.
      attributionControl: false,
    });

    const settled = heroPose(m.getZoom());
    m.jumpTo(still ? settled : introPose(settled));

    m.on('load', () => {
      // Exaggeration is honest-ish and stated: Samui is 25 km across and
      // 635 m high, so at true scale the mountain is a bump. 1.6 is enough to
      // read as terrain without turning a hill into an alp.
      m.setTerrain({ source: 'terrain', exaggeration: 1.6 });
      if (!still) {
        m.easeTo({ ...settled, duration: HERO.introMs, easing: settleEasing, essential: true });
      }
    });
    m.once('idle', () => foldAttribution(m));

    /*
      Say what went wrong.

      This used to be `() => setFailed(true)` - a blank rectangle and no reason,
      which is precisely the failure the rest of this app refuses to ship. A
      style layer pointing at a source-layer that does not exist reports itself
      here and nowhere else.

      Only a source or style failure blanks the map. MapLibre also emits
      `error` for a single 404 tile at the edge of coverage, and losing the
      whole map over one missing tile would be worse than the gap.
    */
    m.on('error', (e) => {
      const message = (e as { error?: Error }).error?.message ?? String(e);
      console.error('[chivago] map:', message);
      if (/source|style|layer/i.test(message)) setFailed(true);
    });

    m.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    m.addControl(new AttributionControl({ compact: true }), 'bottom-left');
    map.current = m;

    return () => { m.remove(); map.current = null; };
  }, []);

  /*
    Markers are plain DOM, positioned by MapLibre.
    They ride the terrain: `Marker` projects through the same camera as the
    coastline, so a pin on the ridge sits ON the ridge rather than beside it -
    which is the whole reason to put real places on real terrain.
  */
  React.useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const marker of markers.current) marker.remove();
    markers.current = [];

    for (const place of places) {
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', `${place.name.en}, Healthy Score ${place.healthyScore}`);
      const high = isHighScore(place.healthyScore);
      el.style.cssText = [
        'display:flex', 'align-items:center', 'gap:5px',
        'padding:3px 7px', 'border-radius:10px', 'cursor:pointer',
        'font-family:Anuphan,system-ui,sans-serif', 'font-size:13px', 'font-weight:600',
        `border:2px solid ${high ? color.accent : color.text}`,
        `background:${high ? color.accent : color.surface}`,
        `color:${high ? onFill.accent : color.text}`,
        'box-shadow:0 2px 8px rgba(8,26,48,.28)',
      ].join(';');
      el.innerHTML = `<span>${place.healthyScore}</span><span style="font-size:9px;letter-spacing:.1em;text-transform:uppercase">${place.short}</span>`;
      el.addEventListener('click', () => onSelect(place));

      markers.current.push(
        new Marker({ element: el })
          .setLngLat([place.lng, place.lat])
          .addTo(m),
      );
    }
  }, [places, onSelect]);

  if (failed) {
    return (
      <View style={{ height, backgroundColor: color.bg, justifyContent: 'center', paddingHorizontal: 18 }}>
        <Label size={10} tracking={0.12} colour={color.neutral700}>
          The terrain map could not load. The list below has the same places.
        </Label>
      </View>
    );
  }

  return (
    <View style={{ height, backgroundColor: color.brandSoft, overflow: 'hidden' }}>
      {/*
        A raw div, because MapLibre owns this rectangle. Wrapping it in a
        react-native-web View would have MapLibre and RNW both writing the
        same element's style.
      */}
      <div
        ref={holder}
        style={{ position: 'absolute', inset: 0 }}
      />
      <MapLegend places={places} />
    </View>
  );
}
