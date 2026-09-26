import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { reconcile } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import { evidenceFor } from './evidence-service.ts';
import { issueStatement } from './statement-service.ts';

/**
 * A statement cannot change. What is under it can.
 *
 * These hold the gap open and readable. The worst outcome is not a pack that
 * disagrees with its statement — it is one that agrees because it never
 * looked at the right table.
 */

let db: DB;
const PERIOD = { from: '2026-01-01', to: '2026-12-31' };
const AT = '2026-06-15T04:00:00.000Z';

const quest = (id: string, hostId = 'h1') =>
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       host_id, kind, lat, lng, geofence_radius_m, esg_pillar)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, id.toUpperCase(), `Quest ${id}`, `ภารกิจ ${id}`, 'Samui', '1 hr', 100,
    hostId, 'today', 9.5, 100.0, 250, 'environmental');

/** An approval, with the proof the host passed. */
const approved = (userId: string, questId: string, opts: {
  by?: string; photos?: number; weightKg?: number | null; at?: string;
} = {}) => {
  const at = opts.at ?? AT;
  db.prepare('INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES (?,?,?)')
    .run(userId, userId, at);
  db.prepare(
    `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at,
       proof_submitted_at, verified_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(userId, questId, 'complete', at, at, at, at);
  const proofId = `pr-${userId}-${questId}`;
  db.prepare(
    `INSERT INTO proofs (id, user_id, quest_id, photos, weight_kg, submitted_at, reviewed_at, approved, reviewed_by)
     VALUES (?,?,?,'[]',?,?,?,1,?)`,
  ).run(proofId, userId, questId, opts.weightKg ?? null, at, at, opts.by ?? 'Nok');
  for (let i = 0; i < (opts.photos ?? 0); i += 1) {
    db.prepare(
      `INSERT INTO proof_files (id, proof_id, storage_path, mime_type, byte_size, uploaded_at)
       VALUES (?,?,?,?,?,?)`,
    ).run(`${proofId}-${i}`, proofId, `/x/${proofId}-${i}.jpg`, 'image/jpeg', 1000, at);
  }
  return proofId;
};

beforeEach(() => {
  db = openTestDb();
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)').run('h1', 'Samui Municipality', 'municipality');
  db.prepare('INSERT INTO hosts (id, name, type) VALUES (?,?,?)').run('h2', 'Other Host', 'ngo');
});

describe('what the pack carries', () => {
  test('one line per approval, with the reviewer, the photos and the weight', () => {
    // Exactly the four things that make a sample cheap to check: what, when,
    // who passed it, and what is attached.
    quest('q1');
    approved('ana', 'q1', { by: 'Nok', photos: 3, weightKg: 12.5 });
    const [item] = evidenceFor(db, 'CG-2026-AAAAAA', 'h1', PERIOD);

    assert.equal(item!.questId, 'q1');
    assert.equal(item!.day, '2026-06-15');
    assert.equal(item!.reviewedBy, 'Nok');
    assert.equal(item!.photos, 3);
    assert.equal(item!.weightKg, 12.5);
    assert.equal(item!.standing, 'approved');
  });

  test('another host’s approvals are not in this host’s pack', () => {
    quest('q1', 'h1');
    quest('q2', 'h2');
    approved('ana', 'q1');
    approved('bo', 'q2');
    const mine = evidenceFor(db, 'CG-2026-AAAAAA', 'h1', PERIOD);
    assert.deepEqual(mine.map((i) => i.questId), ['q1']);
  });

  test('work outside the period is outside the pack', () => {
    quest('q1');
    approved('ana', 'q1', { at: '2025-06-15T04:00:00.000Z' });
    assert.deepEqual(evidenceFor(db, 'CG-2026-AAAAAA', 'h1', PERIOD), []);
  });
});

describe('a participant reference is a reference, not a person', () => {
  test('the same traveller reads the same inside one statement', () => {
    quest('q1');
    quest('q2');
    approved('ana', 'q1');
    approved('ana', 'q2');
    const refs = evidenceFor(db, 'CG-2026-AAAAAA', 'h1', PERIOD).map((i) => i.participantRef);
    assert.equal(refs[0], refs[1], 'one person read as two');
  });

  test('and differently in another, so two packs cannot be joined', () => {
    // THE PROPERTY THE DOCUMENT PROMISES. A plain hash of the user id would
    // read identically on the page and quietly allow exactly the matching it
    // says is impossible.
    quest('q1');
    approved('ana', 'q1');
    const a = evidenceFor(db, 'CG-2026-AAAAAA', 'h1', PERIOD)[0]!.participantRef;
    const b = evidenceFor(db, 'CG-2026-BBBBBB', 'h1', PERIOD)[0]!.participantRef;
    assert.notEqual(a, b, 'the same traveller is traceable across two statements');
  });

  test('the reference carries no part of the user id', () => {
    quest('q1');
    approved('a-very-distinctive-user-id', 'q1');
    const ref = evidenceFor(db, 'CG-2026-AAAAAA', 'h1', PERIOD)[0]!.participantRef;
    assert.ok(!ref.includes('distinctive'), 'the reference leaked the id it was meant to replace');
    assert.match(ref, /^P-[0-9A-F]{8}$/);
  });
});

describe('the gap between a statement and the rows under it', () => {
  test('nothing has changed, and the pack says so', () => {
    quest('q1');
    approved('ana', 'q1');
    approved('bo', 'q1');
    const statement = issueStatement(db, 'h1', PERIOD, 'Nok', new Date('2026-07-01T00:00:00.000Z'));
    const r = reconcile(statement, evidenceFor(db, statement.id, 'h1', PERIOD));
    assert.equal(r.agrees, true);
    assert.deepEqual([r.stated, r.standing], [2, 2]);
  });

  test('AN APPROVAL WITHDRAWN AFTER FILING IS FOUND', () => {
    // The whole reason this is not just a listing. The statement is immutable
    // and still says two; the proof under one of them has been turned down
    // since, and no document stored as a PDF could ever notice.
    quest('q1');
    approved('ana', 'q1');
    approved('bo', 'q1');
    const statement = issueStatement(db, 'h1', PERIOD, 'Nok', new Date('2026-07-01T00:00:00.000Z'));

    db.prepare("UPDATE proofs SET approved = 0 WHERE id = 'pr-bo-q1'").run();
    const r = reconcile(statement, evidenceFor(db, statement.id, 'h1', PERIOD));
    assert.equal(r.agrees, false);
    assert.deepEqual([r.stated, r.standing, r.withdrawn], [2, 1, 1]);
    assert.match(r.verdict.en, /1 have been withdrawn/);
  });

  test('read from the proof, not from the progress row', () => {
    // `quest_progress.verified_at` stays put when a host withdraws an
    // approval - the proof is where the reversal shows. Starting at the
    // progress row would report a withdrawn approval as standing, which is
    // the one answer this file exists to get right.
    quest('q1');
    approved('ana', 'q1');
    db.prepare("UPDATE proofs SET approved = 0 WHERE id = 'pr-ana-q1'").run();

    const stillVerified = db.prepare(
      'SELECT verified_at FROM quest_progress WHERE user_id = ? AND quest_id = ?',
    ).get('ana', 'q1') as unknown as { verified_at: string | null };
    assert.ok(stillVerified.verified_at, 'the fixture no longer models the case');
    assert.equal(evidenceFor(db, 'CG-2026-AAAAAA', 'h1', PERIOD)[0]!.standing, 'withdrawn');
  });

  test('a proof that is gone is its own answer, not a withdrawal', () => {
    quest('q1');
    approved('ana', 'q1');
    db.prepare("DELETE FROM proofs WHERE id = 'pr-ana-q1'").run();
    const item = evidenceFor(db, 'CG-2026-AAAAAA', 'h1', PERIOD)[0]!;
    assert.equal(item.standing, 'gone');
  });

  test('work approved after filing is reported as not part of it', () => {
    quest('q1');
    approved('ana', 'q1');
    const statement = issueStatement(db, 'h1', PERIOD, 'Nok', new Date('2026-07-01T00:00:00.000Z'));
    approved('bo', 'q1', { at: '2026-08-01T04:00:00.000Z' });

    const r = reconcile(statement, evidenceFor(db, statement.id, 'h1', PERIOD));
    assert.equal(r.appeared, 1);
    assert.equal(r.agrees, false);
  });
});
