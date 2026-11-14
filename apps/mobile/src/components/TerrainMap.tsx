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
import type { Shop } from '../api/shops.ts';
import type { Area } from '@chivago/core';
import type maplibregl from 'maplibre-gl';
import {
  AttributionControl, Map as MapLibreMap, Marker, NavigationControl,
} from 'maplibre-gl';
// MapLibre's own stylesheet. Without it the zoom/pitch control renders as
// three unstyled buttons stacked in the corner.
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  islandHour, strings,
  type Bilingual, type ExploredPlace, type FairLot, type Quest, type QuestProgress, type ScoredPlace,
} from '@chivago/core';
import { color, onFill } from '../theme/index.ts';
import { zoneTone } from './fair-tones.ts';
import { edgeNudge, edgeNudgeTop, haloMetres, metreRing, mappable, servicePoints, tightPins, UNPINNED_NOTE, type PinBox } from './map-geometry.ts';
import { API_BASE } from '../api/client.ts';
import { SAMUI_BBOX as SAMUI_FRAME, areaByKey } from '@chivago/core';

/** The island, for a map that was not told which area it is drawing. */
const SAMUI_AREA = areaByKey('samui');
import type { Here } from '../state/here.ts';
import { Label } from './Type.tsx';
import { MapLegend } from './map-parts.tsx';
import { shopMarkerSvg, shopMarkerVisual } from './shop-map-marker.tsx';
import { placeMarkerHtml, placeMarkerVisual } from './place-map-marker.tsx';
import { chivarIconUri } from './ChivarIcon.tsx';
import { t } from '../i18n/locale.ts';
import { hourFrom, mix } from './island-clock.ts';
import {
  CLOUD_PX, DRIFT, FOG_PX, HERO, MAX_PITCH, QUEST_MARK_OFFSET, REVEAL_FEATHER, ROUTE_PHASES,
  TIDE_FPS, boundsOf, campusZoom, chivagoStyle, cloudField, cornersOf, crowdOffsets, islandExaggeration,
  fogBounds, heroPose, introPose, paletteFor,
  questMark, questOffsets, revealedPoints, reveals, rgba, routeDash, settleEasing, surfBreath, type MapPalette, type Pose,
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
function paintFog(
  canvas: HTMLCanvasElement,
  palette: MapPalette,
  points: { lat: number; lng: number }[],
  bounds: ReturnType<typeof fogBounds>,
): void {
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
  for (const c of reveals(points, size, bounds)) {
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
 * How many motes hang in the air in front of the island.
 *
 * Fourteen. Six is a smudge on the screen and thirty is a snowstorm; at
 * fourteen, spread over a frame this size, you notice the air without ever
 * being asked to look at it.
 */
const MOTES = 14;

/**
 * Dress the air: the vignette and the motes, for an hour.
 *
 * Both colours come from the palette rather than being fixed, because the
 * whole trick depends on the frame being darkened toward the colour the
 * sky already is - a cool vignette on a golden-hour map reads as a dirty
 * lens, and a warm one at midnight reads as a fire somewhere off screen.
 *
 * The motes are rebuilt rather than restyled, since their count and their
 * clocks change with the light: nothing at midday, a little white dust
 * through the afternoon, and after dark the gold.
 */
function dressTheAir(el: HTMLElement | null, p: MapPalette, still: boolean): void {
  if (!el) return;
  // Darkest toward near-black, but near-black OF THE HOUR'S OWN HAZE.
  el.style.setProperty('--cg-vignette', rgba(mix(p.fog, '#000710', 0.78), p.night ? 0.74 : 0.34));
  const lit = Math.max(p.lamps, p.night ? 1 : 0);
  el.style.setProperty('--cg-mote', lit > 0.05 ? p.lantern : p.foam);
  el.style.setProperty('--cg-mote-peak', `${0.22 + lit * 0.62}`);
  el.replaceChildren();
  // Nothing drifting for anyone who asked for less motion: a mote that
  // does not move is not dust in the air, it is a speck on the glass.
  if (still) return;
  const next = rng(2719);
  for (let i = 0; i < MOTES; i += 1) {
    const mote = document.createElement('i');
    mote.className = 'cg-mote';
    const size = 1.6 + next() * 2.4;
    mote.style.width = `${size}px`;
    mote.style.height = `${size}px`;
    mote.style.left = `${4 + next() * 92}%`;
    // The lower two thirds, which is where the island is and where the air
    // in front of it would be.
    mote.style.top = `${30 + next() * 62}%`;
    mote.style.animationDuration = `${9 + next() * 13}s`;
    mote.style.animationDelay = `${-next() * 20}s`;
    el.appendChild(mote);
  }
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
  Every animation here rides a CHILD: `.cg-place-pin-core` inside `.cg-pin`,
  the `<i>` inside `.cg-here`. The place pin no longer bobs - the chip it
  bobbed on was replaced by a category mark - but the rule is what keeps the
  NEXT animation off the marker root, so it stays written down.
*/
const CSS_ID = 'chivago-map-marks';
/** The accuracy halo's source and fill. Named so the effect can find them again. */
const HERE_SOURCE = 'chivago-here';
const HERE_LAYER = 'chivago-here-fill';
/** The route to the chosen place: a dark casing under a bright line, as a road map draws one. */
const WAY_SOURCE = 'chivago-way';
const WAY_CASING = 'chivago-way-casing';
const WAY_LINE = 'chivago-way-line';
/** How often the pin names are re-decided while the camera is moving, in ms. */
const RELABEL_MS = 200;
const MARK_CSS = `
.cg-pin{display:flex;flex-direction:column;align-items:center;cursor:pointer;border:0;background:none;padding:0;font-family:Anuphan,system-ui,sans-serif}
.cg-place-pin{position:relative;display:flex;flex-direction:column;align-items:center;width:46px;height:51px;color:#fff}
.cg-place-pin-core{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;width:42px;height:42px;
  border:3px solid #fff;border-radius:50%;background:var(--cg-place-colour);transition:transform .16s ease,box-shadow .16s ease;
  box-shadow:0 4px 7px rgba(8,26,48,.4)}
.cg-place-pin-core img{width:94px;height:94px;max-width:none;display:block;object-fit:contain}
.cg-place-pin-tail{position:absolute;z-index:0;top:34px;width:14px;height:14px;transform:rotate(45deg);
  background:var(--cg-place-colour);border-right:2.5px solid #fff;border-bottom:2.5px solid #fff;border-radius:2px;
  box-shadow:3px 3px 5px rgba(8,26,48,.32)}
.cg-pin:hover .cg-place-pin-core,.cg-pin:focus-visible .cg-place-pin-core{transform:translateY(-2px) scale(1.07);box-shadow:0 0 0 4px rgba(255,255,255,.24),0 6px 10px rgba(8,26,48,.4)}
.cg-pin.cg-storied .cg-place-pin-core{box-shadow:0 0 0 3px ${color.gold},0 5px 10px rgba(8,26,48,.45)}
.cg-shop-pin{display:flex;flex-direction:column;align-items:center;width:46px;height:51px;padding:0;border:0;
  background:transparent;cursor:pointer;color:#fff}
.cg-shop-pin-core{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;width:42px;height:42px;
  border:3px solid #fff;border-radius:50%;background:var(--cg-shop-colour);transition:transform .16s ease,box-shadow .16s ease;
  box-shadow:0 4px 7px rgba(8,26,48,.4)}
.cg-shop-pin-core svg{width:21px;height:21px;display:block}
.cg-shop-pin-core img{width:94px;height:94px;max-width:none;display:block;object-fit:contain}
.cg-shop-pin-tail{position:absolute;z-index:0;top:34px;width:14px;height:14px;transform:rotate(45deg);
  background:var(--cg-shop-colour);border-right:2.5px solid #fff;border-bottom:2.5px solid #fff;border-radius:2px;
  box-shadow:3px 3px 5px rgba(8,26,48,.32)}
.cg-shop-pin:hover .cg-shop-pin-core,.cg-shop-pin:focus-visible .cg-shop-pin-core{transform:translateY(-2px) scale(1.07);box-shadow:0 0 0 4px rgba(255,255,255,.24),0 6px 10px rgba(8,26,48,.4)}
.cg-shop-pin:focus-visible{outline:3px solid #8fe7ff;outline-offset:3px;border-radius:24px}
.cg-shop-pin.cg-approx .cg-shop-pin-core{border-style:dashed;opacity:.9}
.cg-shop-pin.cg-approx .cg-shop-pin-tail{opacity:.55}
.cg-approx-badge{position:absolute;z-index:2;top:-4px;right:-2px;width:18px;height:18px;border-radius:50%;
  background:${color.gold};color:#3b2a10;border:2px solid #fff;font:800 11px/14px system-ui,sans-serif;text-align:center}
/*
  The story bubble: the poster itself, on the pin.

  A ring of gold around a score chip said a place HAD a story. It never
  showed one, which on a map is most of the point - a photograph somebody
  took at that beach is the thing a reader wants to look at, and a coloured
  outline is a footnote about it. The poster sits above the chip on its own
  ring, tappable on its own, and opens the viewer rather than the place.

  Forty-two pixels: big enough to read a face in at arm's length, small
  enough that five of them on a phone do not become the map. The image is
  cover-cropped because a vertical clip's poster is 9:16 and a circle wants
  the middle of it.
*/
/*
  Bubble and chip on one ROW.

  Stacked, the bubble sat above the chip and grew the pin upward - and a pin
  near the top of the frame had its photograph sliced off by the map's own
  edge, which is exactly what happened to Building 13 the first time this
  shipped. Side by side the pin gains width instead of height, and width is
  already handled: the declutter measures this row, and edgeNudge slides it
  back inside the frame. No backticks in here - this whole block is inside a
  template literal, and one would end the string.
*/
.cg-top{display:flex;align-items:center;gap:5px;position:relative}
.cg-tale{width:46px;height:46px;border-radius:50%;padding:2px;cursor:pointer;flex:none;
  background:${color.gold};box-shadow:0 3px 10px rgba(8,26,48,.4);border:0;display:block}
.cg-tale img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;
  background:${color.neutral200};border:2px solid ${color.bg}}
.cg-night .cg-tale{box-shadow:0 0 0 1px rgba(255,255,255,.14),0 0 16px rgba(255,214,120,.5)}
.cg-night .cg-place-pin-core,.cg-night .cg-shop-pin-core{box-shadow:0 0 0 2px rgba(255,255,255,.08),0 0 18px rgba(255,236,190,.55)}
.cg-quest{display:flex;flex-direction:column;align-items:center;cursor:pointer;border:0;background:none;padding:0;width:56px;font-family:Anuphan,system-ui,sans-serif}
.cg-ring{position:absolute;top:2px;left:50%;width:34px;height:34px;margin-left:-17px;border-radius:50%;
  border:3px solid #f2b531;opacity:.8;animation:cg-pulse 2.4s ease-out infinite;will-change:transform,opacity}
.cg-quest.cg-active .cg-ring{border-color:${color.brand};animation-duration:1.6s}
.cg-quest.cg-done .cg-ring{border-color:${color.accent};animation:none;opacity:.55;transform:scale(.9)}
.cg-x{width:38px;height:38px;overflow:hidden;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 3px 4px rgba(8,26,48,.45))}
.cg-x img{width:128px;height:128px;max-width:none;display:block;object-fit:contain}
.cg-tag{margin-top:-2px;padding:2px 6px;border-radius:8px;font-size:9.5px;font-weight:700;letter-spacing:.08em;white-space:nowrap;
  background:#3b2a10;color:#ffe9b3;box-shadow:0 2px 6px rgba(8,26,48,.35)}
.cg-quest.cg-active .cg-tag{background:${color.brand};color:${onFill.brand}}
.cg-quest.cg-done .cg-tag{background:${color.accent};color:${onFill.accent}}
.cg-quest.cg-untagged .cg-tag{display:none}
.cg-night .cg-x{filter:drop-shadow(0 0 8px rgba(255,205,90,.85))}
.cg-stop{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;
  background:${color.ctaDeep};border:2px solid #ffffff;box-shadow:0 2px 6px rgba(8,26,48,.4)}
.cg-stop svg{width:13px;height:13px;display:block}
.cg-night .cg-stop{box-shadow:0 0 7px rgba(140,200,255,.55)}
.cg-here{display:flex;align-items:center;justify-content:center;width:18px;height:18px}
.cg-here i{display:block;width:18px;height:18px;border-radius:50%;background:${color.brand};border:3px solid #ffffff;
  box-shadow:0 2px 8px rgba(8,26,48,.45);animation:cg-here-beat 2.6s ease-in-out infinite;will-change:transform}
@keyframes cg-here-beat{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
.cg-compass{position:absolute;top:10px;left:10px;width:46px;height:46px;border-radius:50%;padding:0;cursor:pointer;
  border:2px solid ${color.text};background:rgba(255,250,236,.94);box-shadow:0 2px 8px rgba(8,26,48,.3);z-index:2}
.cg-compass svg{width:100%;height:100%;transition:transform .2s ease-out}
.maplibregl-map.cg-fullscreen .maplibregl-ctrl-top-right{top:8px;right:8px}
.maplibregl-map.cg-fullscreen .maplibregl-ctrl-group{overflow:hidden;border-radius:30px;background:#fff;box-shadow:0 3px 14px rgba(4,30,55,.24)}
.maplibregl-map.cg-fullscreen .maplibregl-ctrl-group button{width:58px;height:58px}
.maplibregl-map.cg-fullscreen .maplibregl-ctrl-bottom-left{left:auto;right:10px}
.maplibregl-map.cg-fullscreen .cg-compass{top:202px;left:auto;right:10px;width:58px;height:58px;border:0;background:#fff;box-shadow:0 3px 14px rgba(4,30,55,.24)}
.maplibregl-map.cg-fullscreen .cg-compass svg{width:26px;height:26px}
@keyframes cg-pulse{0%{transform:scale(.7);opacity:.9}100%{transform:scale(2.1);opacity:0}}
@media (prefers-reduced-motion: reduce){.cg-ring,.cg-here i,.cg-mote{animation:none}.cg-compass svg{transition:none}}
/*
  THE AIR IN FRONT OF THE ISLAND.

  Everything above this point is the map. These last two are the
  photograph of it, and they are in CSS rather than in the style because
  neither of them is a thing on the ground: they sit between the camera
  and the island, where a lens and an atmosphere sit.

  The grade is a vignette and a wash of the hour's own sky colour, darkest
  in the corners and clear through the middle third where the island is.
  It costs one composited layer and it is most of the difference between a
  map in a box and a view out of one. Both colours are handed in by the
  clock, because a noon vignette on a night map reads as a smudge.

  The motes are the dust and the insects in the few metres of air nearest
  the camera, lit by whatever the hour has: white in daylight, gold once
  the lamps are up. They do NOT move with the map, and that is the point -
  they are in front of it, not on it, and holding still while the island
  turns behind them is exactly what gives the frame its depth. Three
  sizes, drifting up and across on their own slow clocks.
*/
.cg-grade{position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden;
  background:radial-gradient(118% 76% at 50% 44%,transparent 36%,var(--cg-vignette) 100%)}
.cg-mote{position:absolute;border-radius:50%;background:var(--cg-mote);opacity:0;
  box-shadow:0 0 6px 1px var(--cg-mote);animation-name:cg-drift;animation-timing-function:linear;
  animation-iteration-count:infinite;will-change:transform,opacity}
@keyframes cg-drift{
  0%{transform:translate3d(0,0,0) scale(.7);opacity:0}
  12%{opacity:var(--cg-mote-peak)}
  50%{transform:translate3d(18px,-34px,0) scale(1)}
  88%{opacity:var(--cg-mote-peak)}
  100%{transform:translate3d(-10px,-72px,0) scale(.7);opacity:0}}
/*
  A fair's lots (docs/66): a dot per lot in its zone's colour, a hollow one for
  a free lot, and on the lot asked for, a label above. The label is a CHILD
  placed against the mark, for the same reason as everything above: the mark
  itself is MapLibre's to position.
*/
.cg-lot{pointer-events:none;font-family:Anuphan,system-ui,sans-serif}
.cg-lot i{display:block;width:12px;height:12px;border-radius:3px;background:var(--lot);border:2px solid #ffffff;box-shadow:0 1px 4px rgba(8,26,48,.45)}
.cg-lot.cg-lot-free i{background:#ffffff;border-color:var(--lot)}
.cg-lot.cg-lot-on i{width:20px;height:20px;border-radius:6px;box-shadow:0 0 0 3px ${color.brand},0 3px 10px rgba(8,26,48,.5)}
.cg-lot-tag{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);display:flex;align-items:center;gap:6px;
  padding:5px 9px;border-radius:10px;background:${color.surface};color:${color.text};font-size:13px;font-weight:700;white-space:nowrap;
  box-shadow:0 0 0 2px ${color.brand},0 3px 10px rgba(8,26,48,.4)}
.cg-lot-tag b{padding:1px 6px;border-radius:6px;background:var(--lot);color:#ffffff}
`;

/**
 * Text on its way into innerHTML.
 *
 * The names are our own data, not a stranger's, so nothing here is expected
 * to bite. But a mark is assembled as a STRING and handed to innerHTML, and
 * a place called "Bo Phut & Fisherman's" would come out broken even without
 * anyone being clever. Escaping is four characters of work and removes the
 * whole question.
 */
function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

function ensureMarkCss(): void {
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_ID;
  style.textContent = MARK_CSS;
  document.head.appendChild(style);
}

/** The approved quest artwork, with the state still owned by server progress. */
const questGlyph = (mark: 'open' | 'active' | 'done'): string => {
  const icon = mark === 'done' ? 'questCompleted' : mark === 'active' ? 'questInProgress' : 'questNew';
  return `<span class="cg-x" aria-hidden="true"><img src="${esc(chivarIconUri(icon))}" alt=""></span>`;
};

/**
 * A bus stop: small, quiet, and deliberately not a pin.
 *
 * The place pins carry a score and the quest marks carry a reward - both are
 * things to go and do. A stop is a fact about the pavement, so it is drawn
 * smaller than either and never competes for the eye. It is also not a
 * button: there is nothing behind it to open, and a control that does
 * nothing when pressed is worse than a mark that never invited the press.
 */
const STOP_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
<rect x="4.5" y="3.5" width="15" height="13" rx="2.6" fill="none" stroke="#ffffff" stroke-width="2.1"/>
<path d="M4.5 10.2h15" stroke="#ffffff" stroke-width="2.1"/>
<circle cx="8.6" cy="19.4" r="1.7" fill="#ffffff"/>
<circle cx="15.4" cy="19.4" r="1.7" fill="#ffffff"/>
</svg>`;

/** The existing compass rose for the ordinary map view. */
const COMPASS_SVG = `<svg viewBox="0 0 46 46" aria-hidden="true">
<circle cx="23" cy="23" r="17" fill="none" stroke="${color.neutral400}" stroke-width="1"/>
<path d="M23 5 L27.5 23 L23 20 L18.5 23 Z" fill="${color.ctaDeep}"/>
<path d="M23 41 L27.5 23 L23 26 L18.5 23 Z" fill="${color.neutral500}"/>
<path d="M5 23 L23 18.5 L20 23 L23 27.5 Z M41 23 L23 18.5 L26 23 L23 27.5 Z" fill="${color.neutral400}"/>
<text x="23" y="12.5" text-anchor="middle" font-family="Anuphan,system-ui,sans-serif" font-size="7" font-weight="700" fill="${color.text}">N</text>
</svg>`;
const LOCATE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M21 3 14.5 21l-3.2-7.3L4 10.5 21 3Z" fill="none" stroke="${color.brand}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/**
 * The fallback height for a building the tiles give no height for.
 *
 * THE KIND-BASED CONVENTION THIS REPLACES NEVER RAN. The code here used to
 * size and tint each block by `['get', 'class']` - university, dormitory,
 * hospital, retail - on the strength of a count in docs/43 that says the
 * survey records what every building IS.
 *
 * The survey may well. The TILES do not. OpenFreeMap's `building`
 * source-layer carries four fields and the TileJSON lists them:
 * `render_height`, `render_min_height`, `colour`, `hide_3d`. There is no
 * `class` on a building, so every one of those `match` expressions fell
 * through to its default, for every building, on every campus, since the
 * day it was written. Decoding the z14 tiles on 2026-10-23 confirmed it.
 *
 * What the tiles DO give is a height for every single building - 21 on the
 * Si Racha campus, from 4 m to 55 m - which is better than the convention
 * was reaching for. So the convention is gone and the height is read. This
 * constant survives only for a tile from somewhere the field is missing.
 */
const CAMPUS_DEFAULT_M = 11.9;

/**
 * The roof, as a band at the top of the wall.
 *
 * MapLibre paints every face of an extrusion the same colour, so a block is
 * a solid lozenge and reads as a box rather than a building. Two layers fix
 * that: the walls stop short, and a second extrusion sits on top of them in
 * a roof colour. Under a metre, because what this is drawing is the edge of
 * a roof seen from a kilometre away and not a storey.
 *
 * The tiles record NOTHING about these roofs - no shape, no material, no
 * colour, on any building anywhere in them. So the colour is a convention
 * and is one colour for all of them, rather than a per-building invention
 * dressed up as a survey.
 */
const CAMPUS_ROOF_M = 1.3;

/**
 * How much to lift the campus hill.
 *
 * The island runs at 2.0 because Khao Pom is 635 m seen from twelve
 * kilometres out. The campus is 180 m seen from one, and at 2.0 the ridge
 * behind the library reads as an alp. A little over life size is enough to
 * say "this place is on a slope", which is the true thing the flat version
 * was hiding.
 */
const CAMPUS_EXAGGERATION = 1.15;

/**
 * The sources that carry the ground. A failure in one of these costs the
 * map its hills, not its existence - see the `error` handler.
 */
const DEM_SOURCES = ['terrain', 'relief', 'deep'];

export function TerrainMap({
  places, onSelect, shops = [], onSelectShop, quests = [], progress = {}, onOpenQuest, explored = [], height = 344, compact = false, area, storied,
  tales, onOpenStory, stops = [], interactive = true, fullScreenControls = false,
  onPickCoordinate, selectedCoordinate = null,
  here = null, way = null, wayIsRoute = false, fairLots = null, fairFocus = null,
}: {
  places: ScoredPlace[];
  onSelect: (place: ScoredPlace) => void;
  shops?: Shop[];
  onSelectShop?: (shop: Shop) => void;
  quests?: Quest[];
  progress?: Record<string, QuestProgress>;
  onOpenQuest?: (id: string) => void;
  explored?: ExploredPlace[];
  height?: number;
  /** Phone-width: score-only pins, no zoom buttons. Decided by `SamuiMap`. */
  compact?: boolean;
  /** Disable map gestures and camera motion in the overview image. */
  interactive?: boolean;
  /** Apply the larger map controls only while the map is expanded. */
  fullScreenControls?: boolean;
  onPickCoordinate?: (point: { lat: number; lng: number }) => void;
  selectedCoordinate?: { lat: number; lng: number } | null;
  /** The island unless told otherwise. A campus is flat, framed at street zoom, and grows buildings. */
  area?: Area;
  /** Places with an approved story on them: a gold ring on the chip (docs/45). */
  storied?: ReadonlySet<string>;
  /** The poster to wear on each pin that has one, by place id. */
  tales?: ReadonlyMap<string, string>;
  /** Tapping a poster opens the story, not the place. */
  onOpenStory?: (placeId: string) => void;
  /**
   * Bus stops that serve this area, from OpenStreetMap.
   *
   * Empty for the island, which has none in the seed. A stop is where the
   * pavement is, not somewhere to go, so it is drawn small and is not
   * pressable - see STOP_SVG.
   */
  stops?: { id: string; name: Bilingual | null; lat: number; lng: number; route: string }[];
  /** Where the traveller is, if the phone has said. Null draws nothing at all. */
  here?: Here | null;
  /**
   * The way to the chosen place, in GeoJSON order.
   *
   * The road route when a router answered, and the straight line from the
   * traveller to the place when it did not - the caller decides which, and
   * says which in `wayIsRoute` so the map can draw a road as a road and a
   * direction as a direction.
   */
  way?: [number, number][] | null;
  wayIsRoute?: boolean;
  /** A fair's lots, drawn as small dots in their zone's colour (docs/66). Null draws none. */
  fairLots?: FairLot[] | null;
  /** The lot asked for: labelled, and the camera flies to it. */
  fairFocus?: FairLot | null;
}) {
  const holder = React.useRef<HTMLDivElement | null>(null);
  // The lot to fly to, readable from the map's own load handler: when the map
  // opens for a lot, the intro and the drift stand aside for it.
  const focusRef = React.useRef<FairLot | null>(fairFocus);
  focusRef.current = fairFocus;
  const lotMarks = React.useRef<Marker[]>([]);
  // Whether this map's 'load' has fired. Not `isStyleLoaded()`, which is false
  // whenever a tile is still on its way - during the drift, most of the time -
  // while 'load' fires once: waiting on it then would wait forever.
  const loaded = React.useRef(false);
  // The area's settled bearing, which a flight to a lot turns back to: the
  // same heading the compass and reduced motion give, not the intro's swing.
  const settledBearing = React.useRef(0);
  const map = React.useRef<MapLibreMap | null>(null);
  const hereRef = React.useRef(here);
  hereRef.current = here;
  const pickCoordinateRef = React.useRef(onPickCoordinate);
  pickCoordinateRef.current = onPickCoordinate;
  const pickerMarker = React.useRef<Marker | null>(null);
  const markers = React.useRef<Marker[]>([]);
  // Kept apart from `markers`, which is torn down and rebuilt whenever the
  // places change. The traveller is not a place and must not be swept up.
  const hereMark = React.useRef<Marker | null>(null);
  // The place pins, kept in build order so the name declutter can measure
  // them without hunting through the map's DOM for a class.
  const pinEls = React.useRef<{ id: string; rank: number; el: HTMLElement }[]>([]);
  /**
   * The quest marks, for a declutter of their own.
   *
   * Separate from `pinEls` because the two are crowded differently. A pin
   * can drop its NAME and still be a pin, and `tightPins` decides which
   * ones do. A quest's tag is its code and what it pays, which is the whole
   * of what the mark says, so a crowded one loses the tag whole rather
   * than wearing a shortened one. What it pays is kept here beside the
   * element because that is the order the tags are given out in.
   */
  const questEls = React.useRef<{ el: HTMLElement; pays: number }[]>([]);
  /** The pane of air in front of the island: the vignette, and the motes in it. */
  const grade = React.useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = React.useState(false);
  // What the mist is painted from, readable from inside the map's own
  // handlers without re-running the mount effect.
  const revealed = React.useRef<{ lat: number; lng: number }[]>([]);
  revealed.current = revealedPoints(explored, places);
  const fog = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    if (!holder.current || map.current) return;
    ensureMarkCss();

    const still = prefersReducedMotion() || !interactive;
    let hour = hourNow();
    /*
      The campus (docs/43). Its box from the OpenStreetMap outline, a little
      room around it; no sea, no ferries, no mist - those are the island's;
      and the buildings stand up, from the same OpenFreeMap tiles the roads
      already come from.

      IT IS NOT FLAT, and this said it was for a fortnight. The elevation
      model puts 180 m of relief inside the campus box - 10 m at the west
      gate, 191 m at the ridge the Sapandao viewpoint is named for - which
      is a hillside, not a village green. Terrain is on here for the same
      reason it is on for the island, at a gentler exaggeration because
      180 m over a kilometre and a half is already steep without help.
    */
    const campus = area?.map === 'campus';
    /*
      THE AREA'S OWN BOX, whichever map draws it.

      This used to read "the campus box, or else Samui's", which was true
      while Samui was the only island. Ko Sichang is the second, and the
      line that made the hero portable was this one: the frame is the box
      the AREA carries, and the only thing the map still decides is how
      much room to leave around it. A campus gets two hundred metres,
      because its fence is its edge; an island gets a slack proportional to
      its own size, so a stray scroll off Sichang lands in the same amount
      of sea that one off Samui does.
    */
    const frame = area?.bbox ?? SAMUI_FRAME;
    const pad = campus ? 0.002 : 0;
    const box: [[number, number], [number, number]] = boundsOf({
      minLng: frame.minLng - pad, minLat: frame.minLat - pad,
      maxLng: frame.maxLng + pad, maxLat: frame.maxLat + pad,
    });
    const span = Math.max(frame.maxLng - frame.minLng, frame.maxLat - frame.minLat);
    const slack = campus ? 0.01 : span * 0.6;
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
      interactive,
      dragRotate: interactive,
      touchZoomRotate: interactive,
      touchPitch: interactive,
      // Added by hand below, so it can be folded.
      attributionControl: false,
    });
    const movePickerMarker = (point: { lat: number; lng: number }) => {
      if (!pickerMarker.current) {
        const pin = document.createElement('div');
        pin.setAttribute('aria-hidden', 'true');
        Object.assign(pin.style, { width: '22px', height: '22px', borderRadius: '50%', background: '#0077B6', border: '4px solid #fff', boxShadow: '0 2px 10px rgba(0,0,0,.35)' });
        pickerMarker.current = new Marker({ element: pin, anchor: 'center' }).addTo(m);
      }
      pickerMarker.current.setLngLat([point.lng, point.lat]);
    };
    m.on('click', (event) => {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest('.maplibregl-ctrl, .maplibregl-marker, .maplibregl-popup')) return;
      const point = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      pickCoordinateRef.current?.(point);
      if (pickCoordinateRef.current) movePickerMarker(point);
    });
    if (onPickCoordinate && selectedCoordinate) movePickerMarker(selectedCoordinate);
    holder.current.classList.toggle('cg-night', paletteFor(hour).night);
    dressTheAir(grade.current, paletteFor(hour), still);

    /*
      The weather and the tide.

      There used to be a fourth thing on this clock: a 256-pixel sea
      pattern repainted twelve times a second. It is gone, and `TIDE_FPS`
      explains why. What is left runs at three ticks a second instead of
      twelve, and none of it writes a texture.
    */
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = CLOUD_PX;
    cloudCanvas.height = CLOUD_PX;
    const born = performance.now();
    let routePhase = 0;
    let tick = 0;
    /*
      IS ANYBODY LOOKING, and is the camera still?

      The map is the hero of a screen that scrolls: read the list under it
      and the map is off the top of the page, still rendering a 3D island
      nobody can see - and every one of those frames competes with the
      scroll the reader is actually doing. `onScreen` is that question,
      answered by the browser rather than guessed.
    */
    let onScreen = true;
    let drifting = false;
    const sight = typeof IntersectionObserver === 'undefined' || !holder.current ? null
      : new IntersectionObserver(([entry]) => {
        onScreen = !!entry && entry.isIntersecting && entry.intersectionRatio >= 0.15;
        // The 45-second turn is a flourish for somebody looking at it. Off
        // screen it is a full-rate 3D render for nobody, so it ends there.
        if (!onScreen && drifting) { drifting = false; m.stop(); }
      }, { threshold: [0, 0.15, 0.5] });
    if (sight && holder.current) sight.observe(holder.current);
    const tide = (still || campus) ? 0 : window.setInterval(() => {
      /*
        Not while hidden, not while scrolled away, and NOT WHILE THE CAMERA
        MOVES. During a pan MapLibre already renders every frame, so the
        repaint below buys nothing, and the paint-property writes above it
        made the style re-evaluate in the middle of the very frames the
        traveller was dragging. The surf can hold its breath for a gesture.
      */
      if (document.hidden || !onScreen || m.isMoving()) return;
      const t = (performance.now() - born) / 1000;
      const palette = paletteFor(hour);
      tick += 1;

      /*
        The surf breathes. This is the sea's motion now: a band of white
        water on the shore that rises and falls, rather than a repeating
        tile of crests out in open water. It is one paint property, and it
        is in the one place a still photograph of a coast always looks
        wrong.
      */
      if (m.getLayer('surf')) {
        m.setPaintProperty('surf', 'color-relief-opacity', (palette.night ? 0.5 : 0.95) * surfBreath(t));
      }
      // The ferry dots walk toward the island.
      routePhase = (routePhase + 1) % ROUTE_PHASES;
      if (m.getLayer('ferry')) m.setPaintProperty('ferry', 'line-dasharray', routeDash(routePhase));

      /*
        The lamps breathe.

        Twelve kilometres of warm air stand between the camera and Chaweng,
        and air that warm does not hold a light still - it is the same
        shimmer that makes a planet twinkle and a runway wobble. A slow
        eighth either side of full, on a period long enough that nobody
        catches it cycling, and the island stops being a photograph of
        lights and starts being lights.

        Two notes, one period apart, so the haze and the core do not swell
        together like a single dimmer being turned.
      */
      if (tick % 2 === 0 && palette.lamps > 0.01 && m.getLayer('lanterns')) {
        const breath = (phase: number) => 0.88 + 0.12 * Math.sin(t * 0.55 + phase);
        m.setPaintProperty('lanterns', 'circle-opacity', 0.95 * palette.lamps * breath(0));
        m.setPaintProperty('lantern-haze', 'circle-opacity', 0.4 * palette.lamps * breath(1.9));
      }
      if (tick % 2 === 0) {
        const clouds = m.getSource('uncharted-weather') as { play?: () => void; pause?: () => void } | undefined;
        if (clouds) {
          paintClouds(cloudCanvas, palette, t);
          clouds.play?.();
          m.once('render', () => clouds.pause?.());
        }
      }
      m.triggerRepaint();
    }, 1000 / TIDE_FPS);

    /*
      The mist. A canvas the size of the island's box and then some, painted
      by paintFog and draped over everything but the names. Re-laid whenever
      the places reached change, the light changes, or the style is swapped
      under it - each of which is rare, so the source is simply replaced.
    */
    /*
      The mist and the weather are draped over the AREA's box, padded by a
      multiple of itself - see `fogBounds`. On Samui that is the same
      footprint it always had; on an island a tenth the size it is a tenth
      the footprint, instead of a canvas mostly spent on the Gulf.
    */
    const haze = fogBounds(frame);
    const corners = cornersOf(haze);
    const fogCanvas = document.createElement('canvas');
    fogCanvas.width = FOG_PX;
    fogCanvas.height = FOG_PX;
    const layFog = () => {
      if (campus || !m.isStyleLoaded()) return;
      const palette = paletteFor(hour);
      paintFog(fogCanvas, palette, revealed.current, haze);
      for (const id of ['uncharted', 'uncharted-weather']) {
        if (m.getLayer(id)) m.removeLayer(id);
        if (m.getSource(id)) m.removeSource(id);
      }
      // The weather goes under the roads and the names; the mist over
      // everything but the names.
      paintClouds(cloudCanvas, palette, (performance.now() - born) / 1000);
      m.addSource('uncharted-weather', { type: 'canvas', canvas: cloudCanvas, coordinates: corners, animate: false });
      m.addLayer({
        id: 'uncharted-weather', type: 'raster', source: 'uncharted-weather',
        paint: { 'raster-opacity': palette.night ? 0.22 : 0.5, 'raster-fade-duration': 0 },
      }, 'streams');
      m.addSource('uncharted', { type: 'canvas', canvas: fogCanvas, coordinates: corners, animate: false });
      /*
        THINNER THAN IT WAS - 0.44 by day, 0.55 at night - and the reason
        is what a new traveller sees.

        Nobody starts with anything explored, so the first thing anybody
        ever sees of this island is ALL of it under parchment. Half an
        opaque sheet of it turned a golden hour into milk: the sea went
        grey, the hills went flat, and the one frame that has to make
        somebody want to go there looked like a photocopy of a map.

        It is still the fog of war and it still says the same thing - what
        clears it is standing somewhere, and nothing else. It just says it
        at the strength of a haze rather than a lid. The reveal circles cut
        to nothing, so the difference between walked and unwalked ground
        reads as clearly as it ever did; there is simply an island visible
        underneath the part you have not walked yet.
      */
      m.addLayer({
        id: 'uncharted', type: 'raster', source: 'uncharted',
        paint: { 'raster-opacity': palette.night ? 0.36 : 0.24, 'raster-fade-duration': 0 },
      }, 'place-labels');
      /*
        And the lamps come back up THROUGH the mist, which is the one thing
        on this map allowed to ignore it.

        The mist is the fog of war: it is about where this traveller has
        been. A village light is about where there is a village, which is
        true whether or not anybody has walked there - and half an opaque
        parchment over the top turned the lit coast at nine in the evening
        back into the dark green diagram it had just stopped being.

        Read it the way a window across a valley reads: the mist is between
        you and the island, and a light carries through mist. That is also
        why the lights are the invitation and the mist is the record.
      */
      for (const id of ['lantern-haze', 'lanterns']) {
        if (m.getLayer(id)) m.moveLayer(id, 'place-labels');
      }
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
      // Sixty rather than fifty-five: the buildings still read as buildings,
      // and the ridge behind them now has somewhere to be. Bearing from the
      // south-west, which is the side the campus climbs from. The zoom is
      // taken from the frame's width, not fixed: see campusZoom.
      ? { zoom: campusZoom(holder.current?.clientWidth ?? 0), pitch: 60, bearing: -24, center: [area.center.lng, area.center.lat] }
      : heroPose(m.getZoom(), frame);
    const intro: Pose = campus
      ? { ...settled, zoom: settled.zoom - 0.8, pitch: 68, bearing: settled.bearing - 35 }
      : introPose(settled, frame);
    settledBearing.current = settled.bearing;
    // A map opened for a fair lot has no intro to play: it starts settled and flies from there.
    m.jumpTo(still || focusRef.current ? settled : intro);

    /*
      The camera: a rise and a swing into the settled pose, then a slow turn
      that lasts until the first touch. Not `essential`, so MapLibre skips
      the drift for anyone who asked for less motion - and `still` skips the
      intro too, for the reason in prefersReducedMotion.
    */
    const drift = () => {
      if (focusRef.current || !onScreen) return;
      drifting = true;
      m.once('moveend', () => { drifting = false; });
      m.easeTo({
        bearing: settled.bearing + DRIFT.degrees,
        duration: DRIFT.ms,
        easing: (k) => k,
        essential: false,
      });
    };
    /*
      The buildings.

      A measured height wins whenever the survey has one - two of the
      seventy-five. Otherwise the height comes from what the building IS,
      which the survey does record for all of them: see
      CAMPUS_HEIGHT_BY_KIND. A convention, said out loud, and a better one
      than seventy-five identical boxes.

      The faces are lit like the ground is: the vertical gradient darkens
      the base so a block reads as standing on the hill rather than pasted
      onto it, and `fill-extrusion-vertical-gradient` is what MapLibre calls
      that.
    */
    const raiseBuildings = () => {
      if (!campus || m.getLayer('campus-buildings')) return;
      const night = paletteFor(hour).night;
      // The surveyed height, every time the tiles have one - which here is
      // every time. See CAMPUS_DEFAULT_M for what used to be in this slot
      // and why it never did anything.
      const tall: maplibregl.ExpressionSpecification =
        ['coalesce', ['get', 'render_height'], CAMPUS_DEFAULT_M];
      /*
        The shadow first, under everything: the footprint again, dark and
        soft, pushed a few pixels away from the light. A block with nothing
        under it floats; a block with a shadow stands on the hill. The
        offset is derived from the same illumination bearing the hillshade
        uses, so the buildings and the ground agree about where the sun is.
      */
      const theta = (paletteFor(hour).illumination * Math.PI) / 180;
      const drop = night ? 4 : 8;
      m.addLayer({
        id: 'campus-shadows', type: 'fill', source: 'osm', 'source-layer': 'building', minzoom: 14,
        paint: {
          'fill-color': paletteFor(hour).shadow,
          'fill-opacity': night ? 0.2 : 0.3,
          'fill-translate': [-Math.sin(theta) * drop, Math.cos(theta) * drop],
          'fill-translate-anchor': 'map',
        },
      }, m.getLayer('place-labels') ? 'place-labels' : undefined);

      m.addLayer({
        id: 'campus-buildings', type: 'fill-extrusion', source: 'osm', 'source-layer': 'building', minzoom: 13,
        paint: {
          /*
            Tinted by what the building IS, from the same survey tag the
            height comes from. Not a claim about paint - nobody surveyed the
            colour of the halls of residence - but a campus where every
            block is the identical beige reads as a model, and the survey
            does distinguish a teaching block from a hall from a shop.
          */
          'fill-extrusion-color': night ? '#2c3e46'
            : ['coalesce', ['get', 'colour'], '#f2ece0'],
          // The WALLS stop a roof's thickness short of the top, and the
          // roof layer below picks up exactly where they stop. Adjacent
          // rather than overlapping, so the two never fight for the same
          // pixels in that band.
          'fill-extrusion-height': ['max', 0, ['-', tall, CAMPUS_ROOF_M]],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.97,
          'fill-extrusion-vertical-gradient': true,
        },
      }, m.getLayer('place-labels') ? 'place-labels' : undefined);

      /*
        The roof. One colour for all of them: the survey records no roof at
        all on this campus, so a per-building roof would be fiction wearing
        a survey's clothes. What it does buy is the line where wall meets
        roof, which is most of what tells an eye "building" rather than
        "box".
      */
      m.addLayer({
        id: 'campus-roofs', type: 'fill-extrusion', source: 'osm', 'source-layer': 'building', minzoom: 13,
        paint: {
          // A light warm grey, which is what concrete and metal sheet read
          // as from above. The first pass was a mud brown and every block
          // came out a slab; the roof has to be LIGHTER than the eye expects
          // or it swallows the whole building at this pitch.
          'fill-extrusion-color': night ? '#1d2b33' : '#b8b2a6',
          'fill-extrusion-height': tall,
          'fill-extrusion-base': ['max', 0, ['-', tall, CAMPUS_ROOF_M]],
          'fill-extrusion-opacity': 0.97,
        },
      }, m.getLayer('place-labels') ? 'place-labels' : undefined);
    };
    /*
      The ground itself. The island is exaggerated hard because Khao Pom is
      635 m seen from twelve kilometres out and needs the help; the campus
      is 180 m seen from a kilometre and needs almost none - at the island's
      figure the same hill reads as a cartoon alp behind the library.
    */
    const lift = () => m.setTerrain({
      source: 'terrain',
      exaggeration: campus ? CAMPUS_EXAGGERATION : islandExaggeration(frame),
    });

    /*
      The air, at the scale being looked through.

      The style's fog is written for the island: the far edge of that frame
      is Ko Pha-ngan twelve kilometres out, and blending the distance toward
      the horizon is what makes the near beach read as near. The CAMPUS is a
      kilometre and a half from edge to edge, and the same fog put a grey
      wash over the ridge behind the library - haze where there is a
      hillside, at a distance a person can walk in fifteen minutes.

      So the ground blend is pushed almost all the way out and the
      atmosphere thinned. It is still there, at the very back, because the
      hills beyond the campus really are further away.
    */
    const clearTheAir = () => {
      if (!campus) return;
      const p = paletteFor(hour);
      m.setSky({
        'sky-color': p.sky,
        'horizon-color': p.horizon,
        'fog-color': p.fog,
        'fog-ground-blend': 0.92,
        'horizon-fog-blend': 0.9,
        'sky-horizon-blend': 0.6,
        'atmosphere-blend': 0.45,
      });
    };

    m.on('load', () => {
      loaded.current = true;
      lift();
      clearTheAir();
      raiseBuildings();
      layFog();
      // A lot to fly to takes the camera: the focus effect moves it, not the intro.
      if (still || focusRef.current) return;
      m.once('moveend', drift);
      m.easeTo({ ...settled, duration: HERO.introMs, easing: settleEasing, essential: true });
    });
    /*
      ONCE WAS NOT ENOUGH. MapLibre opens the panel the first time the
      credits actually arrive, which is a source-data event after the first
      idle, so a single fold on idle folded an empty panel and the real one
      opened behind it - two lines of licence text across the south coast
      with the legend underneath, which is what the hero shipped with.

      So: fold whenever the map comes to rest or the hour turns the style
      over, and stop for good the moment somebody opens the credits
      themselves. `isTrusted` is the whole difference between their tap and
      the synthetic click `foldAttribution` makes, and folding the licence
      shut while it is being read is its own small rudeness.
    */
    let creditsAreTheirs = false;
    m.getContainer().addEventListener('click', (e) => {
      if (!e.isTrusted) return;
      if ((e.target as HTMLElement | null)?.closest('.maplibregl-ctrl-attrib')) creditsAreTheirs = true;
    });
    const fold = () => { if (!creditsAreTheirs) foldAttribution(m); };
    m.on('idle', fold);
    m.on('styledata', fold);

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
      dressTheAir(grade.current, paletteFor(hour), still);
      m.once('style.load', () => {
        lift();
        clearTheAir();
        raiseBuildings();
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
    const resetMapView = () => m.easeTo({ ...settled, duration: 650, essential: true });
    window.addEventListener('chivago-map-reset', resetMapView);
    const bail = () => {
      window.clearInterval(relight);
      window.clearInterval(tide);
      sight?.disconnect();
      watcher?.disconnect();
      window.removeEventListener('chivago-map-reset', resetMapView);
      fog.current = null;
      pickerMarker.current?.remove();
      pickerMarker.current = null;
      if (map.current) { map.current.remove(); map.current = null; }
    };

    /*
      THE GROUND CAN FAIL WITHOUT TAKING THE MAP WITH IT.

      This used to blank the whole map on any error whose message mentioned
      a source, a style or a layer - which includes every way the elevation
      archive can let us down. A slow afternoon at `elevation-tiles-prod`
      and a traveller got the fallback list instead of Koh Samui, because
      the HILLS could not be drawn.

      That is the wrong trade. The elevation is what makes the island look
      like an island; the OpenFreeMap vector tiles are what make it a MAP.
      Lose the first and you have a flat map, which is most of a map. Lose
      the second and there is nothing to show.

      So a failure in the DEM sources drops the terrain and the three
      layers that read it, keeps everything else, and says so once in the
      console. Only the vector source still blanks the screen.
    */
    /*
      ONE MISSING TILE IS NOT A MISSING ARCHIVE.

      The first version of this dropped the terrain on any error from a DEM
      source, and a single 404 at the edge of coverage - which the archive
      serves routinely - flattened the island for the rest of the session.
      That is the same mistake the handler below this one already records
      for the map as a whole, made one level down.

      So the ground goes only when the archive is really gone: eight tile
      errors, which no edge of coverage produces and no healthy session
      reaches.
    */
    const DEM_ERRORS_BEFORE_FLAT = 8;
    let demErrors = 0;
    let groundGone = false;
    const dropTheGround = () => {
      demErrors += 1;
      if (demErrors < DEM_ERRORS_BEFORE_FLAT) return;
      if (groundGone || !map.current) return;
      groundGone = true;
      console.warn(`[chivago] elevation unavailable after ${demErrors} tile errors - the map is flat for this session`);
      try {
        m.setTerrain(null);
        for (const id of ['relief', 'hillshade', 'surf', 'sea-depth']) {
          if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none');
        }
      } catch { /* the map is going away anyway */ }
    };

    m.on('error', (e) => {
      const message = (e as { error?: Error }).error?.message ?? String(e);
      const source = (e as { sourceId?: string }).sourceId;
      console.error('[chivago] map:', message);
      if (source && DEM_SOURCES.includes(source)) { dropTheGround(); return; }
      if (/elevation-tiles-prod|terrarium/i.test(message)) { dropTheGround(); return; }
      if (/source|style|layer/i.test(message)) { setFailed(true); bail(); }
    });

    // Zoom buttons are for a mouse. On a phone they sat over Pha-ngan, and
    // pinch and drag already do everything they do. Read once, at mount: a
    // phone does not become a desktop by rotating.
    if (!compact && interactive) m.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    // `compact` asks for the little (i); keeping it folded takes more than
    // asking - see the `fold` handlers above.
    m.addControl(new AttributionControl({ compact: true }), 'bottom-left');

    /*
      The compass rose. Its needle keeps true north however the map is
      turned - which, with the drift, it always is a little - and tapping it
      flies the camera back to the island view. The one control that is
      drawn, not borrowed, because the borrowed one is a grey arrow.
    */
    /*
      One rose, however many times this effect has run.

      The compass is appended to the holder, which is React's div and
      outlives the map. `bail` removes the MAP but has no idea the compass
      is there, so a mount that bailed and remounted - a DEM error, a
      StrictMode double-invoke - left the old needle behind and hung a
      second one beside it.
    */
    holder.current.querySelector('.cg-compass')?.remove();
    const compass = document.createElement('button');
    compass.type = 'button';
    compass.className = 'cg-compass';
    compass.setAttribute('aria-label', fullScreenControls
      ? t({ en: 'Center on my location', th: 'กลับไปตำแหน่งของฉัน', zh: '定位到我的位置' })
      : t(strings.map.compass));
    compass.innerHTML = fullScreenControls ? LOCATE_SVG : COMPASS_SVG;
    const needle = compass.firstElementChild as SVGElement;
    const turn = () => { needle.style.transform = `rotate(${-m.getBearing()}deg)`; };
    if (!fullScreenControls) { m.on('rotate', turn); turn(); }
    if (interactive) compass.addEventListener('click', () => {
      if (fullScreenControls && hereRef.current) {
        m.easeTo({ center: [hereRef.current.lng, hereRef.current.lat], zoom: Math.max(m.getZoom(), 14), duration: 650, essential: true });
      } else {
        m.easeTo({ ...settled, duration: still ? 0 : 900, easing: settleEasing, essential: true });
      }
    });
    holder.current.appendChild(compass);

    map.current = m;
    return bail;
    // Once per mount, on purpose: the box, the bounds and the pose are the
    // area's, and MapLibre has no way to swap them under a live map.
    // MapScreen keys this component by area, so a change of area is a fresh
    // mount and a fresh map, not a map of the island asked to show the campus.
  }, []);

  /*
    The mist follows the places REACHED, and nothing else.

    It used to follow `[explored, places]`, which sounds like the same
    thing and is not. `places` changes identity whenever the layer chips
    are touched - that is what the chips do - and every one of those taps
    re-laid the mist: a million-pixel canvas repainted, two sources torn
    down and rebuilt, two layers added and moved. A visible hitch for a
    filter that cannot change where anybody has been.

    What the mist is actually drawn from is the list of revealed points,
    so that is what this watches. A layer toggle leaves it alone; walking
    somewhere new does not.
  */
  const revealKey = revealed.current.map((p) => `${p.lat},${p.lng}`).sort().join('|');
  React.useEffect(() => { fog.current?.(); }, [revealKey]);

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

    // Pins on a phone still collide where the places do; see crowdOffsets.
    // At desktop width they have room.
    const nudge = compact ? crowdOffsets(places) : new Map<string, [number, number]>();

    pinEls.current = [];
    places.forEach((place) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `cg-pin${storied?.has(place.id) ? ' cg-storied' : ''}`;
      el.setAttribute('aria-label', `${t(place.name)}, ${t(strings.place.healthyScore)} ${place.healthyScore}`);
      /*
        THE PIN SAYS WHAT IT IS, at every width.

        The name used to be dropped on a phone, because five of them
        overlapped each other and the basemap's own labels. That collision
        was real; dropping every name was the wrong answer to it. A chip
        reading "81" over a hillside tells you the air is good SOMEWHERE and
        leaves you to tap five pins to find out where you would be going.

        What ships instead is `relabel` at the foot of this effect: measure
        what actually overlaps, and let only those pins fall back to the
        score. The fallback is this same chip wearing `cg-tight`.
      */
      const tale = tales?.get(place.id);
      const visual = placeMarkerVisual(place);
      el.innerHTML = `<span class="cg-top">${tale ? `<button type="button" class="cg-tale" aria-label="${esc(t(strings.place.stories))}: ${esc(t(place.name))}"><img src="${esc(API_BASE)}${esc(tale)}" alt=""></button>` : ''}<span class="cg-place-pin" style="--cg-place-colour:${visual.colour}"><span class="cg-place-pin-tail"></span><span class="cg-place-pin-core">${placeMarkerHtml(place)}</span></span></span>`;
      el.addEventListener('click', () => onSelect(place));
      /*
        The poster answers first and keeps the tap. Without stopping it here
        the click would bubble to the pin and open the place instead, which
        is the one thing somebody tapping a photograph is not asking for.
      */
      if (tale && onOpenStory) {
        el.querySelector('.cg-tale')?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onOpenStory(place.id);
        });
      }

      pinEls.current.push({ id: place.id, rank: place.healthyScore, el });
      markers.current.push(
        new Marker({ element: el, anchor: 'bottom', offset: nudge.get(place.id) ?? [0, 0] })
          .setLngLat([place.lng, place.lat])
          .addTo(m),
      );
    });

    /*
      EVERY SERVICE, ONE PIN. A service without usable coordinates used to be
      skipped here - listed under the map, absent from it. `servicePoints`
      stands those on a dashed ring around the area's centre and says so in
      the label. The tap still hands over the ORIGINAL shop, never the ring
      copy, so nothing downstream can route a traveller to a point the
      business never gave.
    */
    // Guides are people, not places, and have no pin; see `isGuide`.
    const onMap = mappable(shops);
    const placed = servicePoints(onMap, (area ?? SAMUI_AREA).center, (area ?? SAMUI_AREA).bbox);
    placed.forEach((point) => {
      const shop = point.source;
      const visual = shopMarkerVisual(shop.category);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = point.approximate ? 'cg-shop-pin cg-approx' : 'cg-shop-pin';
      el.setAttribute('aria-label', point.approximate
        ? `${shop.category}: ${shop.name}. ${t(UNPINNED_NOTE)}`
        : `${shop.category}: ${shop.name}`);
      el.style.setProperty('--cg-shop-colour', visual.colour);
      el.innerHTML = `<span class="cg-shop-pin-tail"></span><span class="cg-shop-pin-core">${shopMarkerSvg(shop.category)}</span>${point.approximate ? '<span class="cg-approx-badge" aria-hidden="true">?</span>' : ''}`;
      el.addEventListener('click', () => onSelectShop?.(shop));
      markers.current.push(new Marker({ element: el, anchor: 'bottom' }).setLngLat([point.lng, point.lat]).addTo(m));
    });

    /*
      X marks the spot. Every quest on today's list stands on the map where
      the work is, with what it pays; the ring pulses gold until you join it,
      blue while it is yours, and goes quiet green once a host has verified -
      the only one of the three that has earned the colour.
    */
    const fan = questOffsets(quests);
    questEls.current = [];
    for (const quest of quests) {
      const mark = questMark(progress[quest.id]);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `cg-quest cg-${mark}`;
      const reward = quest.rewardExp != null ? `${quest.rewardExp} XP` : t(strings.map.questPin(quest.rewardPoints));
      el.setAttribute('aria-label', `${t(quest.name)}, ${t(quest.where)}. ${reward}`);
      el.innerHTML = `<span class="cg-ring"></span>${questGlyph(mark)}<span class="cg-tag">${esc(quest.code)} · +${quest.rewardExp ?? quest.rewardPoints}${quest.rewardExp != null ? ' XP' : ''}</span>`;
      if (onOpenQuest) el.addEventListener('click', () => onOpenQuest(quest.id));

      questEls.current.push({ el, pays: quest.rewardPoints });
      markers.current.push(
        new Marker({ element: el, anchor: 'top', offset: fan.get(quest.id) ?? QUEST_MARK_OFFSET })
          .setLngLat([quest.lng, quest.lat])
          .addTo(m),
      );
    }

    /*
      The stops, under everything else.

      Added after the pins and the quest marks so that where a stop and a pin
      land on the same pavement, the pin - which is the thing worth walking
      to - is the one on top. They are marks, not controls: `role="img"` with
      the route in the label, because a screen reader reading "button" here
      would promise something to press.
    */
    for (const stop of stops) {
      const el = document.createElement('div');
      el.className = 'cg-stop';
      el.setAttribute('role', 'img');
      const named = stop.name ? t(stop.name) : t({ en: 'Unnamed stop', th: 'ป้ายที่ยังไม่มีชื่อบนแผนที่', zh: '未命名站点' });
      el.setAttribute('aria-label', `${t({ en: 'Bus stop', th: 'ป้ายรถ', zh: '公交站' })}: ${named} · ${stop.route}`);
      el.innerHTML = STOP_SVG;
      markers.current.push(
        new Marker({ element: el, anchor: 'center' }).setLngLat([stop.lng, stop.lat]).addTo(m),
      );
    }

    /*
      Every name that fits, and no name that does not.

      Two layout passes for the whole set rather than two per pin: measure
      all of them wearing their names, then all of them without, and hand
      the real rectangles to `tightPins`. Reading a rectangle flushes
      layout, so batching the reads this way costs two flushes rather than
      two per pin.

      It runs when the camera STOPS. A name that flickered in and out
      through a drag would read worse than one that settles a moment after
      the map does, and the pins move under a pan anyway.
    */
    const boxOf = (el: HTMLElement): PinBox => {
      const r = (el.querySelector('.cg-top') ?? el.querySelector('.cg-place-pin') ?? el).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    /*
      How far a quest's tag may slide to stay on the map.

      Chaweng is on the east coast, so the marks there hang their
      `TP-03 · +80` over the right-hand edge and the map's overflow eats
      the number. The tag slides back; the X does not, so the mark still
      stands on the true spot.

      A longer slide than a pin's chip is allowed, whose 28 px ceiling is
      there because a NAME that has walked far from its stem starts reading
      as the name of its neighbour. These are not names. A tag is sixty
      pixels of code and a number and the X it belongs to is three pixels
      above it; it can go to the edge and still only be read as the tag of
      the mark over it.

      It is applied in `thinTheTags`, with a transform rather than `left`:
      the tag is a flex child centred under the mark, and `left` on it does
      nothing without a `position`, which would take it out of that
      centring. Nothing animates the tag's transform - the pulse is on
      `.cg-ring`, the hover lift on `.cg-place-pin-core` - so this one is
      safe to move this way.
    */
    const TAG_SLIDE_PX = 44;

    /*
      And the marks themselves, out of each other's way.

      `questOffsets` fans a crowd apart by GROUND distance, which is all it
      can know and not enough: three quests within six hundred metres land
      on screen wherever the camera happens to put them, so a fan that
      separates them at one bearing has them back on top of each other at
      the next. The fan clears the X; what it cannot clear is the tag hung
      under it, which is twice as wide again, so "on top of each other"
      means one X lying across the code of the mark above.

      MOVING THE MARK IS NOT THE ANSWER, and it took three tries to stop
      trying. A pin that slides to the edge still has its stem, so it keeps
      pointing at its own spot and the slide can be seen for what it is; a
      quest mark is an X with no stem, and an X moved a hundred pixels to
      clear a crowd is not a decluttered mark, it is a mark on the wrong
      beach. Pushed down it went behind the legend; pushed up it went into
      the pins; given the pins and the legend both to avoid it flew to the
      top of the frame and claimed a quest at Chaweng was out at sea.

      So nothing moves. Every X stays exactly where the fan put it, over
      its own ground, and what gives way is the TAG - the same bargain the
      pins strike in `tightPins`, where a name that will not fit is a name
      that is not drawn. Taken in order of what the quest pays, so when the
      east coast can only show one code it is the one worth most; and a
      mark that loses its tag is still an X you can tap, which is how you
      find out what it is.
    */
    const thinTheTags = (frame: DOMRect, chips: PinBox[]) => {
      const marks = questEls.current;
      if (marks.length === 0) return;
      for (const { el } of marks) el.classList.remove('cg-untagged');
      /*
        The ground already taken: the legend, and the pins - which have had
        their own pass by now and are settled. A place is why anybody is
        looking at this map and a quest is something to do when they get
        there, so where the two want the same hundred pixels, the quest is
        the one that gives.
      */
      const legend = m.getContainer().parentElement?.querySelector('#cg-legend')?.getBoundingClientRect();
      const taken: { left: number; right: number; top: number; bottom: number }[] = [...chips];
      if (legend) {
        taken.push({ left: legend.left, right: legend.right, top: legend.top, bottom: legend.bottom });
      }
      const clear = (b: { left: number; right: number; top: number; bottom: number }) =>
        b.left >= frame.left && b.right <= frame.right
        && !taken.some((p) => b.right > p.left && b.left < p.right && b.bottom > p.top && b.top < p.bottom);
      /*
        TEXT BLOCKS TEXT; the X's do not come into it. They are 38 px of
        drawn glyph fanned 40 apart, so a pair of them touching corners
        still reads as two marks - and counting them as taken ground was
        enough, on the first run of this, to hide every tag on the island.
        What cannot be read through is another label.
      */
      /*
        Measured with the edge slide already applied, because a tag that
        only overruns the frame is not crowded, it is near the side, and
        there is somewhere to put it. Deciding before the slide would drop
        tags that had room all along.

        In BATCHES, for the reason the pin loop above gives: reset every
        tag, read every tag, slide every tag, read every tag once more -
        two layouts for the set instead of two for each mark.
      */
      const ordered = [...marks].sort((a, b) => b.pays - a.pays)
        .map(({ el }) => ({ el, tag: el.querySelector<HTMLElement>('.cg-tag') }))
        .filter((mark): mark is { el: HTMLElement; tag: HTMLElement } => mark.tag !== null);
      for (const { tag } of ordered) tag.style.transform = '';
      const slides = ordered.map(({ tag }) => edgeNudge(tag.getBoundingClientRect(), frame, TAG_SLIDE_PX));
      ordered.forEach(({ tag }, i) => { tag.style.transform = slides[i] ? `translateX(${slides[i]}px)` : ''; });
      const tagBoxes = ordered.map(({ tag }) => {
        const t = tag.getBoundingClientRect();
        return { left: t.left, right: t.right, top: t.top, bottom: t.bottom };
      });
      ordered.forEach(({ el }, i) => {
        const box = tagBoxes[i]!;
        const keep = clear(box);
        el.classList.toggle('cg-untagged', !keep);
        if (keep) taken.push(box);
      });
    };
    const relabel = () => {
      const pins = pinEls.current;
      if (pins.length === 0) {
        thinTheTags(m.getContainer().getBoundingClientRect(), []);
        return;
      }
      // Back to the unedited state first: names on, no edge slide. Deciding
      // from boxes that carry the LAST pass's nudges would compound one
      // frame's answer into the next.
      for (const pin of pins) {
        pin.el.classList.remove('cg-tight');
        const top = pin.el.querySelector<HTMLElement>('.cg-top');
        top?.style.setProperty('left', '0px');
        top?.style.setProperty('top', '0px');
      }
      const named = pins.map((pin) => boxOf(pin.el));
      for (const pin of pins) pin.el.classList.add('cg-tight');
      const slim = pins.map((pin) => boxOf(pin.el));
      const tight = tightPins(
        pins.map((pin, i) => ({ id: pin.id, rank: pin.rank, named: named[i]!, slim: slim[i]! })),
      );
      for (const pin of pins) pin.el.classList.toggle('cg-tight', tight.has(pin.id));

      /*
        And then, having decided what each chip SAYS, keep it on the map.

        A place near the edge has its chip centred on its point, so half the
        name hangs over the side and is cut off by the map's own overflow.
        The chip slides back; the stem does not, so the pin still points at
        the true position and the offset can be seen for what it is.

        The slide is `left` on the mark, not a transform: a CSS rule
        outranks an inline style - `.cg-place-pin-core` moves on a transform
        for hover - and an inline `translateX` here would be thrown away. It is
        the same trap the traveller's dot fell into - see the note at the
        top of this file.
      */
      /*
        ALL THE READS, THEN ALL THE WRITES. This loop used to zero a chip,
        measure it and nudge it one pin at a time - a write, a read, a write
        - which makes the browser lay the whole page out again for every
        pin, five times a second while the camera moves. The chips were
        already zeroed at the top of `relabel`, so one pass can measure
        them all and a second can place them all: one layout instead of
        one per pin, and the same answer.
      */
      const frame = m.getContainer().getBoundingClientRect();
      const rows = pins.map((pin) => pin.el.querySelector<HTMLElement>('.cg-top'));
      const rowBoxes = rows.map((row) => row?.getBoundingClientRect() ?? null);
      rows.forEach((row, i) => {
        const box = rowBoxes[i];
        if (!row || !box) return;
        row.style.left = `${edgeNudge(box, frame)}px`;
        // And down, when a pin wearing a photograph has climbed off the top.
        row.style.top = `${edgeNudgeTop(box, frame)}px`;
      });
      // The pins are settled now - names decided, edges cleared - so the
      // quest marks can be told where they ended up and step around them.
      thinTheTags(frame, pins.map((pin) => boxOf(pin.el)));
    };
    /*
      And it has to keep up with a camera that does not stop.

      Settling on `moveend` alone was measured and found wrong: the campus
      pose is followed by a slow drift that runs until the first touch, so a
      chip nudged onto the map at the end of the intro had wandered three
      pixels back off it a second later. Five times a second while the
      camera moves is enough to look fixed and cheap enough not to matter -
      two layout reads for a handful of chips, against everything MapLibre
      is already doing on the same frames.
    */
    let lastRun = 0;
    let pending = 0;
    const relabelSoon = () => {
      const since = performance.now() - lastRun;
      if (since >= RELABEL_MS) {
        lastRun = performance.now();
        relabel();
      } else if (!pending) {
        pending = window.setTimeout(() => {
          pending = 0;
          lastRun = performance.now();
          relabel();
        }, RELABEL_MS - since);
      }
    };
    // One frame later, so MapLibre has placed every marker before any of
    // them is measured. Before that they all sit at the map's origin and
    // every box overlaps every other box.
    const settle = requestAnimationFrame(relabel);
    m.on('move', relabelSoon);
    m.on('moveend', relabel);
    m.on('resize', relabel);
    return () => {
      cancelAnimationFrame(settle);
      if (pending) window.clearTimeout(pending);
      m.off('move', relabelSoon);
      m.off('moveend', relabel);
      m.off('resize', relabel);
    };
  }, [places, shops, quests, progress, onSelect, onSelectShop, onOpenQuest, compact, storied, tales, onOpenStory, stops, area]);

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
        avoid it the same way, by moving `.cg-place-pin-core` inside `.cg-pin`.
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

  /*
    The way to the chosen place.

    Two layers, because that is how a road map draws a road and how it stays
    readable over both the pale sand and the dark forest: a dark casing, and
    a bright line on top of it. When the router did not answer, the SAME
    geometry arrives as a straight line from the traveller to the place, and
    it is drawn DASHED - a dashed line is a bearing and a solid one is a
    road, and the difference matters on an island where the straight line
    between two beaches crosses a hill.

    Its own effect again, and its own source, so choosing a destination does
    not disturb the pins, the mist or the traveller's dot.
  */
  React.useEffect(() => {
    const m = map.current;
    if (!m) return;

    const draw = () => {
      if (!map.current) return;
      const feature = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: way ?? [] },
      };
      const existing = m.getSource(WAY_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(feature);
        // The dash is a paint property, so it can change without the layer.
        if (m.getLayer(WAY_LINE)) {
          m.setPaintProperty(WAY_LINE, 'line-dasharray', wayIsRoute ? [1] : [1.4, 1.1]);
        }
        return;
      }
      if (!way || way.length < 2) return;
      m.addSource(WAY_SOURCE, { type: 'geojson', data: feature });
      m.addLayer({
        id: WAY_CASING,
        type: 'line',
        source: WAY_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': color.text, 'line-width': 8, 'line-opacity': 0.55 },
      });
      m.addLayer({
        id: WAY_LINE,
        type: 'line',
        source: WAY_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          // The CTA orange, which is what "start something" is in this app,
          // and the one strong colour on the map that is not the evidence
          // green and not a quest's gold.
          'line-color': color.ctaDeep,
          'line-width': 4,
          'line-dasharray': wayIsRoute ? [1] : [1.4, 1.1],
        },
      });
    };

    if (m.isStyleLoaded()) draw();
    else m.once('load', draw);
    return () => { m.off('load', draw); };
  }, [way, wayIsRoute]);

  /*
    A fair's lots (docs/66).

    Their own marks and their own effect, so choosing a lot does not tear
    down the place pins. Small and silent - a dot is not a button, the list on
    the fair screen is where a lot is chosen - except the lot asked for, which
    wears its code and its stall's name on a label.
  */
  React.useEffect(() => {
    const m = map.current;
    const clear = () => {
      for (const mark of lotMarks.current) mark.remove();
      lotMarks.current = [];
    };
    clear();
    if (!m || !fairLots?.length) return clear;
    for (const lot of fairLots) {
      const on = fairFocus?.code === lot.code;
      const el = document.createElement('div');
      el.className = `cg-lot${on ? ' cg-lot-on' : ''}${lot.stall ? '' : ' cg-lot-free'}`;
      el.style.setProperty('--lot', zoneTone(lot.zone.code));
      el.innerHTML = on
        ? `<span class="cg-lot-tag"><b>${esc(lot.code)}</b>${esc(lot.stall?.name ?? t(strings.fair.free))}</span><i></i>`
        : '<i></i>';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', lot.stall ? t(strings.fair.onMap(lot.code, lot.stall.name)) : t(strings.fair.onMapFree(lot.code)));
      // The lot asked for sits over its neighbours, label and all.
      if (on) el.style.zIndex = '4';
      lotMarks.current.push(new Marker({ element: el, anchor: 'center' }).setLngLat([lot.lng, lot.lat]).addTo(m));
    }
    return clear;
  }, [fairLots, fairFocus]);

  /*
    Fly to the lot asked for.

    After the map has loaded, and instead of the intro: the load handler
    stands aside when `focusRef` holds a lot (see there), so the two never
    fight over the camera. A map that loaded long ago flies at once, from
    wherever it is - mid-drift included. Street zoom, a gentler pitch so the
    label reads, and no flight at all for anyone who asked for less motion.
  */
  React.useEffect(() => {
    const m = map.current;
    if (!m || !fairFocus || !interactive) return;
    const go = () => {
      if (!map.current) return;
      m.flyTo({
        center: [fairFocus.lng, fairFocus.lat],
        zoom: 18,
        pitch: 50,
        bearing: settledBearing.current,
        duration: prefersReducedMotion() ? 0 : 1600,
        essential: true,
      });
    };
    if (loaded.current) go();
    else m.once('load', go);
    return () => { m.off('load', go); };
  }, [fairFocus, interactive]);

  if (failed) {
    return (
      <View style={{ height, backgroundColor: color.bg, justifyContent: 'center', paddingHorizontal: 18 }}>
        <Label size={10} tracking={0.12} colour={color.neutral700}>
          {t({
            en: 'The terrain map could not load. The list below has the same places.',
            th: 'โหลดแผนที่ภูมิประเทศไม่สำเร็จ รายการด้านล่างมีสถานที่เดียวกัน',
            zh: '地形图加载失败。下方列表中是同样的地点。',
          })}
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
        className={fullScreenControls ? 'cg-fullscreen' : undefined}
        style={{ position: 'absolute', inset: 0 }}
      />
      {/*
        Outside the map's rectangle, over the top of it: see the note on
        `.cg-grade`. A sibling rather than a child because everything
        inside that div belongs to MapLibre.
      */}
      <div ref={grade} className="cg-grade" />
      <MapLegend places={places} explored={explored} />
    </View>
  );
}
