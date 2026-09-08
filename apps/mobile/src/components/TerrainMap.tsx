/**
 * The web map: real terrain, real coastline, no key, no bill - lit.
 *
 * Reached only from `SamuiMap.tsx`, and only on web, through a lazy import that
 * native never triggers. It is NOT named `.web.tsx`: Metro resolves platform
 * extensions only for extensionless imports, and this codebase imports with
 * explicit `.tsx` everywhere because the node test harness resolves the same
 * files. Trying it the idiomatic way broke every test that renders MapScreen,
 * so the switch is explicit instead of implicit.
 *
 * What the map is drawn with, where the camera sits, and what a quest's mark
 * means live in `terrain-style.ts` so the tests can hold them to their rules.
 * This file is the part that needs a browser: the canvas, the marks, the
 * compass, the moments that move.
 *
 * THE COASTLINE IS REAL HERE, which is why this file draws no "stylised
 * coastline" note. The native map still carries one, and still should: it is
 * still a traced decagon. Two implementations, two different truths, each
 * saying its own.
 */

import React from 'react';
import { View } from 'react-native';
import type { Area } from '@chivago/core';
import type maplibregl from 'maplibre-gl';
import {
  AttributionControl, Map as MapLibreMap, Marker, NavigationControl,
} from 'maplibre-gl';
// MapLibre's own stylesheet. Without it the zoom/pitch control renders as
// three unstyled buttons stacked in the corner.
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  isHighScore, islandHour, strings, type ExploredPlace, type Quest, type QuestProgress, type ScoredPlace,
} from '@chivago/core';
import { color, onFill } from '../theme/index.ts';
import { haloMetres, metreRing } from './map-geometry.ts';
import type { Here } from '../state/here.ts';
import { Label } from './Type.tsx';
import { MapLegend } from './map-parts.tsx';
import { t } from '../i18n/locale.ts';
import { hourFrom, mix } from './island-clock.ts';
import {
  CLOUD_PX, DRIFT, FOG_CORNERS, FOG_PX, HERO, MAX_PITCH, QUEST_MARK_OFFSET, REVEAL_FEATHER, ROUTE_PHASES,
  SAMUI_BOUNDS, SWELL_FPS, SWELL_PX, chivagoStyle, cloudField, crest, crowdOffsets, heroPose, introPose, paletteFor,
  questMark, questOffsets, revealedPoints, reveals, routeDash, settleEasing, swell, type MapPalette, type Pose,
} from './terrain-style.ts';

/** Paint the cloud shadows for a moment: soft dark ellipses on a clear canvas. */
function paintClouds(canvas: HTMLCanvasElement, palette: MapPalette, t: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  const ink = palette.night ? '20,30,60' : '16,24,64';
  for (const c of cloudField(t)) {
    // Drawn three times so a shadow leaving one edge is already arriving at
    // the other; the field wraps.
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) {
        const x = (c.x + dx) * size;
        const y = (c.y + dy) * size;
        const rx = c.rx * size;
        const ry = c.ry * size;
        if (x + rx < 0 || x - rx > size || y + ry < 0 || y - ry > size) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 1);
        g.addColorStop(0, `rgba(${ink},${c.depth})`);
        g.addColorStop(0.6, `rgba(${ink},${c.depth * 0.6})`);
        g.addColorStop(1, `rgba(${ink},0)`);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(rx, ry);
        ctx.fillStyle = g;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }
    }
  }
}

/** A hex colour as three bytes. */
const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Paint one frame of the sea into a pattern tile: the sea colour, a little
 * deeper in the troughs, with the crests of the swell drawn over it - white
 * by day, the moon's glitter by night.
 */
function paintSwell(out: Uint8ClampedArray, palette: MapPalette, t: number): void {
  const sea = rgb(palette.sea);
  const deep = rgb(palette.deep);
  const crestColour = rgb(palette.night ? '#c9d7f2' : mix(palette.sea, '#ffffff', 0.6));
  const crestMax = palette.night ? 0.7 : 0.55;
  let i = 0;
  for (let y = 0; y < SWELL_PX; y += 1) {
    for (let x = 0; x < SWELL_PX; x += 1) {
      const h = swell(x, y, t);
      const trough = (1 - h) * 0.2;
      const c = crest(h) * crestMax;
      for (let ch = 0; ch < 3; ch += 1) {
        const base = sea[ch]! * (1 - trough) + deep[ch]! * trough;
        out[i + ch] = base * (1 - c) + crestColour[ch]! * c;
      }
      out[i + 3] = 255;
      i += 4;
    }
  }
}

/** A tiny deterministic generator, so the mist has the same texture every visit. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Paint the mist: a parchment haze with a little texture in it, cleared in
 * a soft circle around every place this traveller has reached.
 */
function paintFog(canvas: HTMLCanvasElement, palette: MapPalette, points: { lat: number; lng: number }[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.width;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = palette.night ? '#0e1834' : '#efe4c9';
  ctx.fillRect(0, 0, size, size);
  // Texture: a few dozen soft blobs, lighter and darker, so the haze reads
  // as mist and not as a tint.
  const next = rng(84);
  for (let i = 0; i < 48; i += 1) {
    const x = next() * size;
    const y = next() * size;
    const r = size * (0.06 + next() * 0.12);
    const light = next() > 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, light ? 'rgba(255,255,255,0.14)' : 'rgba(40,30,10,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (const c of reveals(points, size)) {
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(REVEAL_FEATHER, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

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

/** The island hour the map is lit for: the URL's, or the clock's. */
const hourNow = (): number => hourFrom(window.location.search) ?? islandHour(new Date());

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

/*
  The marks' stylesheet, once per document.

  The marks are plain DOM positioned by MapLibre, and their motion - the bob
  of a chip, the pulse of a quest's ring - is CSS, which the compositor runs
  without waking React or the map. The reduced-motion rule at the end is not
  a courtesy: it turns every animation off.

  NOTHING HERE SETS `position` ON THE MARK ITSELF. MapLibre's own stylesheet
  makes the marker element `position: absolute` and places it with a
  transform; a `position: relative` on the same element wins by being
  declared later, and then every mark is laid out in a column under the
  first one - each exactly one mark's height lower than the place it names.
  The first version did that, and it looked like the pins had slid south.

  AND NOTHING ANIMATES `transform` ON THE MARK ITSELF, for the same reason
  one cascade rule along: MapLibre PLACES a marker with an inline transform,
  and a CSS animation outranks an inline style. A `transform: scale()`
  keyframe on the marker element therefore replaces the placement, and the
  mark sits in the map's top-left corner while its inline style still reads
  the right position - so every DOM check agrees and only a screenshot
  disagrees. That is exactly how the traveller's dot shipped and was caught.
  Every animation here rides a CHILD: `.cg-chip` inside `.cg-pin`, the `<i>`
  inside `.cg-here`.
*/
const CSS_ID = 'chivago-map-marks';
/** The accuracy halo's source and fill. Named so the effect can find them again. */
const HERE_SOURCE = 'chivago-here';
const HERE_LAYER = 'chivago-here-fill';
const MARK_CSS = `
.cg-pin{display:flex;flex-direction:column;align-items:center;cursor:pointer;border:0;background:none;padding:0;font-family:Anuphan,system-ui,sans-serif}
.cg-chip{display:flex;align-items:center;gap:5px;padding:4px 8px;border-radius:11px;font-size:13px;font-weight:700;line-height:1;
  border:2px solid ${color.text};background:${color.surface};color:${color.text};
  box-shadow:0 3px 10px rgba(8,26,48,.35);animation:cg-bob 3.2s ease-in-out infinite;will-change:transform}
.cg-chip small{font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}
.cg-pin.cg-high .cg-chip{border-color:${color.accent};background:${color.accent};color:${onFill.accent}}
.cg-stem{width:2px;height:18px;background:${color.text};opacity:.9}
.cg-foot{width:14px;height:5px;border-radius:50%;background:rgba(8,26,48,.4);margin-top:-1px}
.cg-pin.cg-storied .cg-chip{box-shadow:0 0 0 2px ${color.bg},0 0 0 5px ${color.gold}}
.cg-night .cg-chip{box-shadow:0 0 0 2px rgba(255,255,255,.08),0 0 18px rgba(255,236,190,.55)}
.cg-quest{display:flex;flex-direction:column;align-items:center;cursor:pointer;border:0;background:none;padding:0;width:56px;font-family:Anuphan,system-ui,sans-serif}
.cg-ring{position:absolute;top:2px;left:50%;width:34px;height:34px;margin-left:-17px;border-radius:50%;
  border:3px solid #f2b531;opacity:.8;animation:cg-pulse 2.4s ease-out infinite;will-change:transform,opacity}
.cg-quest.cg-active .cg-ring{border-color:${color.brand};animation-duration:1.6s}
.cg-quest.cg-done .cg-ring{border-color:${color.accent};animation:none;opacity:.55;transform:scale(.9)}
.cg-x{width:38px;height:38px;filter:drop-shadow(0 3px 4px rgba(8,26,48,.45))}
.cg-tag{margin-top:-2px;padding:2px 6px;border-radius:8px;font-size:9.5px;font-weight:700;letter-spacing:.08em;white-space:nowrap;
  background:#3b2a10;color:#ffe9b3;box-shadow:0 2px 6px rgba(8,26,48,.35)}
.cg-quest.cg-active .cg-tag{background:${color.brand};color:${onFill.brand}}
.cg-quest.cg-done .cg-tag{background:${color.accent};color:${onFill.accent}}
.cg-night .cg-x{filter:drop-shadow(0 0 8px rgba(255,205,90,.85))}
.cg-here{display:flex;align-items:center;justify-content:center;width:18px;height:18px}
.cg-here i{display:block;width:18px;height:18px;border-radius:50%;background:${color.brand};border:3px solid #ffffff;
  box-shadow:0 2px 8px rgba(8,26,48,.45);animation:cg-here-beat 2.6s ease-in-out infinite;will-change:transform}
@keyframes cg-here-beat{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
.cg-compass{position:absolute;top:10px;left:10px;width:46px;height:46px;border-radius:50%;padding:0;cursor:pointer;
  border:2px solid ${color.text};background:rgba(255,250,236,.94);box-shadow:0 2px 8px rgba(8,26,48,.3);z-index:2}
.cg-compass svg{width:100%;height:100%;transition:transform .2s ease-out}
@keyframes cg-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes cg-pulse{0%{transform:scale(.7);opacity:.9}100%{transform:scale(2.1);opacity:0}}
@media (prefers-reduced-motion: reduce){.cg-chip,.cg-ring,.cg-here i{animation:none}.cg-compass svg{transition:none}}
`;

function ensureMarkCss(): void {
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_ID;
  style.textContent = MARK_CSS;
  document.head.appendChild(style);
}

/** X marks the spot: two rounded strokes in gold with a dark edge; a tick once a host has verified. */
const questGlyph = (done: boolean): string => (done
  ? `<svg class="cg-x" viewBox="0 0 38 38" aria-hidden="true"><circle cx="19" cy="19" r="14" fill="${color.accent}" stroke="#ffffff" stroke-width="3"/><path d="M11 19.5 L16.5 25 L27 13.5" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  : `<svg class="cg-x" viewBox="0 0 38 38" aria-hidden="true"><path d="M9 9 L29 29 M29 9 L9 29" stroke="#3b2a10" stroke-width="10" stroke-linecap="round"/><path d="M9 9 L29 29 M29 9 L9 29" stroke="#f2b531" stroke-width="5.5" stroke-linecap="round"/></svg>`);

/** The rose. The needle points true north whatever the camera does. */
const COMPASS_SVG = `<svg viewBox="0 0 46 46" aria-hidden="true">
<circle cx="23" cy="23" r="17" fill="none" stroke="${color.neutral400}" stroke-width="1"/>
<path d="M23 5 L27.5 23 L23 20 L18.5 23 Z" fill="${color.ctaDeep}"/>
<path d="M23 41 L27.5 23 L23 26 L18.5 23 Z" fill="${color.neutral500}"/>
<path d="M5 23 L23 18.5 L20 23 L23 27.5 Z M41 23 L23 18.5 L26 23 L23 27.5 Z" fill="${color.neutral400}"/>
<text x="23" y="12.5" text-anchor="middle" font-family="Anuphan,system-ui,sans-serif" font-size="7" font-weight="700" fill="${color.text}">N</text>
</svg>`;

/** Four storeys, for every campus building OpenStreetMap has no height for. */
const CAMPUS_STOREYS_M = 12;

export function TerrainMap({
  places, onSelect, quests = [], progress = {}, onOpenQuest, explored = [], height = 344, compact = false, area, storied,
  here = null,
}: {
  places: ScoredPlace[];
  onSelect: (place: ScoredPlace) => void;
  quests?: Quest[];
  progress?: Record<string, QuestProgress>;
  onOpenQuest?: (id: string) => void;
  explored?: ExploredPlace[];
  height?: number;
  /** Phone-width: score-only pins, no zoom buttons. Decided by `SamuiMap`. */
  compact?: boolean;
  /** The island unless told otherwise. A campus is flat, framed at street zoom, and grows buildings. */
  area?: Area;
  /** Places with an approved story on them: a gold ring on the chip (docs/45). */
  storied?: ReadonlySet<string>;
  /** Where the traveller is, if the phone has said. Null draws nothing at all. */
  here?: Here | null;
}) {
  const holder = React.useRef<HTMLDivElement | null>(null);
  const map = React.useRef<MapLibreMap | null>(null);
  const markers = React.useRef<Marker[]>([]);
  // Kept apart from `markers`, which is torn down and rebuilt whenever the
  // places change. The traveller is not a place and must not be swept up.
  const hereMark = React.useRef<Marker | null>(null);
  const [failed, setFailed] = React.useState(false);
  // What the mist is painted from, readable from inside the map's own
  // handlers without re-running the mount effect.
  const revealed = React.useRef<{ lat: number; lng: number }[]>([]);
  revealed.current = revealedPoints(explored, places);
  const fog = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    if (!holder.current || map.current) return;
    ensureMarkCss();

    const still = prefersReducedMotion();
    let hour = hourNow();
    /*
      The campus (docs/43). Its box from the OpenStreetMap outline, a little
      room around it; no terrain, because there is none to speak of; no
      sea, no ferries, no mist - those are the island's; and the buildings
      stand up, from the same OpenFreeMap tiles the roads already come from.
    */
    const campus = area?.map === 'campus';
    const box: [[number, number], [number, number]] = area && campus
      ? [[area.bbox.minLng - 0.002, area.bbox.minLat - 0.002], [area.bbox.maxLng + 0.002, area.bbox.maxLat + 0.002]]
      : SAMUI_BOUNDS;
    const slack = campus ? 0.01 : 0.14;
    const m = new MapLibreMap({
      container: holder.current,
      style: chivagoStyle(hour),
      // Fitted to the island's own bounding box - the same one the native
      // map projects through, so both implementations frame the same place.
      // Flat, first: the flat fit is the one thing that scales honestly with
      // the width of the screen, and the pose is lifted from it below.
      bounds: box,
      fitBoundsOptions: { padding: HERO.fitPadding, bearing: HERO.bearing, pitch: 0 },
      // The hero is a view of one island, not a world map. Locking the frame
      // stops a stray scroll landing somebody in the Gulf of Thailand with no
      // way back.
      maxBounds: [
        [box[0][0] - slack, box[0][1] - slack],
        [box[1][0] + slack, box[1][1] + slack],
      ],
      minZoom: campus ? 14 : 9,
      maxZoom: campus ? 18.5 : 15.5,
      maxPitch: MAX_PITCH,
      // Added by hand below, so it can be folded.
      attributionControl: false,
    });
    holder.current.classList.toggle('cg-night', paletteFor(hour).night);

    /*
      The sea. A pattern tile the size of a stamp, repainted a dozen times a
      second and pushed into the style's image atlas; the `sea` fill wears
      it. MapLibre asks for it the first time it draws the layer, which is
      before `load`, so the answer is given in that event rather than after.
      Still, for anyone who asked for less motion: one frame, and no loop.
    */
    const swellA = new Uint8ClampedArray(SWELL_PX * SWELL_PX * 4);
    const swellB = new Uint8ClampedArray(SWELL_PX * SWELL_PX * 4);
    let flip = false;
    const swellFrame = (t: number) => {
      const data = flip ? swellA : swellB;
      flip = !flip;
      paintSwell(data, paletteFor(hour), t);
      return { width: SWELL_PX, height: SWELL_PX, data };
    };
    const born = performance.now();
    m.on('styleimagemissing', (e: { id: string }) => {
      if (e.id !== 'sea-swell' || m.hasImage('sea-swell')) return;
      m.addImage('sea-swell', swellFrame(0));
    });
    /*
      The weather. Cloud shadows on a small canvas draped over the island,
      repainted with the tide below; and the ferry routes' dots walking
      toward the island, five dash arrays cycled. Both ride the same clock.
    */
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = CLOUD_PX;
    cloudCanvas.height = CLOUD_PX;
    let routePhase = 0;
    let tick = 0;
    const tide = (still || campus) ? 0 : window.setInterval(() => {
      if (document.hidden || !m.hasImage('sea-swell')) return;
      const t = (performance.now() - born) / 1000;
      m.updateImage('sea-swell', swellFrame(t));
      tick += 1;
      if (tick % 2 === 0) {
        routePhase = (routePhase + 1) % ROUTE_PHASES;
        if (m.getLayer('ferry')) m.setPaintProperty('ferry', 'line-dasharray', routeDash(routePhase));
      }
      if (tick % 3 === 0) {
        const clouds = m.getSource('uncharted-weather') as { play?: () => void; pause?: () => void } | undefined;
        if (clouds) {
          paintClouds(cloudCanvas, paletteFor(hour), t);
          clouds.play?.();
          m.once('render', () => clouds.pause?.());
        }
      }
      m.triggerRepaint();
    }, 1000 / SWELL_FPS);

    /*
      The mist. A canvas the size of the island's box and then some, painted
      by paintFog and draped over everything but the names. Re-laid whenever
      the places reached change, the light changes, or the style is swapped
      under it - each of which is rare, so the source is simply replaced.
    */
    const fogCanvas = document.createElement('canvas');
    fogCanvas.width = FOG_PX;
    fogCanvas.height = FOG_PX;
    const layFog = () => {
      if (campus || !m.isStyleLoaded()) return;
      const palette = paletteFor(hour);
      paintFog(fogCanvas, palette, revealed.current);
      for (const id of ['uncharted', 'uncharted-weather']) {
        if (m.getLayer(id)) m.removeLayer(id);
        if (m.getSource(id)) m.removeSource(id);
      }
      // The weather goes under the roads and the names; the mist over
      // everything but the names.
      paintClouds(cloudCanvas, palette, (performance.now() - born) / 1000);
      m.addSource('uncharted-weather', { type: 'canvas', canvas: cloudCanvas, coordinates: FOG_CORNERS, animate: false });
      m.addLayer({
        id: 'uncharted-weather', type: 'raster', source: 'uncharted-weather',
        paint: { 'raster-opacity': palette.night ? 0.22 : 0.5, 'raster-fade-duration': 0 },
      }, 'streams');
      m.addSource('uncharted', { type: 'canvas', canvas: fogCanvas, coordinates: FOG_CORNERS, animate: false });
      m.addLayer({
        id: 'uncharted', type: 'raster', source: 'uncharted',
        paint: { 'raster-opacity': palette.night ? 0.55 : 0.44, 'raster-fade-duration': 0 },
      }, 'place-labels');
    };
    fog.current = layFog;

    /*
      Measure again once the page has settled. MapLibre reads the container
      at construction and watches it after; but a container that was laid
      out at zero width for one frame - a lazy chunk landing inside a scroll
      view - gives it a 400-pixel default it has been seen to keep. One more
      `resize` on the next frame, on load, and on any later change costs a
      few microseconds and never shows a map in a quarter of its box.
    */
    const refit = () => { if (map.current === m) m.resize(); };
    window.requestAnimationFrame(refit);
    m.once('load', refit);
    const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(refit) : null;
    watcher?.observe(holder.current);

    /*
      The island's pose is lifted from the flat fit and centred a little
      south of the middle, for the mountain. The campus has no mountain and
      a box the size of a village: centre on it, street zoom, a lower pitch
      so the buildings read as buildings, and an intro that turns in place
      rather than approaching from the sea it does not have.
    */
    const settled: Pose = campus && area
      ? { zoom: 15.7, pitch: 55, bearing: -20, center: [area.center.lng, area.center.lat] }
      : heroPose(m.getZoom());
    const intro: Pose = campus
      ? { ...settled, zoom: settled.zoom - 0.8, pitch: 68, bearing: settled.bearing - 35 }
      : introPose(settled);
    m.jumpTo(still ? settled : intro);

    /*
      The camera: a rise and a swing into the settled pose, then a slow turn
      that lasts until the first touch. Not `essential`, so MapLibre skips
      the drift for anyone who asked for less motion - and `still` skips the
      intro too, for the reason in prefersReducedMotion.
    */
    const drift = () => {
      m.easeTo({
        bearing: settled.bearing + DRIFT.degrees,
        duration: DRIFT.ms,
        easing: (k) => k,
        essential: false,
      });
    };
    /*
      The buildings. OpenStreetMap knows the height of one building on the
      campus, so the rest stand at four storeys - the same for all, which is
      a drawing convention and not a measurement, and the legend says so.
    */
    const raiseBuildings = () => {
      if (!campus || m.getLayer('campus-buildings')) return;
      m.addLayer({
        id: 'campus-buildings', type: 'fill-extrusion', source: 'osm', 'source-layer': 'building', minzoom: 13,
        paint: {
          'fill-extrusion-color': paletteFor(hour).night ? '#2c3e46' : '#d9d3c4',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], CAMPUS_STOREYS_M],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.92,
        },
      }, m.getLayer('place-labels') ? 'place-labels' : undefined);
    };
    m.on('load', () => {
      if (!campus) m.setTerrain({ source: 'terrain', exaggeration: HERO.exaggeration });
      raiseBuildings();
      layFog();
      if (still) return;
      m.once('moveend', drift);
      m.easeTo({ ...settled, duration: HERO.introMs, easing: settleEasing, essential: true });
    });
    m.once('idle', () => foldAttribution(m));

    /*
      The light moves. Every few minutes the hour is read again and, if it has
      changed enough to see, the style is swapped for that hour's. MapLibre
      diffs the two and repaints what differs; the marks and the camera stay.
    */
    const relight = window.setInterval(() => {
      const now = hourNow();
      if (Math.abs(now - hour) < 0.25) return;
      hour = now;
      m.setStyle(chivagoStyle(hour), { diff: true });
      holder.current?.classList.toggle('cg-night', paletteFor(hour).night);
      m.once('style.load', () => {
        if (!campus) m.setTerrain({ source: 'terrain', exaggeration: HERO.exaggeration });
        raiseBuildings();
        if (m.hasImage('sea-swell')) m.updateImage('sea-swell', swellFrame((performance.now() - born) / 1000));
        layFog();
      });
    }, 5 * 60_000);

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
    // Tear the map down once, whether it failed or the screen left. A failed
    // map used to keep its GL context alive behind the fallback text until
    // the screen unmounted - a context the phone counts against a small
    // budget, held for a map nobody could see.
    const bail = () => {
      window.clearInterval(relight);
      window.clearInterval(tide);
      watcher?.disconnect();
      fog.current = null;
      if (map.current) { map.current.remove(); map.current = null; }
    };

    m.on('error', (e) => {
      const message = (e as { error?: Error }).error?.message ?? String(e);
      console.error('[chivago] map:', message);
      if (/source|style|layer/i.test(message)) { setFailed(true); bail(); }
    });

    // Zoom buttons are for a mouse. On a phone they sat over Pha-ngan, and
    // pinch and drag already do everything they do. Read once, at mount: a
    // phone does not become a desktop by rotating.
    if (!compact) m.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    m.addControl(new AttributionControl({ compact: true }), 'bottom-left');

    /*
      The compass rose. Its needle keeps true north however the map is
      turned - which, with the drift, it always is a little - and tapping it
      flies the camera back to the island view. The one control that is
      drawn, not borrowed, because the borrowed one is a grey arrow.
    */
    const compass = document.createElement('button');
    compass.type = 'button';
    compass.className = 'cg-compass';
    compass.setAttribute('aria-label', t(strings.map.compass));
    compass.innerHTML = COMPASS_SVG;
    const needle = compass.firstElementChild as SVGElement;
    const turn = () => { needle.style.transform = `rotate(${-m.getBearing()}deg)`; };
    m.on('rotate', turn);
    turn();
    compass.addEventListener('click', () => {
      m.easeTo({ ...settled, duration: still ? 0 : 900, easing: settleEasing, essential: true });
    });
    holder.current.appendChild(compass);

    map.current = m;
    return bail;
    // Once per mount, on purpose: the box, the bounds and the pose are the
    // area's, and MapLibre has no way to swap them under a live map.
    // MapScreen keys this component by area, so a change of area is a fresh
    // mount and a fresh map, not a map of the island asked to show the campus.
  }, []);

  // The mist follows the places reached.
  React.useEffect(() => { fog.current?.(); }, [explored, places]);

  /*
    Marks are plain DOM, positioned by MapLibre.
    They ride the terrain: `Marker` projects through the same camera as the
    coastline, so a pin on the ridge sits ON the ridge rather than beside it -
    which is the whole reason to put real places on real terrain.
  */
  React.useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const marker of markers.current) marker.remove();
    markers.current = [];

    // Score-only pins on a phone still collide where the places do; see
    // crowdOffsets. At desktop width the named chips have room.
    const nudge = compact ? crowdOffsets(places) : new Map<string, [number, number]>();

    places.forEach((place, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `cg-pin${isHighScore(place.healthyScore) ? ' cg-high' : ''}${storied?.has(place.id) ? ' cg-storied' : ''}`;
      el.setAttribute('aria-label', `${t(place.name)}, ${t(strings.place.healthyScore)} ${place.healthyScore}`);
      // Score alone on a narrow map - see PinChip for why.
      el.innerHTML = `<span class="cg-chip" style="animation-delay:${-(i * 0.7).toFixed(1)}s"><span>${place.healthyScore}</span>${
        compact ? '' : `<small>${place.short}</small>`
      }</span><span class="cg-stem"></span><span class="cg-foot"></span>`;
      el.addEventListener('click', () => onSelect(place));

      markers.current.push(
        new Marker({ element: el, anchor: 'bottom', offset: nudge.get(place.id) ?? [0, 0] })
          .setLngLat([place.lng, place.lat])
          .addTo(m),
      );
    });

    /*
      X marks the spot. Every quest on today's list stands on the map where
      the work is, with what it pays; the ring pulses gold until you join it,
      blue while it is yours, and goes quiet green once a host has verified -
      the only one of the three that has earned the colour.
    */
    const fan = questOffsets(quests);
    for (const quest of quests) {
      const mark = questMark(progress[quest.id]);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `cg-quest cg-${mark}`;
      el.setAttribute('aria-label', `${t(quest.name)}, ${t(quest.where)}. ${t(strings.map.questPin(quest.rewardPoints))}`);
      el.innerHTML = `<span class="cg-ring"></span>${questGlyph(mark === 'done')}<span class="cg-tag">${quest.code} · +${quest.rewardPoints}</span>`;
      if (onOpenQuest) el.addEventListener('click', () => onOpenQuest(quest.id));

      markers.current.push(
        new Marker({ element: el, anchor: 'top', offset: fan.get(quest.id) ?? QUEST_MARK_OFFSET })
          .setLngLat([quest.lng, quest.lat])
          .addTo(m),
      );
    }
  }, [places, quests, progress, onSelect, onOpenQuest, compact, storied]);

  /*
    You are here.

    A dot with a halo, and the halo is the honest half: the fix's own error
    radius, drawn as REAL GROUND rather than as pixels, so it rides the
    sixty-degree camera the way the coastline does (see `metreRing`). A tight
    dot on its own would claim to be standing somewhere the phone might be
    fifty metres from.

    Its own effect, keyed only on the position, so a walking traveller moves
    one marker instead of tearing down and rebuilding every pin on the map.
    The layer needs a loaded style; the marker does not, and the position
    usually arrives after the map has drawn - but "usually" is not a
    guarantee, so the source waits for `load` when it has to.
  */
  React.useEffect(() => {
    const m = map.current;
    if (!m) return;

    const drawHalo = () => {
      if (!map.current) return;
      const ring = {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'Polygon' as const,
          // No position is an empty polygon rather than a removed layer: the
          // halo goes away and the style keeps its shape.
          coordinates: here ? [metreRing(here, haloMetres(here.accuracyM))] : [],
        },
      };
      const existing = m.getSource(HERE_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (existing) { existing.setData(ring); return; }
      if (!here) return;
      m.addSource(HERE_SOURCE, { type: 'geojson', data: ring });
      m.addLayer({
        id: HERE_LAYER,
        type: 'fill',
        source: HERE_SOURCE,
        // Brand blue, not the evidence green: this is where the phone thinks
        // it is, and nobody has verified anything by standing there.
        paint: { 'fill-color': color.brand, 'fill-opacity': 0.18 },
      });
    };

    if (m.isStyleLoaded()) drawHalo();
    else m.once('load', drawHalo);

    if (!here) {
      hereMark.current?.remove();
      hereMark.current = null;
      return () => { m.off('load', drawHalo); };
    }

    if (hereMark.current) {
      hereMark.current.setLngLat([here.lng, here.lat]);
    } else {
      const el = document.createElement('div');
      el.className = 'cg-here';
      /*
        The beat lives on the CHILD, never on this element. MapLibre places a
        marker with an inline `transform`, and a CSS ANIMATION on the same
        element outranks an inline style - so a `transform: scale()` keyframe
        here replaces the placement and the dot snaps to the map's top-left
        corner. It did, until a screenshot showed it there. Same trap as the
        `position` one in the header, one cascade rule along; the place pins
        avoid it the same way, by animating `.cg-chip` inside `.cg-pin`.
      */
      el.innerHTML = '<i></i>';
      el.setAttribute('role', 'img');
      // A graphic that says something, not a control: there is nowhere to go
      // by tapping where you already are.
      el.setAttribute('aria-label', t(strings.map.youAreHere));
      hereMark.current = new Marker({ element: el }).setLngLat([here.lng, here.lat]).addTo(m);
    }
    return () => { m.off('load', drawHalo); };
  }, [here]);

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
      <MapLegend places={places} explored={explored} />
    </View>
  );
}
