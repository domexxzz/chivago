/**
 * What state the navigator is in, and which states it may go to next.
 *
 * Written as a reducer over plain data rather than as a handful of
 * `useState` calls, for one reason that matters more than tidiness: a
 * navigator has four things happening at once - a GPS watcher, a route
 * request, a camera and a traveller's thumb - and the bugs that come out of
 * that are not logic bugs in any one of them. They are ORDERING bugs:
 *
 *   - a route request sent before the traveller pressed Stop, arriving
 *     after, and putting the map back into navigation;
 *   - two reroutes in flight, the slower one landing last and replacing a
 *     good route with a stale one;
 *   - the camera being told to follow while the traveller is panning the
 *     map, so the map snaps back under their finger;
 *   - a GPS gap being read as arrival because the last fix happened to be
 *     near the destination.
 *
 * None of those can be reproduced by rendering a component. All of them can
 * be reproduced here, in a loop, which is why this file holds no React.
 *
 * THE TICKET is how the first two are prevented. Every route request takes
 * the current ticket number with it; anything that invalidates a request in
 * flight - a new destination, a new reroute, stopping - increments it. A
 * reply whose ticket is not the current one is dropped on arrival, and the
 * fetch it came from is also aborted, so this is a second line rather than
 * the only one.
 */

export type NavStatus =
  /** Nothing asked for. */
  | 'idle'
  /** A destination chosen, its route drawn, nothing moving yet. */
  | 'preview'
  /** Started, and waiting for the phone to say where it is. */
  | 'acquiring-location'
  /** Asking the router. */
  | 'routing'
  /** A route in hand, about to follow it. */
  | 'ready'
  /** Following. */
  | 'navigating'
  /** Following, but the camera is in the traveller's hands. */
  | 'overview'
  /** Off the road, asking for another route, still drawing the old one. */
  | 'rerouting'
  /** No usable fix for long enough to say so. The route is still drawn. */
  | 'gps-lost'
  | 'arrived'
  /** Stopped by the traveller. */
  | 'ended'
  /** No route, and none to be had: the only state with nothing to draw. */
  | 'failed';

/**
 * Why the navigator failed, in terms a screen can turn into a sentence.
 *
 * Five, not one, because each has a different thing the traveller can DO:
 * change a setting, move somewhere with sky, switch mode, or accept that
 * the last part of the journey is by boat. "No route" for all of them is
 * true and useless.
 */
export type NavFailure = 'no-route' | 'no-permission' | 'no-location' | 'too-far' | 'no-path';

export interface NavMachine {
  status: NavStatus;
  /** The request generation. A reply from an older one is ignored. */
  ticket: number;
  /** When the last reroute was asked for, for the cooldown. */
  reroutedAt: number | null;
  /**
   * A reroute came back with nothing and the OLD route is still on screen.
   *
   * Kept as its own flag rather than as a status, because the navigator is
   * still navigating - the traveller is still being followed along a route
   * that is still drawn. What has changed is that the route is no longer
   * known to start where they are standing, and the screen has to say so.
   */
  rerouteFailed: boolean;
  failure: NavFailure | null;
}

export const IDLE: NavMachine = {
  status: 'idle', ticket: 0, reroutedAt: null, rerouteFailed: false, failure: null,
};

/**
 * How long before another reroute may be asked for.
 *
 * Fifteen seconds, and it is a kindness to somebody else's server as much as
 * a debounce: the router is the free FOSSGIS community instance (see
 * `packages/core/src/routing.ts`), and a traveller walking the wrong way
 * down a long road is otherwise a request every second for a minute.
 */
export const REROUTE_COOLDOWN_MS = 15_000;

/**
 * How long without a usable fix before the navigator says the signal is
 * gone.
 *
 * Longer than a gap between fixes and shorter than a traveller's patience.
 * Under a canopy a phone goes quiet for ten or fifteen seconds routinely,
 * and a banner that appears every time it does is a banner people learn to
 * ignore.
 */
export const GPS_LOST_AFTER_MS = 20_000;

/**
 * How often the navigator checks whether it has heard anything.
 *
 * Once a second, which is the rate fixes arrive at, so the worst case is a
 * second of extra silence before it is reported. Cheap: the check is a
 * subtraction against a ref, not a render.
 */
export const GPS_SILENCE_CHECK_MS = 1_000;

export type NavEvent =
  /** A destination was chosen. Draws its route; follows nothing. */
  | { type: 'preview' }
  /** The traveller pressed Start. */
  | { type: 'start' }
  /** The phone gave a position. */
  | { type: 'located' }
  /**
   * A route request came back. `ticket` is the one it was sent with.
   *
   * `failure` carries the router's own reason when it refused, so the first
   * route's failure can say which refusal it was. A REROUTE ignores it: a
   * reroute that fails keeps the old line and says so, whatever the reason.
   */
  | { type: 'routed'; ticket: number; ok: boolean; failure?: NavFailure }
  /** A fix arrived and the traveller is off the road. */
  | { type: 'off-route'; now: number }
  /** A fix arrived while navigating. */
  | { type: 'fix' }
  /** No usable fix for `GPS_LOST_AFTER_MS`. */
  | { type: 'gps-lost' }
  /** The traveller moved the map themselves. */
  | { type: 'panned' }
  /** The traveller asked for the camera back. */
  | { type: 'recentre' }
  | { type: 'arrived' }
  | { type: 'stop' }
  | { type: 'fail'; failure: NavFailure };

/** The states in which a route is on screen and progress is being measured. */
export const FOLLOWING: readonly NavStatus[] = ['navigating', 'overview', 'rerouting', 'gps-lost'];

export const isFollowing = (status: NavStatus): boolean => FOLLOWING.includes(status);

/** Whether the camera should be driving itself. */
export const isCameraOwned = (status: NavStatus): boolean =>
  status === 'navigating' || status === 'rerouting' || status === 'gps-lost';

/**
 * The next state.
 *
 * Every transition that is not listed is NOT A FAILURE - it is simply
 * ignored, and the state comes back unchanged. That is deliberate: events
 * arrive from a GPS watcher that does not know what the screen is doing, and
 * a fix landing one tick after Stop must not be an error to handle at the
 * call site. It must be nothing at all.
 */
export function step(state: NavMachine, event: NavEvent): NavMachine {
  switch (event.type) {
    case 'preview':
      // A new destination invalidates anything in flight for the old one.
      return { ...IDLE, status: 'preview', ticket: state.ticket + 1 };

    case 'start':
      if (state.status === 'ended' || state.status === 'arrived' || state.status === 'failed') {
        return { ...IDLE, status: 'acquiring-location', ticket: state.ticket + 1 };
      }
      if (state.status !== 'preview' && state.status !== 'idle') return state;
      return { ...state, status: 'acquiring-location', failure: null, rerouteFailed: false };

    case 'located':
      return state.status === 'acquiring-location' ? { ...state, status: 'routing' } : state;

    case 'routed': {
      // The reply to a question nobody is waiting for any more.
      if (event.ticket !== state.ticket) return state;
      if (state.status === 'routing') {
        return event.ok
          ? { ...state, status: 'ready', rerouteFailed: false, failure: null }
          : { ...state, status: 'failed', failure: event.failure ?? 'no-route' };
      }
      if (state.status === 'rerouting') {
        // A failed reroute does NOT clear the route or stop the navigator.
        // The old line is still a road; what it has lost is its claim to
        // start where the traveller is standing, and that is said in words.
        return event.ok
          ? { ...state, status: 'navigating', rerouteFailed: false }
          : { ...state, status: 'navigating', rerouteFailed: true };
      }
      return state;
    }

    case 'fix':
      if (state.status === 'ready') return { ...state, status: 'navigating' };
      // A fix is what brings the signal back. Returning to `navigating`
      // rather than to whatever came before is right: the only other
      // possibility is `overview`, and that is a camera state the traveller
      // asked for, which the clause below preserves.
      if (state.status === 'gps-lost') return { ...state, status: 'navigating' };
      return state;

    case 'gps-lost':
      return state.status === 'navigating' || state.status === 'rerouting'
        ? { ...state, status: 'gps-lost' }
        : state;

    case 'off-route': {
      if (state.status !== 'navigating' && state.status !== 'gps-lost') return state;
      const since = state.reroutedAt === null ? Infinity : event.now - state.reroutedAt;
      if (since < REROUTE_COOLDOWN_MS) return state;
      return { ...state, status: 'rerouting', reroutedAt: event.now, ticket: state.ticket + 1 };
    }

    case 'panned':
      // Only from the states where the camera was the app's to give up. A
      // pan during `rerouting` would otherwise lose the reroute.
      return state.status === 'navigating' ? { ...state, status: 'overview' } : state;

    case 'recentre':
      return state.status === 'overview' ? { ...state, status: 'navigating' } : state;

    case 'arrived':
      return isFollowing(state.status) || state.status === 'ready'
        ? { ...state, status: 'arrived' }
        : state;

    case 'stop':
      // Ticket bumped: a reroute in flight must not reopen a stopped trip.
      return { ...IDLE, status: 'ended', ticket: state.ticket + 1 };

    case 'fail':
      if (state.status === 'ended') return state;
      return { ...state, status: 'failed', failure: event.failure, ticket: state.ticket + 1 };

    default:
      return state;
  }
}

/** Replay a list of events, for tests and for reading a session back. */
export const run = (events: NavEvent[], from: NavMachine = IDLE): NavMachine =>
  events.reduce(step, from);
