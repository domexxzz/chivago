/**
 * Drop-off points as pins on the island map.
 *
 * WHY THEY RIDE THE SHOP PIN CHANNEL. Both map implementations (MapLibre on
 * the web, MapLibre in a WebView on a phone) and the drawn 2D fallback
 * already know how to place, draw and report a tap on a service pin. A
 * drop-off point shaped as one gets all three maps at once, with its own
 * category and icon, instead of a fourth pin type threaded through three
 * renderers. The `do-` id prefix (see `drop-off.ts`) is what tells a tap on
 * a bin from a tap on a shop, and the screen routes a bin straight to
 * directions - it never opens a shop profile.
 *
 * ONLY INSIDE THE AREA. A service with no usable coordinate is stood on the
 * area's ring (`servicePoints`). A bin on Koh Sichang is not "somewhere near"
 * Samui, so a point outside the area's box is dropped here rather than
 * handed to a map that would ring it.
 */
import { DROP_OFF_POINTS, type Bbox, type Bilingual, type DropOffPoint } from '@chivago/core';

import type { Shop } from '../api/shops.ts';

/** The pin category. `shop-map-marker.tsx` gives it the bin icon. */
export const DROP_OFF_PIN_CATEGORY = 'จุดทิ้งขยะ';

/** A pin id that belongs to a drop-off point rather than a shop. */
export const isDropOffPin = (id: string): boolean => id.startsWith('do-');

const inside = (point: { lat: number; lng: number }, bbox: Bbox): boolean =>
  point.lat >= bbox.minLat && point.lat <= bbox.maxLat && point.lng >= bbox.minLng && point.lng <= bbox.maxLng;

/** The drop-off points inside `bbox`: the pins on the map and the list under it ask the same question. */
export const dropOffPointsIn = (bbox: Bbox, points: readonly DropOffPoint[] = DROP_OFF_POINTS): DropOffPoint[] =>
  points.filter((point) => inside(point, bbox));

/**
 * The drop-off points inside `bbox`, shaped as service pins.
 *
 * `nameOf` resolves the bilingual name in the reader's language; it is passed
 * in so this stays free of the UI's locale state and can be tested plainly.
 */
export function dropOffPins(
  bbox: Bbox,
  nameOf: (text: Bilingual) => string,
  points: readonly DropOffPoint[] = DROP_OFF_POINTS,
): Shop[] {
  return dropOffPointsIn(bbox, points).map((point) => ({
    id: point.id,
    name: nameOf(point.name),
    category: DROP_OFF_PIN_CATEGORY,
    areaKey: '',
    description: nameOf(point.where),
    address: nameOf(point.where),
    lat: point.lat,
    lng: point.lng,
    phone: '',
    email: '',
    openingHours: point.hours ?? '',
    amenities: [],
    active: true,
    rating: null,
    reviewCount: 0,
    coverUrl: null,
    guideProfilePhotoUrl: null,
    owner: false,
    createdAt: '',
    updatedAt: '',
    serviceType: 'business',
    guideLanguages: [],
    guideSkills: [],
    guideTourStyles: [],
    guideLineId: '',
    guideStatus: 'not_required',
    hasGuideDocument: false,
  }));
}

/** The drop-off point behind a pin id, or null for any other pin. */
export const dropOffForPin = (
  id: string,
  points: readonly DropOffPoint[] = DROP_OFF_POINTS,
): DropOffPoint | null => (isDropOffPin(id) ? points.find((point) => point.id === id) ?? null : null);
