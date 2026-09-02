import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { STATEMENT_ID_PATTERN, canonicalJson } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import {
  InvalidPeriod, StatementTampered, UnknownHost, digestOf, draftStatement, issueStatement,
  readStatement, statementsFor, statementsIncluding,
} from './statement-service.ts';

let db: DB;
const Q3 = { from: '2026-07-01', to: '2026-09-30' };
const T = new Date('2026-10-01T02:00:00.000Z');

const addHost = (id: string, name: string, type = 'hotel') =>
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)').run(id, name, type);

const addQuest = (id: string, host: string, pillar: string | null = 'environmental') => {
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, id.toUpperCase(), `Quest ${id}`, `ภารกิจ ${id}`, 'Samui', '1 hr', 100,
    host, 'today', 9.5, 100.0, 120);
  if (pillar !== null) db.prepare('UPDATE quests SET esg_pillar = ? WHERE id = ?').run(pillar, id);
};

const approvedOn = (userId: string, questId: string, at: string, weightKg: number | null = null) => {
  db.prepare('INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(userId, userId, at);
  db.prepare(
    `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at,
       proof_submitted_at, verified_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(userId, questId, 'complete', at, at, at, at);
  db.prepare(
    `INSERT INTO proofs (id, user_id, quest_id, photos, weight_kg, submitted_at, reviewed_at, approved)
     VALUES (?,?,?,?,?,?,?,1)`,
  ).run(`p-${userId}-${questId}`, userId, questId, '[]', weightKg, at, at);
};

const refusedOn = (userId: string, questId: string, at: string) => {
  db.prepare('INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(userId, userId, at);
  db.prepare(
    `INSERT INTO proofs (id, user_id, quest_id, photos, weight_kg, submitted_at, reviewed_at, approved)
     VALUES (?,?,?,?,?,?,?,0)`,
  ).run(`p-${userId}-${questId}-no`, userId, questId, '[]', null, at, at);
};

beforeEach(() => {
  db = openTestDb();
  addHost('h-lab', 'Ocean Lab');
  addHost('h-ngo', 'Samui Green Foundation', 'ngo');
  addQuest('q3', 'h-lab');
  addQuest('q2', 'h-ngo');
});

describe('what a draft reads', () => {
  test('only this host, only this period', () => {
    approvedOn('ana', 'q3', '2026-08-14T04:00:00.000Z');
    approvedOn('bo', 'q3', '2026-06-30T23:59:59.000Z'); // the day before the period
    approvedOn('cy', 'q2', '2026-08-14T04:00:00.000Z'); // the NGO's quest
    const s = draftStatement(db, 'h-lab', Q3, T);
    assert.equal(s.verified, 1);
    assert.equal(s.participants, 1);
    assert.equal(s.lines.length, 1);
    assert.equal(s.lines[0]!.day, '2026-08-14');
  });

  test('the last day of the period is inside it', () => {
    approvedOn('ana', 'q3', '2026-09-30T16:30:00.000Z');
    assert.equal(draftStatement(db, 'h-lab', Q3, T).verified, 1);
  });

  test('weight comes from the approved proof, and only from it', () => {
    approvedOn('ana', 'q3', '2026-08-14T04:00:00.000Z', 3.2);
    refusedOn('bo', 'q3', '2026-08-15T04:00:00.000Z'); // refused proofs never weigh
    const s = draftStatement(db, 'h-lab', Q3, T);
    assert.equal(s.weightKg, 3.2);
    assert.equal(s.refused, 1);
  });

  test('a refusal outside the period is not this period’s refusal', () => {
    refusedOn('bo', 'q3', '2026-10-02T04:00:00.000Z');
    assert.equal(draftStatement(db, 'h-lab', Q3, T).refused, 0);
  });

  test('a period out of order, or not a date, is refused', () => {
    assert.throws(() => draftStatement(db, 'h-lab', { from: '2026-09-30', to: '2026-07-01' }, T), InvalidPeriod);
    assert.throws(() => draftStatement(db, 'h-lab', { from: '2026-13-01', to: '2026-12-31' }, T), InvalidPeriod);
    assert.throws(() => draftStatement(db, 'h-lab', { from: 'July', to: '2026-12-31' }, T), InvalidPeriod);
  });

  test('a host that does not exist cannot be stated for', () => {
    assert.throws(() => draftStatement(db, 'h-ghost', Q3, T), UnknownHost);
  });
});

describe('issuing', () => {
  test('writes the record with a public id and a digest anyone can recompute', () => {
    approvedOn('ana', 'q3', '2026-08-14T04:00:00.000Z', 3.2);
    const s = issueStatement(db, 'h-lab', Q3, 'Nok', T);
    assert.match(s.id, STATEMENT_ID_PATTERN);
    assert.equal(s.digest.length, 64);
    const { id, digest, ...body } = s;
    assert.equal(digestOf(body), digest);
    assert.equal(s.issuedBy, 'Nok');
    assert.equal(s.issuedAt, T.toISOString());

    const back = readStatement(db, id);
    assert.deepEqual(back, s, 'what was issued is what is read back');
  });

  test('a second issue for the same period is a second statement, never an edit', () => {
    approvedOn('ana', 'q3', '2026-08-14T04:00:00.000Z');
    const first = issueStatement(db, 'h-lab', Q3, 'Nok', T);
    approvedOn('bo', 'q3', '2026-08-20T04:00:00.000Z');
    const second = issueStatement(db, 'h-lab', Q3, 'Nok', new Date(T.getTime() + 60_000));
    assert.notEqual(first.id, second.id);
    assert.equal(readStatement(db, first.id)!.verified, 1, 'the first still says what it said');
    assert.equal(second.verified, 2);
    assert.deepEqual(statementsFor(db, 'h-lab').map((s) => s.id), [second.id, first.id], 'newest first');
  });

  test('the table refuses an edit outright', () => {
    approvedOn('ana', 'q3', '2026-08-14T04:00:00.000Z');
    const s = issueStatement(db, 'h-lab', Q3, 'Nok', T);
    assert.throws(
      () => db.prepare('UPDATE statements SET body = ? WHERE id = ?').run('{}', s.id),
      /append-only/,
    );
  });

  test('a row altered behind the trigger is refused on read, not served', () => {
    approvedOn('ana', 'q3', '2026-08-14T04:00:00.000Z');
    const s = issueStatement(db, 'h-lab', Q3, 'Nok', T);
    // Simulate the edit the trigger exists to stop: replace the row wholesale.
    const forged = { ...s, verified: 99 };
    const { id: _id, digest: _digest, ...body } = forged;
    db.prepare('DELETE FROM statements WHERE id = ?').run(s.id);
    db.prepare(
      `INSERT INTO statements (id, host_id, period_from, period_to, issued_at, issued_by, body, digest)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(s.id, 'h-lab', Q3.from, Q3.to, s.issuedAt, 'Nok', canonicalJson(body), s.digest);
    assert.throws(() => readStatement(db, s.id), StatementTampered);
  });

  test('an unknown id is null, not an error', () => {
    assert.equal(readStatement(db, 'CG-2026-000000'), null);
  });

  test('an empty period can still be stated - "no activity" is a statement too', () => {
    const s = issueStatement(db, 'h-lab', Q3, null, T);
    assert.equal(s.verified, 0);
    assert.equal(s.lines.length, 0);
    assert.equal(s.weightKg, null);
  });
});

describe('what a traveller is told', () => {
  test('the statement that counts their work, and which quests of theirs it counts', () => {
    approvedOn('ana', 'q3', '2026-08-14T04:00:00.000Z');
    approvedOn('bo', 'q3', '2026-08-14T05:00:00.000Z');
    const s = issueStatement(db, 'h-lab', Q3, 'Nok', T);
    const filed = statementsIncluding(db, 'ana');
    assert.equal(filed.length, 1);
    assert.equal(filed[0]!.id, s.id);
    assert.equal(filed[0]!.host.name, 'Ocean Lab');
    assert.deepEqual(filed[0]!.quests.map((q) => q.id), ['q3']);
    assert.doesNotMatch(JSON.stringify(filed), /"bo"/, 'nothing about anyone else');
  });

  test('work verified after the statement was issued is not in it', () => {
    approvedOn('ana', 'q3', '2026-08-14T04:00:00.000Z');
    issueStatement(db, 'h-lab', Q3, 'Nok', T);
    approvedOn('cy', 'q3', '2026-09-01T04:00:00.000Z'); // inside the dates, after the issue
    assert.equal(statementsIncluding(db, 'cy').length, 0);
  });

  test('another host’s statement is not theirs', () => {
    approvedOn('ana', 'q2', '2026-08-14T04:00:00.000Z');
    issueStatement(db, 'h-lab', Q3, 'Nok', T);
    assert.equal(statementsIncluding(db, 'ana').length, 0);
  });

  test('someone with nothing verified is told nothing, cheaply', () => {
    issueStatement(db, 'h-lab', Q3, 'Nok', T);
    assert.deepEqual(statementsIncluding(db, 'nobody'), []);
  });
});

describe('the same day, either side of the issue', () => {
  test('work approved on the day of issue but AFTER it is not on record', () => {
    // A statement issued at 10:00 counts Ana at 09:00. Bo, approved at 11:00
    // on the same day, matches the line by (day, quest) - and the first
    // version told Bo they were on record in a statement that counts Ana.
    approvedOn('ana', 'q3', '2026-08-14T09:00:00.000Z');
    const s = issueStatement(db, 'h-lab', Q3, 'Nok', new Date('2026-08-14T10:00:00.000Z'));
    approvedOn('bo', 'q3', '2026-08-14T11:00:00.000Z');
    assert.equal(statementsIncluding(db, 'bo').length, 0, 'the statement was issued before Bo was approved');
    assert.deepEqual(statementsIncluding(db, 'ana').map((f) => f.id), [s.id]);
  });
});
