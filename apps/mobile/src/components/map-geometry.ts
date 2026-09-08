/**
 * Map geometry - projection and label layout.
 *
 * Pure functions, deliberately kept out of the component file so they can be
 * unit-tested without a renderer. This is also the seam where MapLibre drops
 * in: the SDK would replace `project`, but `layoutPins` still applies, because
 * screen-space label collision is a problem every map has.
 */

import { SAMUI_BBOX, type ScoredPlace } from '@chivago/core';

/**
 * How far a visit clears the mist, in metres: the beach, and a walk either
 * way. Shared by both maps, and kept here - the module with no renderer and
 * no theme in it - so the geometry tests can run without a browser.
 */
export const REVEAL_M = 1500;

/** Where the sharp centre of a cleared circle softens into the mist, as a fraction of its radius. */
export const REVEAL_FEATHER = 0.55;

/**
 * Inset into the drawn island rather than the raw viewport.
 *
 * The bounding box is a rectangle; the island inside it is not. A pin at the
 * box edge would land in open sea with its chip clipped off-screen, so the
 * projection is squeezed into the region the island silhouette actually covers.
 * Relative geography is preserved - only the scale changes.
 */
export const INSET = { x: 0.16, y: 0.14 } as const;

/**
 * Project a real coordinate into 0-1 map space.
 *
 * An equirectangular projection is accurate enough here: the island spans about
 * 0.2 degrees, where distortion is well under a pixel. Do not carry this into a
 * country-scale map.
 */
export function project(lat: number, lng: number): { x: number; y: number } {
  const { minLat, maxLat, minLng, maxLng } = SAMUI_BBOX;
  const x = (lng - minLng) / (maxLng - minLng);
  // Screen y grows downward; latitude grows upward.
  const y = 1 - (lat - minLat) / (maxLat - minLat);
  return {
    x: INSET.x + x * (1 - INSET.x * 2),
    y: INSET.y + y * (1 - INSET.y * 2),
  };
}

/**
 * The tilt that turns the flat plan into a 3D island.
 *
 * `SPREAD` narrows the far (northern) edge so the ground plane recedes;
 * `SQUASH` foreshortens it; `LIFT` drops the whole plane so the extruded
 * side wall has room beneath it.
 *
 * Two properties this must never lose, because the pins ride the same
 * transform as the coastline:
 *  - `y` stays strictly increasing, so a southern place can never render
 *    above a northern one;
 *  - `x` ordering is preserved within any single row.
 * Both hold because the y term is linear and the x term scales about the
 * centre by a positive factor.
 */
export const TILT = { spread: 0.16, squash: 0.88, lift: 0.03 } as const;

/** Apply the ground-plane tilt to a point already in 0-1 map space. */
export function tilt(x: number, y: number): { x: number; y: number } {
  // Far edge (y=0) is narrowest; near edge (y=1) keeps its full width.
  const narrow = 1 - TILT.spread * (1 - y);
  return {
    x: 0.5 + (x - 0.5) * narrow,
    y: TILT.lift + y * TILT.squash,
  };
}

/** Chip footprint, used for label de-collision. */
export const CHIP = { halfWidth: 46, height: 24, stem: 16 } as const;

export interface PlacedPin {
  place: ScoredPlace;
  left: number;
  top: number;
}

/**
 * Lay out pin chips so labels do not overlap.
 *
 * Real geography collides: Chaweng and Fisherman's Village are 2.4 km apart on
 * the same coast, so at island zoom their chips sit on top of each other and
 * both become unreadable. The standard cartographic fix - place in priority
 * order (highest score first, because that is the pin the product most wants
 * read) and push any chip that would collide upward along its own stem, so it
 * keeps pointing at the true location.
 *
 * Deliberately simple: with five to a few dozen island places an O(n^2) sweep
 * costs nothing and is far easier to reason about than a force simulation.
 */
export function layoutPins(
  places: ScoredPlace[],
  width: number,
  height: number,
): PlacedPin[] {
  const ordered = [...places].sort((a, b) => b.healthyScore - a.healthyScore);
  // `anchor` is the pin's TRUE position, kept alongside its drawn one so the
  // north/south check below compares geography against geography rather than
  // against wherever a previous chip happened to be nudged to.
  const placed: (PlacedPin & { anchor: number })[] = [];

  /*
    Two chips clash when their footprints touch.

    The horizontal reach is a FULL chip width - halfWidth twice over - not
    the 1.6 it was while the chips on a phone showed a score and no name.
    At 1.6 two chips 80 px apart were declared clear of each other and then
    drawn 92 px wide, so they overlapped by a dozen pixels: fine for a pair
    of numbers, a smudge once each of them carries a word.
  */
  const collidingWith = (left: number, top: number): (PlacedPin & { anchor: number }) | undefined =>
    placed.find(
      (other) =>
        Math.abs(other.left - left) < CHIP.halfWidth * 2 &&
        Math.abs(other.top - top) < CHIP.height + 6,
    );

  const STEP = CHIP.height + 6;

  for (const place of ordered) {
    const flat = project(place.lat, place.lng);
    // The same tilt the coastline is drawn through, or the pins would float
    // beside the island rather than stand on it.
    const { x, y } = tilt(flat.x, flat.y);
    const left = Math.min(Math.max(x * width, CHIP.halfWidth), width - CHIP.halfWidth);
    const anchorTop = y * height;
    let top = anchorTop;

    // Resolve collisions by pushing AWAY from whatever is in the way, in the
    // direction that preserves north/south order.
    //
    // A naive "always push up" inverts the geography: Chaweng is south of
    // Fisherman's Village, but being lower-scoring it is placed second, and
    // pushing it up put the southern place above the northern one. On a map
    // that is not a cosmetic flaw - it is wrong information.
    //
    // The direction is decided against the clashing pin's TRUE position, not
    // its drawn one. Comparing against a chip that has itself been nudged
    // compounds one displacement into the next.
    const inView = (t: number) => t >= CHIP.height && t <= height - CHIP.height;
    for (let guard = 0; guard < 24; guard += 1) {
      const clash = collidingWith(left, top);
      if (!clash) break;
      const pushDown = anchorTop >= clash.anchor;
      const wanted = pushDown ? clash.top + STEP : clash.top - STEP;
      // Never let a chip escape the viewport; reverse if it would.
      top = inView(wanted) ? wanted : (pushDown ? clash.top - STEP : clash.top + STEP);
    }

    placed.push({ place, left, top, anchor: anchorTop });
  }

  /*
    PLACEMENT order and PAINT order are two different questions, and answering
    them with one array was a 3D bug.

    Placement runs highest-score-first, so the pin the product most wants read
    never gets nudged off its true spot. Painting must run FAR-TO-NEAR, because
    absolutely-positioned siblings paint in document order and this is a tilted
    scene: whatever is drawn last sits in front.

    Returning the placement order meant a low-scoring pin in the north — far
    away, up the plane — was painted after a high-scoring one in the south, so
    the distant chip occluded the near one. On a flat map that is a z-index
    quibble; on a tilted one the depth cue is the whole illusion, and reversing
    it makes the island read inside-out.
  */
  return placed
    .slice()
    .sort((a, b) => a.top - b.top)
    .map(({ place, left, top }) => ({ place, left, top }));
}

/**
 * Where the drawn island's mist clears, in pixels, through the same
 * projection and tilt as the pins - so a cleared circle sits around the
 * chip that names the place, on the ground plane, foreshortened like it.
 *
 * The radius is `REVEAL_M` on the ground: a beach and a walk either way,
 * the same distance the web map clears. A place the traveller reached that
 * is not on screen (a filter hid it) still clears its ground: they were
 * there.
 */
export interface MistCircle { cx: number; cy: number; rx: number; ry: number }

export function mistCircles(
  explored: readonly { placeId: string }[],
  places: readonly { id: string; lat: number; lng: number }[],
  width: number,
  height: number,
): MistCircle[] {
  const { minLat, maxLat, minLng, maxLng } = SAMUI_BBOX;
  const metresPerDeg = 111_320;
  const latSpanM = (maxLat - minLat) * metresPerDeg;
  const midLat = (minLat + maxLat) / 2;
  const lngSpanM = (maxLng - minLng) * metresPerDeg * Math.cos((midLat * Math.PI) / 180);
  const byId = new Map(places.map((p) => [p.id, p]));
  const out: MistCircle[] = [];
  for (const e of explored) {
    const p = byId.get(e.placeId);
    if (!p) continue;
    const flat = project(p.lat, p.lng);
    const { x, y } = tilt(flat.x, flat.y);
    // How wide this row of the ground plane is drawn, as the tilt draws it.
    const narrow = 1 - TILT.spread * (1 - flat.y);
    const rx = (REVEAL_M / lngSpanM) * (1 - INSET.x * 2) * narrow * width;
    const ry = (REVEAL_M / latSpanM) * (1 - INSET.y * 2) * TILT.squash * height;
    out.push({ cx: x * width, cy: y * height, rx, ry });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Where the traveller is
// ---------------------------------------------------------------------------

/** Inside the island's box, which is the only place the drawn island can put a point. */
export const insideSamui = (p: { lat: number; lng: number }): boolean =>
  p.lat >= SAMUI_BBOX.minLat && p.lat <= SAMUI_BBOX.maxLat
  && p.lng >= SAMUI_BBOX.minLng && p.lng <= SAMUI_BBOX.maxLng;

/**
 * The accuracy halo, as a ring of real coordinates.
 *
 * GEOGRAPHY, NOT PIXELS, and that is the point. The terrain map is pitched
 * sixty degrees, so a circle of pixels drawn on top of it is a circle on the
 * screen and an ellipse on the ground - it would claim the fix is more
 * certain to the north than to the east. A ring of lat/lng goes through the
 * same camera as the coastline and the pins, so it lands on the ground the
 * way the ground actually lies, and it scales with the zoom for free.
 *
 * Small-circle approximation: a degree of latitude is 111,320 m everywhere,
 * a degree of longitude that times the cosine of the latitude. Over the tens
 * of metres a GPS error circle covers, the error in that is millimetres.
 */
export function metreRing(
  centre: { lat: number; lng: number },
  metres: number,
  points = 48,
): [number, number][] {
  const metresPerDeg = 111_320;
  const dLat = metres / metresPerDeg;
  const dLng = dLat / Math.max(0.01, Math.cos((centre.lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i < points; i += 1) {
    const a = (i / points) * Math.PI * 2;
    ring.push([centre.lng + Math.sin(a) * dLng, centre.lat + Math.cos(a) * dLat]);
  }
  // GeoJSON wants the ring closed: the last point is the first point.
  ring.push(ring[0]!);
  return ring;
}

/**
 * How big to draw the halo, in metres.
 *
 * A fix that says it is accurate to three metres is usually being
 * optimistic, and a halo that small is a dot with a rim. The floor is the
 * radius at which the halo still reads as "about here" rather than as a
 * decoration; the ceiling stops a bad indoor fix from covering the island
 * with a claim that is true and useless.
 */
export const HALO_MIN_M = 20;
export const HALO_MAX_M = 250;
export const haloMetres = (accuracyM: number | null): number =>
  Math.min(HALO_MAX_M, Math.max(HALO_MIN_M, accuracyM ?? HALO_MIN_M));

// ---------------------------------------------------------------------------
// Naming the pins
// ---------------------------------------------------------------------------

/**
 * A chip's box on screen, in CSS pixels. The four numbers a DOMRect gives.
 */
export type PinBox = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

/**
 * Slack between two chips before they count as touching.
 *
 * Six pixels, not zero, for two reasons. Chips that merely graze each other
 * read as one smudged label rather than as two places. And the chips BOB:
 * a three-pixel CSS animation runs on every one of them, so a rectangle
 * measured now is up to three pixels from where the same chip sits a second
 * later. Six absorbs both.
 */
export const LABEL_GAP_PX = 6;

/** Do these two boxes, with the slack above, share any ground? */
export function boxesOverlap(a: PinBox, b: PinBox, gap = LABEL_GAP_PX): boolean {
  return a.left - gap < b.right
    && b.left - gap < a.right
    && a.top - gap < b.bottom
    && b.top - gap < a.bottom;
}

/**
 * Which pins have to give up their name.
 *
 * A pin with no name is a number floating over a hillside: it tells you the
 * air is good somewhere without telling you where you would be going. So
 * every pin carries its name now, on a phone too - and this is what keeps
 * that from turning the map into a pile of overlapping words.
 *
 * The rule is greedy and takes the pins in rank order: the first pin keeps
 * its name, and each one after it keeps its name only if the named box
 * clears everything already kept. A pin that cannot fit falls back to the
 * SLIM box - the score alone, which is what the map drew before - and that
 * slim box is what the pins after it have to clear, because the score is
 * still on the screen taking up room.
 *
 * Two consequences worth saying out loud. A crowded pair is resolved in
 * favour of the better score, so the place worth walking to is the one that
 * gets named. And nothing is ever hidden outright: the losing pin keeps its
 * number, its tap target and its screen-reader label, and gets its name back
 * as soon as you zoom in far enough to separate them.
 */
export function tightPins(
  pins: readonly { readonly id: string; readonly rank: number; readonly named: PinBox; readonly slim: PinBox }[],
): Set<string> {
  // Sorted by rank, then by id so a tie resolves the same way on every frame
  // rather than flickering between two equally good places.
  const order = [...pins].sort((a, b) => (b.rank - a.rank) || a.id.localeCompare(b.id));
  const kept: PinBox[] = [];
  const tight = new Set<string>();
  for (const pin of order) {
    const fits = !kept.some((box) => boxesOverlap(box, pin.named));
    if (fits) kept.push(pin.named);
    else {
      tight.add(pin.id);
      kept.push(pin.slim);
    }
  }
  return tight;
}

/**
 * The furthest a chip may slide to stay on the map.
 *
 * A place near the edge of the frame has its chip centred on its point, so
 * half a chip hangs over the edge and the name is cut in half. Sliding the
 * chip back costs a few pixels of accuracy and buys a readable name; the
 * STEM does not move, so the pin still points at the true position and the
 * offset is visible rather than hidden.
 *
 * Capped, because past a certain point the honest thing is a cut-off label:
 * a chip dragged thirty pixels to stay on screen is a label for a place
 * that is no longer really in the picture.
 */
export const EDGE_NUDGE_MAX_PX = 28;

/**
 * How far to slide a chip, in pixels, so it sits inside the frame.
 * Positive is right. Zero when it already fits, or when no allowed slide
 * would be enough.
 */
export function edgeNudge(
  chip: { readonly left: number; readonly right: number },
  frame: { readonly left: number; readonly right: number },
  max = EDGE_NUDGE_MAX_PX,
): number {
  const wanted = chip.left < frame.left
    ? frame.left - chip.left
    : chip.right > frame.right
      ? frame.right - chip.right
      : 0;
  return Math.abs(wanted) <= max ? Math.round(wanted) : 0;
}
