import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { openTestDb, type DB } from './db-node.ts';
import { openArea } from './area-opening.ts';
import { hashApiKey } from './host-auth.ts';
import {
  HostQuestRefused, OutsideQuestHours, QuestNotJoinable, closeHostQuest, createHostQuest, discardHostQuest,
  editHostQuest, hostQuestById, hostQuestsOf, hostQuestsToReview, publishHostQuest, returnHostQuest, submitHostQuest,
} from './host-quest-service.ts';
import { arriveAtQuest, InvalidTransition, joinQuest, leaveQuest } from './quest-service.ts';
import { getQuest, listQuests } from './repo.ts';

const NOW = new Date('2026-12-01T02:00:00Z');
const DURING = new Date('2026-12-04T03:00:00Z');
const input = {
  area: 'rmutt',
  nameEn: 'Plant a tree', nameTh: 'ปลูกต้นไม้', whereEn: 'Rajamangala Park', whereTh: 'สวนราชมงคล',
  minutes: 90, rewardPoints: 80, rewardCurrency: 'green',
  lat: 14.0334, lng: 100.7251, radiusM: 120, seats: 2,
  startsAt: '2026-12-04T09:00:00+07:00', endsAt: '2026-12-04T12:00:00+07:00',
};
const dean = { hostId: 'h-affairs', name: 'Reviewer' };

let db: DB;
const person = (id: string) =>
  db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(id, id, NOW.toISOString());

beforeEach(() => {
  db = openTestDb();
  for (const [id, name] of [['h-faculty', 'Faculty'], ['h-affairs', 'Student affairs']] as const) {
    db.prepare('INSERT INTO hosts (id,name,type,api_key_hash,created_at) VALUES (?,?,?,?,?)')
      .run(id, name, 'community', hashApiKey(id), NOW.toISOString());
  }
  for (const id of ['a', 'b', 'c']) person(id);
});

const published = (change: Partial<typeof input> = {}) => {
  const draft = createHostQuest(db, 'h-faculty', 'Writer', { ...input, ...change }, NOW);
  submitHostQuest(db, 'h-faculty', draft.id, NOW);
  return publishHostQuest(db, dean, draft.id, NOW);
};
const refused = (fn: () => unknown, words: RegExp) =>
  assert.throws(fn, (err: unknown) => err instanceof HostQuestRefused && words.test(err.message));

describe('from a draft to something a student can join', () => {
  test('a draft is nobody else’s business', () => {
    const draft = createHostQuest(db, 'h-faculty', 'Writer', input, NOW);
    assert.equal(draft.status, 'draft');
    assert.equal(getQuest(db, draft.id), null);
    assert.deepEqual(hostQuestsToReview(db, 'h-affairs'), []);
    assert.equal(hostQuestsOf(db, 'h-faculty').length, 1);
    assert.equal(hostQuestsOf(db, 'h-affairs').length, 0);
  });

  test('a wrong one is refused with the reason, and nothing is kept', () => {
    refused(() => createHostQuest(db, 'h-faculty', null, { ...input, rewardPoints: 9999 }, NOW), /Points/);
    assert.equal(hostQuestsOf(db, 'h-faculty').length, 0);
  });

  test('the host that wrote it cannot publish it', () => {
    const draft = createHostQuest(db, 'h-faculty', 'Writer', input, NOW);
    submitHostQuest(db, 'h-faculty', draft.id, NOW);
    assert.deepEqual(hostQuestsToReview(db, 'h-faculty'), []);
    refused(() => publishHostQuest(db, { hostId: 'h-faculty', name: 'Writer' }, draft.id, NOW), /another host/);
    assert.equal(hostQuestById(db, draft.id)!.status, 'submitted');
    assert.equal(getQuest(db, draft.id), null);
  });

  test('another host publishes it, once', () => {
    const q = published();
    assert.equal(q.status, 'published');
    assert.equal(q.reviewedBy, 'Reviewer');
    const seen = getQuest(db, q.id)!;
    assert.equal(seen.name.th, 'ปลูกต้นไม้');
    assert.equal(seen.duration.en, '90 min');
    assert.equal(seen.host.id, 'h-faculty');
    assert.deepEqual(seen.event, {
      startsAt: '2026-12-04T02:00:00.000Z', endsAt: '2026-12-04T05:00:00.000Z', seats: 2, taken: 0, closed: false,
    });
    refused(() => publishHostQuest(db, dean, q.id, NOW), /not waiting/);
  });

  test('one that ended while it waited is not published', () => {
    const draft = createHostQuest(db, 'h-faculty', null, input, NOW);
    submitHostQuest(db, 'h-faculty', draft.id, NOW);
    refused(() => publishHostQuest(db, dean, draft.id, new Date('2026-12-05T00:00:00Z')), /already ended/);
    assert.equal(getQuest(db, draft.id), null);
  });

  test('sent back with a reason, corrected, and sent again', () => {
    const draft = createHostQuest(db, 'h-faculty', null, input, NOW);
    submitHostQuest(db, 'h-faculty', draft.id, NOW);
    refused(() => returnHostQuest(db, dean, draft.id, ' ', NOW), /why/);
    assert.equal(returnHostQuest(db, dean, draft.id, 'Move it off the road', NOW).returnReason, 'Move it off the road');
    const fixed = editHostQuest(db, 'h-faculty', draft.id, { ...input, whereEn: 'The lawn' }, NOW);
    assert.equal(fixed.whereEn, 'The lawn');
    assert.equal(submitHostQuest(db, 'h-faculty', draft.id, NOW).returnReason, null);
  });

  test('nobody edits another host’s, and nobody edits a published one', () => {
    const draft = createHostQuest(db, 'h-faculty', null, input, NOW);
    refused(() => editHostQuest(db, 'h-affairs', draft.id, input, NOW), /no longer/);
    refused(() => submitHostQuest(db, 'h-affairs', draft.id, NOW), /No such/);
    refused(() => discardHostQuest(db, 'h-affairs', draft.id), /Only a draft/);
    const live = published();
    refused(() => editHostQuest(db, 'h-faculty', live.id, { ...input, rewardPoints: 150 }, NOW), /no longer/);
    refused(() => discardHostQuest(db, 'h-faculty', live.id), /Only a draft/);
  });
});

describe('the list a traveller reads', () => {
  test('the island’s five do not hide a campus activity, nor a draft appear beside them', () => {
    openArea(db, 'koh-sichang', NOW);
    const before = listQuests(db).length;
    const q = published();
    createHostQuest(db, 'h-faculty', null, input, NOW);
    const list = listQuests(db, undefined, { now: NOW });
    assert.equal(list.length, before + 1);
    assert.ok(list.some((x) => x.id === q.id));
  });

  test('one that is over leaves the list, except for whoever was in it', () => {
    const q = published();
    joinQuest(db, 'a', q.id, NOW);
    const after = new Date('2026-12-06T00:00:00Z');
    const ids = (userId?: string) => listQuests(db, undefined, { now: after, userId }).map((x) => x.id);
    assert.equal(ids().includes(q.id), false);
    assert.equal(ids('b').includes(q.id), false);
    assert.equal(ids('a').includes(q.id), true);
  });

  test('opening the area again does not delete what the university wrote', () => {
    const q = published();
    openArea(db, 'rmutt', NOW);
    assert.ok(getQuest(db, q.id), 'retireSupersededQuests removes what the seed does not list');
  });
});

describe('a seat', () => {
  test('is refused once they are gone, and free again when somebody gives one up', () => {
    const q = published();
    joinQuest(db, 'a', q.id, NOW);
    joinQuest(db, 'b', q.id, NOW);
    assert.throws(() => joinQuest(db, 'c', q.id, NOW), (e: unknown) => e instanceof QuestNotJoinable && e.reason === 'full');
    assert.equal(joinQuest(db, 'a', q.id, NOW).stage, 'joined', 'joining twice is not a second seat');
    leaveQuest(db, 'a', q.id);
    assert.equal(joinQuest(db, 'c', q.id, NOW).stage, 'joined');
    assert.equal(getQuest(db, q.id)!.event!.taken, 2);
  });

  test('cannot be given up once the work has begun', () => {
    const q = published();
    joinQuest(db, 'a', q.id, NOW);
    db.prepare("UPDATE quest_progress SET stage = 'arrived' WHERE user_id = 'a'").run();
    assert.throws(() => leaveQuest(db, 'a', q.id), InvalidTransition);
    assert.throws(() => leaveQuest(db, 'b', q.id), InvalidTransition);
  });

  test('is not given in a closed activity, nor one that is over', () => {
    const q = published();
    joinQuest(db, 'a', q.id, NOW);
    closeHostQuest(db, 'h-faculty', q.id, NOW);
    assert.throws(() => joinQuest(db, 'b', q.id, NOW), (e: unknown) => e instanceof QuestNotJoinable && e.reason === 'closed');
    assert.equal(getQuest(db, q.id)!.event!.closed, true, 'whoever is in it can still open it');
    const late = published();
    assert.throws(
      () => joinQuest(db, 'b', late.id, new Date('2026-12-04T06:00:00Z')),
      (e: unknown) => e instanceof QuestNotJoinable && e.reason === 'ended',
    );
  });

  test('an unpublished activity cannot be joined by guessing its id', () => {
    const draft = createHostQuest(db, 'h-faculty', null, input, NOW);
    assert.throws(() => joinQuest(db, 'a', draft.id, NOW));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM quest_progress').get()!.n, 0);
  });
});

describe('check-in', () => {
  const here = { lat: 14.0334, lng: 100.7251, accuracyM: 8, mocked: false };

  test('only during the activity’s own hours', () => {
    const q = published();
    joinQuest(db, 'a', q.id, NOW);
    assert.throws(() => arriveAtQuest(db, 'a', q.id, here, NOW), OutsideQuestHours);
    assert.throws(() => arriveAtQuest(db, 'a', q.id, here, new Date('2026-12-04T06:00:00Z')), OutsideQuestHours);
    assert.equal(arriveAtQuest(db, 'a', q.id, here, DURING).stage, 'arrived');
  });
});
