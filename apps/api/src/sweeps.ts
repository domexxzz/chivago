/**
 * The work that happens because time passed, rather than because somebody
 * asked.
 *
 * WHY THESE MOVED. They were six `setInterval` calls at the top of
 * `server.ts`, which is the right shape for one long-lived Node process and
 * the wrong shape for anything else. A Cloudflare Worker has no process to
 * hold a timer: scheduled work in a Durable Object is an ALARM, which fires
 * once, does what is due, and books the next one. Neither runtime can use the
 * other's mechanism, but both can use a list of jobs that knows how often each
 * should run - so that is what this is.
 *
 * NOTHING ABOUT THE SCHEDULE CHANGED. The intervals here are the intervals
 * that were in `server.ts`, including the two that are load-bearing:
 *
 *  - ESCALATION IS 30 SECONDS, faster than the notification retry, because the
 *    first SOS rung fires at two minutes and a sweep on the same minute-long
 *    clock could turn that into three.
 *  - THE HOURLY ONES ARE DELIBERATELY SLOW. They chase promises measured in
 *    days - a proof unreviewed for 24 hours, an appeal unread for 48 - and
 *    running them faster would burn queries to discover the same nothing.
 *
 * EVERY SWEEP SWALLOWS ITS OWN ERRORS, and that is deliberate in each case: a
 * sweep that throws stops running for everybody. The individual reasons are
 * kept with the individual jobs below, because they are not the same reason.
 */

import type { DB } from './db.ts';
import { expireStories } from './story-service.ts';
import { rotateEpochs } from './summon-service.ts';
import { sweepOverdue } from './sla-service.ts';
import { staleAssists } from './assist-service.ts';
import { nothingToEscalate, sweep as escalationSweep } from './escalation-service.ts';

/** One scheduled job. */
export interface Sweep {
  /** Stable key. Used to remember when it last ran; do not rename lightly. */
  name: string;
  everyMs: number;
  run: () => void | Promise<void>;
  /**
   * Whether there is nothing for this sweep to watch right now.
   *
   * ONLY THE CADENCE CHANGES, never whether the sweep runs. A sweep that says
   * it is idle is still run on every alarm; what it loses is the right to
   * drag the next alarm forward to its own interval. The escalation sweep
   * wants thirty seconds because a distress call is on the line - but there is
   * no distress call at four in the morning on a quiet island, and waking the
   * object 2,880 times a day to confirm that is work nobody asked for.
   *
   * SAFE ONLY BECAUSE OF `fetch`. An alert can only begin with a request, and
   * `worker.ts` pulls the alarm back in at the end of every request it serves.
   * So the moment an alert exists the cadence is thirty seconds again, before
   * the response has even left the object. Remove that and this becomes a
   * three-minute delay on an SOS, which is not a trade anybody should make.
   *
   * Must be cheap and must not throw: it is consulted on the request path.
   */
  idle?: () => boolean;
  /** The cadence while `idle()` is true. Ignored without one. */
  idleMs?: number;
}

/**
 * How often a sweep wants the next alarm, given what it can see right now.
 *
 * A sweep with no `idle` always wants `everyMs`, which is every sweep but one.
 */
export function cadenceOf(sweep: Sweep): number {
  if (sweep.idle === undefined || sweep.idleMs === undefined) return sweep.everyMs;
  try {
    return sweep.idle() ? sweep.idleMs : sweep.everyMs;
  } catch (err) {
    /*
      A broken idle check must never be the reason an escalation is late. The
      answer to "I cannot tell whether anything is happening" is to assume
      something is, and pay for the alarm.
    */
    console.error(`[chivago] idle check for '${sweep.name}' threw; assuming busy`, err);
    return sweep.everyMs;
  }
}

export interface SweepDeps {
  db: DB;
  /** Where an escalation's page goes. */
  oncall: Parameters<typeof escalationSweep>[1];
  /**
   * Send what is queued. Owned by the caller because routes fire it too -
   * a host's decision flushes immediately rather than waiting for the tick.
   */
  flushNotifications: () => void;
  /** Start a second pair of eyes on a proof. Never awaited by a request. */
  startAssist: (proofId: string) => void;
}

/**
 * The six jobs, in the order they were declared in `server.ts`.
 *
 * Built rather than exported as a constant, because each closes over the
 * database handle and the transports, and on Workers those do not exist until
 * a Durable Object has been constructed.
 */
export function buildSweeps(deps: SweepDeps): Sweep[] {
  const { db, oncall, flushNotifications, startAssist } = deps;

  return [
    {
      /*
        Every 30 seconds, faster than the notification retry, because the first
        rung fires at two minutes and a sweep that ran on the same minute-long
        clock could turn that into three.

        A fired rung flushes notifications immediately rather than waiting for
        the next dispatch tick - the whole value of telling someone "nobody has
        answered, call 1669" is that it arrives while it still matters.
      */
      name: 'escalation',
      everyMs: 30_000,
      /*
        Five minutes while no alert is open, because thirty seconds buys
        nothing when there is nothing to escalate - and on Workers every one of
        those wake-ups re-opens the object and is billed. `worker.ts` pulls the
        alarm back to thirty seconds at the end of the request that files an
        alert, so this never delays a real one; `Sweep.idle` says why that
        guarantee is the whole basis for doing this at all.
      */
      idle: () => nothingToEscalate(db),
      idleMs: 300_000,
      run: () =>
        escalationSweep(db, oncall)
          .then((summary) => {
            if (summary.rungsFired > 0) {
              for (const o of summary.outcomes) {
                console.warn(`[chivago] SOS escalated ${o.alertId} · ${o.rung} · ${o.detail}`);
              }
              flushNotifications();
            }
          })
          .catch((err) => {
            // Swallowed deliberately. A sweep that throws stops escalating for
            // everybody, and breaking silence is this module's entire job.
            console.error('[chivago] escalation sweep failed', err);
          }),
    },
    {
      /**
       * The retry tick. One minute is short enough that a blip clears quickly
       * and long enough that a dead upstream is not hammered.
       */
      name: 'dispatch',
      everyMs: 60_000,
      run: flushNotifications,
    },
    {
      // Picks up what a restart interrupted. A minute is plenty: nobody is
      // waiting on it, and the host can decide without it.
      name: 'assist',
      everyMs: 60_000,
      run: () => {
        try {
          for (const id of staleAssists(db)) startAssist(id);
        } catch (e) {
          console.error('[chivago] assist sweep:', (e as Error).message);
        }
      },
    },
    {
      // Seven days on, a story and its files go. Hourly; nobody is waiting.
      name: 'stories',
      everyMs: 3_600_000,
      run: () => {
        try {
          expireStories(db);
        } catch (e) {
          console.error('[chivago] story expiry:', (e as Error).message);
        }
      },
    },
    {
      /*
        The summoning's seed reveal (docs/68).

        An epoch's commitment is published the second it opens, and the SEED -
        the thing that makes every roll under it recomputable by a stranger -
        is only handed out once the epoch closes. Nothing closed one.
        `closeEpoch` was written, tested and never called by the running
        product, so every receipt answered "this epoch is still open" forever
        and the one promise the mechanic is built on could not be kept.

        Hourly and logged: a reveal is a thing we want to be able to point at
        afterwards.
      */
      name: 'epochs',
      everyMs: 3_600_000,
      run: () => {
        try {
          for (const closed of rotateEpochs(db)) {
            console.log(`[chivago] summon epoch ${closed.id} closed; its seed is now published`);
          }
        } catch (err) {
          // Swallowed like the other sweeps. A throw here must not take the
          // process down, and the next tick tries again an hour later.
          console.error('[chivago] epoch rotation failed', (err as Error).message);
        }
      },
    },
    {
      /**
       * The overdue sweep. Never flushes: being told your appeal is still
       * waiting is not urgent enough to jump the dispatch queue, and quiet
       * hours should hold it like anything else.
       */
      name: 'overdue',
      everyMs: 3_600_000,
      run: () => {
        try {
          const summary = sweepOverdue(db);
          if (summary.proofsChased + summary.appealsChased > 0) {
            console.warn(
              `[chivago] overdue: ${summary.proofsChased} proofs, ${summary.appealsChased} appeals`,
            );
          }
        } catch (err) {
          // Swallowed like the escalation sweep: a throw here must not stop
          // the process, and the worst case is somebody told late twice.
          console.error('[chivago] overdue sweep failed', err);
        }
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// One long-lived process: a timer each, exactly as before
// ---------------------------------------------------------------------------

/**
 * Start a timer per sweep. The Node deployment's mechanism, unchanged.
 *
 * Every timer is unreferenced: a sweep must never be the reason the process
 * stays alive. Returns a stop function, so a test or a shutdown can end them.
 */
export function startSweepTimers(sweeps: Sweep[]): () => void {
  const timers = sweeps.map((s) => {
    const timer = setInterval(() => void s.run(), s.everyMs);
    timer.unref?.();
    return timer;
  });
  return () => timers.forEach((t) => clearInterval(t));
}

// ---------------------------------------------------------------------------
// One alarm: run what is due, book the next
// ---------------------------------------------------------------------------

/** When each sweep last ran, by name. Milliseconds since the epoch. */
export type LastRunAt = Readonly<Record<string, number>>;

/**
 * Run every sweep that is due and say when each one last ran.
 *
 * A Durable Object gets ONE alarm, not six timers, so the alarm fires at the
 * shortest cadence and each job decides for itself whether its turn has come.
 * That is what keeps the hourly jobs hourly instead of running them every
 * thirty seconds alongside the escalation sweep.
 *
 * Returns a NEW record rather than editing the one it was given: the caller
 * persists it, and a half-updated map that was mutated before a throw is the
 * kind of state that makes a sweep run twice or never.
 */
export async function runDueSweeps(
  sweeps: Sweep[],
  lastRunAt: LastRunAt,
  now = Date.now(),
): Promise<LastRunAt> {
  const updated: Record<string, number> = { ...lastRunAt };

  for (const s of sweeps) {
    const last = lastRunAt[s.name];
    // Never run before: run now. Otherwise only once its interval has passed.
    if (last !== undefined && now - last < s.everyMs) continue;
    updated[s.name] = now;
    try {
      await s.run();
    } catch (err) {
      /*
        Each sweep already swallows its own errors for its own reasons. This is
        the backstop for the one that does not: on an alarm the sweeps share a
        single call, so an escape here would stop the sweeps AFTER it in the
        list from running at all, which is a far worse failure than the one
        that threw. The timestamp is recorded BEFORE the run for the same
        reason - a job that throws every time must not be retried on every
        alarm for ever.
      */
      console.error(`[chivago] sweep '${s.name}' threw`, err);
    }
  }

  return updated;
}

/**
 * When the next alarm should fire.
 *
 * The earliest moment any sweep becomes due, and never further off than the
 * shortest interval - so a Durable Object that has just been created, with
 * nothing in `lastRunAt`, still books an alarm rather than waiting an hour
 * because the hourly jobs are not due.
 *
 * Each sweep's interval is `cadenceOf`, not `everyMs`, so a sweep with nothing
 * to watch stops pulling the alarm forward. See `Sweep.idle`.
 */
export function nextDueAt(sweeps: Sweep[], lastRunAt: LastRunAt, now = Date.now()): number {
  const cadences = sweeps.map(cadenceOf);
  const due = sweeps.map((s, i) => {
    const last = lastRunAt[s.name];
    return last === undefined ? now : last + cadences[i]!;
  });
  return Math.min(...due, now + Math.min(...cadences));
}
