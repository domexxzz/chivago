/**
 * Is a snapshot of a LIVE database complete?
 *
 * WHY THIS IS NOT A SUBTRACTION. The obvious check is "the file has as many
 * rows as the database" and it is wrong here, because the database does not
 * hold still while it is read: the Durable Object's alarm runs six sweeps
 * every thirty seconds, expiring stories, sessions and link codes, and a
 * traveller opening the app writes a `users` row. So a count that differs
 * from the live one is the ORDINARY case, and a check that failed on it would
 * cry wolf until nobody read it - which is the same as having no check.
 *
 * What CAN be said is a bracket. The export asks the live system for its
 * counts before it reads and again afterwards. A table's true size during the
 * read was somewhere between those two numbers, so:
 *
 *   - fewer rows in the file than the live system had BOTH before and after
 *     means rows were skipped. That is the failure a rowid cursor exists to
 *     prevent, and the one worth stopping for.
 *   - more rows than it had at either end is impossible honestly: a page was
 *     read twice.
 *   - anything between the two is a database that moved while it was copied,
 *     which is what a snapshot is.
 *
 * It is a separate module from the CLI that uses it so the rule can be tested
 * rather than reasoned about - see `snapshot-check.test.ts`.
 */

/** One table's counts: what the file holds, and what the live system said. */
export interface CountCheck {
  table: string;
  /** Rows actually present in the snapshot's batch files. */
  inSnapshot: number;
  /** The live count taken BEFORE the read began. */
  before: number;
  /** The live count taken AFTER the last page came back. */
  after: number;
  /**
   * What the live system says now, if it was asked again later.
   *
   * Informational only, and deliberately so: a pilot six days from its finals
   * gains users and loses expired stories by the hour, so "it does not match
   * today" says nothing about whether the copy was complete.
   */
  liveNow?: number;
}

export type Verdict = 'ok' | 'rows-missing' | 'rows-repeated';

export interface CountVerdict {
  table: string;
  verdict: Verdict;
  /** A sentence an operator can act on, naming the numbers. */
  reason: string;
}

export function checkCount(c: CountCheck): CountVerdict {
  const lo = Math.min(c.before, c.after);
  const hi = Math.max(c.before, c.after);
  const drift = c.before === c.after
    ? `${c.before} row(s) throughout`
    : `${c.before} row(s) before the read, ${c.after} after`;

  if (c.inSnapshot < lo) {
    return {
      table: c.table,
      verdict: 'rows-missing',
      reason:
        `${c.table}: the snapshot holds ${c.inSnapshot} row(s), but the live database had `
        + `at least ${lo} throughout the read (${drift}). Rows were skipped - do not rely `
        + 'on this snapshot.',
    };
  }
  if (c.inSnapshot > hi) {
    return {
      table: c.table,
      verdict: 'rows-repeated',
      reason:
        `${c.table}: the snapshot holds ${c.inSnapshot} row(s), more than the ${hi} the live `
        + `database ever had during the read (${drift}). A page was read twice.`,
    };
  }
  return {
    table: c.table,
    verdict: 'ok',
    reason: c.before === c.after
      ? `${c.table}: ${c.inSnapshot} row(s), matching the live count.`
      : `${c.table}: ${c.inSnapshot} row(s), within ${drift} - the database moved while it was read.`,
  };
}

export const checkCounts = (checks: CountCheck[]): CountVerdict[] => checks.map(checkCount);

/** Anything that is not `ok`. Empty means the snapshot can be relied on. */
export const failures = (verdicts: CountVerdict[]): CountVerdict[] =>
  verdicts.filter((v) => v.verdict !== 'ok');
