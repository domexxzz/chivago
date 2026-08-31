import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { BATCH_MAX_REVIEWS, TAKEDOWN_LIMIT_PER_WINDOW } from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import { checkIn } from './checkin-service.ts';
import { inbox } from './notification-service.ts';
import { moderatorWatch } from './moderator-watch.ts';
import {
  hideReview, moderationItem, moderationLog, restoreReview, reviewsFor,
  TakedownRateLimited, withdrawReview, writeReview,
} from './place-review-service.ts';
import {
  approveBatch, BatchEmpty, BatchTooLarge, cancelBatch, getBatch, pendingBatches,
  previewBatch, proposeBatch, SameApprover,
} from './batch-service.ts';

let db: DB;
const SITE = { lat: 9.5357, lng: 100.0617 };
const PLACE = 'chaweng';
const BODY = 'A review long enough to be a real one for the next traveller here.';

beforeEach(() => {
  db = openTestDb();
  nextAuthor = 0;
  db.prepare(
    `INSERT INTO places (id,name_en,name_th,short,layer,lat,lng,meta,blurb_en,blurb_th,
       tags,safety_label_en,safety_label_th,crowd_density,aqi,safety_index,walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(PLACE, 'Chaweng Beach', 'x', 'C', 'Green', SITE.lat, SITE.lng,
        'x', 'x', 'x', '[]', 'P', 'x', 2, 42, 7, 8);
});

/**
 * `n` reviews by `n` different authors — a spam wave, in miniature.
 *
 * The counter is shared across calls: a second `wave` in the same test would
 * otherwise reuse `spam0` and collide on the primary key.
 */
let nextAuthor = 0;
const wave = (n: number): string[] =>
  Array.from({ length: n }, () => {
    const author = `spam${nextAuthor}`;
    nextAuthor += 1;
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run(author, 'S', new Date().toISOString());
    checkIn(db, { userId: author, placeId: PLACE, ...SITE });
    return writeReview(db, { userId: author, placeId: PLACE, rating: 1, body: BODY }).review.id;
  });

describe('two people, or it does not happen', () => {
  test('a proposal changes nothing on its own', () => {
    const ids = wave(3);
    proposeBatch(db, { reviewIds: ids, reasonKey: 'commercial', proposedBy: 'Ploy' });

    // The whole mechanism is that proposing is not deciding.
    assert.equal(reviewsFor(db, PLACE).length, 3, 'all still published');
    assert.equal(moderationLog(db).length, 0, 'nothing acted on');
    assert.equal(pendingBatches(db).length, 1);
  });

  test('the proposer cannot approve their own', () => {
    const ids = wave(3);
    const batch = proposeBatch(db, {
      reviewIds: ids, reasonKey: 'commercial', proposedBy: 'Ploy',
    });
    assert.throws(
      () => approveBatch(db, { batchId: batch.id, approver: 'Ploy' }),
      SameApprover,
    );
    assert.equal(reviewsFor(db, PLACE).length, 3, 'still published');
  });

  test('a second moderator executes it', () => {
    const ids = wave(4);
    const batch = proposeBatch(db, {
      reviewIds: ids, reasonKey: 'commercial', note: 'same text on all four',
      proposedBy: 'Ploy',
    });
    const result = approveBatch(db, { batchId: batch.id, approver: 'Anan' })!;

    assert.equal(result.hidden, 4);
    assert.deepEqual(result.skipped, []);
    assert.equal(reviewsFor(db, PLACE).length, 0);
    assert.equal(result.batch.status, 'approved');
    assert.equal(result.batch.approvedBy, 'Anan');
    assert.equal(result.batch.proposedBy, 'Ploy');
  });

  test('every author is still told individually', () => {
    const ids = wave(3);
    const batch = proposeBatch(db, {
      reviewIds: ids, reasonKey: 'commercial', proposedBy: 'Ploy',
    });
    approveBatch(db, { batchId: batch.id, approver: 'Anan' });

    // A bulk decision is still a hundred individual removals from a hundred
    // people's point of view, and each of them is owed the reason.
    for (const id of ids) {
      const author = moderationItem(db, id)!.authorId;
      assert.ok(
        inbox(db, author).some((n) => n.kind === 'review_hidden'),
        `${author} was not told`,
      );
    }
  });
});

describe('the rate limit, and the way around it', () => {
  test('acting alone still stops at the cap', () => {
    const ids = wave(TAKEDOWN_LIMIT_PER_WINDOW + 1);
    for (let i = 0; i < TAKEDOWN_LIMIT_PER_WINDOW; i += 1) {
      hideReview(db, { reviewId: ids[i]!, reasonKey: 'commercial', moderator: 'Ploy' });
    }
    assert.throws(
      () => hideReview(db, {
        reviewId: ids[TAKEDOWN_LIMIT_PER_WINDOW]!, reasonKey: 'commercial', moderator: 'Ploy',
      }),
      TakedownRateLimited,
    );
  });

  test('an approved batch goes straight past it', () => {
    const ids = wave(TAKEDOWN_LIMIT_PER_WINDOW + 5);
    const batch = proposeBatch(db, {
      reviewIds: ids, reasonKey: 'commercial', proposedBy: 'Ploy',
    });
    const result = approveBatch(db, { batchId: batch.id, approver: 'Anan' })!;

    // The point of the whole mechanism: the cap contains ONE account acting
    // alone, and two accounts agreeing is a different, slower risk.
    assert.equal(result.hidden, TAKEDOWN_LIMIT_PER_WINDOW + 5);
    assert.equal(reviewsFor(db, PLACE).length, 0);
  });

  test('and the batch does not then block that moderator acting normally', () => {
    const ids = wave(TAKEDOWN_LIMIT_PER_WINDOW + 2);
    const batch = proposeBatch(db, {
      reviewIds: ids.slice(0, TAKEDOWN_LIMIT_PER_WINDOW), reasonKey: 'commercial',
      proposedBy: 'Ploy',
    });
    approveBatch(db, { batchId: batch.id, approver: 'Anan' });

    // Batch hides must not consume the individual allowance, or approving one
    // would silently disarm the moderator for the rest of the hour.
    assert.ok(hideReview(db, {
      reviewId: ids[TAKEDOWN_LIMIT_PER_WINDOW]!, reasonKey: 'abusive', moderator: 'Ploy',
    }));
  });
});

describe('what the proposal is, and is not', () => {
  test('the id set is frozen at proposal time', () => {
    const ids = wave(3);
    const batch = proposeBatch(db, {
      reviewIds: ids, reasonKey: 'commercial', proposedBy: 'Ploy',
    });
    // A fourth spam review arrives after the proposal. It is NOT in the batch:
    // resolving the set at approval time would let it drift between what was
    // agreed and what was executed.
    const late = wave(1);
    approveBatch(db, { batchId: batch.id, approver: 'Anan' });

    assert.equal(reviewsFor(db, PLACE).length, 1);
    assert.equal(moderationItem(db, late[0]!)!.hiddenAt, null);
  });

  test('a review withdrawn in between is skipped, and counted honestly', () => {
    const ids = wave(3);
    const batch = proposeBatch(db, {
      reviewIds: ids, reasonKey: 'commercial', proposedBy: 'Ploy',
    });
    const firstAuthor = moderationItem(db, ids[0]!)!.authorId;
    withdrawReview(db, firstAuthor, PLACE);
    const result = approveBatch(db, { batchId: batch.id, approver: 'Anan' })!;

    // "We removed 3" when it was 2 is a small lie that erodes the record.
    assert.equal(result.hidden, 2);
    assert.deepEqual(result.skipped, [ids[0]!]);
    assert.equal(result.batch.hiddenCount, 2);
  });

  test('an empty or oversized proposal is refused', () => {
    assert.throws(
      () => proposeBatch(db, { reviewIds: [], reasonKey: 'commercial', proposedBy: 'Ploy' }),
      BatchEmpty,
    );
    assert.throws(
      () => proposeBatch(db, {
        reviewIds: Array.from({ length: BATCH_MAX_REVIEWS + 1 }, (_, i) => `r${i}`),
        reasonKey: 'commercial', proposedBy: 'Ploy',
      }),
      BatchTooLarge,
    );
  });

  test('duplicate ids collapse rather than double-counting', () => {
    const ids = wave(2);
    const batch = proposeBatch(db, {
      reviewIds: [...ids, ...ids], reasonKey: 'commercial', proposedBy: 'Ploy',
    });
    assert.equal(batch.reviewIds.length, 2);
  });

  test('the approver sees what they are agreeing to', () => {
    const ids = wave(4);
    const batch = proposeBatch(db, {
      reviewIds: ids, reasonKey: 'commercial', proposedBy: 'Ploy',
    });
    const preview = previewBatch(db, batch, 2);
    // Approving a list of ids nobody read is a signature, not a decision.
    assert.equal(preview.length, 2);
    assert.equal(preview[0]!.placeName, 'Chaweng Beach');
    assert.ok(preview[0]!.body!.length > 0);
  });
});

describe('expiry and withdrawal', () => {
  const HOUR = 3_600_000;

  test('a proposal nobody approved lapses rather than waiting for ever', () => {
    const now = new Date('2026-08-31T00:00:00Z');
    const ids = wave(2);
    const batch = proposeBatch(db, {
      reviewIds: ids, reasonKey: 'commercial', proposedBy: 'Ploy', now,
    });

    const later = new Date(now.getTime() + 25 * HOUR);
    // A day-old proposal is a decision about a situation that has changed.
    assert.equal(getBatch(db, batch.id, later)!.status, 'expired');
    assert.deepEqual(pendingBatches(db, later), []);
    assert.equal(approveBatch(db, { batchId: batch.id, approver: 'Anan', now: later }), null);
    assert.equal(reviewsFor(db, PLACE).length, 2, 'nothing executed');
  });

  test('still approvable inside the window', () => {
    const now = new Date('2026-08-31T00:00:00Z');
    const batch = proposeBatch(db, {
      reviewIds: wave(2), reasonKey: 'commercial', proposedBy: 'Ploy', now,
    });
    const later = new Date(now.getTime() + 23 * HOUR);
    assert.equal(approveBatch(db, { batchId: batch.id, approver: 'Anan', now: later })!.hidden, 2);
  });

  test('a withdrawn proposal cannot be approved', () => {
    const batch = proposeBatch(db, {
      reviewIds: wave(2), reasonKey: 'commercial', proposedBy: 'Ploy',
    });
    assert.equal(cancelBatch(db, batch.id)!.status, 'cancelled');
    assert.equal(approveBatch(db, { batchId: batch.id, approver: 'Anan' }), null);
    assert.equal(reviewsFor(db, PLACE).length, 2);
  });

  test('a batch cannot be approved twice', () => {
    const batch = proposeBatch(db, {
      reviewIds: wave(2), reasonKey: 'commercial', proposedBy: 'Ploy',
    });
    assert.equal(approveBatch(db, { batchId: batch.id, approver: 'Anan' })!.hidden, 2);
    assert.equal(approveBatch(db, { batchId: batch.id, approver: 'Nok' }), null);
  });
});

describe('the safe path must not look worse than acting alone', () => {
  test('batch hides do not count toward the volume rules', () => {
    const ids = wave(20);
    const batch = proposeBatch(db, {
      reviewIds: ids, reasonKey: 'commercial', proposedBy: 'Ploy',
    });
    approveBatch(db, { batchId: batch.id, approver: 'Anan' });

    const ploy = moderatorWatch(db).find((m) => m.moderator === 'Ploy')!;
    // Twenty hides, and no volume flag: a second human reviewed them. If using
    // the safe path made you look worse on the watch than acting alone, nobody
    // would use it.
    assert.equal(ploy.recentHides, 0);
    assert.ok(!ploy.reasons.includes('absolute'));
    assert.ok(!ploy.reasons.includes('spike'));
  });

  test('but they DO count toward the overturn rate', () => {
    const ids = wave(6);
    const batch = proposeBatch(db, {
      reviewIds: ids, reasonKey: 'commercial', proposedBy: 'Ploy',
    });
    approveBatch(db, { batchId: batch.id, approver: 'Anan' });
    for (const id of ids.slice(0, 4)) restoreReview(db, id, 'Nok');

    const ploy = moderatorWatch(db).find((m) => m.moderator === 'Ploy')!;
    // If a batch was wrong, that is precisely what should surface — being
    // approved does not make a bad call a good one.
    assert.equal(ploy.totalHides, 6);
    assert.equal(ploy.overturned, 4);
    assert.ok(ploy.reasons.includes('overturned'));
  });

  test('the log records the batch, so it reads as authorised not unilateral', () => {
    const batch = proposeBatch(db, {
      reviewIds: wave(3), reasonKey: 'commercial', proposedBy: 'Ploy',
    });
    approveBatch(db, { batchId: batch.id, approver: 'Anan' });

    const entries = moderationLog(db).filter((e) => e.action === 'hide');
    assert.equal(entries.length, 3);
    for (const e of entries) assert.equal(e.batchId, batch.id);
  });
});
