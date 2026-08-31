/**
 * Wallet rules - balances, ledger formatting and affordability.
 *
 * Balances are SERVER-OWNED. Nothing here mutates points; these are pure
 * derivations the client uses to render what the server already said. The
 * prototype awards points locally to stay self-contained - that must never
 * ship, because a client-side award is a client-side exploit.
 *
 * Level and rank USED to live here, derived from the points balance. They now
 * live in progression.ts, derived from lifetime EXP instead, because a level
 * computed from a spendable balance falls when the user spends.
 */

import { QUIET_FROM_HOUR, QUIET_UNTIL_HOUR } from './strings.ts';
import type { Balances, Currency, LedgerEntry } from './types.ts';

export const emptyBalances = (): Balances => ({ trip: 0, green: 0 });

export const balanceOf = (balances: Balances, currency: Currency): number =>
  currency === 'green' ? balances.green : balances.trip;

/**
 * Ledger amount as displayed.
 * Debits use U+2212 MINUS SIGN, not a hyphen - the design is explicit about
 * this and a hyphen reads as a dash at 15px/800.
 */
export function formatAmount(amount: number): string {
  const abs = Math.abs(amount).toLocaleString('en-US');
  return amount < 0 ? `−${abs}` : `+${abs}`;
}

/** Credits render in accent-700, debits in neutral-600. */
export const isCredit = (entry: LedgerEntry): boolean => entry.amount >= 0;

/**
 * The pilot runs on Koh Samui, so day boundaries are the ISLAND's, not the
 * device's. A tourist whose phone is still on Europe/Berlin must still see the
 * cleanup they did this morning as "Today".
 */
export const ISLAND_TZ = 'Asia/Bangkok';

/**
 * Calendar date in island time, as YYYY-MM-DD.
 *
 * Used as the day component of a check-in's idempotency key, so "once per place
 * per day" means the island's day. Without this a traveller on a European clock
 * would get a second free check-in in the middle of the Samui afternoon.
 */
export const islandDateKey = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ISLAND_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

/** Calendar day number in the island timezone, for day-difference arithmetic. */
function islandDayNumber(d: Date): number {
  const [y, m, day] = islandDateKey(d).split('-').map(Number);
  return Date.UTC(y!, m! - 1, day!) / 86_400_000;
}

/**
 * Relative date label: Today / Yesterday / "12 Oct", in island time.
 * `now` is injected so this is pure and testable - never read the clock here.
 */
export function formatLedgerDate(iso: string, now: Date): string {
  const days = islandDayNumber(now) - islandDayNumber(new Date(iso));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ISLAND_TZ,
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

/**
 * Can this balance afford this cost?
 *
 * Takes the WHOLE balance set and the offer's currency rather than a bare
 * number, because with two currencies "can I afford it" is no longer a question
 * about one figure, and passing the wrong one would let a traveller redeem a
 * host-verified Green reward using sightseeing points.
 *
 * The prototype leaves unaffordable offers tappable and shows a toast.
 * Resolved: keep them tappable (a disabled control tells the user nothing about
 * how far off they are) but render at the unaffordable treatment and explain
 * the gap in the toast.
 */
export const canAfford = (balances: Balances, currency: Currency, cost: number): boolean =>
  balanceOf(balances, currency) >= cost;

export const shortfall = (balances: Balances, currency: Currency, cost: number): number =>
  Math.max(0, cost - balanceOf(balances, currency));

/**
 * Is this instant inside island quiet hours?
 *
 * Uses the ISLAND clock, not the device's: a traveller still set to Europe
 * would otherwise be woken at 03:00 Samui time by the rule meant to spare them.
 *
 * The DEFAULT window wraps midnight (22:00 to 07:00), so the obvious test is
 * an OR. But a custom window need not wrap - somebody who sleeps 01:00 to
 * 09:00 wants a plain range, and the OR would call almost every hour quiet.
 * Which comparison applies is decided by whether `from` is after `until`.
 */
export function inQuietHours(
  at: Date,
  fromHour = QUIET_FROM_HOUR,
  untilHour = QUIET_UNTIL_HOUR,
): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ISLAND_TZ,
      hour: '2-digit',
      hour12: false,
    }).format(at),
  );
  return fromHour > untilHour
    // Wraps midnight: 22:00-07:00 is late evening OR early morning.
    ? hour >= fromHour || hour < untilHour
    // Same day: 01:00-09:00 is a plain range.
    : hour >= fromHour && hour < untilHour;
}

/**
 * When a held notification may be sent: the next 07:00 on the island.
 *
 * Returned rather than applied, so the caller decides whether to hold. A
 * notification queued at 21:59 is sent immediately; one at 22:01 waits.
 *
 * Independent of where the window STARTS: past the end hour, the next one is
 * tomorrow morning either way.
 */
export function nextQuietHoursEnd(
  at: Date,
  untilHour = QUIET_UNTIL_HOUR,
): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISLAND_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const hour = get('hour');
  // Still before the end hour today: it ends this morning. Past it: tomorrow.
  const dayOffset = hour < untilHour ? 0 : 1;
  const base = Date.UTC(get('year'), get('month') - 1, get('day') + dayOffset, untilHour);
  // Asia/Bangkok is UTC+7 year round - no daylight saving to reason about.
  return new Date(base - 7 * 3_600_000);
}
