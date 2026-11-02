/**
 * The schedule.
 *
 * None of this was testable while the six jobs were `setInterval` calls at the
 * top of `server.ts`: importing that file started the timers, and the cadence
 * was a number inside a call nobody could reach. The reason to extract them
 * was a Durable Object alarm, but the reason to KEEP them extracted is this
 * file - the intervals are now a fact a test can hold, and the two that are
 * load-bearing cannot be changed by accident.
 */

import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  buildSweeps,
  nextDueAt,
  runDueSweeps,
  startSweepTimers,
  type LastRunAt,
  type Sweep,
} from './sweeps.ts';

/** Names and cadences, so a change to either is a change to this test. */
const EXPECTED: ReadonlyArray<readonly [name: string, everyMs: number]> = [
  ['escalation', 30_000],
  ['dispatch', 60_000],
  ['assist', 60_000],
  ['stories', 3_600_000],
  ['epochs', 3_600_000],
  ['overdue', 3_600_000],
];

const sweepsWithNothingToDo = (): Sweep[] =>
  buildSweeps({
    // Nothing here is called: every test below either checks the schedule or
    // substitutes its own jobs. A database that would throw if touched is the
    // point - it proves the schedule is decided without doing the work.
    db: null as never,
    oncall: null as never,
    flushNotifications: () => { throw new Error('not expected'); },
    startAssist: () => { throw new Error('not expected'); },
  });

/** A job that records when it ran. */
const spy = (name: string, everyMs: number, log: string[]): Sweep => ({
  name,
  everyMs,
  run: () => { log.push(name); },
});

describe('the cadences that were in server.ts', () => {
  test('all six are here, named and in order', () => {
    const built = sweepsWithNothingToDo();
    assert.deepEqual(built.map((s) => [s.name, s.everyMs]), EXPECTED.map((e) => [...e]));
  });

  test('escalation is the fastest, and faster than dispatch', () => {
    /*
      The one cadence with a documented reason to be what it is: the first SOS
      rung fires at two minutes, and a sweep running on the same minute-long
      clock as the notification retry could turn that into three.
    */
    const built = sweepsWithNothingToDo();
    const by = (n: string) => built.find((s) => s.name === n)!.everyMs;
    assert.equal(by('escalation'), 30_000);
    assert.ok(by('escalation') < by('dispatch'), 'escalation must outpace the dispatch retry');
    assert.equal(Math.min(...built.map((s) => s.everyMs)), by('escalation'));
  });

  test('the three that chase days are hourly, not faster', () => {
    const built = sweepsWithNothingToDo();
    for (const name of ['stories', 'epochs', 'overdue']) {
      assert.equal(built.find((s) => s.name === name)!.everyMs, 3_600_000, name);
    }
  });
});

describe('what an alarm runs', () => {
  test('a sweep that has never run, runs', async () => {
    const log: string[] = [];
    const after = await runDueSweeps([spy('a', 30_000, log)], {}, 1_000_000);
    assert.deepEqual(log, ['a']);
    assert.equal(after.a, 1_000_000);
  });

  test('a sweep that just ran does not run again', async () => {
    const log: string[] = [];
    const now = 1_000_000;
    const after = await runDueSweeps([spy('a', 30_000, log)], { a: now - 1_000 }, now);
    assert.deepEqual(log, [], 'not due for another 29 seconds');
    assert.equal(after.a, now - 1_000, 'and its timestamp is untouched');
  });

  test('exactly on its interval, it runs', async () => {
    const log: string[] = [];
    await runDueSweeps([spy('a', 30_000, log)], { a: 1_000_000 - 30_000 }, 1_000_000);
    assert.deepEqual(log, ['a']);
  });

  test('the hourly ones are NOT dragged along by the 30-second one', async () => {
    /*
      The whole point of one alarm doing six jobs. If every sweep ran on every
      alarm, the hourly sweeps would run 120 times an hour, which is the thing
      their comments say not to do.
    */
    const log: string[] = [];
    const now = 10_000_000;
    const sweeps = [spy('fast', 30_000, log), spy('slow', 3_600_000, log)];
    const after = await runDueSweeps(sweeps, { fast: now - 30_000, slow: now - 60_000 }, now);
    assert.deepEqual(log, ['fast']);
    assert.equal(after.slow, now - 60_000);
  });

  test('a throwing sweep does not stop the ones after it', async () => {
    // On an alarm the six share one call, so an escape would silently stop
    // every job later in the list - a worse failure than the one that threw.
    const log: string[] = [];
    const sweeps: Sweep[] = [
      { name: 'boom', everyMs: 1, run: () => { throw new Error('nope'); } },
      spy('after', 1, log),
    ];
    const after = await runDueSweeps(sweeps, {}, 500);
    assert.deepEqual(log, ['after'], 'the later sweep still ran');
    assert.equal(after.boom, 500, 'and the failing one is not retried on the next alarm');
  });

  test('a rejecting async sweep is contained too', async () => {
    const log: string[] = [];
    const sweeps: Sweep[] = [
      { name: 'reject', everyMs: 1, run: () => Promise.reject(new Error('async nope')) },
      spy('after', 1, log),
    ];
    await runDueSweeps(sweeps, {}, 500);
    assert.deepEqual(log, ['after']);
  });

  test('the record handed in is never edited', async () => {
    // The caller persists it; a map mutated before a throw is how a sweep
    // ends up running twice or never.
    const before: LastRunAt = Object.freeze({ a: 1 });
    const after = await runDueSweeps([spy('a', 1, [])], before, 1_000);
    assert.deepEqual(before, { a: 1 }, 'the original is untouched');
    assert.equal(after.a, 1_000);
    assert.notEqual(after, before, 'a new object came back');
  });

  test('an await inside a sweep is waited for', async () => {
    const order: string[] = [];
    const sweeps: Sweep[] = [
      { name: 'slow', everyMs: 1, run: async () => {
        await new Promise((r) => setTimeout(r, 5));
        order.push('slow finished');
      } },
      { name: 'next', everyMs: 1, run: () => { order.push('next started'); } },
    ];
    await runDueSweeps(sweeps, {}, 1);
    assert.deepEqual(order, ['slow finished', 'next started']);
  });
});

describe('when to book the next alarm', () => {
  test('a brand new object books one at once rather than in an hour', () => {
    /*
      With nothing in `lastRunAt` every job is due, so the next alarm is now -
      not "in an hour because the hourly jobs are not due", which is the
      mistake a naive `min(last + every)` makes on an empty record.
    */
    assert.equal(nextDueAt(sweepsWithNothingToDo(), {}, 5_000), 5_000);
  });

  test('otherwise, the moment the soonest job comes due', () => {
    const now = 1_000_000;
    const sweeps = [spy('fast', 30_000, []), spy('slow', 3_600_000, [])];
    const last = { fast: now - 10_000, slow: now - 10_000 };
    assert.equal(nextDueAt(sweeps, last, now), now + 20_000);
  });

  test('and never further off than the shortest interval', () => {
    const now = 1_000_000;
    const sweeps = [spy('slow', 3_600_000, [])];
    assert.ok(nextDueAt(sweeps, { slow: now }, now) <= now + 3_600_000);
  });
});

describe('one long-lived process', () => {
  test('a timer per sweep, and stopping them stops the work', async () => {
    const log: string[] = [];
    const stop = startSweepTimers([spy('tick', 1, log)]);
    await new Promise((r) => setTimeout(r, 20));
    stop();
    const seen = log.length;
    assert.ok(seen > 0, 'it ran while the timers were up');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(log.length, seen, 'and not once after they were stopped');
  });

  test('the timers never hold the process open', () => {
    // A sweep must not be the reason a CLI command refuses to exit.
    const stop = startSweepTimers([spy('tick', 60_000, [])]);
    // `unref` is called on each; if it were not, this process would hang for a
    // minute after the test finished rather than exiting.
    stop();
    assert.ok(true);
  });
});
