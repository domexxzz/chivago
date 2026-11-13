/**
 * Does a Durable Object alarm actually keep going?
 *
 *   node scripts/alarm-integration.mjs
 *
 * WHY THIS IS A SCRIPT AND NOT A TEST IN THE SUITE. It starts `wrangler dev`,
 * which takes half a minute, so it would roughly double `pnpm test` for one
 * assertion. It runs as its own step instead - in CI, and by hand.
 *
 * WHAT IT PROVES, which nothing else does. `sweeps.ts` is unit-tested and
 * `worker.ts` wires it to an alarm in six lines, but no test had let a REAL
 * alarm fire in a REAL Durable Object and watched what happened next. An alarm
 * books the next alarm; if that ever fails, every scheduled job on that object
 * stops silently and for ever - SOS escalation included, whose whole purpose is
 * to break a silence. That failure is in the platform loop, not in a function,
 * so no unit test can see it.
 *
 * It drives `worker-alarm-fixture.ts`, whose sweeps are stand-ins with the
 * shapes that matter (always due, hourly, and one that throws) run by the real
 * `runDueSweeps` and scheduled by the real `nextDueAt`.
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'api');
const PORT = Number(process.env.ALARM_TEST_PORT ?? 8851);
const BASE = `http://127.0.0.1:${PORT}`;

const failures = [];
const ok = (name) => console.log(`  ok    ${name}`);
const check = (name, condition, detail = '') => {
  if (condition) return ok(name);
  failures.push(`${name}${detail ? ` - ${detail}` : ''}`);
  console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for wrangler to answer, rather than guessing how long it takes. */
async function waitForReady(timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${BASE}/state`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
}

/**
 * Every call to the object carries a deadline.
 *
 * `waitForReady` above always had one; these did not, and on 13 November that
 * was the difference between a job that fails and a job that hangs. wrangler
 * came up, the suite asked it for `/arm`, and the answer never came - so the
 * script sat inside `try` for seventeen minutes, never reached the `finally`
 * that kills wrangler, and CI cut the whole job at twenty. The leftovers were
 * visible as orphan `workerd` processes in the runner's cleanup.
 *
 * A request that cannot be answered in ten seconds, against a local object on
 * loopback, is not slow. It is not coming.
 */
const call = async (path, timeoutMs = 10_000) =>
  fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(timeoutMs) });

const state = async () => (await call('/state')).json();

const wrangler = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['wrangler', 'dev', '--config', 'wrangler.alarm-test.jsonc', '--port', String(PORT), '--local'],
  { cwd: API_DIR, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
);
// Detached from this process's reference count: `kill()` does not reliably
// take down the npx -> wrangler -> workerd tree on Windows, and without this
// the script finishes its checks and then hangs waiting for the child.
wrangler.unref();
let log = '';
wrangler.stdout.on('data', (c) => { log += c.toString('utf8'); });
wrangler.stderr.on('data', (c) => { log += c.toString('utf8'); });

/*
  The backstop, for the hang the per-request deadlines do not catch.

  This script takes about two minutes, most of it wrangler starting up. Five
  minutes is not a budget, it is the point past which something is wrong in a
  way no amount of waiting fixes
  - and the difference between learning that from a failed step with wrangler's
  output attached, and learning it from a job the runner cut with no reason
  given, which is what happened on 13 November.

  `unref`ed, so a healthy run is never held open by it.
*/
const watchdog = setTimeout(() => {
  console.error(
    `\n[alarm] no result after 5 minutes - giving up rather than holding the job open.\n`
    + `wrangler's output:\n${log.slice(-2_000)}`,
  );
  wrangler.kill();
  process.exit(1);
}, 5 * 60_000);
watchdog.unref();

try {
  if (!(await waitForReady())) {
    console.error('wrangler dev never answered. Its output:\n' + log.slice(-2_000));
    process.exit(1);
  }
  console.log('[alarm] wrangler dev is up\n');

  // --- the loop runs at all -------------------------------------------------
  await call('/arm');
  await sleep(2_500);
  const first = await state();

  check('the alarm fired without anything asking it to',
    (first.counts.fast ?? 0) > 0,
    `counts: ${JSON.stringify(first.counts)}`);

  check('it fired more than once, so it rebooked itself',
    (first.counts.fast ?? 0) > 1,
    `fast ran ${first.counts.fast ?? 0} time(s) - one means the loop stopped after the first alarm`);

  check('an alarm is still booked',
    first.alarmBooked === true,
    `alarmAt: ${first.alarmAt}`);

  // --- the throwing sweep does not stop the ones after it -------------------
  check('a sweep AFTER the throwing one still ran',
    (first.counts['after-the-thrower'] ?? 0) > 0,
    `counts: ${JSON.stringify(first.counts)}`);

  check('the throwing sweep did not stop the loop rebooking',
    first.alarmBooked === true && (first.counts.fast ?? 0) > 1);

  // --- cadence is honoured across alarms -----------------------------------
  check('the hourly sweep ran exactly once, not on every alarm',
    first.counts.hourly === 1,
    `hourly ran ${first.counts.hourly} time(s) across ${first.counts.fast ?? 0} alarms`);

  // --- the bookkeeping survives ---------------------------------------------
  check('what ran and when was persisted to storage',
    typeof first.lastRunAt.fast === 'number' && typeof first.lastRunAt.hourly === 'number',
    `lastRunAt: ${JSON.stringify(first.lastRunAt)}`);

  check('the throwing sweep recorded a timestamp too, so it is not retried for ever',
    typeof first.lastRunAt.throws === 'number',
    `lastRunAt: ${JSON.stringify(first.lastRunAt)}`);

  // --- it keeps going -------------------------------------------------------
  await sleep(2_000);
  const later = await state();

  check('the loop was still running two seconds later',
    (later.counts.fast ?? 0) > (first.counts.fast ?? 0),
    `${first.counts.fast} -> ${later.counts.fast}`);

  check('and the hourly sweep STILL has not run again',
    later.counts.hourly === 1,
    `hourly: ${later.counts.hourly}`);

  /*
    The alarm COUNT is context, not a measurement, and deliberately not
    asserted on beyond "more than once". Observed across runs of this very
    script: about 20 alarms in the 2.5s window on one run and about 9,000 on
    another, with the same 100ms floor in the fixture. Local alarm scheduling
    is simply not steady, so anything that depended on the rate would be a
    flaky test.

    What the spread does do is strengthen the cadence check: an hourly sweep
    that ran exactly once, whether there were 20 alarms or 9,000, is a cadence
    that works.
  */
  console.log(`\n[alarm] ${first.counts.fast} alarm(s) in the first 2.5s, `
    + `${later.counts.fast} by the end - local alarm timing is not steady, so that is `
    + `context and not a rate. The hourly sweep ran ${later.counts.hourly} time(s).`);
} finally {
  clearTimeout(watchdog);
  wrangler.kill();
  // Give workerd a moment to let go of its lock files on Windows.
  await sleep(500);
}

if (failures.length > 0) {
  console.error(`\n[alarm] ${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\n[alarm] every check passed.');
