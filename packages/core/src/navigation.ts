/**
 * Turn-by-turn, from the router this app already asks.
 *
 * `routing.ts` asks Valhalla for a line and reads two numbers off the answer:
 * how long the road is and how long it takes. That is everything a BANNER
 * over a map needs and nothing a NAVIGATOR needs, because a navigator has to
 * say which way to turn and when - and that lives in a part of the reply the
 * existing parser throws away.
 *
 * This file reads the rest of it. It does not ask a different question: the
 * request `routeRequestUrl` already builds returns maneuvers by default, so
 * nothing new is fetched and nobody's free server is asked twice.
 *
 * THE SCHEMA WAS READ, NOT GUESSED. Every field below was checked against a
 * live reply from `valhalla1.openstreetmap.de` on the two costings this app
 * uses, and two of them are the kind of thing a guess gets wrong:
 *
 *   - `type` is a NUMBER, not a string. 10 is right and 15 is left, and
 *     there is no textual enum anywhere in the reply to fall back on.
 *   - a maneuver's `length` is in the units the REQUEST asked for, which is
 *     kilometres. A maneuver reading `"length": 0.119` is 119 metres, and
 *     the reply's own `verbal_post_transition_instruction` says "Continue
 *     for 100 meters" beside it, which is how that was confirmed.
 *
 * WHY THE ROUTER'S OWN SENTENCE IS NOT SHOWN. Valhalla writes a perfectly
 * good instruction - "Turn right onto ถนนพังบัว." - in `trip.language`,
 * which is `en-US` unless asked otherwise. Showing it would put an English
 * sentence on a Thai screen and a Chinese one, and asking the router for
 * three languages would be three requests for one line. So the TYPE is read
 * and the sentence is written here, in all three languages, from the app's
 * own strings. The street name is the one piece taken verbatim, because a
 * road's name is its name.
 */

import type { Localised } from './types.ts';
import type { LatLng } from './wayfinding.ts';
import { decodePolyline, type Route, type RouteMode } from './routing.ts';

/**
 * What a traveller is asked to do, in the words this app has pictures for.
 *
 * Eleven, which is fewer than Valhalla's forty-odd. The ones left out -
 * ramps, merges, ferry boarding, lifts, escalators - do not happen on a
 * Samui back road, and inventing an icon for each would be drawing for a
 * case nobody will meet. They fold into the nearest honest neighbour below,
 * and the fold is written down rather than implied.
 */
export type ManeuverType =
  | 'start'
  | 'continue'
  | 'slight-left'
  | 'slight-right'
  | 'turn-left'
  | 'turn-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'u-turn'
  | 'roundabout'
  | 'arrive';

/**
 * Valhalla's numeric maneuver codes, as the server actually sends them.
 *
 * Taken from the enum the project documents and confirmed against live
 * replies for 1, 6, 10, 11, 14, 15. The ones this app has no picture for are
 * folded deliberately:
 *
 *   - a ramp or an exit to the right reads as a slight right, because that
 *     is what the hand on the bars does;
 *   - "stay straight", "becomes" and a plain merge read as continue;
 *   - entering and leaving a roundabout are one icon, because the second
 *     only ever follows the first.
 *
 * Anything not listed - a ferry, a lift, a flight of steps, a code added in
 * a future Valhalla - becomes `continue`. That is the one fallback that can
 * never point somebody the wrong way: it says keep going, and the distance
 * to the NEXT maneuver still counts down correctly.
 */
const VALHALLA_TYPES: Record<number, ManeuverType> = {
  1: 'start', 2: 'start', 3: 'start',
  4: 'arrive', 5: 'arrive', 6: 'arrive',
  7: 'continue', 8: 'continue',
  9: 'slight-right',
  10: 'turn-right',
  11: 'sharp-right',
  12: 'u-turn', 13: 'u-turn',
  14: 'sharp-left',
  15: 'turn-left',
  16: 'slight-left',
  17: 'continue',
  18: 'slight-right', 19: 'slight-left',
  20: 'slight-right', 21: 'slight-left',
  22: 'continue', 23: 'slight-right', 24: 'slight-left',
  25: 'continue',
  26: 'roundabout', 27: 'roundabout',
  37: 'slight-right', 38: 'slight-left',
};

/** The fold above, as a function, so an unknown code has one answer everywhere. */
export const maneuverType = (code: unknown): ManeuverType =>
  (typeof code === 'number' ? VALHALLA_TYPES[code] : undefined) ?? 'continue';

export interface Maneuver {
  type: ManeuverType;
  /**
   * The roads this maneuver turns onto, as the router named them. Empty when
   * it named none - which is common on Samui, where a great many lanes are
   * in OpenStreetMap as geometry with no name at all.
   *
   * NEVER FILLED IN. An instruction with no street name says "turn right";
   * it does not say "turn right onto the road", and it certainly does not
   * borrow the name of the previous one.
   */
  streets: string[];
  /** The length of this leg of the walk or drive, in METRES. */
  metres: number;
  seconds: number;
  /**
   * Where this maneuver begins and ends in the route's shape.
   *
   * Indices into `Route.line` AFTER the legs have been joined - see
   * `parseNavRoute`, which offsets them, because Valhalla counts each leg's
   * shape from zero and a two-leg route would otherwise put every maneuver
   * of the second leg back at the start of the first.
   */
  beginIndex: number;
  endIndex: number;
  /** Heading on leaving the maneuver, degrees clockwise from north, or null. */
  bearingAfter: number | null;
  /** Which exit to take, for a roundabout. Null when the router did not say. */
  roundaboutExit: number | null;
}

/**
 * A route with its instructions.
 *
 * A superset of `Route`, deliberately: everything that already draws a line
 * from a `Route` - the map's way layer, the banner, the Google Maps handoff -
 * keeps working when handed one of these, and nothing had to be changed to
 * accept it.
 */
export interface NavRoute extends Route {
  maneuvers: Maneuver[];
}

interface ValhallaManeuver {
  type?: number;
  street_names?: unknown;
  length?: number;
  time?: number;
  begin_shape_index?: number;
  end_shape_index?: number;
  bearing_after?: number;
  roundabout_exit_count?: number;
}

interface ValhallaReply {
  trip?: {
    status?: number;
    summary?: { length?: number; time?: number };
    legs?: { shape?: string; maneuvers?: ValhallaManeuver[] }[];
  };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The router's street names, with anything that is not a usable name dropped. */
const streetsOf = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [])
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    .map((n) => n.trim());

/**
 * The route and its instructions, or null.
 *
 * Null for the same shapes of failure `parseRoute` returns null for, and for
 * the same reason: a caller that cannot draw a road draws the straight line,
 * and there is nothing it would do differently for a malformed body than for
 * a server that said no route exists.
 *
 * A route with NO maneuvers is not a failure. The line is still a road and
 * still worth drawing and following; what it costs is the turn banner, and
 * the navigator says so rather than inventing turns. That is why the
 * maneuver list is allowed to come back empty here instead of failing the
 * whole parse.
 *
 * TWO THINGS ARE DONE TO THE SHAPE INDICES, and both matter:
 *
 *   - legs are joined, and the joint is a DUPLICATE POINT. Valhalla ends one
 *     leg and starts the next at the same coordinate, so the shared point is
 *     dropped and the offset for the next leg's indices is reduced by one to
 *     match. Get this wrong and every maneuver after the first via-point is
 *     one point further along than the road it names.
 *   - they are CLAMPED to the joined line. A truncated polyline decodes to a
 *     short line (see `decodePolyline`), and an index past its end would
 *     read `undefined` as a coordinate somewhere deep in the progress
 *     engine, where it would surface as NaN metres rather than as a bad
 *     index.
 */
export function parseNavRoute(body: unknown, mode: RouteMode): NavRoute | null {
  const trip = (body as ValhallaReply)?.trip;
  if (!trip || (trip.status !== undefined && trip.status !== 0)) return null;
  const km = trip.summary?.length;
  const seconds = trip.summary?.time;
  if (!finite(km) || !finite(seconds)) return null;

  const line: [number, number][] = [];
  const maneuvers: Maneuver[] = [];

  for (const leg of trip.legs ?? []) {
    const shape = leg?.shape ? decodePolyline(leg.shape) : [];
    if (shape.length === 0) continue;
    const previous = line[line.length - 1];
    const first = shape[0]!;
    const joined = previous !== undefined && previous[0] === first[0] && previous[1] === first[1];
    const offset = line.length - (joined ? 1 : 0);
    line.push(...(joined ? shape.slice(1) : shape));

    for (const raw of leg?.maneuvers ?? []) {
      if (!raw || typeof raw !== 'object') continue;
      const begin = finite(raw.begin_shape_index) ? raw.begin_shape_index : 0;
      const end = finite(raw.end_shape_index) ? raw.end_shape_index : begin;
      maneuvers.push({
        type: maneuverType(raw.type),
        streets: streetsOf(raw.street_names),
        // Kilometres in the reply, because the request asked for kilometres.
        metres: finite(raw.length) ? Math.max(0, Math.round(raw.length * 1000)) : 0,
        seconds: finite(raw.time) ? Math.max(0, raw.time) : 0,
        beginIndex: Math.max(0, begin + offset),
        endIndex: Math.max(0, end + offset),
        bearingAfter: finite(raw.bearing_after) ? ((raw.bearing_after % 360) + 360) % 360 : null,
        roundaboutExit: finite(raw.roundabout_exit_count) ? raw.roundabout_exit_count : null,
      });
    }
  }

  // A route with one point is not a line, and would draw as nothing.
  if (line.length < 2) return null;

  const last = line.length - 1;
  for (const m of maneuvers) {
    m.beginIndex = Math.min(m.beginIndex, last);
    m.endIndex = Math.min(Math.max(m.endIndex, m.beginIndex), last);
  }

  return {
    mode,
    metres: Math.round(km * 1000),
    seconds: Math.round(seconds),
    line,
    maneuvers,
  };
}

/**
 * The arrow to draw, as a name rather than a picture.
 *
 * The icon itself belongs to the app - `lucide-react-native` on a phone, an
 * inline SVG inside the map's document - and the two cannot share a
 * component. What they can share is this: one place that decides which arrow
 * a maneuver gets, so the banner over the map and the mark on the route can
 * never disagree about which way the road turns.
 */
export type ManeuverArrow = 'straight' | 'left' | 'right' | 'slight-left' | 'slight-right'
  | 'sharp-left' | 'sharp-right' | 'u-turn' | 'roundabout' | 'flag' | 'start';

export const maneuverArrow = (type: ManeuverType): ManeuverArrow => {
  switch (type) {
    case 'start': return 'start';
    case 'arrive': return 'flag';
    case 'turn-left': return 'left';
    case 'turn-right': return 'right';
    case 'slight-left': return 'slight-left';
    case 'slight-right': return 'slight-right';
    case 'sharp-left': return 'sharp-left';
    case 'sharp-right': return 'sharp-right';
    case 'u-turn': return 'u-turn';
    case 'roundabout': return 'roundabout';
    default: return 'straight';
  }
};

/**
 * A space, where Thai and Chinese need one and only there.
 *
 * Thai and Chinese do not put spaces between words, which is why
 * "เลี้ยวขวาเข้าถนนพังบัว" is correct and a space in the middle of it would
 * read as a phrase break. Both languages DO put a space around a run of
 * Latin script, and a great many roads on this island are in OpenStreetMap
 * under a Latin name - so the same template that sets Thai correctly sets
 * "เลี้ยวขวาเข้าSoi Nalat", which is what a live run of this feature
 * produced and what these two functions exist to fix.
 *
 * The test is the FIRST or LAST character, not the whole string: a road
 * called "ซอย 4171" is Thai with digits in it and needs no space, while
 * "Soi Nalat" does.
 */
const LOCAL_SCRIPT = /[฀-๿　-鿿＀-￯]/;

/** A space to put BEFORE this text in Thai or Chinese, or nothing. */
export const gapBefore = (text: string): string =>
  (text.length > 0 && !LOCAL_SCRIPT.test(text[0]!) ? ' ' : '');

/** A space to put AFTER this text in Thai or Chinese, or nothing. */
export const gapAfter = (text: string): string =>
  (text.length > 0 && !LOCAL_SCRIPT.test(text[text.length - 1]!) ? ' ' : '');

/**
 * What to say, in all three languages.
 *
 * The verb comes from the TYPE and the road name comes from the router, in
 * that order and never the other way round: a maneuver with no street name
 * gets the plain verb, because "turn right onto" with nothing after it is
 * worse than "turn right", and a borrowed name is worse than both.
 *
 * Thai and Chinese take the street name without a preposition, which is how
 * both languages do it - เลี้ยวขวาเข้าถนนพังบัว, 右转进入ถนนพังบัว - and the
 * name itself is never translated, because the sign at the junction is not.
 */
const VERB: Record<ManeuverType, Localised> = {
  start: { en: 'Start', th: 'เริ่มเดินทาง', zh: '出发' },
  continue: { en: 'Continue straight', th: 'ตรงไป', zh: '直行' },
  'slight-left': { en: 'Keep left', th: 'ชิดซ้าย', zh: '靠左行驶' },
  'slight-right': { en: 'Keep right', th: 'ชิดขวา', zh: '靠右行驶' },
  'turn-left': { en: 'Turn left', th: 'เลี้ยวซ้าย', zh: '向左转' },
  'turn-right': { en: 'Turn right', th: 'เลี้ยวขวา', zh: '向右转' },
  'sharp-left': { en: 'Turn sharp left', th: 'เลี้ยวซ้ายหักศอก', zh: '向左急转' },
  'sharp-right': { en: 'Turn sharp right', th: 'เลี้ยวขวาหักศอก', zh: '向右急转' },
  'u-turn': { en: 'Make a U-turn', th: 'กลับรถ', zh: '掉头' },
  roundabout: { en: 'Enter the roundabout', th: 'เข้าวงเวียน', zh: '进入环岛' },
  arrive: { en: 'Arrive at your destination', th: 'ถึงจุดหมาย', zh: '到达目的地' },
};

const ONTO: Record<ManeuverType, (verb: Localised, street: string) => Localised> = {
  start: (v, s) => ({ en: `${v.en} on ${s}`, th: `${v.th}บน${gapBefore(s)}${s}`, zh: `${v.zh}，沿${gapBefore(s)}${s}` }),
  continue: (v, s) => ({ en: `${v.en} on ${s}`, th: `${v.th}บน${gapBefore(s)}${s}`, zh: `${v.zh}，沿${gapBefore(s)}${s}` }),
  roundabout: (v, s) => ({ en: `${v.en} and exit onto ${s}`, th: `${v.th} แล้วออกที่${gapBefore(s)}${s}`, zh: `${v.zh}，驶出至${gapBefore(s)}${s}` }),
  arrive: (v) => v,
  'slight-left': (v, s) => ({ en: `${v.en} onto ${s}`, th: `${v.th}เข้า${gapBefore(s)}${s}`, zh: `${v.zh}，进入${gapBefore(s)}${s}` }),
  'slight-right': (v, s) => ({ en: `${v.en} onto ${s}`, th: `${v.th}เข้า${gapBefore(s)}${s}`, zh: `${v.zh}，进入${gapBefore(s)}${s}` }),
  'turn-left': (v, s) => ({ en: `${v.en} onto ${s}`, th: `${v.th}เข้า${gapBefore(s)}${s}`, zh: `${v.zh}进入${gapBefore(s)}${s}` }),
  'turn-right': (v, s) => ({ en: `${v.en} onto ${s}`, th: `${v.th}เข้า${gapBefore(s)}${s}`, zh: `${v.zh}进入${gapBefore(s)}${s}` }),
  'sharp-left': (v, s) => ({ en: `${v.en} onto ${s}`, th: `${v.th}เข้า${gapBefore(s)}${s}`, zh: `${v.zh}进入${gapBefore(s)}${s}` }),
  'sharp-right': (v, s) => ({ en: `${v.en} onto ${s}`, th: `${v.th}เข้า${gapBefore(s)}${s}`, zh: `${v.zh}进入${gapBefore(s)}${s}` }),
  'u-turn': (v, s) => ({ en: `${v.en} onto ${s}`, th: `${v.th}เข้า${gapBefore(s)}${s}`, zh: `${v.zh}，进入${gapBefore(s)}${s}` }),
};

/** The whole instruction for a maneuver, road name and all. */
export function maneuverInstruction(maneuver: Maneuver): Localised {
  const verb = VERB[maneuver.type];
  const street = maneuver.streets[0];
  if (!street) return verb;
  return ONTO[maneuver.type](verb, street);
}

/**
 * The road being travelled right now, for the line under the instruction.
 *
 * The CURRENT maneuver's street, not the next one's: the banner says "turn
 * left in 120 m" and underneath it says which road that is happening on.
 * Null when the router named none, and the banner then draws nothing rather
 * than a placeholder.
 */
export const maneuverStreet = (maneuver: Maneuver | null): string | null =>
  maneuver?.streets[0] ?? null;

/**
 * Where a maneuver happens on the ground.
 *
 * Its BEGIN point: that is the junction. The end index is where the next
 * stretch of road finishes, which is the next junction along, and counting
 * down to that would tell somebody to turn one road too late.
 */
export const maneuverPoint = (route: NavRoute, index: number): LatLng | null => {
  const maneuver = route.maneuvers[index];
  if (!maneuver) return null;
  const point = route.line[maneuver.beginIndex];
  return point ? { lat: point[1], lng: point[0] } : null;
};

/**
 * The moment the traveller is expected to arrive, as a wall clock.
 *
 * Takes `now` rather than reading the clock itself, which is what makes it
 * testable and what keeps one render's "now" consistent across the three
 * places that show it. Seconds are a router's estimate, not a promise; the
 * rounding that admits as much happens in `formatDuration`, and this returns
 * a `Date` so the screen can format it in the traveller's own locale.
 */
export const arrivalAt = (now: number, remainingSeconds: number): Date =>
  new Date(now + Math.max(0, remainingSeconds) * 1000);
