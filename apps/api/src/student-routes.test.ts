/** The routes a phone calls about a faculty and a year, and what becomes of it. */
import { strict as assert } from 'node:assert';
import { before, describe, test } from 'node:test';

delete process.env.CHIVAGO_OPEN_IDENTITY;
process.env.CHIVAGO_DB = ':memory:';
const { app, db } = await import('./server-node.ts');
const { STUDENT_CONSENT_VERSION } = await import('@chivago/core');
const { participationByFaculty } = await import('./student-service.ts');
const { createHostQuest, submitHostQuest, publishHostQuest } = await import('./host-quest-service.ts');
const { joinQuest } = await import('./quest-service.ts');

let key = '';
const call = (method: string, path: string, body?: unknown) => app.request(path, {
  method,
  headers: { 'content-type': 'application/json', ...(key ? { 'x-chivago-device-key': key } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const json = async (res: Response | Promise<Response>) => (await (await res).json()) as { ok: boolean; data?: any; code?: string };
const student = { university: 'rmutt', faculty: 'science', year: '2' };

before(async () => {
  key = (await json(call('POST', '/devices', { label: 'student' }))).data.deviceKey as string;
});

describe('saying a faculty and a year', () => {
  test('nothing is known until somebody says', async () => {
    assert.equal((await json(call('GET', '/campus/student'))).data.student, null);
  });

  test('not without agreeing to the words that are current', async () => {
    for (const consentVersion of [undefined, 'student-0', true]) {
      const res = await call('PUT', '/campus/student', { ...student, consentVersion });
      assert.equal(res.status, 400);
      assert.equal((await json(res)).code, 'STUDENT_INVALID');
    }
    assert.equal((await json(call('GET', '/campus/student'))).data.student, null);
  });

  test('not a faculty that does not exist, nor a body that is not one', async () => {
    for (const body of [{ ...student, faculty: 'magic' }, { ...student, year: 12 }, [], 'x', null]) {
      const res = await call('PUT', '/campus/student', body && typeof body === 'object' && !Array.isArray(body)
        ? { ...body, consentVersion: STUDENT_CONSENT_VERSION } : body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  test('kept, changed, and taken back', async () => {
    const put = (change = {}) => call('PUT', '/campus/student', { ...student, ...change, consentVersion: STUDENT_CONSENT_VERSION });
    assert.deepEqual((await json(put())).data.student, student);
    assert.equal((await json(put({ year: '3' }))).data.student.year, '3');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM student_profiles').get()!.n, 1);
    assert.equal((await json(call('DELETE', '/campus/student'))).ok, true);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM student_profiles').get()!.n, 0);
  });

  test('goes with the account', async () => {
    await call('PUT', '/campus/student', { ...student, consentVersion: STUDENT_CONSENT_VERSION });
    const { user_id: id } = db.prepare('SELECT user_id FROM student_profiles').get() as { user_id: string };
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM student_profiles').get()!.n, 0);
  });
});

describe('what a host is shown', () => {
  test('counts, with the small ones hidden, over its own activities only', () => {
    const now = new Date();
    const host = (id: string) => db.prepare('INSERT INTO hosts (id,name,type,created_at) VALUES (?,?,?,?)').run(id, id, 'community', now.toISOString());
    host('h-one'); host('h-two'); host('h-dean');
    const run = (hostId: string) => {
      const q = createHostQuest(db, hostId, null, {
        area: 'rmutt', nameEn: 'Walk', nameTh: 'เดินเล่น', whereEn: 'Park', whereTh: 'สวน', minutes: 60, rewardPoints: 10,
        rewardCurrency: 'trip', lat: 14.0334, lng: 100.7251, radiusM: 100, seats: 100,
        startsAt: new Date(now.getTime() + 3_600_000).toISOString(), endsAt: new Date(now.getTime() + 7_200_000).toISOString(),
      }, now);
      submitHostQuest(db, hostId, q.id, now);
      return publishHostQuest(db, { hostId: 'h-dean', name: null }, q.id, now).id;
    };
    const mine = run('h-one');
    const theirs = run('h-two');
    const person = (id: string, faculty: string | null) => {
      db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(id, id, now.toISOString());
      if (faculty) {
        db.prepare('INSERT INTO student_profiles (user_id, university, faculty, year, consent_version, consented_at) VALUES (?,?,?,?,?,?)')
          .run(id, 'rmutt', faculty, '1', STUDENT_CONSENT_VERSION, now.toISOString());
      }
    };
    for (let i = 0; i < 9; i += 1) { person(`e${i}`, 'engineering'); joinQuest(db, `e${i}`, mine); }
    for (let i = 0; i < 6; i += 1) { person(`n${i}`, null); joinQuest(db, `n${i}`, mine); }
    for (let i = 0; i < 2; i += 1) { person(`a${i}`, 'fine-arts'); joinQuest(db, `a${i}`, mine); }
    for (let i = 0; i < 7; i += 1) { person(`t${i}`, 'nursing'); joinQuest(db, `t${i}`, theirs); }

    const shown = Object.fromEntries(participationByFaculty(db, 'h-one').map((c) => [c.key, c.count]));
    assert.deepEqual(shown, { engineering: 9, 'fine-arts': null, 'not-said': null });
    assert.deepEqual(participationByFaculty(db, 'h-dean'), []);
  });
});
