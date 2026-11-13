/**
 * The navigator: one hook that owns the trip.
 *
 * The parts it joins are all testable on their own and all deliberately
 * dumb - `machine.ts` knows nothing about GPS, `navigation-progress.ts`
 * knows nothing about React, `session.ts` knows nothing about routes beyond
 * their shape. What is left here is the WIRING, and the wiring is where the
 * ordering hazards live. Each one is handled in a named place below:
 *
 *   - a reply arriving after the question stopped mattering: the ticket, and
 *     an `AbortController` so the fetch dies too;
 *   - a reroute storm on a free community server: the cooldown in the
 *     machine, plus the rule that an offline phone does not ask at all;
 *   - a route cleared before its replacement arrives: the old route is held
 *     until a new one parses, and only then swapped;
 *   - a GPS watcher left running: `active` is the single switch, and it is
 *     false in every ended state.
 *
 * WHAT THIS DOES NOT DO. It does not simulate a position, ever, in any
 * build. A navigator with no fix says it has no fix; that is the whole
 * reason the `gps-lost` state exists rather than a last-known dot that keeps
 * creeping along the route on its own.
 */

import React from 'react';
import {
  advance, beyondRouter, metresBetween, parseNavRoute, routeMetrics, routeRefusal, routeRequestUrl,
  type LatLng, type NavFix, type NavProgress, type NavRoute, type RouteMode, type RouteMetrics,
} from '@chivago/core';

import { useOnline } from '../state/online.ts';
import {
  GPS_LOST_AFTER_MS, GPS_SILENCE_CHECK_MS, IDLE, isFollowing, step,
  type NavFailure, type NavMachine, type NavStatus,
} from './machine.ts';

/** The router's refusal, in the words the navigator's states are kept in. */
const FAILURE_FOR: Record<string, NavFailure> = {
  'too-far': 'too-far',
  'no-path': 'no-path',
  unreachable: 'no-path',
  unknown: 'no-route',
};
import { clearSession, loadSession, saveSession, type NavDestination } from './session.ts';
import { useNavigationFix } from './use-navigation-fix.ts';

/** The router's deadline. The same one the map's banner uses, for the same reason. */
export const NAV_ROUTE_TIMEOUT_MS = 12_000;

/**
 * How long to wait for the phone to say where it is before giving up.
 *
 * A cold GPS fix outdoors is five to fifteen seconds; indoors it may never
 * come at all. Twenty-five seconds is past the first and well short of a
 * traveller's patience - and the state it fails into is one they can act
 * on, which an endlessly disabled button is not.
 *
 * This exists because of a screenshot: the Start button read "Waiting for
 * GPS…", greyed out, with no route, no error and no way forward, and it
 * would have stayed that way until the screen was closed.
 */
export const NAV_FIRST_FIX_TIMEOUT_MS = 25_000;

/**
 * How near a saved route's destination has to be to count as the same trip.
 *
 * A hundred metres. The saved record holds the coordinate the ROUTER was
 * given; asking again for the same place produces the same coordinate, so
 * this is really a guard against restoring a route to the beach next door.
 */
const SAME_DESTINATION_M = 100;

export interface Navigator {
  status: NavStatus;
  failure: NavFailure | null;
  route: NavRoute | null;
  progress: NavProgress | null;
  /** True while the drawn route is one the router could not refresh. */
  rerouteFailed: boolean;
  /** True while the route being followed came from the phone's own store. */
  fromCache: boolean;
  online: boolean;
  fix: NavFix | null;
  /** The camera is the app's to drive. False once the traveller pans. */
  following: boolean;
  start: () => void;
  stop: () => void;
  recentre: () => void;
  /** The traveller moved the map; the camera lets go until they ask for it back. */
  releaseCamera: () => void;
}

const sameDestination = (a: NavDestination, b: NavDestination): boolean => {
  // A flat approximation is right here: the whole question is "within a
  // hundred metres", and this runs once per restore.
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng) <= SAME_DESTINATION_M;
};

export function useNavigator(
  destination: NavDestination | null,
  mode: RouteMode,
  /** Optional planned start. Live progress still comes only from real GPS fixes. */
  originOverride: LatLng | null = null,
): Navigator {
  const [machine, dispatch] = React.useReducer(step, IDLE);
  const [route, setRoute] = React.useState<NavRoute | null>(null);
  const [progress, setProgress] = React.useState<NavProgress | null>(null);
  const [fromCache, setFromCache] = React.useState(false);
  const online = useOnline();

  /*
    THE WATCHER RUNS ONLY WHILE THE TRIP DOES.

    Every state in which a fix would change something, and no others.
    `preview` is deliberately absent: a route drawn for a place the
    traveller is reading about does not need the GPS radio on the tightest
    setting, and `useHere` has already given the screen a dot.
  */
  const wantsFixes = machine.status === 'acquiring-location'
    || machine.status === 'routing'
    || machine.status === 'ready'
    || isFollowing(machine.status);
  /*
    THE WATCHER, AND THE RIGHT TO ASK FOR A NEW ONE.

    `attempt` is bumped when the navigator has heard nothing for long enough
    to believe the watcher itself has died - see the silence check below.
    Without it a subscription that goes quiet is permanent: the screen keeps
    drawing a route, the arrow never moves again, and nothing in the app is
    in a position to notice.
  */
  const [attempt, setAttempt] = React.useState(0);
  const { fix, permission } = useNavigationFix(wantsFixes, attempt);

  // Read inside effects that must not re-run when they change.
  const fixRef = React.useRef<NavFix | null>(null);
  fixRef.current = fix;
  const progressRef = React.useRef<NavProgress | null>(null);
  const routeRef = React.useRef<NavRoute | null>(null);
  routeRef.current = route;
  const onlineRef = React.useRef(online);
  onlineRef.current = online;
  const destinationRef = React.useRef(destination);
  destinationRef.current = destination;
  const originRef = React.useRef(originOverride);
  originRef.current = originOverride;

  /**
   * The route's measurements, computed once per route.
   *
   * A twenty-kilometre drive is nine hundred points; `routeMetrics` walks
   * all of them. Doing that per fix is the difference between a map that
   * follows and a map that stutters, and it is the one memo in this file
   * that is load-bearing rather than tidy.
   */
  const metrics: RouteMetrics | null = React.useMemo(
    () => (route ? routeMetrics(route.line) : null),
    [route],
  );

  // -- Starting and stopping ------------------------------------------------

  const start = React.useCallback(() => { dispatch({ type: 'start' }); }, []);
  const recentre = React.useCallback(() => { dispatch({ type: 'recentre' }); }, []);
  const releaseCamera = React.useCallback(() => { dispatch({ type: 'panned' }); }, []);
  const stop = React.useCallback(() => {
    dispatch({ type: 'stop' });
    setProgress(null);
    progressRef.current = null;
    void clearSession();
  }, []);

  // A new destination is a new trip. The route is dropped here rather than
  // left to the next reply, so the map never shows the road to the place the
  // traveller changed their mind about.
  const destinationKey = destination ? `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}` : '';
  const originKey = originOverride ? `${originOverride.lat.toFixed(5)},${originOverride.lng.toFixed(5)}` : 'gps';
  React.useEffect(() => {
    if (!destinationKey) { dispatch({ type: 'stop' }); return; }
    dispatch({ type: 'preview' });
    setRoute(null);
    setProgress(null);
    setFromCache(false);
    progressRef.current = null;
  }, [destinationKey, originKey, mode]);

  // The permission dialog's answer, turned into a state the screen can read.
  React.useEffect(() => {
    if (permission === 'denied' && wantsFixes) dispatch({ type: 'fail', failure: 'no-permission' });
  }, [permission, wantsFixes]);

  // The first fix is what ends `acquiring-location`. Nothing else does: a
  // navigator that started routing from a position it did not have would be
  // routing from the island's centre.
  React.useEffect(() => {
    if (fix && machine.status === 'acquiring-location') dispatch({ type: 'located' });
  }, [fix, machine.status]);

  /*
    AND IF IT NEVER COMES, SAY SO.

    Permission granted and no fix is a real and common state - indoors, in a
    lift, in a concrete stairwell - and it is NOT the same as permission
    refused, which is why it fails into `no-location` rather than borrowing
    the permission message. The traveller is told the one thing that
    actually helps, which is to move.
  */
  React.useEffect(() => {
    if (machine.status !== 'acquiring-location') return undefined;
    const timer = setTimeout(() => {
      if (fixRef.current) return;
      dispatch({ type: 'fail', failure: 'no-location' });
    }, NAV_FIRST_FIX_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [machine.status]);

  // -- Asking for a route ---------------------------------------------------

  const asking = machine.status === 'routing' || machine.status === 'rerouting';
  React.useEffect(() => {
    if (!asking) return undefined;
    const to = destinationRef.current;
    // A chosen start shapes the first route. Reroutes always begin at the
    // live GPS fix: once somebody is moving, routing from the place where
    // they planned to start would draw a convincing but wrong road.
    const from = machine.status === 'routing' ? (originRef.current ?? fixRef.current) : fixRef.current;
    const ticket = machine.ticket;
    if (!to || !from) {
      dispatch({ type: 'routed', ticket, ok: false });
      return undefined;
    }

    let live = true;
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(), NAV_ROUTE_TIMEOUT_MS);

    /*
      THE SAVED ROUTE IS THE OFFLINE ANSWER, and it is tried in two places.

      Before the request when there is no network at all - asking a router
      from an aeroplane is a guaranteed twelve-second wait - and after a
      failed one, because a server having a bad afternoon is indistinguishable
      from no signal at this layer and the traveller's answer is the same
      either way: follow the road we already have.

      It is only ever accepted for the SAME destination. A saved route to
      somewhere else is not a route to here, and drawing it would be the
      single most dangerous thing this feature could do.
    */
    const fallBackToSaved = async (): Promise<boolean> => {
      // Saved sessions predate selectable starts and do not store an origin.
      // Reusing one here could silently show a route from another place.
      if (originRef.current) return false;
      const saved = await loadSession();
      if (!saved || saved.mode !== mode || !sameDestination(saved.destination, to)) return false;
      if (!live) return false;
      setRoute(saved.route);
      setFromCache(true);
      return true;
    };

    /*
      THE ONE REFUSAL THE APP CAN WORK OUT FOR ITSELF.

      The router plans a walk up to a hundred kilometres and returns 400
      past it. Asking anyway costs a round trip to somebody's free server
      and tells the traveller nothing the straight line did not already
      say - and a browser log caught this app doing it three times over for
      a single 220 km trip.
    */
    if (beyondRouter(mode, metresBetween(from, to))) {
      dispatch({ type: 'routed', ticket, ok: false, failure: 'too-far' });
      clearTimeout(timer);
      return () => { live = false; control.abort(); };
    }

    void (async () => {
      try {
        if (!onlineRef.current) {
          const restored = await fallBackToSaved();
          if (live) dispatch({ type: 'routed', ticket, ok: restored });
          return;
        }
        const res = await fetch(routeRequestUrl(from, to, mode), { signal: control.signal });
        const body: unknown = await res.json();
        if (!live) return;
        const next = res.ok ? parseNavRoute(body, mode) : null;
        if (next) {
          setRoute(next);
          setFromCache(false);
          // Measuring from scratch: the new route is a different line, and
          // the old distance along the old one means nothing on it.
          progressRef.current = null;
          setProgress(null);
          // See the fallback rule above: a route with an explicit start must
          // not become a future GPS-origin route without carrying that start.
          if (!originRef.current) void saveSession({ destination: to, mode, route: next });
          dispatch({ type: 'routed', ticket, ok: true });
          return;
        }
        const restored = await fallBackToSaved();
        // The router's own reason, when it gave one and nothing was saved.
        if (live) {
          dispatch({
            type: 'routed', ticket, ok: restored,
            failure: restored ? undefined : FAILURE_FOR[routeRefusal(body)],
          });
        }
      } catch {
        if (!live) return;
        const restored = await fallBackToSaved();
        if (live) dispatch({ type: 'routed', ticket, ok: restored });
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => { live = false; clearTimeout(timer); control.abort(); };
    // Deliberately NOT keyed on the fix: the route is asked for once per
    // ticket, and the ticket changes exactly when a new question is worth
    // asking. `destination` and the fix are read through refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking, machine.ticket, mode]);

  // -- Following ------------------------------------------------------------

  /*
    ONE MEASUREMENT PER FIX, and the guard below is not an optimisation.

    This effect is keyed on the status as well as the fix, because it has to
    start measuring the moment a route arrives. That made it re-run whenever
    the status changed - with the SAME fix - and re-running `advance` on a
    fix that has already been counted is wrong in three separate ways:

      - it dispatches another `fix` event, which turns `gps-lost` straight
        back into `navigating`. A browser run found the navigator sitting in
        total silence with a live-looking banner for as long as it was left
        there, because the silence check and this effect undid each other
        once a second;
      - it increments the off-route streak twice for one fix, so three bad
        fixes became six and the reroute fired early;
      - it does the same to the arrival streak.

    A new ROUTE is the one case that must recompute without a new fix, and
    it recomputes from scratch: the old distance along the old line means
    nothing on the new one.
  */
  const seenFix = React.useRef<NavFix | null>(null);
  const seenMetrics = React.useRef<RouteMetrics | null>(null);
  React.useEffect(() => {
    const current = routeRef.current;
    const to = destinationRef.current;
    if (!fix || !current || !metrics || !to) return;
    if (!isFollowing(machine.status) && machine.status !== 'ready') return;

    const freshFix = fix !== seenFix.current;
    const freshRoute = metrics !== seenMetrics.current;
    if (!freshFix && !freshRoute) return;
    seenFix.current = fix;
    seenMetrics.current = metrics;

    const next = advance(current, metrics, freshRoute ? null : progressRef.current, fix, to);
    if (!next) return;
    progressRef.current = next;
    setProgress(next);

    // `ready` becomes `navigating` on the first fix measured against the
    // route, not on the first fix at all: until then there is nothing to
    // put in the banner.
    if (freshFix) dispatch({ type: 'fix' });

    if (next.arrived) { dispatch({ type: 'arrived' }); return; }
    /*
      OFF THE ROAD, AND WHETHER THAT IS WORTH A REQUEST.

      An offline phone cannot be given a new route, so asking is a
      guaranteed failure that costs a timeout and tells the traveller
      nothing they do not already know. The screen says "off the route" from
      `progress.offRoute` either way; what the network decides is only
      whether a REQUEST goes out.
    */
    if (next.offRoute && onlineRef.current) {
      dispatch({ type: 'off-route', now: fix.timestamp });
    }
  }, [fix, metrics, machine.status]);

  // Arrival ends the trip, and the saved route goes with it: the next time
  // this place is asked for it should be routed from wherever the traveller
  // is then, not from where they were when they set off.
  React.useEffect(() => {
    if (machine.status === 'arrived') void clearSession();
  }, [machine.status]);

  /*
    THE SIGNAL IS GONE WHEN NOTHING HAS ARRIVED FOR LONG ENOUGH.

    Not when a fix is inaccurate - that is `progress.confident`, and the dot
    still moves for it. This is the other failure: a phone in a valley, or a
    watcher the platform has quietly torn down, that has simply stopped
    speaking.

    A TICKING CHECK, NOT A ONE-SHOT TIMER, and the difference is the whole
    reason this was rewritten. The first version armed a `setTimeout` keyed
    on the last fix's timestamp, which is correct only while the effect's
    dependencies behave: a re-render that re-ran the effect at the wrong
    moment cancelled the pending timer and armed a new one against a
    timestamp that was already old, and a browser run showed the result -
    twenty-three seconds of total silence with the banner still showing a
    live route and a frozen distance. Measuring the silence once a second
    against a clock cannot be lost that way, because it does not depend on
    being re-armed.

    IT ALSO ASKS FOR A NEW WATCHER. Saying "no signal" is honest but useless
    if the reason is that the subscription died, which is what the same run
    found happening: the watcher was being torn down and never replaced, and
    nothing in the app was in a position to notice. One re-subscription per
    silence, no faster than the silence threshold, is a recovery rather than
    a retry loop.
  */
  const lastFixAtRef = React.useRef<number | null>(null);
  if (fix) lastFixAtRef.current = Date.now();
  const silenceHandledAt = React.useRef(0);
  React.useEffect(() => {
    if (machine.status !== 'navigating' && machine.status !== 'rerouting') return undefined;
    const tick = setInterval(() => {
      const last = lastFixAtRef.current;
      if (last === null) return;
      if (Date.now() - last < GPS_LOST_AFTER_MS) return;
      dispatch({ type: 'gps-lost' });
      if (Date.now() - silenceHandledAt.current < GPS_LOST_AFTER_MS) return;
      silenceHandledAt.current = Date.now();
      setAttempt((n) => n + 1);
    }, GPS_SILENCE_CHECK_MS);
    return () => clearInterval(tick);
  }, [machine.status]);

  return {
    status: machine.status,
    failure: machine.failure,
    route,
    progress,
    rerouteFailed: machine.rerouteFailed,
    fromCache,
    online,
    fix,
    following: machine.status !== 'overview',
    start,
    stop,
    recentre,
    releaseCamera,
  };
}
