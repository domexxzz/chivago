/**
 * A second signal on the geofence.
 *
 * A geofence check is the phone saying "I am here" and the server agreeing
 * that "here" is inside a circle. Android ships a one-toggle developer option
 * whose documented purpose is to "fake the GPS location of the device", and
 * neither Play Integrity nor App Attest says anything about where a device
 * is. So a radius on its own is a marketing phrase, not a security property.
 *
 * The 2013 ACSAC study of Foursquare ("The Man Who Was There") found the real
 * hole was not GPS spoofing at all: the API accepted an *accuracy* field and
 * tolerated coarse fixes, so an attacker simply claimed to be imprecise. It
 * also found no total-distance constraint - the authors "visited" 36,120 km
 * of venues in 25 hours, every check-in accepted.
 *
 * So the second signal here is four cheap server-side checks that close those
 * exact holes, in the order they are cheapest to fail:
 *
 *   1. MOCKED - the OS said the fix is simulated. Refused outright.
 *   2. ACCURACY - a fix whose error circle is wider than the fence cannot
 *      place anyone inside it. Refused, with both numbers.
 *   3. TRAVEL - the implied speed from the last accepted fix. Nothing on the
 *      ground approaches an airliner.
 *   4. DWELL - proof of work filed a minute after arriving is a drive-by.
 *      The clock is the check: ten minutes between arrival and proof, always
 *      enforced. The proof also carries a second in-fence position, which
 *      the route requires and the service accepts the absence of for tests;
 *      when present it is fenced and presence-checked like an arrival.
 *
 * None of these stop a patient attacker with a rooted phone. They stop the
 * cheap attacks, they cost an honest traveller nothing, and every refusal
 * lands on the "recorded, not scored" path rather than a red wall.
 */

/** What a client reports about where it is. Everything past lat/lng is optional but read. */
export interface Fix {
  lat: number;
  lng: number;
  /** The fix's own error radius, in metres, as the OS reported it. */
  accuracyM?: number | null;
  /** The OS flagged the fix as simulated (Android `isMock`). */
  mocked?: boolean | null;
}

/**
 * Faster than this between two accepted fixes is teleporting. Twelve km a
 * minute is an airliner at cruise; a ferry does one, a scooter half of one.
 */
export const MAX_TRAVEL_KM_PER_MIN = 12;

/**
 * Below this, two fixes are not travel at all. GPS jitter between two taps
 * seconds apart is 30-200 m, and read as speed it looks like teleporting -
 * it did, live: 200 m in half a second came out as 21 km a minute. The
 * check is for kilometres.
 */
export const TRAVEL_CHECK_MIN_M = 500;

/**
 * Proof this soon after arriving is a drive-by. Ten minutes is short next to
 * the shortest quest (45 min) and long next to a photograph from the road.
 */
export const QUEST_MIN_DWELL_MIN = 10;

/**
 * A quest site is a point. Ingress interacts at 40 m and Pokémon GO counts a
 * visit at 40-50 m; 120 m leaves room for a meeting point that is "the north
 * end of the beach" and consumer GPS that is 30-50 m out under trees. The
 * 250 m check-in radius is for a PLACE - a whole beach or market - and pays
 * only self-verified Trip Points. The one exception is a quest whose site is
 * the island itself.
 */
export const QUEST_RADIUS_MAX_M = 120;

/**
 * Whether a fix can place someone inside a fence at all.
 *
 * Unknown accuracy is allowed - an older client, or an OS that did not say -
 * because refusing it would refuse every honest phone that predates this
 * rule. A stated accuracy wider than the fence is not.
 */
export const fixIsUsable = (accuracyM: number | null | undefined, radiusM: number): boolean =>
  accuracyM == null || !Number.isFinite(accuracyM) || accuracyM <= radiusM;

/** Great-circle distance in metres. */
export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The speed two fixes imply, in km per minute.
 *
 * Zero or negative elapsed time with any real distance is infinite - two
 * places in the same instant - and anything under `TRAVEL_CHECK_MIN_M` is
 * zero, so jitter between two taps never reads as teleporting.
 */
export function impliedKmPerMin(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  elapsedMs: number,
): number {
  const km = metresBetween(from, to) / 1000;
  if (km * 1000 < TRAVEL_CHECK_MIN_M) return 0;
  if (elapsedMs <= 0) return Number.POSITIVE_INFINITY;
  return km / (elapsedMs / 60_000);
}
