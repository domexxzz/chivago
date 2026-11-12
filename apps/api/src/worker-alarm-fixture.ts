/**
 * A Durable Object that exists only to be tested.
 *
 * WHAT IS NOT OTHERWISE TESTED. `sweeps.ts` unit-tests `runDueSweeps` and
 * `nextDueAt` thoroughly, and `worker.ts` wires them to an alarm in six lines.
 * Those six lines are the whole of the scheduled work on Workers, and nothing
 * exercised them: no test had ever let a real alarm fire in a real Durable
 * Object and watched what happened next.
 *
 * WHY THAT IS WORTH A FIXTURE. An alarm books the next alarm. If that ever
 * fails - because `alarm()` threw before reaching `setAlarm`, because a
 * rejected sweep escaped, because storage did not round-trip - then ALL
 * scheduled work on that object stops, silently and for ever. That includes
 * the SOS escalation sweep, whose entire job is to break a silence. A unit
 * test cannot see that failure, because the thing that fails is the platform
 * loop, not the function.
 *
 * WHY A FIXTURE AND NOT THE REAL OBJECT. The real one needs a database, R2 and
 * the whole route tree; this needs an alarm. The sweeps here are stand-ins
 * with the shapes that matter - one always due, one hourly, one that throws -
 * and they are run by the REAL `runDueSweeps` and scheduled by the REAL
 * `nextDueAt`, which is the code under test.
 *
 * It is scaffolding, like `do-storage-stand-in.ts`. It has its own
 * `wrangler.alarm-test.jsonc`, is never bundled into the deployed Worker, and
 * is driven by `scripts/alarm-integration.mjs`.
 */

import { DurableObject } from 'cloudflare:workers';

import { nextDueAt, runDueSweeps, type LastRunAt, type Sweep } from './sweeps.ts';

export interface Env {
  ALARM_FIXTURE: DurableObjectNamespace<AlarmFixture>;
}

const LAST_RUN_KEY = 'sweeps:lastRunAt';
const COUNTS_KEY = 'fixture:counts';

/** How many times each sweep has run, kept in storage so an alarm can add to it. */
type Counts = Record<string, number>;

export class AlarmFixture extends DurableObject<Env> {
  #sweeps: Sweep[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    /*
      Deliberately NOT booked in the constructor, unlike `worker.ts`. The
      driver arms it, so the test controls when the loop starts and is not
      racing a constructor.
    */
    this.#sweeps = [
      // Always due: every alarm should run it.
      this.#counting('fast', 1),
      // Due once and then not again, however many alarms fire. This is what
      // proves the hourly sweeps are not dragged along by the fast one.
      this.#counting('hourly', 3_600_000),
      /*
        Throws every time. `runDueSweeps` catches it - but if it did not, the
        alarm would die before `setAlarm` and every sweep after this one would
        stop for ever. That is the failure this fixture exists to catch, so the
        throwing sweep is deliberately in the MIDDLE of the list.
      */
      { name: 'throws', everyMs: 1, run: () => { throw new Error('this sweep always fails'); } },
      // After the thrower, so a count here proves the list kept going.
      this.#counting('after-the-thrower', 1),
    ];
  }

  /** A sweep that records that it ran. */
  #counting(name: string, everyMs: number): Sweep {
    return {
      name,
      everyMs,
      run: async () => {
        const counts = (await this.ctx.storage.get<Counts>(COUNTS_KEY)) ?? {};
        await this.ctx.storage.put(COUNTS_KEY, { ...counts, [name]: (counts[name] ?? 0) + 1 });
      },
    };
  }

  /** Start the loop, from a clean slate. */
  async arm(): Promise<void> {
    await this.ctx.storage.delete(LAST_RUN_KEY);
    await this.ctx.storage.delete(COUNTS_KEY);
    await this.ctx.storage.setAlarm(Date.now() + 100);
  }

  /** Everything the driver needs to judge what happened. */
  async state(): Promise<{
    counts: Counts;
    lastRunAt: LastRunAt;
    alarmBooked: boolean;
    alarmAt: number | null;
  }> {
    const alarmAt = await this.ctx.storage.getAlarm();
    return {
      counts: (await this.ctx.storage.get<Counts>(COUNTS_KEY)) ?? {},
      lastRunAt: (await this.ctx.storage.get<LastRunAt>(LAST_RUN_KEY)) ?? {},
      alarmBooked: alarmAt !== null,
      alarmAt,
    };
  }

  /**
   * The same body as `worker.ts`'s alarm, on purpose.
   *
   * If these two drift apart this fixture stops meaning anything, so they are
   * short enough to compare by eye and the comment says to.
   */
  override async alarm(): Promise<void> {
    const last = (await this.ctx.storage.get<LastRunAt>(LAST_RUN_KEY)) ?? {};
    const updated = await runDueSweeps(this.#sweeps, last);
    await this.ctx.storage.put(LAST_RUN_KEY, updated);
    /*
      A floor on the next alarm, because the fastest sweep here is 1ms and
      asking workerd for an alarm in the past on a loop is not a useful thing
      to measure. `worker.ts` needs no floor: its fastest sweep is 30 seconds.

      MEASURED, AND WORTH KNOWING: the rate is not steady in local dev. Two
      runs of the same script, with this same floor, gave about 20 alarms in
      2.5 seconds and about 9,000. So nothing here asserts on the rate - only
      that the loop ran more than once - and the spread makes the cadence
      assertion stronger rather than weaker: the hourly sweep ran exactly once
      either way.
    */
    const due = nextDueAt(this.#sweeps, updated);
    await this.ctx.storage.setAlarm(Math.max(due, Date.now() + 100));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const stub = env.ALARM_FIXTURE.getByName('fixture');

    if (url.pathname === '/arm') {
      await stub.arm();
      return new Response('armed');
    }
    if (url.pathname === '/state') {
      return Response.json(await stub.state());
    }
    return new Response('not found', { status: 404 });
  },
};
