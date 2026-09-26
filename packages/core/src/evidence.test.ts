import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  EVIDENCE_LEVEL, EVIDENCE_PRIVACY, SAMPLING_NOTE, reconcile, type EvidenceItem,
} from './evidence.ts';
import { activityStatement, type StatementBody } from './statement.ts';

/**
 * A statement is immutable. The rows behind it are not.
 *
 * That gap is the whole reason this module exists. A pack that listed today's
 * rows beside a statement filed in March would invite the reader to assume
 * they still match — and a statement that no longer matches its evidence is
 * the single most important thing an assurer can be told.
 */

const host = { id: 'h1', name: 'Samui Municipality', type: 'municipality' as const };
const period = { from: '2026-01-01', to: '2026-12-31' };

const statementOf = (approvals: number): StatementBody => activityStatement({
  host,
  period,
  activities: Array.from({ length: approvals }, (unused, i) => ({
    questId: 'q1',
    name: { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด' },
    pillar: 'environmental' as const,
    day: '2026-06-15',
    participants: [`u${i}`],
    weightKg: null,
  })),
  refused: 0,
  issuedAt: '2026-07-01T00:00:00.000Z',
  issuedBy: 'Nok',
});

const item = (over: Partial<EvidenceItem> = {}): EvidenceItem => ({
  questId: 'q1',
  questName: { en: 'Beach Cleanup', th: 'เก็บขยะชายหาด' },
  day: '2026-06-15',
  verifiedAt: '2026-06-15T04:00:00.000Z',
  reviewedBy: 'Nok',
  participantRef: 'ref-1',
  photos: 2,
  weightKg: null,
  standing: 'approved',
  ...over,
});

describe('the pack reconciles rather than just listing', () => {
  test('everything still standing says so, and says nothing else', () => {
    const r = reconcile(statementOf(3), [item(), item(), item()]);
    assert.equal(r.agrees, true);
    assert.deepEqual([r.stated, r.standing, r.withdrawn, r.gone, r.appeared], [3, 3, 0, 0, 0]);
    assert.match(r.verdict.en, /All 3 approvals .* still stand/);
    assert.match(r.verdict.th, /ยังคงอยู่/);
  });

  test('a withdrawn approval breaks the agreement and is counted', () => {
    // The uncomfortable answer, printed. A host who takes an approval back
    // after filing has changed what the filing rests on, and the filing
    // cannot change - so the pack is the only place it can be said.
    const r = reconcile(statementOf(3), [item(), item(), item({ standing: 'withdrawn' })]);
    assert.equal(r.agrees, false);
    assert.deepEqual([r.standing, r.withdrawn], [2, 1]);
    assert.match(r.verdict.en, /1 have been withdrawn/);
  });

  test('a record that has gone entirely is its own count', () => {
    // Different from withdrawn: withdrawn is a decision somebody made and can
    // be asked about. Gone is a row that is not there, which is a different
    // conversation and a worse one.
    const r = reconcile(statementOf(2), [item(), item({ standing: 'gone' })]);
    assert.deepEqual([r.withdrawn, r.gone], [0, 1]);
    assert.match(r.verdict.en, /1 no longer have a record/);
  });

  test('work approved after the statement is reported, not folded in', () => {
    // Real work, and not in THAT statement. Adding it would be amending an
    // immutable document from the outside.
    const r = reconcile(statementOf(2), [item(), item(), item()]);
    assert.equal(r.agrees, false);
    assert.equal(r.appeared, 1);
    assert.match(r.verdict.en, /1 were approved after it was issued/);
  });

  test('a statement with nothing in it agrees with no evidence', () => {
    const r = reconcile(statementOf(0), []);
    assert.equal(r.agrees, true);
    assert.equal(r.stated, 0);
  });

  test('agreeing needs every count to line up, not just the total', () => {
    // One withdrawn and one appeared nets to the same total. A check on the
    // total alone would call this unchanged, which is exactly the kind of
    // quiet pass this pack exists to refuse.
    const r = reconcile(statementOf(2), [item(), item({ standing: 'withdrawn' }), item()]);
    assert.equal(r.standing, 2);
    assert.equal(r.agrees, false, 'a withdrawal cancelled out by a new approval read as unchanged');
    assert.equal(r.withdrawn, 1);
  });
});

describe('what the pack says about itself', () => {
  test('it is evidence, not an opinion, and says whose approval it carries', () => {
    assert.match(SAMPLING_NOTE.en, /not an opinion/);
    assert.match(SAMPLING_NOTE.en, /nobody here has audited that reviewer/);
    assert.match(SAMPLING_NOTE.th, /ไม่ใช่ความเห็น/);
  });

  test('participants are a reference, and the pack says it cannot be resolved', () => {
    assert.match(EVIDENCE_PRIVACY.en, /cannot be resolved to a person/);
    assert.match(EVIDENCE_PRIVACY.en, /cannot be matched against another statement/);
    assert.match(EVIDENCE_PRIVACY.th, /ย้อนกลับไปหาตัวบุคคล/);
  });
});

describe('the pack names which rung of the ladder it is on', () => {
  test('level 3, and level 4 is somebody else', () => {
    // The framework note of 26 September grades evidence one to four.
    // Everything this platform produces is 3 - a named host approved it - and
    // no amount of tooling moves it to 4 by itself. Saying so on the document
    // is the same rule `esg.ts` applies to its own figures.
    assert.match(EVIDENCE_LEVEL.en, /Level 3 of four/);
    assert.match(EVIDENCE_LEVEL.en, /supports and does not perform/);
    assert.match(EVIDENCE_LEVEL.th, /ระดับ 3 จาก 4/);
    assert.match(EVIDENCE_LEVEL.th, /ไม่ได้ทำแทน/);
  });
});
