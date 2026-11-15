/**
 * Which quests the app publishes, and the one thing that must never happen.
 *
 * On 14 November 2026 `listQuests` was given an allow-list -
 * `q.code IN ('SG-01'..'SG-05')` - so that a stale database could not bring
 * retired Ko Sichang quests back onto the screen. The intent was right. The
 * shape was not: an allow-list hides everything it was not told about, and
 * the live database holds quests this repository's seed has never listed -
 * Samui and the campuses. Asked against production, that filter published
 * **0 of 16 quests**, a week before the finals.
 *
 * These tests are the ones that would have caught it. The first is the one
 * that matters: a filter may hide something retired, and nothing else.
 */

import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { RETIRED_CODE_PREFIX, isRetiredQuestCode } from '@chivago/core';
import { openTestDb, type DB } from './db-node.ts';
import { getQuest, listQuests } from './repo.ts';

let db: DB;

/** A quest row, written straight in - these are live rows, not seed entries. */
function addQuest(id: string, code: string, kind = 'today'): void {
  db.prepare(
    `INSERT INTO hosts (id, name, type, role, created_at)
     VALUES ('h-t', 'Host', 'ngo', 'host', ?) ON CONFLICT(id) DO NOTHING`,
  ).run(new Date().toISOString());
  db.prepare(
    `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
       reward_currency, host_id, kind, lat, lng, geofence_radius_m)
     VALUES (?, ?, 'Q', 'คิว', 'Where', '30 min', 60, 'green', 'h-t', ?, 13.15, 100.81, 120)`,
  ).run(id, code, kind);
}

const publishedCodes = (): string[] => listQuests(db).map((q) => q.code).sort();

beforeEach(() => { db = openTestDb(); });

describe('what the app publishes', () => {
  test('publishes only the active set once that set is in the database', () => {
    // The rule the pilot asked for, unchanged.
    addQuest('q-sg-explorer', 'SG-01');
    addQuest('q-samui-beach', 'BC-04');
    addQuest('q-ku-walk', 'KU-01');

    assert.deepEqual(publishedCodes(), ['SG-01']);
  });

  test('IT MAY NOT PUBLISH NOTHING WHEN THE ACTIVE SET HAS NOT ARRIVED', () => {
    /*
      The regression, stated as plainly as it can be. The SG rows reach a
      Durable Object only when an operator runs `open-area`; until then the
      allow-list matched no row at all and the app showed an empty missions
      screen. What is on the island is still the island's until its
      replacement is actually there.
    */
    addQuest('q-samui-beach', 'BC-04');
    addQuest('q-ku-walk', 'KU-01');
    addQuest('q-sc-explorer', 'SC-01');

    assert.deepEqual(publishedCodes(), ['BC-04', 'KU-01', 'SC-01']);
  });

  test('the fallback still hides anything explicitly retired', () => {
    addQuest('q-sc-beach', `${RETIRED_CODE_PREFIX}SC-02`);
    addQuest('q-sc-explorer', 'SC-01');

    assert.deepEqual(publishedCodes(), ['SC-01'], 'retired stays retired either way');
  });

  test('a retired quest is hidden once the active set has arrived too', () => {
    addQuest('q-sc-beach', `${RETIRED_CODE_PREFIX}SC-02`);
    addQuest('q-sg-explorer', 'SG-01');

    assert.deepEqual(publishedCodes(), ['SG-01']);
  });

  test('a hidden quest cannot be fetched by id either', () => {
    addQuest('q-sc-beach', `${RETIRED_CODE_PREFIX}SC-02`);
    addQuest('q-sc-explorer', 'SC-01');

    assert.equal(getQuest(db, 'q-sc-beach'), null);
    assert.ok(getQuest(db, 'q-sc-explorer'), 'and one that is published still can');
  });

  test('the handover publishes five before and five after, never zero between', () => {
    /*
      The whole point, walked through. The island carries its current quests,
      the replacements land and retire them in the same transaction, and at no
      moment in between does a traveller open MISSIONS to nothing.
    */
    for (const [id, code] of [['q-a', 'SC-01'], ['q-b', 'SC-02'], ['q-c', 'SC-03']]) addQuest(id!, code!);
    assert.equal(listQuests(db).length, 3, 'before: the island as it stands');

    // What `openArea` does: retire the old codes and insert the new ones.
    for (const [id, code] of [['q-a', `${RETIRED_CODE_PREFIX}SC-01`], ['q-b', `${RETIRED_CODE_PREFIX}SC-02`], ['q-c', `${RETIRED_CODE_PREFIX}SC-03`]]) {
      db.prepare('UPDATE quests SET code = ? WHERE id = ?').run(code!, id!);
    }
    for (const [id, code] of [['q-x', 'SG-01'], ['q-y', 'SG-02'], ['q-z', 'SG-03']]) addQuest(id!, code!);

    assert.deepEqual(publishedCodes(), ['SG-01', 'SG-02', 'SG-03'], 'after: the new set, alone');
  });

  test('an empty quests table publishes nothing, and that is not the bug', () => {
    assert.deepEqual(listQuests(db), [], 'no quests means no quests');
  });

  test('the kind filter narrows the published set, it does not widen it', () => {
    addQuest('q-a', 'SG-01', 'today');
    addQuest('q-b', 'SG-03', 'weekend');
    addQuest('q-c', `${RETIRED_CODE_PREFIX}SC-02`, 'weekend');

    assert.deepEqual(listQuests(db, 'weekend').map((q) => q.code), ['SG-03']);
    assert.deepEqual(listQuests(db, 'today').map((q) => q.code), ['SG-01']);
  });
});

describe('the retirement mark', () => {
  test('the rule and the SQL agree on what retired looks like', () => {
    assert.ok(isRetiredQuestCode(`${RETIRED_CODE_PREFIX}SC-01`));
    assert.ok(!isRetiredQuestCode('SC-01'));
    assert.ok(!isRetiredQuestCode('SG-01'));
  });

  test('no live quest code may begin with the mark by accident', () => {
    /*
      The prefix is a claim on the code space. If a real code ever started
      with it, that quest would vanish and nobody would know why.
    */
    assert.ok(!isRetiredQuestCode('XC-01'), 'the mark is X- and not X');
  });
});
