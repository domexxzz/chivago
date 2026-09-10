/**
 * May this machine write?
 *
 * Under LiteFS exactly one node holds the lease, and every other node's
 * filesystem refuses writes with `read only replica`. The app has to know,
 * because it writes without being asked to: it runs the schema and the
 * migrations at boot, and four timers sweep expired stories, flush
 * notifications and escalate alerts on a schedule. On a replica each of those
 * is an error in the log every few seconds.
 *
 * LiteFS answers by writing a `.primary` file into the mount on REPLICAS
 * only, holding the primary's hostname; on the primary itself it is absent.
 * So the question is "is that sentinel missing".
 *
 * With no LITEFS_DIR set there is no LiteFS, which is the plain deployment:
 * one machine on one volume, which is its own primary and must keep writing
 * exactly as it always has. That is why the default is true rather than
 * false — the safe answer here is the one that does not silently stop a
 * single-machine deployment from migrating itself.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function isPrimary(): boolean {
  const dir = process.env.LITEFS_DIR;
  if (dir === undefined || dir === '') return true;
  return !existsSync(join(dir, '.primary'));
}

/**
 * Run this only on the writer.
 *
 * Wraps a timer's callback rather than the timer itself, because which node
 * is primary changes while the process is running: a handoff must start the
 * sweeps here and stop them over there, without either process restarting.
 */
export const onPrimary = (fn: () => void) => (): void => {
  if (isPrimary()) fn();
};
