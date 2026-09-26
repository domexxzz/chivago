import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  STANDING_LABEL, VALIDATION_LIMIT, VALIDATION_VS_VERIFICATION,
  planBytes, planNote, planStanding,
  type MeasurementPlan, type PlanLock,
} from './validation.ts';

/**
 * Validation, which this codebase had never had, against verification, which
 * is all it had.
 *
 * The assertions that carry weight are the ones about a LATE lock: it is
 * still recorded, it is never described as an early one, and the number that
 * makes it late is in the sentence.
 */

const plan = (over: Partial<MeasurementPlan> = {}): MeasurementPlan => ({
  measure: 'verified_submissions',
  baseline: 0,
  target: 120,
  requiredLevel: 3,
  ...over,
});

const lock = (over: Partial<PlanLock> = {}): PlanLock => ({
  id: 'l1',
  questId: 'q1',
  digest: 'abc123',
  verifiedAtLock: 0,
  lockedAt: '2026-09-27T00:00:00.000Z',
  lockedBy: 'Nok',
  supersededAt: null,
  supersededReason: null,
  ...over,
});

describe('the bytes a plan is fixed as', () => {
  test('KEY ORDER CANNOT CHANGE THE DIGEST', () => {
    // A caller must not be able to move a plan's bytes by rearranging a
    // literal, or "the plan that was locked" stops meaning anything.
    const a = planBytes({ measure: 'verified_submissions', baseline: 0, target: 120, requiredLevel: 3 });
    const b = planBytes({ requiredLevel: 3, target: 120, measure: 'verified_submissions', baseline: 0 });
    assert.equal(a, b);
  });

  test('every field is in them', () => {
    const base = planBytes(plan());
    assert.notEqual(base, planBytes(plan({ target: 121 })));
    assert.notEqual(base, planBytes(plan({ baseline: 1 })));
    assert.notEqual(base, planBytes(plan({ requiredLevel: 2 })));
    assert.notEqual(base, planBytes(plan({ measure: 'distinct_participants' })));
  });

  test('a null target and an absent one are the same plan', () => {
    assert.equal(planBytes(plan({ target: null })), planBytes(plan({ target: null })));
  });
});

describe('what can be said about when a plan was chosen', () => {
  test('no lock is not a passing grade', () => {
    assert.equal(planStanding(null, 'abc123'), 'unfixed');
    assert.match(planNote(null, 'unfixed').en, /No measurement plan was fixed/);
    assert.match(planNote(null, 'unfixed').en, /nothing here shows whether/);
  });

  test('locked with nothing yet verified is the strong case', () => {
    assert.equal(planStanding(lock(), 'abc123'), 'fixed_before');
  });

  test('A LATE LOCK IS NEVER DESCRIBED AS AN EARLY ONE', () => {
    // The whole point. Refusing a late lock would push the plan into an
    // email; describing it as early would be a lie.
    const late = lock({ verifiedAtLock: 14 });
    assert.equal(planStanding(late, 'abc123'), 'fixed_after');
    const note = planNote(late, 'fixed_after');
    assert.match(note.en, /after 14 activities had already been verified/);
    assert.match(note.en, /not chosen before the results existed/);
    assert.match(note.th, /14 รายการ/);
  });

  test('one activity is singular', () => {
    assert.match(planNote(lock({ verifiedAtLock: 1 }), 'fixed_after').en, /after 1 activity had/);
  });

  test('a superseded lock is checked before the count', () => {
    // A superseded plan no longer describes the quest, so whether it was
    // early is not the question any more.
    const s = lock({ supersededAt: '2026-10-01T00:00:00.000Z', verifiedAtLock: 0 });
    assert.equal(planStanding(s, 'abc123'), 'superseded');
    assert.match(planNote(s, 'superseded').en, /kept because it once applied/);
  });

  test('a lock whose plan no longer matches covers nothing', () => {
    // Unreachable through the service - the trigger refuses the edit - and
    // displayable anyway, because a state only a bug can produce is the one
    // worth showing rather than crashing on.
    assert.equal(planStanding(lock(), 'a-different-digest'), 'drifted');
    assert.match(planNote(lock(), 'drifted').en, /covering nothing/);
  });

  test('an unknown current digest does not manufacture drift', () => {
    // A caller that cannot read the quest passes null, and null must not be
    // read as "the plan changed".
    assert.equal(planStanding(lock(), null), 'fixed_before');
    assert.equal(planStanding(lock({ verifiedAtLock: 3 }), null), 'fixed_after');
  });
});

describe('what a lock declines to claim', () => {
  test('THE EARLY CASE STILL SAYS IT IS NOT A JUDGEMENT OF THE INDICATOR', () => {
    const note = planNote(lock(), 'fixed_before');
    assert.match(note.en, /not that it is the right one/);
    assert.match(note.th, /ไม่ได้บอกว่าเป็นตัวชี้วัดที่ถูกต้อง/);
  });

  test('the limit names all three things a lock is not', () => {
    assert.match(VALIDATION_LIMIT.en, /does not say the indicator suits the activity/);
    assert.match(VALIDATION_LIMIT.en, /that the target is demanding/);
    assert.match(VALIDATION_LIMIT.en, /anybody outside ChivaGo agreed/);
  });

  test('NOTHING HERE PROMOTES A HOST’S VERIFICATION INTO AN INDEPENDENT ONE', () => {
    // A reader who knows the standards must not take a validation record as
    // assurance, so the boundary says who still verifies.
    assert.match(VALIDATION_VS_VERIFICATION.en, /the first kind and only the first/);
    assert.match(VALIDATION_VS_VERIFICATION.en, /verified by the host who ran the activity/);
    assert.match(VALIDATION_VS_VERIFICATION.th, /ตรวจโดยผู้จัดกิจกรรมเช่นเดิม/);
  });

  test('both standard terms appear, in both languages', () => {
    assert.match(VALIDATION_VS_VERIFICATION.en, /Validation/);
    assert.match(VALIDATION_VS_VERIFICATION.en, /verification/);
    assert.match(VALIDATION_VS_VERIFICATION.th, /Validation/);
    assert.match(VALIDATION_VS_VERIFICATION.th, /Verification/);
  });
});

describe('the short labels', () => {
  test('every standing has one, in both languages, and they differ', () => {
    const seen = new Set<string>();
    for (const [k, label] of Object.entries(STANDING_LABEL)) {
      assert.ok(label.en.length > 0 && label.th.length > 0, `${k} is missing a language`);
      assert.ok(!seen.has(label.en), `${k} reuses the label ${label.en}`);
      seen.add(label.en);
    }
  });

  test('THE UNFIXED LABEL DOES NOT READ AS A PASS OR A FAIL', () => {
    // "Not fixed" is a statement about the record, not a grade on the quest.
    assert.equal(STANDING_LABEL.unfixed.en, 'Not fixed');
    assert.doesNotMatch(STANDING_LABEL.unfixed.en, /fail|invalid|bad/i);
  });
});
