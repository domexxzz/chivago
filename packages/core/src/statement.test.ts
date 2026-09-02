import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  STATEMENT_ID_PATTERN, STATEMENT_NOT_CLAIMABLE, activityStatement, canonicalJson,
  statementHeadline, type StatementActivity,
} from './statement.ts';
import { NOT_CLAIMABLE } from './esg.ts';

const host = { id: 'h-lab', name: 'Ocean Lab', type: 'hotel' as const };
const period = { from: '2026-07-01', to: '2026-09-30' };

const approval = (over: Partial<StatementActivity> = {}): StatementActivity => ({
  questId: 'q3',
  name: { en: 'Coral Nursery Check', th: 'ตรวจแปลงปะการัง' },
  pillar: 'environmental',
  day: '2026-08-14',
  participants: ['ana'],
  weightKg: null,
  ...over,
});

const build = (activities: StatementActivity[], refused = 0) =>
  activityStatement({ host, period, activities, refused, issuedAt: '2026-10-01T02:00:00.000Z', issuedBy: 'Nok' });

describe('what a statement counts', () => {
  test('two approvals of one quest on one day are one line with a count of two', () => {
    const s = build([approval({ participants: ['ana'] }), approval({ participants: ['bo'] })]);
    assert.equal(s.lines.length, 1);
    assert.equal(s.lines[0]!.verified, 2);
    assert.equal(s.verified, 2);
  });

  test('a person who did three things is one person', () => {
    // The inflation the ESG report refuses, refused here too.
    const s = build([
      approval({ day: '2026-08-14' }),
      approval({ day: '2026-08-15' }),
      approval({ questId: 'q9', day: '2026-08-15' }),
    ]);
    assert.equal(s.verified, 3);
    assert.equal(s.participants, 1);
  });

  test('nobody is in it', () => {
    // Lines carry counts. A hotel is handed how many, never who - a guest's
    // history across places is exactly what must not reach a business.
    const s = build([approval({ participants: ['traveller-ana', 'traveller-bo'] })]);
    const text = canonicalJson(s);
    assert.doesNotMatch(text, /traveller-/, 'a participant id leaked into the statement');
    assert.ok(!('participants' in s.lines[0]!));
  });

  test('weight stays null until a proof recorded one, and then sums', () => {
    assert.equal(build([approval()]).weightKg, null, '0 kg must never be invented');
    const s = build([approval({ weightKg: 3.2 }), approval({ day: '2026-08-15', weightKg: 1.8 })]);
    assert.equal(s.weightKg, 5);
  });

  test('refusals are carried, because a host that never says no is not checking', () => {
    assert.equal(build([approval()], 4).refused, 4);
  });

  test('lines are ordered by day then quest, whatever order they arrived in', () => {
    const s = build([
      approval({ questId: 'q9', day: '2026-08-15' }),
      approval({ questId: 'q3', day: '2026-08-15' }),
      approval({ questId: 'q3', day: '2026-08-14' }),
    ]);
    assert.deepEqual(s.lines.map((l) => `${l.day} ${l.questId}`), [
      '2026-08-14 q3', '2026-08-15 q3', '2026-08-15 q9',
    ]);
  });
});

describe('what a statement refuses', () => {
  test('it has nowhere to put a carbon number, at any depth', () => {
    const s = build([approval({ weightKg: 3.2 })]);
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v && typeof v === 'object') {
        for (const [k, inner] of Object.entries(v)) { keys.add(k.toLowerCase()); walk(inner); }
      }
    };
    walk(s);
    for (const forbidden of ['tco2e', 'co2', 'carbon', 'emissions', 'offset', 'credits', 'sroi']) {
      assert.ok(![...keys].some((k) => k.includes(forbidden)), `a ${forbidden} field appeared`);
    }
  });

  test('the four refusals: the ESG three, plus the hotel one', () => {
    assert.equal(STATEMENT_NOT_CLAIMABLE.length, 4);
    assert.equal(STATEMENT_NOT_CLAIMABLE[0], NOT_CLAIMABLE[0], 'carbon, word for word');
    assert.equal(STATEMENT_NOT_CLAIMABLE[1], NOT_CLAIMABLE[1], 'assurance, word for word');
    assert.match(STATEMENT_NOT_CLAIMABLE[3]!.en, /HCMI, CHSB or CF-Hotels/);
    assert.match(STATEMENT_NOT_CLAIMABLE[3]!.en, /changes no number/);
  });

  test('the boundary excludes other hosts and anything self-reported', () => {
    const s = build([]);
    assert.match(s.boundary.en, /other hosts is excluded/);
    assert.match(s.boundary.en, /without a host/);
  });
});

describe('the digest stands on canonical form', () => {
  test('key order does not change the canonical text', () => {
    const a = canonicalJson({ b: 1, a: { d: [1, 2], c: 'x' } });
    const b = canonicalJson({ a: { c: 'x', d: [1, 2] }, b: 1 });
    assert.equal(a, b);
    assert.equal(a, '{"a":{"c":"x","d":[1,2]},"b":1}');
  });

  test('two identical bodies canonicalise identically, and a changed count does not', () => {
    const one = canonicalJson(build([approval()]));
    const same = canonicalJson(build([approval()]));
    const more = canonicalJson(build([approval({ participants: ['ana', 'bo'] })]));
    assert.equal(one, same);
    assert.notEqual(one, more);
  });

  test('the id shape is Crockford base32 under a year', () => {
    assert.match('CG-2026-7K3M9Q', STATEMENT_ID_PATTERN);
    assert.doesNotMatch('CG-2026-7K3M9I', STATEMENT_ID_PATTERN, 'I is not in the alphabet');
    assert.doesNotMatch('cg-2026-7k3m9q', STATEMENT_ID_PATTERN);
  });
});

describe('the headline', () => {
  test('names the host and the dates inside the sentence', () => {
    const h = statementHeadline(build([approval({ participants: ['ana', 'bo'] })]));
    assert.equal(h.en, '2 activities verified by Ocean Lab, involving 2 people, between 2026-07-01 and 2026-09-30.');
    assert.match(h.th, /Ocean Lab ตรวจผ่านกิจกรรม 2 ครั้ง/);
  });

  test('says so when there was nothing', () => {
    assert.match(statementHeadline(build([])).en, /verified no activity/);
  });
});
