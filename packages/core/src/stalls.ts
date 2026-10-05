/**
 * Food stalls that take orders ahead - the first is RMUTT's central food
 * court, where everybody turns up at the same hour (docs/65).
 *
 * ChivaGo does not take the orders and moves no money. สั่งก่อน
 * (sangkon.fly.dev) does: the menu, the PromptPay QR that pays the stall
 * directly, the kitchen's own queue. This app shows which stalls take orders
 * ahead and how long each says it needs, and opens the stall's order page.
 * Every wait here is the stall's own, read from its kitchen queue; nothing is
 * estimated on this side.
 */

import { capText } from './text.ts';
import type { Provenance } from './types.ts';

/** Where a place's stalls take their orders, and which ones they are. */
export interface StallSource {
  provider: 'sangkon';
  /** The stalls' names (slugs) in that service, in the order to list them. */
  slugs: readonly string[];
}

/**
 * Places with stalls that take orders ahead. A static map, like
 * SAFETY_PHRASES: no migration, and the seed stays the one source of places.
 *
 * `demo` is สั่งก่อน's EXAMPLE shop, not a stall in this food court. It stands
 * in until the court's own stalls join, and is labelled an example whatever
 * the service says (EXAMPLE_SLUGS). Replace it with the real stalls' slugs as
 * they sign up.
 */
export const PLACE_STALLS: Readonly<Record<string, StallSource>> = {
  'rmutt-canteen': { provider: 'sangkon', slugs: ['demo'] },
};

/** A place's stalls, or null. Object.hasOwn, never a bare lookup: `constructor` is not a place. */
export function stallSourceFor(placeId: string): StallSource | null {
  return Object.hasOwn(PLACE_STALLS, placeId) ? PLACE_STALLS[placeId]! : null;
}

/** สั่งก่อน's example shops. An answer can label a stall an example; it cannot take the label off one of these. */
const EXAMPLE_SLUGS: ReadonlySet<string> = new Set(['demo']);
export const isExampleStall = (slug: string): boolean => EXAMPLE_SLUGS.has(slug);

export interface Stall {
  slug: string;
  name: string;
  /** Not a real stall here - the service's example shop. Labelled like an example offer. */
  example: boolean;
  open: boolean;
  /** When it opens next (ISO), if it is closed now and said when. */
  opensAt: string | null;
  /** The owner's "take online orders" switch. */
  accepting: boolean;
  /** Payment is set up, so an order can be paid. */
  payReady: boolean;
  /**
   * Minutes until an order placed now would be ready, as the stall's own queue
   * says. Null when it cannot take one now: the kitchen is full, or it closes
   * before an order could be ready.
   */
  waitMin: number | null;
  /** The stall's order page. Built here from the configured service, never taken from its answer. */
  orderUrl: string;
}

export interface PlaceStalls {
  provider: StallSource['provider'] | null;
  /**
   * 'live' when the service answered within the last half minute. 'stale' when
   * it did not: the last figures it gave, a few minutes old at most and dated
   * by `observedAt`, or none at all. A build that does not read the service
   * (the static demo) answers 'stale' with the stalls named and no
   * `observedAt`: their status is not known there.
   */
  provenance: Extract<Provenance, 'live' | 'stale'>;
  /** When the figures were read (ISO), or null when they never were. */
  observedAt: string | null;
  source: string;
  stalls: Stall[];
}

/** What a stall can do right now, in the order a hungry student needs to know it. */
export type StallState = 'order' | 'full' | 'paused' | 'closed' | 'unpaid';

export function stallState(s: Stall): StallState {
  if (!s.open) return 'closed';
  if (!s.accepting) return 'paused';
  if (!s.payReady) return 'unpaid';
  // Open and taking orders, with no pick-up time free: the kitchen is full,
  // or it closes before an order placed now could be ready.
  if (s.waitMin === null) return 'full';
  return 'order';
}

/**
 * A link the app may open as a stall's order page: https, or http on this
 * machine for a local สั่งก่อน, ending at the stall's page. The API builds
 * these from its own setting; the app checks again before a tap can take a
 * student anywhere.
 */
const ORDER_LINK = /^(?:https:\/\/[a-z0-9.-]+|http:\/\/(?:localhost|127\.0\.0\.1))(?::\d{1,5})?(?:\/[a-z0-9._~-]+)*\/s\/[a-z0-9-]+$/;
export const isOrderLink = (url: string): boolean => ORDER_LINK.test(url);

const SLUG = /^[a-z0-9](?:-?[a-z0-9]){2,39}$/;
/** Longer than any stall's sign. */
const NAME_MAX = 80;
/** A wait longer than a day is not a wait. */
const WAIT_MAX_MIN = 24 * 60;
/** An opening more than a fortnight out is not one a student can plan around. */
const OPENS_WITHIN_MS = 14 * 86_400_000;
/** Control characters and the marks that reorder text: a name is shown as written, never steered. */
const HIDDEN = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/** What one shop-status answer said about the stalls asked for. */
export interface ShopStatusRead {
  /** The stalls read, in the order they were asked for. */
  stalls: Stall[];
  /** Asked for and not read: not in the answer, or not in a shape that could be read. */
  missing: string[];
  /** Rows in the answer that were not read: the wrong shape, a stall not asked for, or one read already. */
  dropped: number;
}

/**
 * The stalls out of สั่งก่อน's `GET /api/shop-status` answer, or null when the
 * body is not such an answer at all.
 *
 * Only the stalls asked for are read, once each, in the order they were asked
 * for, and a row that is not the shape it should be is dropped rather than
 * guessed at. The order page is built from `base` and the slug: the link a
 * student taps must lead to the service this app was configured with, whatever
 * the answer said. Times arrive as epoch milliseconds and leave as ISO
 * instants, like every other time this API sends.
 */
export function stallsFromShopStatus(
  body: unknown, slugs: readonly string[], base: string, now: number,
): ShopStatusRead | null {
  const shops = (body as { data?: { shops?: unknown } } | null)?.data?.shops;
  if (!Array.isArray(shops)) return null;
  const root = base.replace(/\/+$/, '');
  const asked = new Set(slugs);
  const read = new Map<string, Stall>();
  let dropped = 0;
  for (const raw of shops) {
    const stall = readStall(raw, root, now);
    if (!stall || !asked.has(stall.slug) || read.has(stall.slug)) {
      dropped += 1;
      continue;
    }
    read.set(stall.slug, stall);
  }
  return {
    stalls: slugs.flatMap((slug) => read.get(slug) ?? []),
    missing: slugs.filter((slug) => !read.has(slug)),
    dropped,
  };
}

/** One row of the answer, checked field by field, or null. */
function readStall(raw: unknown, root: string, now: number): Stall | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.slug !== 'string' || !SLUG.test(s.slug)) return null;
  const name = typeof s.name === 'string' ? capText(s.name.replace(HIDDEN, '').trim(), NAME_MAX) : '';
  if (name === '') return null;
  if (typeof s.openNow !== 'boolean' || typeof s.accepting !== 'boolean' || typeof s.payReady !== 'boolean') return null;
  // Out of range is unknown, never clamped: a clamped figure is an invented one.
  const wait = typeof s.waitMin === 'number' && s.waitMin >= 0 && s.waitMin <= WAIT_MAX_MIN ? Math.round(s.waitMin) : null;
  const opens = typeof s.nextOpenAt === 'number' && s.nextOpenAt >= now - 60_000 && s.nextOpenAt <= now + OPENS_WITHIN_MS
    ? new Date(s.nextOpenAt).toISOString()
    : null;
  return {
    slug: s.slug,
    name,
    example: s.demo === true || isExampleStall(s.slug),
    open: s.openNow,
    opensAt: s.openNow ? null : opens,
    accepting: s.accepting,
    payReady: s.payReady,
    waitMin: wait,
    orderUrl: `${root}/s/${s.slug}`,
  };
}

/** The answer for a place with no stalls of its own. */
export const NO_STALLS: PlaceStalls = { provider: null, provenance: 'stale', observedAt: null, source: '', stalls: [] };
