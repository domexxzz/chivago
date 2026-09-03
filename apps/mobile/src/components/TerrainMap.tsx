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
import {
  AttributionControl, Map as MapLibreMap, Marker, NavigationControl,
} from 'maplibre-gl';
// MapLibre's own stylesheet. Without it the zoom/pitch control renders as
// three unstyled buttons stacked in the corner.
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  isHighScore, islandHour, strings, type Quest, type QuestProgress, type ScoredPlace,
} from '@chivago/core';
import { color, onFill } from '../theme/index.ts';
import { Label } from './Type.tsx';
import { MapLegend } from './map-parts.tsx';
import { t } from '../i18n/locale.ts';
import { hourFrom } from './island-clock.ts';
import {
  DRIFT, HERO, QUEST_MARK_OFFSET, SAMUI_BOUNDS, chivagoStyle, crowdOffsets, heroPose, introPose,
  paletteFor, questMark, questOffsets, settleEasing,
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
*/
const CSS_ID = 'chivago-map-marks';
const MARK_CSS = `
.cg-pin{display:flex;flex-direction:column;align-items:center;cursor:pointer;border:0;background:none;padding:0;font-family:Anuphan,system-ui,sans-serif}
.cg-chip{display:flex;align-items:center;gap:5px;padding:4px 8px;border-radius:11px;font-size:13px;font-weight:700;line-height:1;
  border:2px solid ${color.text};background:${color.surface};color:${color.text};
  box-shadow:0 3px 10px rgba(8,26,48,.35);animation:cg-bob 3.2s ease-in-out infinite;will-change:transform}
.cg-chip small{font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}
.cg-pin.cg-high .cg-chip{border-color:${color.accent};background:${color.accent};color:${onFill.accent}}
.cg-stem{width:2px;height:18px;background:${color.text};opacity:.9}
.cg-foot{width:14px;height:5px;border-radius:50%;background:rgba(8,26,48,.4);margin-top:-1px}
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
.cg-compass{position:absolute;top:10px;left:10px;width:46px;height:46px;border-radius:50%;padding:0;cursor:pointer;
  border:2px solid ${color.text};background:rgba(255,250,236,.94);box-shadow:0 2px 8px rgba(8,26,48,.3);z-index:2}
.cg-compass svg{width:100%;height:100%;transition:transform .2s ease-out}
@keyframes cg-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes cg-pulse{0%{transform:scale(.7);opacity:.9}100%{transform:scale(2.1);opacity:0}}
@media (prefers-reduced-motion: reduce){.cg-chip,.cg-ring{animation:none}.cg-compass svg{transition:none}}
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

export function TerrainMap({
  places, onSelect, quests = [], progress = {}, onOpenQuest, height = 344, compact = false,
}: {
  places: ScoredPlace[];
  onSelect: (place: ScoredPlace) => void;
  quests?: Quest[];
  progress?: Record<string, QuestProgress>;
  onOpenQuest?: (id: string) => void;
  height?: number;
  /** Phone-width: score-only pins, no zoom buttons. Decided by `SamuiMap`. */
  compact?: boolean;
}) {
  const holder = React.useRef<HTMLDivElement | null>(null);
  const map = React.useRef<MapLibreMap | null>(null);
  const markers = React.useRef<Marker[]>([]);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!holder.current || map.current) return;
    ensureMarkCss();

    const still = prefersReducedMotion();
    let hour = hourNow();
    const m = new MapLibreMap({
      container: holder.current,
      style: chivagoStyle(hour),
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
      maxZoom: 15.5,
      // Added by hand below, so it can be folded.
      attributionControl: false,
    });
    holder.current.classList.toggle('cg-night', paletteFor(hour).night);

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

    const settled = heroPose(m.getZoom());
    m.jumpTo(still ? settled : introPose(settled));

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
    m.on('load', () => {
      m.setTerrain({ source: 'terrain', exaggeration: HERO.exaggeration });
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
      m.once('style.load', () => m.setTerrain({ source: 'terrain', exaggeration: HERO.exaggeration }));
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
      watcher?.disconnect();
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
  }, []);

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
      el.className = `cg-pin${isHighScore(place.healthyScore) ? ' cg-high' : ''}`;
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
  }, [places, quests, progress, onSelect, onOpenQuest, compact]);

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
