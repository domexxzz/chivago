/**
 * HTTP helpers: the response envelope and the error mapping.
 *
 * Every route returns the same shape so the client has exactly one branch to
 * write. Errors are mapped to codes the app can act on - `OUTSIDE_GEOFENCE`
 * drives a specific message, `INSUFFICIENT_POINTS` drives another.
 */

import type { Context } from 'hono';
import {
  StoriesClosed, StoryNotFound, StoryQuotaReached, StoryTooLarge, UnknownPlace, UnsupportedStory,
} from './story-service.ts';
import type { ApiFailure, ApiSuccess } from '@chivago/core';
import { InsufficientPoints } from './wallet-service.ts';
import { InvalidTransition, OutsideGeofence } from './quest-service.ts';
import { SelfVisitQuotaReached } from './visit-service.ts';
import { FixTooCoarse, ImpossibleTravel, MockedLocation } from './presence-service.ts';
import { TooSoonAfterArrival } from './quest-service.ts';
import {
  AlreadyReported, AppealAlreadyOpen, CannotReportOwn, InvalidRating, NeverVisited,
  NothingToAppeal, NotYourReview, ReportRateLimited, TakedownRateLimited,
} from './place-review-service.ts';

/**
 * What the auth middleware puts on the context.
 *
 * Declared here rather than in server.ts because `userId` below is the only
 * thing that reads it, and a variable whose shape lives away from its reader
 * drifts from it.
 */
export type AppEnv = { Variables: { userId?: string } };

export const ok = <T>(c: Context, data: T, meta?: ApiSuccess<T>['meta']) =>
  c.json<ApiSuccess<T>>({ ok: true, data, ...(meta ? { meta } : {}) });

export const fail = (c: Context, code: string, error: string, status = 400) =>
  c.json<ApiFailure>({ ok: false, code, error }, status as 400);

/**
 * Turn a thrown error into a response.
 *
 * Unknown errors return a generic message and log the detail server-side: an
 * error string is an information leak, and the user cannot act on a stack
 * trace anyway.
 */
export function handleError(c: Context, err: unknown) {
  if (err instanceof OutsideGeofence) {
    return fail(
      c,
      'OUTSIDE_GEOFENCE',
      `You need to be within ${err.radiusM} m of the site to check in. You are about ${Math.round(err.distanceM)} m away.`,
      403,
    );
  }
  // The second signal on the geofence - docs/30. All 403 like the fence
  // itself, and all of them land on the recorded-not-scored path in the app.
  if (err instanceof MockedLocation) return fail(c, 'MOCK_LOCATION', err.message, 403);
  if (err instanceof FixTooCoarse) return fail(c, 'FIX_TOO_COARSE', err.message, 403);
  if (err instanceof ImpossibleTravel) return fail(c, 'IMPOSSIBLE_TRAVEL', err.message, 403);
  if (err instanceof TooSoonAfterArrival) return fail(c, 'TOO_SOON', err.message, 409);
  if (err instanceof StoriesClosed) return fail(c, 'STORIES_CLOSED', err.message, 403);
  if (err instanceof StoryQuotaReached) return fail(c, 'STORY_QUOTA', err.message, 429);
  if (err instanceof StoryTooLarge) return fail(c, 'STORY_TOO_LARGE', err.message, 413);
  if (err instanceof UnsupportedStory) return fail(c, 'UNSUPPORTED_STORY', err.message, 400);
  if (err instanceof UnknownPlace) return fail(c, 'NOT_FOUND', err.message, 404);
  if (err instanceof StoryNotFound) return fail(c, 'NOT_FOUND', err.message, 404);
  if (err instanceof SelfVisitQuotaReached) {
    // 429, not 400: the request was well-formed, and the traveller can simply
    // come back next year.
    return fail(c, 'VISIT_QUOTA', err.message, 429);
  }
  if (err instanceof TakedownRateLimited) {
    return fail(
      c,
      'TAKEDOWN_RATE_LIMITED',
      `Take-down limit reached for now. Try again in about ${err.retryAfterMinutes} minutes, `
      + 'or ask a second moderator to look.',
      429,
    );
  }
  if (err instanceof NotYourReview) {
    return fail(c, 'NOT_YOUR_REVIEW', 'Only the author can appeal a review.', 403);
  }
  if (err instanceof NothingToAppeal) {
    return fail(c, 'NOTHING_TO_APPEAL', 'This review is published — there is nothing to appeal.');
  }
  if (err instanceof AppealAlreadyOpen) {
    return fail(c, 'APPEAL_OPEN', 'Your appeal is already waiting for a moderator.', 409);
  }
  if (err instanceof ReportRateLimited) {
    return fail(
      c,
      'REPORT_RATE_LIMITED',
      `You have reported a lot recently. Try again in about ${err.retryAfterMinutes} minutes.`,
      429,
    );
  }
  if (err instanceof AlreadyReported) {
    // 409, not 400. They did nothing wrong - they already did this.
    return fail(c, 'ALREADY_REPORTED', 'You have already reported this review.', 409);
  }
  if (err instanceof CannotReportOwn) {
    return fail(
      c,
      'CANNOT_REPORT_OWN',
      'This is your own review — you can edit or delete it instead.',
      400,
    );
  }
  if (err instanceof NeverVisited) {
    return fail(
      c,
      'NEVER_VISITED',
      // Says what to do, not just what went wrong. The user can act on this.
      'Check in at this place before reviewing it — reviews here come from people who were actually there.',
      403,
    );
  }
  if (err instanceof InvalidRating) {
    return fail(c, 'INVALID_RATING', 'A rating must be a whole number from 1 to 5.');
  }
  if (err instanceof InvalidTransition) {
    return fail(c, 'INVALID_TRANSITION', err.message, 409);
  }
  if (err instanceof InsufficientPoints) {
    return fail(
      c,
      'INSUFFICIENT_POINTS',
      // Name the currency. With two balances "not enough points" is not an
      // answer - the other one may be full, and the user cannot act without
      // knowing which.
      `You need ${err.required - err.balance} more ${err.currency === 'green' ? 'Green' : 'Trip'} Points.`,
      402,
    );
  }
  console.error('[chivago] unhandled', err);
  return fail(c, 'INTERNAL', 'Something went wrong on our side.', 500);
}

/**
 * Identify the caller.
 *
 * Accounts have landed, and this is where they arrive: the auth middleware in
 * server.ts resolves a device key and stores the user on the context, so every
 * route that already read the caller through this one function got
 * authentication without changing a line.
 *
 * The `x-chivago-user` header behind it is the PILOT path, kept alive only
 * while no account exists — see `openIdentityAllowed` in server.ts, which
 * closes it automatically the moment the first device registers. Under
 * Thailand's PDPA the least personal data you can collect is the safest
 * amount, and a header was the least; it was also unauthenticated, which is
 * why it is now on a timer rather than a promise.
 */
export function userId(c: Context): string {
  const authenticated = (c as unknown as Context<AppEnv>).get('userId');
  return authenticated ?? c.req.header('x-chivago-user') ?? 'demo-user';
}

/** Parse a numeric query param, or return the fallback. */
export function num(v: string | undefined, fallback: number): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
