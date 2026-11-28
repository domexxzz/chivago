/**
 * The municipality's side of a debris report: the queue it decides from,
 * the funnel that answers "how do you know people aren't making it up", and
 * the two decisions an officer can make here - and nobody else's island.
 */
import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { setBlobStore, type BlobStore } from './blob-store.ts';
import { openTestDb, type DB } from './db-node.ts';
import {
  DebrisDeskError, assignDebrisCase, closeDebrisCase, debrisCaseForDesk, debrisDesk, debrisDeskScope, dismissDebrisCase,
  readDebrisAfterPhotoForDesk, readDebrisPhotoForDesk,
} from './debris-desk-service.ts';
import { debrisReportFor, submitDebrisReport } from './debris-report-service.ts';

const NOW = new Date('2026-11-23T03:30:00.000Z'); // Monday 10:30 on the island
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

const THAM_PHANG = { lat: 13.1454, lng: 100.806835 };
const PALACE = { lat: 13.14909, lng: 100.818436 };
const NORTH_COAST = { lat: 13.177361, lng: 100.808091 };
const SI_RACHA = { lat: 13.1676, lng: 100.9253 };
const SAMUI = { lat: 9.5120, lng: 100.0136 };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const blobs = new Map<string, Uint8Array>();
const store: BlobStore = {
  async put(key, bytes) { blobs.set(key, bytes); },
  async get(key) { return blobs.get(key) ?? null; },
  async delete(key) { blobs.delete(key); },
};

let db: DB;
const SICHANG = ['koh-sichang'] as const;

const send = (userId: string, where: { lat: number; lng: number }, over: Record<string, unknown> = {}, when = NOW) =>
  submitDebrisReport(db, {
    userId,
    raw: {
      position: { ...where, accuracyM: 8 }, takenAt: new Date(when.getTime() - 60_000).toISOString(),
      kinds: ['foam'], amount: 'pile', access: 'walk', ...over,
    },
    photo: JPEG,
  }, when);

beforeEach(() => {
  blobs.clear();
  setBlobStore(store);
  db = openTestDb();
  for (const u of ['ana', 'bo', 'chai', 'dao', 'eve']) {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(u, u, NOW.toISOString());
  }
});

describe('who sees the desk', () => {
  const host = (type: string, role: string, campus: string | null) => {
    const id = `h-${type}-${role}-${campus ?? 'none'}`;
    db.prepare('INSERT INTO hosts (id,name,type,role,campus,created_at) VALUES (?,?,?,?,?,?)')
      .run(id, id, type, role, campus, NOW.toISOString());
    return { hostId: id, hostType: type, role: role as 'host' | 'moderator' | 'admin' };
  };

  test('the island’s own municipality sees its island', () => {
    assert.deepEqual(debrisDeskScope(db, host('municipality', 'host', 'koh-sichang')), ['koh-sichang']);
  });

  test('a municipality with no island set sees nothing, rather than every island', () => {
    assert.deepEqual(debrisDeskScope(db, host('municipality', 'host', null)), []);
  });

  test('Samui’s municipality does not see Ko Sichang’s photographs', () => {
    assert.deepEqual(debrisDeskScope(db, host('municipality', 'host', 'samui')), []);
  });

  test('a shop, a hotel or a community host sees nothing, whatever its area', () => {
    assert.deepEqual(debrisDeskScope(db, host('community', 'host', 'koh-sichang')), []);
    assert.deepEqual(debrisDeskScope(db, host('hotel', 'host', 'koh-sichang')), []);
  });

  test('the platform’s moderators see every island that takes reports', () => {
    assert.deepEqual(debrisDeskScope(db, host('platform', 'moderator', null)), ['koh-sichang']);
  });
});

describe('the queue', () => {
  test('ranked by severity, people and access; a boat-only pile goes to the boat team’s list instead', async () => {
    // A: a tideline two people saw on open sand  → 3 × 2 × 1   = 6
    await send('ana', THAM_PHANG, { amount: 'strand' });
    await send('bo', THAM_PHANG, { amount: 'pile' }, at(0.5));
    // B: a heap one person saw down the steps    → 2 × 1 × 0.7 = 1.4
    await send('chai', PALACE, { access: 'climb' });
    // C: a tideline three saw from the boat      → boat list
    for (const u of ['dao', 'eve', 'ana']) await send(u, NORTH_COAST, { amount: 'strand', access: 'boat_only' }, at(0.2));

    const desk = debrisDesk(db, SICHANG, at(1));
    assert.deepEqual(desk.land.map((c) => [c.reporters, c.amount, c.access]), [[2, 'strand', 'walk'], [1, 'pile', 'climb']]);
    assert.ok(desk.land[0]!.priority > desk.land[1]!.priority);
    assert.deepEqual(desk.boat.map((c) => [c.reporters, c.access]), [[3, 'boat_only']]);
    assert.deepEqual(desk.assigned, []);
  });

  test('an empty scope is an empty desk', async () => {
    await send('ana', THAM_PHANG);
    const desk = debrisDesk(db, [], at(1));
    assert.deepEqual([desk.land, desk.boat, desk.assigned], [[], [], []]);
    assert.equal(desk.funnel.received, 0);
  });
});

describe('the funnel: "how do you know nobody is making it up"', () => {
  test('today’s reports, what was merged, what was sent back and why, and the cases that came of it', async () => {
    await send('ana', THAM_PHANG);
    await send('bo', THAM_PHANG, {}, at(0.2));                    // merged
    await send('chai', PALACE);                                    // a second case
    await send('dao', SI_RACHA);                                   // outside, 11 km off
    await send('eve', THAM_PHANG, { takenAt: at(-26).toISOString() }); // stale
    await send('ana', SAMUI);                                      // outside, another island - not ours to count

    const { funnel } = debrisDesk(db, SICHANG, at(1));
    assert.deepEqual(funnel, {
      day: '2026-11-23', received: 5, merged: 1, opened: 2,
      rejected: { mocked: 0, outside_area: 1, stale: 1 },
    });
  });

  test('yesterday’s reports are yesterday’s, by the island’s clock', async () => {
    // 23:30 on the 22nd in Bangkok is 16:30 UTC.
    await send('ana', THAM_PHANG, {}, new Date('2026-11-22T16:30:00.000Z'));
    assert.equal(debrisDesk(db, SICHANG, NOW).funnel.received, 0);
  });
});

describe('one case', () => {
  test('what the reporters said, oldest first, with no name attached to any of it', async () => {
    const first = await send('ana', THAM_PHANG, { kinds: ['foam'], access: 'walk' });
    await send('bo', THAM_PHANG, { kinds: ['net_rope'], access: 'climb' }, at(0.5));
    const caseId = (db.prepare('SELECT case_id FROM debris_reports WHERE id = ?').get(first.id) as { case_id: string }).case_id;

    const detail = debrisCaseForDesk(db, SICHANG, caseId)!;
    assert.equal(detail.number, 'KS-2611-0001');
    assert.equal(detail.reporters, 2);
    assert.equal(detail.access, 'climb', 'planned for the hardest way in anybody reported');
    assert.deepEqual(detail.kinds, ['foam', 'net_rope']);
    assert.equal(detail.reports.length, 2);
    assert.ok(detail.reports[0]!.submittedAt < detail.reports[1]!.submittedAt);
    assert.ok(detail.reports.every((r) => r.hasPhoto));
    assert.doesNotMatch(JSON.stringify(detail), /ana|"bo"|user/i, 'a reporter is a count here, not a name');
  });

  test('another island’s case is not found from this desk', async () => {
    const r = await send('ana', THAM_PHANG);
    const caseId = (db.prepare('SELECT case_id FROM debris_reports WHERE id = ?').get(r.id) as { case_id: string }).case_id;
    assert.equal(debrisCaseForDesk(db, [], caseId), null);
  });
});

describe('the two decisions', () => {
  const opened = async () => {
    const r = await send('ana', THAM_PHANG);
    const caseId = (db.prepare('SELECT case_id FROM debris_reports WHERE id = ?').get(r.id) as { case_id: string }).case_id;
    return { reportId: r.id, caseId };
  };

  test('assigning moves it off the queue, says who and why, and the reporter sees "team assigned"', async () => {
    const { reportId, caseId } = await opened();
    const detail = assignDebrisCase(db, SICHANG, caseId, 'Prasert', 'Two of us, after 13:00 for the low tide', at(0.5));
    assert.equal(detail.status, 'assigned');
    assert.deepEqual(detail.events.map((e) => [e.action, e.actor, e.note]), [['assigned', 'Prasert', 'Two of us, after 13:00 for the low tide']]);
    const desk = debrisDesk(db, SICHANG, at(1));
    assert.deepEqual([desk.land.length, desk.assigned.length], [0, 1]);
    assert.equal(debrisReportFor(db, 'ana', reportId)?.case?.status, 'assigned');
  });

  test('dismissing needs a reason, because the reporter is shown that it was closed', async () => {
    const { caseId } = await opened();
    assert.throws(() => dismissDebrisCase(db, SICHANG, caseId, 'Prasert', '   ', at(0.5)),
      (e: unknown) => e instanceof DebrisDeskError && e.code === 'REASON_REQUIRED');
    assert.throws(() => dismissDebrisCase(db, SICHANG, caseId, 'Prasert', '\u200B\u200B', at(0.5)),
      (e: unknown) => e instanceof DebrisDeskError && e.code === 'REASON_REQUIRED', 'invisible characters are not a reason');
    const detail = dismissDebrisCase(db, SICHANG, caseId, 'Prasert', 'Same pile as KS-2611-0003', at(0.5));
    assert.equal(detail.status, 'dismissed');
    assert.equal(detail.events[0]!.note, 'Same pile as KS-2611-0003');
    assert.equal(debrisDesk(db, SICHANG, at(1)).land.length, 0);
  });

  test('a dismissed case cannot be assigned, and nothing is written trying', async () => {
    const { caseId } = await opened();
    dismissDebrisCase(db, SICHANG, caseId, 'Prasert', 'Not rubbish: a fishing net in use', at(0.5));
    assert.throws(() => assignDebrisCase(db, SICHANG, caseId, 'Prasert', '', at(0.6)),
      (e: unknown) => e instanceof DebrisDeskError && e.code === 'NOT_OPEN');
    assert.equal(debrisCaseForDesk(db, SICHANG, caseId)!.events.length, 1);
  });

  test('a desk cannot decide another island’s case', async () => {
    const { caseId } = await opened();
    assert.throws(() => assignDebrisCase(db, [], caseId, 'Someone', '', at(0.5)),
      (e: unknown) => e instanceof DebrisDeskError && e.code === 'NOT_FOUND');
  });
});

describe('closing the job (F7)', () => {
  const assigned = async () => {
    const r = await send('ana', THAM_PHANG, { amount: 'strand', access: 'climb' });
    await send('bo', THAM_PHANG, { amount: 'pile' }, at(0.2));
    const caseId = (db.prepare('SELECT case_id FROM debris_reports WHERE id = ?').get(r.id) as { case_id: string }).case_id;
    assignDebrisCase(db, SICHANG, caseId, 'Prasert', 'after 13:00', at(0.5));
    return { reportId: r.id, caseId };
  };

  test('collected in full: weighed, what was really there, an after photo - and the reporter sees it closed, by whom, how much', async () => {
    const { reportId, caseId } = await assigned();
    const detail = await closeDebrisCase(db, SICHANG, caseId, 'Prasert', {
      weightKg: '6.4', foundKinds: ['foam', 'net_rope', 'glass'], outcome: 'all', afterPhoto: JPEG,
    }, at(4));
    assert.equal(detail.status, 'closed');
    assert.deepEqual(
      { ...detail.collection!, afterPhoto: undefined },
      { at: at(4).toISOString(), by: 'Prasert', weightKg: 6.4, foundKinds: ['foam', 'net_rope', 'glass'], outcome: 'all', afterPhoto: undefined, followUp: null },
    );
    assert.equal(detail.collection!.afterPhoto, true);
    assert.deepEqual(detail.events.map((e) => e.action), ['assigned', 'closed']);

    const seen = debrisReportFor(db, 'ana', reportId)!;
    assert.equal(seen.case?.status, 'closed');
    assert.deepEqual(seen.case?.collection, { at: at(4).toISOString(), by: 'Prasert', weightKg: 6.4, outcome: 'all', followUpNumber: null });
    assert.deepEqual(debrisDesk(db, SICHANG, at(5)).assigned, []);
  });

  test('collected in part: this case closes with its weight, and what is left opens a new case at the same spot', async () => {
    const { reportId, caseId } = await assigned();
    const detail = await closeDebrisCase(db, SICHANG, caseId, 'Prasert', {
      weightKg: 2.1, foundKinds: ['net_rope'], outcome: 'partial', leftAmount: 'pile', afterPhoto: null,
    }, at(4));
    assert.equal(detail.status, 'closed');
    assert.equal(detail.collection!.followUp?.number, 'KS-2611-0002');

    const desk = debrisDesk(db, SICHANG, at(5));
    assert.equal(desk.land.length, 1, 'the rest is back on the queue, not lost');
    const rest = desk.land[0]!;
    assert.deepEqual([rest.number, rest.amount, rest.access, rest.reporters], ['KS-2611-0002', 'pile', 'climb', 2]);
    assert.equal(debrisCaseForDesk(db, SICHANG, rest.id)!.followUpOf?.number, 'KS-2611-0001');
    assert.equal(debrisReportFor(db, 'ana', reportId)!.case?.collection?.followUpNumber, 'KS-2611-0002');
  });

  test('no weight, no close: a kilo is the one number that came off a scale', async () => {
    const { caseId } = await assigned();
    for (const weightKg of [undefined, '', 0, -1, 'heavy', 5000]) {
      await assert.rejects(closeDebrisCase(db, SICHANG, caseId, 'Prasert', { weightKg, foundKinds: [], outcome: 'all', afterPhoto: null }, at(4)),
        (e: unknown) => e instanceof DebrisDeskError && e.code === 'WEIGHT_REQUIRED', String(weightKg));
    }
    assert.equal(debrisCaseForDesk(db, SICHANG, caseId)!.status, 'assigned');
  });

  test('a part-collection says how much is left, or it cannot be queued again', async () => {
    const { caseId } = await assigned();
    await assert.rejects(closeDebrisCase(db, SICHANG, caseId, 'Prasert', { weightKg: 2, foundKinds: [], outcome: 'partial', afterPhoto: null }, at(4)),
      (e: unknown) => e instanceof DebrisDeskError && e.code === 'LEFT_REQUIRED');
  });

  test('a dismissed case cannot be closed as collected, and its after photo is not kept', async () => {
    const { caseId } = await assigned();
    dismissDebrisCase(db, SICHANG, caseId, 'Prasert', 'duplicate', at(1));
    await assert.rejects(closeDebrisCase(db, SICHANG, caseId, 'Prasert', { weightKg: 1, foundKinds: [], outcome: 'all', afterPhoto: JPEG }, at(4)),
      (e: unknown) => e instanceof DebrisDeskError && e.code === 'NOT_OPEN');
    assert.equal([...blobs.keys()].filter((k) => k.includes('/after/')).length, 0);
  });

  test('a second close of the same case - a double tap, a retry on a weak signal - cannot cost the first its photograph', async () => {
    const { caseId } = await assigned();
    await closeDebrisCase(db, SICHANG, caseId, 'Prasert', { weightKg: 3, foundKinds: [], outcome: 'all', afterPhoto: JPEG }, at(4));
    const retry = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x01, 0x02]);
    await assert.rejects(closeDebrisCase(db, SICHANG, caseId, 'Prasert', { weightKg: 3, foundKinds: [], outcome: 'all', afterPhoto: retry }, at(4.1)),
      (e: unknown) => e instanceof DebrisDeskError && e.code === 'NOT_OPEN');
    const kept = await readDebrisAfterPhotoForDesk(db, SICHANG, caseId);
    assert.ok(kept && Buffer.from(kept.bytes).equals(JPEG), 'the first close’s photograph is still there, unchanged');
  });

  test('a desk that cannot see the case stores nothing trying to close it', async () => {
    const { caseId } = await assigned();
    const before = blobs.size;
    await assert.rejects(closeDebrisCase(db, [], caseId, 'Someone', { weightKg: 3, foundKinds: [], outcome: 'all', afterPhoto: JPEG }, at(4)),
      (e: unknown) => e instanceof DebrisDeskError && e.code === 'NOT_FOUND');
    assert.equal(blobs.size, before);
  });

  test('case numbers run on from the highest used in the month, not from how many there are', async () => {
    db.prepare(`INSERT INTO debris_cases (id, number, area, lat, lng, status, opened_at, last_report_at)
                VALUES ('gap', 'KS-2611-0007', 'koh-sichang', 13.13, 100.80, 'closed', ?, ?)`).run(NOW.toISOString(), NOW.toISOString());
    const r = await send('ana', THAM_PHANG);
    assert.equal(r.case?.number, 'KS-2611-0008');
  });

  test('the after photo is the desk’s, like the reporters’ photos', async () => {
    const { caseId } = await assigned();
    await closeDebrisCase(db, SICHANG, caseId, 'Prasert', { weightKg: 3, foundKinds: [], outcome: 'all', afterPhoto: JPEG }, at(4));
    assert.equal((await readDebrisAfterPhotoForDesk(db, SICHANG, caseId))?.mime, 'image/jpeg');
    assert.equal(await readDebrisAfterPhotoForDesk(db, [], caseId), null);
  });
});

describe('the photograph', () => {
  test('served to the island’s desk, and to nobody else', async () => {
    const r = await send('ana', THAM_PHANG);
    const photo = await readDebrisPhotoForDesk(db, SICHANG, r.id);
    assert.equal(photo?.mime, 'image/jpeg');
    assert.equal(Buffer.from(photo!.bytes).equals(JPEG), true);
    assert.equal(await readDebrisPhotoForDesk(db, [], r.id), null);
  });
});
