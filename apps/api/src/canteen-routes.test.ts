import { strict as assert } from 'node:assert';
import { test, describe, before } from 'node:test';

/**
 * The food court queue, over HTTP.
 *
 * `canteen-queue.test.ts` in core proves the reading rules. This proves the
 * part only the real middleware chain can show: that a report is filed under
 * the person who sent it, so two students at one hall are two reports and not
 * one person pressing twice - the mistake the bus routes made first (see
 * `transit-routes.test.ts`).
 */

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';

const { app } = await import('./server-node.ts');

const json = async (res: Response | Promise<Response>) =>
  (await (await res).json()) as { ok: boolean; data?: any; code?: string };

const send = (path: string, method: 'GET' | 'POST', body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const register = async (label: string): Promise<string> => {
  const res = await json(await send('/devices', 'POST', { label }));
  assert.ok(res.ok, `could not register ${label}`);
  return res.data.deviceKey as string;
};

const COURT = 'rmutt-canteen';
const report = (key: string, level: unknown, place = COURT) =>
  json(send(`/places/${place}/queue`, 'POST', { level }, { 'x-chivago-device-key': key }));
const read = (key: string, place = COURT) =>
  json(send(`/places/${place}/queue`, 'GET', undefined, { 'x-chivago-device-key': key }));

let studentA = '';
let studentB = '';

before(async () => {
  studentA = await register('student A');
  studentB = await register('student B');
});

describe('reporting the queue', () => {
  test('a place with no food court is a 404, not an empty queue', async () => {
    const res = await app.request('/places/rmutt-park/queue', {
      headers: { 'x-chivago-device-key': studentA },
    });
    assert.equal(res.status, 404);
    // The difference matters: an empty reading would read as "no queue now".
    assert.equal((await json(res)).code, 'NOT_FOUND');
  });

  test('a level this app does not know is refused', async () => {
    for (const bad of ['medium', 'LONG', '', 7, null, undefined]) {
      const res = await report(studentA, bad);
      assert.equal(res.ok, false, `${JSON.stringify(bad)} was accepted`);
      assert.equal(res.code, 'BAD_REQUEST');
    }
  });

  test('a report is recorded and read back with its age and count', async () => {
    const wrote = await report(studentA, 'long');
    assert.equal(wrote.ok, true);
    assert.equal(wrote.data.recorded, true);
    assert.equal(wrote.data.queue.level, 'long');
    assert.equal(wrote.data.queue.minAgo, 0);
    assert.equal(wrote.data.queue.reports, 1);

    const got = await read(studentB);
    assert.equal(got.ok, true);
    assert.equal(got.data.queue.level, 'long');
  });

  test('the same phone again inside the window is 200 and not recorded', async () => {
    const again = await report(studentA, 'none');
    assert.equal(again.ok, true, 'a double tap is not an error');
    assert.equal(again.data.recorded, false);
    assert.equal(again.data.because, 'already-reported');
    // And it did not change what everyone else reads.
    assert.equal(again.data.queue.level, 'long');
  });

  test('a different person is a second report, not the same person twice', async () => {
    const other = await report(studentB, 'long');
    assert.equal(other.data.recorded, true);
    assert.equal(other.data.queue.reports, 2, 'two students at one hall are two reports');
    assert.equal(other.data.queue.disagrees, false);
  });

  test('a report needs a device: the queue is not open to anybody', async () => {
    const res = await app.request(`/places/${COURT}/queue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level: 'none' }),
    });
    assert.equal(res.status, 401, 'an unauthenticated report would be filed on a shared account');
  });

  /*
    The library takes reports too, from 26 November, and it is NOT a food
    court: `takesQueueReports` used to ask `PLACE_STALLS`, so opening this to
    a second place was the one change that could quietly leave the library
    answering 404 while the card on screen offered three buttons.
  */
  test('the library takes reports, and counts its own', async () => {
    const LIB = 'rmutt-library';
    const wrote = await report(studentA, 'long', LIB);
    assert.equal(wrote.ok, true);
    assert.equal(wrote.data.recorded, true);
    assert.equal(wrote.data.queue.level, 'long');

    // The two places are counted apart: a full library is not a long lunch queue.
    const court = await read(studentB);
    assert.notEqual(court.data.queue.reports, wrote.data.queue.reports + 1000);
    const lib = await read(studentB, LIB);
    assert.equal(lib.data.queue.level, 'long');
    assert.equal(lib.data.queue.reports, 1, "the library counted a report from the food court");
  });

  test('deleting the account takes its reports with it', async () => {
    // The migration leans on ON DELETE CASCADE for this; a row left behind
    // after the account is gone is a PDPA defect that looks like nothing.
    const leaver = await register('student C');
    const wrote = await report(leaver, 'short');
    assert.equal(wrote.data.recorded, true);
    const before = (await read(studentB)).data.queue.reports as number;

    const gone = await app.request('/profile', {
      method: 'DELETE',
      headers: { 'x-chivago-device-key': leaver },
    });
    assert.ok(gone.status === 200 || gone.status === 204, `delete answered ${gone.status}`);

    const after = (await read(studentB)).data.queue.reports as number;
    assert.equal(after, before - 1, "the leaver's report outlived the account");
  });
});
