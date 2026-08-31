import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { APPEAL_SLA_HOURS, PROOF_SLA_HOURS } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import { checkIn } from './checkin-service.ts';
import { inbox } from './notification-service.ts';
import { appealTakedown, hideReview, writeReview } from './place-review-service.ts';
import { overdueAppealIds, sweepOverdue } from './sla-service.ts';

let db: DB;
const SITE = { lat: 9.5357, lng: 100.0617 };
const NOW = new Date('2026-08-10T06:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

beforeEach(() => {
  db = openTestDb();
  const t = '2026-08-01T00:00:00Z';
  for (const u of ['u1', 'u2']) {
    db.prepare('INSERT INTO users (id,display_name,created_at) VALUES (?,?,?)').run(u, u, t);
  }
  db.prepare('INSERT INTO hosts (id,name,type) VALUES (?,?,?)')
    .run('h1', 'Samui Municipality', 'municipality');
  db.prepare(
    `INSERT INTO quests (id,code,name_en,name_th,where_label,duration,reward_points,
       host_id,kind,lat,lng,geofence_radius_m)
     VALUES ('q1','BC-04','Beach Cleanup','x','Chaweng','45 min',150,'h1','today',?,?,250)`,
  ).run(SITE.lat, SITE.lng);
  db.prepare(
    `INSERT INTO places (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,
       tags,safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
     VALUES ('chaweng','Chaweng Beach','x','C','Green',?,?,'x','x','x','[]','P','x',2,42,7,8)`,
  ).run(SITE.lat, SITE.lng);
});

const submitProofAt = (when: Date, id = 'p1') => {
  db.prepare('INSERT INTO proofs (id,user_id,quest_id,photos,submitted_at) VALUES (?,?,?,?,?)')
    .run(id, 'u1', 'q1', '[]', when.toISOString());
};

describe('proofs past the promised window', () => {
  test('a promise with no mechanism behind it is worse than no promise', () => {
    // quest_review_delayed existed as a template from the notification work and
    // nothing ever sent it. This is the test that it does now.
    submitProofAt(hoursAgo(PROOF_SLA_HOURS + 1));
    assert.equal(sweepOverdue(db, NOW).proofsChased, 1);
    const told = inbox(db, 'u1').find((n) => n.kind === 'quest_review_delayed');
    assert.ok(told);
    assert.match(told!.body.en, /Samui Municipality/);
    assert.match(told!.body.en, /Beach Cleanup/);
  });

  test('one still inside the window is left alone', () => {
    submitProofAt(hoursAgo(PROOF_SLA_HOURS - 1));
    assert.equal(sweepOverdue(db, NOW).proofsChased, 0);
    assert.equal(inbox(db, 'u1').length, 0);
  });

  test('a reviewed proof is never chased', () => {
    submitProofAt(hoursAgo(PROOF_SLA_HOURS + 10));
    db.prepare("UPDATE proofs SET reviewed_at = ?, approved = 1 WHERE id = 'p1'")
      .run(NOW.toISOString());
    assert.equal(sweepOverdue(db, NOW).proofsChased, 0);
  });

  test('chased once, not every hour for ever', () => {
    submitProofAt(hoursAgo(PROOF_SLA_HOURS + 1));
    assert.equal(sweepOverdue(db, NOW).proofsChased, 1);
    // A daily reminder that we are still late is nagging, not accountability.
    assert.equal(sweepOverdue(db, new Date(NOW.getTime() + 3_600_000)).proofsChased, 0);
    assert.equal(inbox(db, 'u1').length, 1);
  });
});

describe('appeals past the promised window', () => {
  const openAppeal = (age: number) => {
    checkIn(db, { userId: 'u1', placeId: 'chaweng', ...SITE, now: hoursAgo(age + 5) });
    const id = writeReview(db, {
      userId: 'u1', placeId: 'chaweng', rating: 1,
      body: 'A review long enough to be a real one for the next traveller here.',
      now: hoursAgo(age + 4),
    }).review.id;
    hideReview(db, {
      reviewId: id, reasonKey: 'abusive', moderator: 'Ploy', now: hoursAgo(age + 2),
    });
    appealTakedown(db, {
      reviewId: id, authorId: 'u1', message: 'I think this was wrong', now: hoursAgo(age),
    });
    return id;
  };

  test('an unread appeal produces a message before they give up on it', () => {
    openAppeal(APPEAL_SLA_HOURS + 1);
    assert.equal(sweepOverdue(db, NOW).appealsChased, 1);
    const told = inbox(db, 'u1').find((n) => n.kind === 'appeal_still_open');
    assert.ok(told);
    assert.match(told!.body.en, /have not forgotten/i);
    assert.match(told!.body.th, /ไม่ได้ลืม/);
  });

  test('one inside the window is left alone', () => {
    openAppeal(APPEAL_SLA_HOURS - 1);
    assert.equal(sweepOverdue(db, NOW).appealsChased, 0);
  });

  test('a resolved appeal is never chased', () => {
    const id = openAppeal(APPEAL_SLA_HOURS + 10);
    db.prepare("UPDATE review_appeals SET resolved_at = ?, outcome = 'declined' WHERE review_id = ?")
      .run(NOW.toISOString(), id);
    assert.equal(sweepOverdue(db, NOW).appealsChased, 0);
  });

  test('the desk can see which appeals are late', () => {
    const late = openAppeal(APPEAL_SLA_HOURS + 1);
    const overdue = overdueAppealIds(db, NOW);
    // The backlog belongs on a screen, not only in somebody's inbox.
    assert.ok(overdue.has(late));
    assert.equal(overdue.size, 1);
  });
});
