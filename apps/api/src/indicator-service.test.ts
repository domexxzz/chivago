import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  InvalidIntent, clearIntent, intentFor, preflightFor, setIntent,
} from './indicator-service.ts';
import { lockPlan, planDigest, planOf } from './plan-lock-service.ts';

/**
 * The indicator rule, run before anything is measured.
 *
 * The assertions that carry weight are the ones about WHEN: a wrong line is
 * caught while the quest's plan can still be fixed, and nothing about where a
 * partner intends to report can disturb the measurement plan's digest.
 */

let db: DB;
const ASOF = new Date('2026-09-28T00:00:00.000Z');

const quest = (id: string, measure: string | null = 'weight_kg') => {
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?,?,?,?,'Samui','1 hr',100,'h1','today',9.5,100.0,250)`,
  ).run(id, id.toUpperCase(), id, id);
  if (measure !== null) db.prepare('UPDATE quests SET kpi_measure = ? WHERE id = ?').run(measure, id);
};

const intend = (questId: string, over: Record<string, string> = {}) => setIntent(db, questId, {
  framework: 'gri', line: '306-3', materialOrigin: 'unknown',
  organisationRole: 'unknown', insideBoundary: 'unknown', ...over,
});

beforeEach(() => {
  db = openTestDb();
  db.prepare("INSERT INTO hosts (id,name,type) VALUES ('h1','Samui Municipality','municipality')").run();
});

describe('what the pre-flight answers', () => {
  test('a quest nobody has placed anywhere is not placed, and not a failure', () => {
    quest('q1');
    assert.deepEqual(preflightFor(db, 'q1', ASOF), { state: 'no_intent' });
  });

  test('A BEACH CLEANUP AIMED AT 306-3 IS CAUGHT BEFORE IT RUNS', () => {
    // The whole point of stage three. The same finding at filing season
    // arrives after the activity and after the figure; here it arrives while
    // the plan can still change.
    quest('q1');
    intend('q1', { materialOrigin: 'third_party' });
    const p = preflightFor(db, 'q1', ASOF);
    assert.equal(p.state, 'placed');
    if (p.state !== 'placed') return;
    assert.equal(p.placement.verdict, 'refuses');
    assert.match(p.placement.because.en, /never this organisation’s waste/);
  });

  test('told nothing, it asks whose waste it will be', () => {
    quest('q1');
    intend('q1');
    const p = preflightFor(db, 'q1', ASOF);
    assert.equal(p.state === 'placed' && p.placement.settledBy, 'materialOrigin');
  });

  test('A LINE WITH NO KPI BEHIND IT HAS NOTHING TO PLACE, AND SAYS SO', () => {
    // How a moderator learns the KPI is missing, which is the more useful of
    // the two findings. Inventing a measure would run a rule about a figure
    // nobody agreed to produce.
    quest('q1', null);
    intend('q1', { materialOrigin: 'third_party' });
    const p = preflightFor(db, 'q1', ASOF);
    assert.equal(p.state, 'no_measure');
  });

  test('a line nobody here has studied is unexamined, not quiet', () => {
    quest('q1');
    intend('q1', { framework: 'ifrs_s', line: 'S2-29a' });
    const p = preflightFor(db, 'q1', ASOF);
    assert.equal(p.state === 'placed' && p.placement.verdict, 'unexamined');
  });
});

describe('the fixed fact', () => {
  test('A QUEST’S FIGURE IS HOST-VERIFIED, AND NOBODY IS ASKED', () => {
    // The mirror of stage two. A pasted file is declared by definition; a
    // quest's figure is verified by the host who ran it by definition.
    quest('q1');
    const intent = intend('q1', {
      materialOrigin: 'own_operations', organisationRole: 'generator', insideBoundary: 'yes',
    });
    assert.equal(intent.facts.measuredBy, 'host_verified');
  });

  test('and it still reaches the conditions, saying what host verification is not', () => {
    quest('q1');
    intend('q1', {
      materialOrigin: 'own_operations', organisationRole: 'generator', insideBoundary: 'yes',
    });
    const p = preflightFor(db, 'q1', ASOF);
    assert.equal(p.state === 'placed' && p.placement.verdict, 'conditional');
    if (p.state !== 'placed') return;
    assert.ok(
      p.placement.conditions.some((c) => /not independent assurance under ISAE 3000/.test(c.en)),
      'a permitted placement forgot to say host verification is not assurance',
    );
  });
});

describe('what the record holds', () => {
  test('UNANSWERED IS STORED AS NULL, SO IT HAS ONE SHAPE', () => {
    // "not answered" as the string and as NULL would be two representations
    // of one fact, and the day they disagree is the day a filter misses one.
    quest('q1');
    intend('q1');
    // Spread into a plain object: node:sqlite rows have a null prototype, and
    // a strict deep-equal would fail on that rather than on the values.
    const r = { ...db.prepare(
      'SELECT material_origin, organisation_role, inside_boundary FROM quests WHERE id = ?',
    ).get('q1') as unknown as Record<string, unknown> };
    assert.deepEqual(r, { material_origin: null, organisation_role: null, inside_boundary: null });
  });

  test('OUTSIDE THE BOUNDARY AND NOT ANSWERED ARE DIFFERENT ANSWERS', () => {
    // 0 and NULL lead the rule down different branches: one refuses, the
    // other asks. Collapsing them would turn a question into a refusal.
    quest('q1');
    intend('q1', { materialOrigin: 'own_operations', organisationRole: 'generator', insideBoundary: 'no' });
    assert.equal(intentFor(db, 'q1')!.facts.insideBoundary, false);
    intend('q1', { materialOrigin: 'own_operations', organisationRole: 'generator', insideBoundary: '' });
    assert.equal(intentFor(db, 'q1')!.facts.insideBoundary, 'unknown');
  });

  test('a standard it does not know is refused', () => {
    quest('q1');
    assert.throws(() => intend('q1', { framework: 'made_up' }), InvalidIntent);
  });

  test('a line is a reference, not a note', () => {
    quest('q1');
    assert.throws(() => intend('q1', { line: '' }), InvalidIntent);
    assert.throws(() => intend('q1', { line: '   ' }), InvalidIntent);
    assert.throws(() => intend('q1', { line: 'x'.repeat(33) }), InvalidIntent);
  });

  test('a quest that does not exist is refused', () => {
    assert.throws(() => intend('nope'), InvalidIntent);
  });

  test('clearing it leaves the quest unplaced', () => {
    quest('q1');
    intend('q1', { materialOrigin: 'third_party' });
    clearIntent(db, 'q1');
    assert.equal(intentFor(db, 'q1'), null);
    assert.deepEqual(preflightFor(db, 'q1', ASOF), { state: 'no_intent' });
  });
});

describe('it never disturbs the measurement plan', () => {
  test('WHERE A PARTNER FILES IS NOT IN THE PLAN’S DIGEST', () => {
    // The digest covers what will be MEASURED. Folding the filing decision
    // into it would make a change of mind about reporting look like a change
    // to the evidence.
    quest('q1');
    const before = planDigest(planOf(db, 'q1')!);
    intend('q1', { materialOrigin: 'third_party' });
    assert.equal(planDigest(planOf(db, 'q1')!), before);
  });

  test('A LOCKED PLAN STILL LETS THE INTENDED LINE BE CORRECTED', () => {
    // The point of catching it early is being able to act on it. If the lock
    // froze the filing line too, the pre-flight would find a wrong line and
    // leave nobody able to fix it without superseding the measurement.
    quest('q1');
    lockPlan(db, 'q1', 'Nok', ASOF);
    intend('q1', { materialOrigin: 'third_party' });
    assert.doesNotThrow(() => intend('q1', { line: '3-3', materialOrigin: 'third_party' }));
    assert.equal(intentFor(db, 'q1')!.line, '3-3');
  });
});
