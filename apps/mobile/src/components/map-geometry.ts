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

  const collidingWith = (left: number, top: number): (PlacedPin & { anchor: number }) | undefined =>
    placed.find(
      (other) =>
        Math.abs(other.left - left) < CHIP.halfWidth * 1.6 &&
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

    // Resolve collisions by searching outward from the true position for the
    // nearest free slot, trying first the direction that preserves north/south
    // order.
    //
    // Direction matters: a naive "always push up" inverts the geography.
    // Chaweng is south of Fisherman's Village, but being lower-scoring it is
    // placed second, and pushing it up put the southern place above the
    // northern one. On a map that is not a cosmetic flaw - it is wrong
    // information.
    //
    // An outward scan rather than a hop-off-the-clash loop, because hopping
    // can land on a THIRD chip and ping-pong until it gives up - which it did
    // silently, returning a pin that still overlapped. The scan tries every
    // slot in order of distance from the truth and stops at the first free
    // one, so it only fails when the viewport genuinely has no room.
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
  return placed.map(({ place, left, top }) => ({ place, left, top }));
}
