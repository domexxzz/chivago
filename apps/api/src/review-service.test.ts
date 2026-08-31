import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';
import { randomUUID } from 'node:crypto';

import { openTestDb, type DB } from './db.ts';
import { pendingQueue, queueStats, recentDecisions, reviewItem, SLA_HOURS } from './review-service.ts';
import { ensureWallet } from './wallet-service.ts';

let db: DB;

/** Chaweng Beach — the real BC-04 site. */
const SITE = { lat: 9.5357, lng: 100.0617 };
/** Na Muang waterfall, ~11 km inland. */
const FAR = { lat: 9.4611, lng: 99.9908 };

const iso = (offsetHours: number) =>
  new Date(Date.now() - offsetHours * 3_600_000).toISOString();

function addProof(args: {
  id: string; questId: string; userId: string; submittedHoursAgo: number;
  weightKg?: number | null; arrivedHoursAgo?: number | null;
  photos?: { lat: number | null; lng: number | null; takenHoursAgo: number | null }[];
  reviewed?: { approved: boolean; by: string; note: string };
}) {
  db.prepare(
    'INSERT INTO proofs (id, user_id, quest_id, photos, weight_kg, submitted_at) VALUES (?,?,?,?,?,?)',
  ).run(args.id, args.userId, args.questId, '[]', args.weightKg ?? null, iso(args.submittedHoursAgo));

  if (args.arrivedHoursAgo !== null && args.arrivedHoursAgo !== undefined) {
    db.prepare(
      `INSERT INTO quest_progress (user_id, quest_id, stage, joined_at, arrived_at)
       VALUES (?,?,'host_verification',?,?)
       ON CONFLICT(user_id, quest_id) DO UPDATE SET arrived_at = excluded.arrived_at`,
    ).run(args.userId, args.questId, iso(args.arrivedHoursAgo + 1), iso(args.arrivedHoursAgo));
  }

  for (const p of args.photos ?? []) {
    db.prepare(
      `INSERT INTO proof_files (id, proof_id, storage_path, mime_type, byte_size, lat, lng, taken_at, uploaded_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(randomUUID(), args.id, '/dev/null', 'image/jpeg', 1000, p.lat, p.lng,
          p.takenHoursAgo === null ? null : iso(p.takenHoursAgo), iso(args.submittedHoursAgo));
  }

  if (args.reviewed) {
    db.prepare(
      'UPDATE proofs SET reviewed_at = ?, approved = ?, reviewed_by = ?, review_note = ? WHERE id = ?',
    ).run(iso(0), args.reviewed.approved ? 1 : 0, args.reviewed.by, args.reviewed.note, args.id);
  }
}

beforeEach(() => {
  db = openTestDb();
  const now = new Date().toISOString();
  for (const [id, name] of [['h-muni', 'Samui Municipality'], ['h-lab', 'Ocean Lab']]) {
    db.prepare('INSERT INTO hosts (id, name, type, created_at) VALUES (?,?,?,?)').run(id, name, 'ngo', now);
  }
  const quest = (id: string, code: string, host: string, at: { lat: number; lng: number }) =>
    db.prepare(
      `INSERT INTO quests (id, code, name_en, name_th, where_label, duration, reward_points,
         host_id, kind, lat, lng, geofence_radius_m)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, code, code, code, 'Chaweng Beach', '45 min', 150, host, 'today', at.lat, at.lng, 250);
  quest('q-muni', 'BC-04', 'h-muni', SITE);
  quest('q-lab', 'CR-02', 'h-lab', SITE);

  for (const u of ['u1', 'u2']) {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(u, u, now);
    ensureWallet(db, u);
  }
});

describe('host scoping — a host sees only its own submissions', () => {
  beforeEach(() => {
    addProof({ id: 'p-muni', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 2 });
    addProof({ id: 'p-lab', questId: 'q-lab', userId: 'u1', submittedHoursAgo: 2 });
  });

  test('the queue contains only this host quests', () => {
    assert.deepEqual(pendingQueue(db, 'h-muni').map((i) => i.proofId), ['p-muni']);
    assert.deepEqual(pendingQueue(db, 'h-lab').map((i) => i.proofId), ['p-lab']);
  });

  test('another host proof id is not retrievable', () => {
    // Must be indistinguishable from "does not exist" — confirming it exists
    // would leak that another host has work in flight.
    assert.equal(reviewItem(db, 'h-muni', 'p-lab'), null);
    assert.equal(reviewItem(db, 'h-muni', 'does-not-exist'), null);
  });

  test('a host own proof is retrievable', () => {
    assert.equal(reviewItem(db, 'h-muni', 'p-muni')!.proofId, 'p-muni');
  });

  test('stats count only this host queue', () => {
    assert.equal(queueStats(db, 'h-muni').pending, 1);
    assert.equal(queueStats(db, 'h-lab').pending, 1);
  });

  test('history is scoped too', () => {
    db.prepare('UPDATE proofs SET reviewed_at = ?, approved = 1 WHERE id = ?').run(iso(0), 'p-lab');
    assert.equal(recentDecisions(db, 'h-muni').length, 0);
    assert.equal(recentDecisions(db, 'h-lab').length, 1);
  });
});

describe('queue ordering and SLA', () => {
  test('oldest first — the item closest to breaching 24h is opened next', () => {
    addProof({ id: 'p-new', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1 });
    addProof({ id: 'p-old', questId: 'q-muni', userId: 'u2', submittedHoursAgo: 20 });
    // Newest-first would starve the oldest item forever.
    assert.deepEqual(pendingQueue(db, 'h-muni').map((i) => i.proofId), ['p-old', 'p-new']);
  });

  test('past the SLA is flagged overdue', () => {
    addProof({ id: 'p-late', questId: 'q-muni', userId: 'u1', submittedHoursAgo: SLA_HOURS + 3 });
    addProof({ id: 'p-fine', questId: 'q-muni', userId: 'u2', submittedHoursAgo: 2 });
    const byId = Object.fromEntries(pendingQueue(db, 'h-muni').map((i) => [i.proofId, i]));
    assert.equal(byId['p-late']!.overdue, true);
    assert.equal(byId['p-fine']!.overdue, false);
    assert.equal(queueStats(db, 'h-muni').overdue, 1);
  });

  test('a reviewed proof leaves the queue', () => {
    addProof({ id: 'p-done', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 3,
               reviewed: { approved: true, by: 'Nok', note: '' } });
    assert.equal(pendingQueue(db, 'h-muni').length, 0);
    assert.equal(recentDecisions(db, 'h-muni').length, 1);
  });

  test('an empty queue reports zeroes rather than crashing', () => {
    assert.deepEqual(queueStats(db, 'h-muni'), { pending: 0, overdue: 0, oldestHours: 0 });
  });
});

describe('geotag check — the most useful thing the console does', () => {
  const check = (proofId: string) =>
    reviewItem(db, 'h-muni', proofId)!.checks.find((c) => c.key === 'geotag')!;

  test('photos at the site pass', () => {
    addProof({ id: 'p1', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1,
               photos: [{ ...SITE, takenHoursAgo: 1 }] });
    assert.equal(check('p1').status, 'pass');
  });

  test('photos 11 km away fail', () => {
    addProof({ id: 'p2', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1,
               photos: [{ ...FAR, takenHoursAgo: 1 }] });
    const c = check('p2');
    assert.equal(c.status, 'fail');
    // The service returns a KEY and the numbers, never a finished sentence -
    // the reviewer's language is not known here.
    assert.equal(c.detailKey, 'geotagFail');
    assert.ok(Number(c.params.worst) > 10_000, `worst was ${c.params.worst}`);
    assert.equal(c.params.radius, 250);
  });

  test('just outside the fence is a warning, not a failure — GPS drifts', () => {
    // ~400 m north of the site, fence is 250 m.
    addProof({ id: 'p3', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1,
               photos: [{ lat: SITE.lat + 0.0036, lng: SITE.lng, takenHoursAgo: 1 }] });
    assert.equal(check('p3').status, 'warn');
  });

  test('no geotag is unknown, never a failure', () => {
    // Plenty of phones strip EXIF. Penalising a volunteer for their privacy
    // settings would be unfair and would cost the pilot volunteers.
    addProof({ id: 'p4', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1,
               photos: [{ lat: null, lng: null, takenHoursAgo: 1 }] });
    assert.equal(check('p4').status, 'unknown');
  });

  test('the worst photo decides — one bad photo is not hidden by three good ones', () => {
    addProof({ id: 'p5', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1,
               photos: [{ ...SITE, takenHoursAgo: 1 }, { ...SITE, takenHoursAgo: 1 },
                        { ...FAR, takenHoursAgo: 1 }] });
    assert.equal(check('p5').status, 'fail');
  });
});

describe('timing check', () => {
  const check = (proofId: string) =>
    reviewItem(db, 'h-muni', proofId)!.checks.find((c) => c.key === 'timing')!;

  test('photos taken after check-in pass', () => {
    addProof({ id: 't1', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1,
               arrivedHoursAgo: 3, photos: [{ ...SITE, takenHoursAgo: 2 }] });
    assert.equal(check('t1').status, 'pass');
  });

  test('a photo from before check-in is flagged', () => {
    // A photo timestamped before arrival came from somewhere else, or another day.
    addProof({ id: 't2', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1,
               arrivedHoursAgo: 2, photos: [{ ...SITE, takenHoursAgo: 30 }] });
    assert.equal(check('t2').status, 'fail');
  });

  test('no check-in or no timestamps is unknown', () => {
    addProof({ id: 't3', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1,
               arrivedHoursAgo: null, photos: [{ ...SITE, takenHoursAgo: 1 }] });
    assert.equal(check('t3').status, 'unknown');
  });
});

describe('volunteer history is scoped to the host', () => {
  test('counts this host prior decisions only', () => {
    addProof({ id: 'h1', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 50,
               reviewed: { approved: false, by: 'Nok', note: 'blurry' } });
    addProof({ id: 'h2', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 40,
               reviewed: { approved: true, by: 'Nok', note: '' } });
    // A decision by a DIFFERENT host must not show up here.
    addProof({ id: 'h3', questId: 'q-lab', userId: 'u1', submittedHoursAgo: 30,
               reviewed: { approved: false, by: 'Lek', note: 'no' } });
    addProof({ id: 'h4', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1 });

    const item = reviewItem(db, 'h-muni', 'h4')!;
    assert.equal(item.priorRejections, 1, 'only the municipality rejection');
    assert.equal(item.priorApprovals, 1);
  });

  test('the current submission is excluded from its own history', () => {
    addProof({ id: 'h5', questId: 'q-muni', userId: 'u2', submittedHoursAgo: 1 });
    const item = reviewItem(db, 'h-muni', 'h5')!;
    assert.equal(item.priorRejections, 0);
    assert.equal(item.priorApprovals, 0);
  });
});

describe('weight check', () => {
  const check = (proofId: string) =>
    reviewItem(db, 'h-muni', proofId)!.checks.find((c) => c.key === 'weight')!;

  test('a plausible weight passes', () => {
    addProof({ id: 'w1', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1, weightKg: 4.2 });
    assert.equal(check('w1').status, 'pass');
  });

  test('an implausible weight warns rather than blocks', () => {
    addProof({ id: 'w2', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1, weightKg: 500 });
    assert.equal(check('w2').status, 'warn');
  });

  test('zero or negative fails', () => {
    addProof({ id: 'w3', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1, weightKg: 0 });
    assert.equal(check('w3').status, 'fail');
  });

  test('no weight is unknown', () => {
    addProof({ id: 'w4', questId: 'q-muni', userId: 'u1', submittedHoursAgo: 1, weightKg: null });
    assert.equal(check('w4').status, 'unknown');
  });
});
