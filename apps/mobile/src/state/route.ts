/**
 * Asking a road router for a line, without ever needing the answer.
 *
 * The service behind this is a community server given away for free (see
 * `packages/core/src/routing.ts`), so the one rule this hook exists to
 * enforce is that NOTHING BREAKS WHEN IT DOES NOT ANSWER. A failure is not
 * an error state a screen has to render: it is `route: null`, which the map
 * already knows how to draw as the straight line it drew before there was a
 * router at all.
 *
 * Three things follow from that, and they are the whole file:
 *
 *   - a TIMEOUT. A request with no deadline is a spinner with no end, and
 *     on a bad conference network that is what a judge would be looking at.
 *   - ONE REQUEST PER DESTINATION. The from-point moves as the traveller
 *     walks, and re-routing on every fix would hammer somebody's free
 *     server for a line that has not meaningfully changed.
 *   - the LAST answer wins, not the last to arrive. Two destinations chosen
 *     quickly must not race, or the map ends up showing the road to the
 *     place the traveller changed their mind about.
 */

import React from 'react';
import { parseRoute, routeRequestUrl, type LatLng, type Route, type RouteMode } from '@chivago/core';

/** Long enough for a busy free server, short enough that nobody waits twice. */
export const ROUTE_TIMEOUT_MS = 8_000;

/**
 * How far the traveller must move before the route is asked for again, in
 * metres. Below this the line on screen would not visibly change, and the
 * request would be pure cost to somebody who is not charging for it.
 */
export const REROUTE_AFTER_M = 150;

export interface RouteState {
  route: Route | null;
  loading: boolean;
  /** True once a request has come back with nothing. The map says so. */
  failed: boolean;
}

const IDLE: RouteState = { route: null, loading: false, failed: false };

/** Rounded so a walking traveller does not re-key the effect every second. */
const gridKey = (p: LatLng | null): string => {
  if (!p) return '';
  // ~1e-3 degrees is about 110 m, which is the re-route distance above.
  const step = REROUTE_AFTER_M / 111_320;
  return `${Math.round(p.lat / step)},${Math.round(p.lng / step)}`;
};

export function useRoute(from: LatLng | null, to: LatLng | null, mode: RouteMode): RouteState {
  const [state, setState] = React.useState<RouteState>(IDLE);
  const fromKey = gridKey(from);
  const toKey = gridKey(to);

  React.useEffect(() => {
    if (!from || !to) { setState(IDLE); return undefined; }
    let live = true;
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(), ROUTE_TIMEOUT_MS);
    setState((was) => ({ route: was.route, loading: true, failed: false }));

    void (async () => {
      try {
        const res = await fetch(routeRequestUrl(from, to, mode), { signal: control.signal });
        const body: unknown = await res.json();
        if (!live) return;
        const route = res.ok ? parseRoute(body, mode) : null;
        setState({ route, loading: false, failed: route === null });
      } catch {
        // A timeout, an offline phone, a server having a bad afternoon. The
        // caller draws the straight line; none of them is worth telling
        // apart on a map.
        if (live) setState({ route: null, loading: false, failed: true });
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => { live = false; clearTimeout(timer); control.abort(); };
    // Keyed on the ROUNDED points: the effect must not re-run for a metre of
    // GPS jitter. `from`/`to` themselves are read inside and are correct at
    // the moment the effect runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKey, toKey, mode]);

  return state;
}
