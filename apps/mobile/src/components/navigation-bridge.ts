/**
 * What the screen may say to the map, and what the map may say back.
 *
 * On a phone the navigation map is MapLibre GL JS inside a WebView, which
 * means every instruction crosses a process boundary as text. Two rules
 * decide the shape of everything below, and both are security rules before
 * they are tidiness rules.
 *
 * ONE: NOTHING IS BUILT BY CONCATENATING JAVASCRIPT. The existing map talks
 * to its document with `injectJavaScript`, which is fine for `__zoom(1)` -
 * a number this code wrote itself. It is not fine for anything carrying
 * data, because a place name with a quote in it, or a route from a server,
 * becomes source code the moment it is pasted into a script string. So
 * commands travel by `postMessage`, where the payload is a string the page
 * parses as JSON and never evaluates.
 *
 * TWO: EVERYTHING ARRIVING IS VALIDATED, in both directions. The page
 * validates commands because a WebView can be reached by anything the page
 * loads; the screen validates events because `onMessage` delivers whatever
 * the document chose to send, and a map that has gone wrong is exactly the
 * situation in which it sends something unexpected.
 *
 * THE ONE RULE THAT MATTERS MOST IS NOT IN THE TYPES. A position update must
 * never cause the document to reload. That is a property of how the HTML is
 * built - see `NavigationMapView`, where the page is memoised on the things
 * that genuinely change it and the fix is NOT one of them - and it is what
 * separates a navigator from a slideshow.
 */

export interface LineUpdate {
  /** The road still ahead, in GeoJSON order. */
  remaining: [number, number][];
  /** The road already behind. */
  travelled: [number, number][];
  /** Junctions and the destination pin, as a FeatureCollection. */
  points: unknown;
}

export type MapCommand =
  /** The whole route, redrawn. Sent once per route, not once per fix. */
  | ({ type: 'SET_ROUTE' } & LineUpdate)
  /**
   * Where the traveller is and which way they face. Sent once per fix.
   *
   * `radius` is the accuracy ring's size as a MapLibre zoom expression,
   * already computed by `accuracyRadius` - plain data, not code. It is sent
   * rather than derived on the far side so the metres-to-pixels conversion
   * exists once in this repository instead of once per platform.
   */
  | { type: 'UPDATE_POSITION'; lng: number; lat: number; bearing: number; accuracyM: number | null; radius?: unknown }
  /** Move the camera. `duration` of 0 is a jump, for the first frame. */
  | { type: 'CAMERA'; centre: [number, number]; bearing: number; zoom: number; pitch: number; duration: number; padding: { top: number; bottom: number; left: number; right: number } }
  /** Frame the whole route, for the overview. */
  | { type: 'FIT'; bounds: [[number, number], [number, number]]; padding: { top: number; bottom: number; left: number; right: number } }
  /** One deliberate step from the visible + / - controls. */
  | { type: 'ZOOM'; delta: 1 | -1 }
  /** Take the route and the arrow off the map. */
  | { type: 'CLEAR_ROUTE' };

export type MapEvent =
  /** The style has loaded and the layers are in. Nothing may be sent before this. */
  | { type: 'MAP_READY' }
  /** A drag, a pinch or a two-finger tilt. The camera is theirs now. */
  | { type: 'USER_MOVED_MAP' }
  /** A deliberate tap, used only while the traveller is choosing an origin. */
  | { type: 'MAP_PRESS'; lng: number; lat: number }
  /** A tile or style failure the map could not recover from. */
  | { type: 'MAP_ERROR'; code: string };

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Read an event the document sent, or null.
 *
 * Null covers a truncated string, a different document's message, and a
 * shape this version does not know - all of which the caller treats the
 * same way, by ignoring it. An unknown event is not an error: a page from a
 * newer build talking to an older screen should fall silent, not crash it.
 */
export function parseMapEvent(raw: unknown): MapEvent | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4_096) return null;
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return null; }
  if (!body || typeof body !== 'object') return null;
  const { type, code, lng, lat } = body as {
    type?: unknown; code?: unknown; lng?: unknown; lat?: unknown;
  };
  if (type === 'MAP_READY') return { type: 'MAP_READY' };
  if (type === 'USER_MOVED_MAP') return { type: 'USER_MOVED_MAP' };
  if (type === 'MAP_PRESS') {
    if (!isNumber(lng) || !isNumber(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
    return { type: 'MAP_PRESS', lng, lat };
  }
  if (type === 'MAP_ERROR') return { type: 'MAP_ERROR', code: typeof code === 'string' ? code.slice(0, 200) : 'unknown' };
  return null;
}

/**
 * The same check, on the page's side, written as a string.
 *
 * It lives here rather than in the HTML so that the two halves of the
 * contract are read together: a command added above and not accepted below
 * is a bug visible in one file.
 */
export function validateCommand(command: unknown): MapCommand | null {
  if (!command || typeof command !== 'object') return null;
  const c = command as Record<string, unknown>;
  const line = (v: unknown): [number, number][] | null => {
    if (!Array.isArray(v)) return null;
    for (const p of v) {
      if (!Array.isArray(p) || p.length !== 2 || !isNumber(p[0]) || !isNumber(p[1])) return null;
    }
    return v as [number, number][];
  };
  const pad = (v: unknown): { top: number; bottom: number; left: number; right: number } | null => {
    if (!v || typeof v !== 'object') return null;
    const p = v as Record<string, unknown>;
    return isNumber(p.top) && isNumber(p.bottom) && isNumber(p.left) && isNumber(p.right)
      ? { top: p.top, bottom: p.bottom, left: p.left, right: p.right }
      : null;
  };

  switch (c.type) {
    case 'SET_ROUTE': {
      const remaining = line(c.remaining);
      const travelled = line(c.travelled);
      if (!remaining || !travelled) return null;
      return { type: 'SET_ROUTE', remaining, travelled, points: c.points ?? { type: 'FeatureCollection', features: [] } };
    }
    case 'UPDATE_POSITION':
      if (!isNumber(c.lng) || !isNumber(c.lat) || !isNumber(c.bearing)) return null;
      return {
        type: 'UPDATE_POSITION', lng: c.lng, lat: c.lat, bearing: c.bearing,
        accuracyM: isNumber(c.accuracyM) ? c.accuracyM : null,
        radius: c.radius,
      };
    case 'CAMERA': {
      const centre = line([c.centre])?.[0];
      const padding = pad(c.padding);
      if (!centre || !padding || !isNumber(c.bearing) || !isNumber(c.zoom) || !isNumber(c.pitch)) return null;
      return {
        type: 'CAMERA', centre, bearing: c.bearing, zoom: c.zoom, pitch: c.pitch,
        duration: isNumber(c.duration) ? c.duration : 0, padding,
      };
    }
    case 'FIT': {
      const bounds = Array.isArray(c.bounds) ? line(c.bounds) : null;
      const padding = pad(c.padding);
      if (!bounds || bounds.length !== 2 || !padding) return null;
      return { type: 'FIT', bounds: [bounds[0]!, bounds[1]!], padding };
    }
    case 'ZOOM':
      return c.delta === 1 || c.delta === -1 ? { type: 'ZOOM', delta: c.delta } : null;
    case 'CLEAR_ROUTE':
      return { type: 'CLEAR_ROUTE' };
    default:
      return null;
  }
}
