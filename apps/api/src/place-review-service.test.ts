import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import {
  REPORT_LIMIT_PER_WINDOW, REVIEW_MAX_BODY, REVIEW_MIN_BODY_FOR_POINTS,
  TAKEDOWN_LIMIT_PER_WINDOW,
  REVIEW_TRIP_POINTS,
} from '@chivago/core';
import { openTestDb, type DB } from './db.ts';
import { checkIn } from './checkin-service.ts';
import { getBalances, getLedger } from './wallet-service.ts';
import { inbox } from './notification-service.ts';
import {
  AlreadyReported, CannotReportOwn, dismissReports, hasVisited, hideReview,
  InvalidRating, moderationCounts, moderationQueue, myReview, NeverVisited,
  reportedByReader, reporterRecord, ReportRateLimited, reportReview, reportsFor,
  appealCount, appealQueue, AppealAlreadyOpen, appealTakedown, declineAppeal,
  latestAppeal, moderationItem, moderationLog, myReviewState, NothingToAppeal,
  NotYourReview, restoreReview, reviewsFor, summaryFor,
  TakedownRateLimited,
  withdrawReview, writeReview,
} from './place-review-service.ts';

let db: DB;
const USER = 'u1';
const OTHER = 'u2';
const PLACE = 'chaweng';
const ELSEWHERE = 'namuang';
const SITE = { lat: 9.5357, lng: 100.0617 };
/** Long enough to earn. */
const REAL = 'Quiet at 7am, shade under the trees at the north end, and the water is clean.';
/** Deliberately under the earning threshold. */
const TERSE = 'Nice.';

const place = (id: string, name: string, lat: number, lng: number) =>
  db.prepare(
    `INSERT INTO places (id, name_en, name_th, short, layer, lat, lng, meta,
       blurb_en, blurb_th, tags, safety_label_en, safety_label_th,
       crowd_density, aqi, safety_index, walkability)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id, name, name, name, 'Green', lat, lng, 'x', 'x', 'x', '[]', 'Patrolled', 'x',
        2.4, 42, 7.2, 8.1);

beforeEach(() => {
  db = openTestDb();
  const now = new Date().toISOString();
  for (const [id, name] of [[USER, 'John'], [OTHER, 'Malee']]) {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run(id, name, now);
  }
  place(PLACE, 'Chaweng Beach', SITE.lat, SITE.lng);
  place(ELSEWHERE, 'Na Muang Waterfall', 9.4611, 99.9908);
});

const visit = (user = USER, placeId = PLACE, coords = SITE) =>
  checkIn(db, { userId: user, placeId, ...coords });

describe('the gate', () => {
  test('a review requires a check-in at THAT place', () => {
    assert.throws(
      () => writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL }),
      NeverVisited,
    );
    assert.equal(reviewsFor(db, PLACE).length, 0, 'nothing written');
  });

  test('checking in somewhere else does not unlock this place', () => {
    visit(USER, ELSEWHERE, { lat: 9.4611, lng: 99.9908 });
    // The whole claim is presence AT the place. A check-in 14 km away
    // unlocking Chaweng would make "verified" mean nothing.
    assert.throws(
      () => writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL }),
      NeverVisited,
    );
  });

  test('after checking in, the review is accepted', () => {
    visit();
    const r = writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    assert.equal(r.created, true);
    assert.equal(r.review.rating, 5);
    assert.equal(reviewsFor(db, PLACE).length, 1);
  });

  test('the review records when they were THERE, not when they wrote', () => {
    const visited = new Date('2026-08-01T04:00:00Z');
    const wrote = new Date('2026-08-09T22:00:00Z');
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE, now: visited });
    const r = writeReview(db, {
      userId: USER, placeId: PLACE, rating: 4, body: REAL, now: wrote,
    });
    // Someone writing up their trip on the flight home still says when they
    // were standing there.
    assert.equal(r.review.visitedAt, visited.toISOString());
    assert.equal(r.review.createdAt, wrote.toISOString());
  });

  test('a rating outside 1-5, or a fractional one, is refused', () => {
    visit();
    for (const rating of [0, 6, -1, 4.5, Number.NaN]) {
      assert.throws(
        () => writeReview(db, { userId: USER, placeId: PLACE, rating, body: REAL }),
        InvalidRating,
        `rating ${rating}`,
      );
    }
  });
});

describe('one voice per person per place', () => {
  test('a second write edits rather than duplicating', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    const again = writeReview(db, { userId: USER, placeId: PLACE, rating: 2, body: 'Busier now, and the north end is roped off this month.' });

    assert.equal(again.created, false);
    // Without this, one traveller with an opinion buries a place under twenty
    // one-star rows and "verified" buys us nothing.
    assert.equal(reviewsFor(db, PLACE).length, 1);
    assert.equal(reviewsFor(db, PLACE)[0]!.rating, 2);
  });

  test('two travellers each get their own row', () => {
    visit(USER);
    visit(OTHER);
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    writeReview(db, { userId: OTHER, placeId: PLACE, rating: 3, body: REAL });
    assert.equal(reviewsFor(db, PLACE).length, 2);
  });

  test('a traveller can withdraw their own words', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    assert.equal(withdrawReview(db, USER, PLACE), true);
    assert.equal(reviewsFor(db, PLACE).length, 0);
    assert.equal(myReview(db, USER, PLACE), null);
  });

  test('withdrawing does not claw back the points', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    const before = getBalances(db, USER).trip;
    withdrawReview(db, USER, PLACE);
    // They really did make the visit. Taking the points back would make
    // withdrawing feel like a penalty for exercising a PDPA right.
    assert.equal(getBalances(db, USER).trip, before);
  });
});

describe('what earns, and what does not', () => {
  test('the first review with words pays Trip Points', () => {
    visit();
    const r = writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    assert.equal(r.pointsAwarded, REVIEW_TRIP_POINTS);
    assert.equal(getBalances(db, USER).trip, 20 + REVIEW_TRIP_POINTS, 'check-in plus review');
  });

  test('editing pays nothing - it is not an income stream', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    const edit = writeReview(db, {
      userId: USER, placeId: PLACE, rating: 4,
      body: 'Still good, but the north end is roped off this month for turtle nesting.',
    });
    assert.equal(edit.pointsAwarded, 0);
    assert.equal(getBalances(db, USER).trip, 20 + REVIEW_TRIP_POINTS, 'paid once');
  });

  test('withdrawing and rewriting does not pay again', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    withdrawReview(db, USER, PLACE);
    const again = writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    // The ledger's source_ref survives the row being withdrawn, which is what
    // makes delete-and-repost a dead end rather than a points printer.
    assert.equal(again.pointsAwarded, 0);
    assert.equal(getBalances(db, USER).trip, 20 + REVIEW_TRIP_POINTS);
  });

  test('a bare rating is accepted but earns nothing', () => {
    visit();
    const r = writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: null });
    // A star is still signal, so it is kept. But the points are for helping the
    // next traveller, and a lone star does not.
    assert.equal(r.pointsAwarded, 0);
    assert.equal(r.review.rating, 5);
    assert.equal(r.review.body, null);
  });

  test('a too-short review earns nothing', () => {
    visit();
    assert.ok(TERSE.length < REVIEW_MIN_BODY_FOR_POINTS);
    assert.equal(
      writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: TERSE }).pointsAwarded,
      0,
    );
  });

  test('padding a short review later still pays, once', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: TERSE });
    const grown = writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    assert.equal(grown.pointsAwarded, REVIEW_TRIP_POINTS, 'the first real one pays');
    const third = writeReview(db, { userId: USER, placeId: PLACE, rating: 4, body: REAL });
    assert.equal(third.pointsAwarded, 0, 'and only once');
  });

  test('the ledger says review, not check-in', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    const entry = getLedger(db, USER)[0]!;
    assert.equal(entry.kind, 'review');
    assert.equal(entry.currency, 'trip', 'never Green - nobody verified the opinion');
    assert.match(entry.host, /verified visit/i);
  });

  test('an over-long body is cut, not rejected', () => {
    visit();
    const huge = 'x'.repeat(REVIEW_MAX_BODY + 500);
    const r = writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: huge });
    // Losing someone's last paragraph is better than losing the whole review
    // to a 400 they cannot see the reason for.
    assert.equal(r.review.body!.length, REVIEW_MAX_BODY);
  });
});

describe('roll-up', () => {
  test('a place nobody has reviewed averages null, not zero', () => {
    const s = summaryFor(db, PLACE);
    // Zero is a rating. Rendering "0.0" for somewhere nobody has been yet is a
    // claim we have no basis for.
    assert.equal(s.count, 0);
    assert.equal(s.average, null);
    assert.deepEqual(s.distribution, [0, 0, 0, 0, 0]);
  });

  test('counts and averages across travellers', () => {
    visit(USER);
    visit(OTHER);
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    writeReview(db, { userId: OTHER, placeId: PLACE, rating: 4, body: REAL });
    const s = summaryFor(db, PLACE);
    assert.equal(s.count, 2);
    assert.equal(s.average, 4.5);
    assert.deepEqual(s.distribution, [0, 0, 0, 1, 1]);
  });

  test('one place roll-up never leaks into another', () => {
    visit(USER);
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    assert.equal(summaryFor(db, ELSEWHERE).count, 0);
  });

  test('an edit moves the average rather than adding to it', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    writeReview(db, { userId: USER, placeId: PLACE, rating: 1, body: REAL });
    const s = summaryFor(db, PLACE);
    assert.equal(s.count, 1);
    assert.equal(s.average, 1);
  });
});

describe('moderation', () => {
  test('a hidden review disappears from the list and the average', () => {
    visit(USER);
    visit(OTHER);
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    writeReview(db, { userId: OTHER, placeId: PLACE, rating: 1, body: REAL });

    // No operator screen exists yet, so this is the SQL an operator would run.
    // The point of the test is that hiding actually takes effect everywhere,
    // not just in the list - a hidden one-star still dragging the average down
    // would make moderation cosmetic.
    db.prepare(
      "UPDATE place_reviews SET hidden_at = ?, hidden_reason = 'names a member of staff' WHERE user_id = ?",
    ).run(new Date().toISOString(), OTHER);

    assert.equal(reviewsFor(db, PLACE).length, 1);
    const s = summaryFor(db, PLACE);
    assert.equal(s.count, 1);
    assert.equal(s.average, 5);
  });
});

describe('the gate does not expire', () => {
  test('a check-in from a previous day still unlocks a review', () => {
    const lastWeek = new Date('2026-08-01T04:00:00Z');
    const today = new Date('2026-08-09T04:00:00Z');
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE, now: lastWeek });

    // The app must not tell someone to do a thing they already did. The gate
    // asks whether they have EVER been here, not whether they are here now.
    const r = writeReview(db, {
      userId: USER, placeId: PLACE, rating: 5, body: REAL, now: today,
    });
    assert.equal(r.created, true);
    assert.equal(r.review.visitedAt, lastWeek.toISOString());
  });

  test('the earliest visit is the one recorded, not the latest', () => {
    const first = new Date('2026-08-01T04:00:00Z');
    const second = new Date('2026-08-05T04:00:00Z');
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE, now: first });
    checkIn(db, { userId: USER, placeId: PLACE, ...SITE, now: second });
    const r = writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    assert.equal(r.review.visitedAt, first.toISOString());
  });
});

describe('moderation', () => {
  const hide = (reasonKey: Parameters<typeof hideReview>[1]['reasonKey'], note?: string) => {
    const target = moderationQueue(db, 'all')[0]!;
    return hideReview(db, { reviewId: target.id, reasonKey, moderator: 'Ploy', note });
  };

  test('a hidden review leaves the list AND the average', () => {
    visit(USER);
    visit(OTHER);
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    writeReview(db, { userId: OTHER, placeId: PLACE, rating: 1, body: REAL });
    const bad = moderationQueue(db, 'low')[0]!;

    hideReview(db, { reviewId: bad.id, reasonKey: 'abusive', moderator: 'Ploy' });

    assert.equal(reviewsFor(db, PLACE).length, 1);
    // A hidden one-star still dragging the mean down would make moderation
    // cosmetic - the visible list would say one thing and the number another.
    assert.equal(summaryFor(db, PLACE).average, 5);
    assert.equal(summaryFor(db, PLACE).count, 1);
  });

  test('the take-down is attributed and reasoned', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 1, body: REAL });
    const item = hide('personal_data', 'names the manager')!;

    assert.ok(item.hiddenAt);
    assert.equal(item.hiddenBy, 'Ploy');
    assert.equal(item.hiddenReasonKey, 'personal_data');
    assert.equal(item.hiddenNote, 'names the manager');
  });

  test('the author is told, in the same transaction, with a KEY not a sentence', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 1, body: REAL });
    hide('personal_data');

    const notes = inbox(db, USER);
    const told = notes.find((n) => n.kind === 'review_hidden');
    assert.ok(told, 'the author must be told');
    // Removing what someone wrote and saying nothing is how a platform earns
    // the reputation of censoring quietly.
    assert.match(told!.body.en, /Chaweng Beach/);
    assert.match(told!.body.en, /Identifies an individual/);
    // Rendered per reader: the moderator decided in one language, the author
    // may read only the other.
    assert.match(told!.body.th, /ระบุตัวบุคคล/);
    assert.doesNotMatch(told!.body.en, /personal_data/, 'never the raw key');
  });

  test('the operator note stays internal', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 1, body: REAL });
    hide('abusive', 'reported by the beach patrol, third time this month');

    const told = inbox(db, USER).find((n) => n.kind === 'review_hidden')!;
    // A sentence typed in Thai by a moderator is no use to a German traveller,
    // and the internal record is not the author's business.
    assert.doesNotMatch(told.body.en, /beach patrol/);
    assert.doesNotMatch(told.body.th, /beach patrol/);
  });

  test('points are not clawed back', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 1, body: REAL });
    const before = getBalances(db, USER).trip;
    hide('abusive');
    // The visit really happened. What was wrong was the words, not the trip.
    assert.equal(getBalances(db, USER).trip, before);
  });

  test('restoring clears the whole moderation record', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 1, body: REAL });
    const hiddenItem = hide('abusive', 'on reflection, borderline')!;

    const restored = restoreReview(db, hiddenItem.id)!;
    assert.equal(restored.hiddenAt, null);
    assert.equal(restored.hiddenBy, null);
    assert.equal(restored.hiddenReasonKey, null);
    // No "was hidden" mark. A decision that was reversed must not follow the
    // author around.
    assert.equal(restored.hiddenNote, null);
    assert.equal(reviewsFor(db, PLACE).length, 1);
  });

  test('an unknown reason key is refused, not stored', () => {
    visit();
    writeReview(db, { userId: USER, placeId: PLACE, rating: 1, body: REAL });
    const target = moderationQueue(db, 'all')[0]!;
    const result = hideReview(db, {
      reviewId: target.id,
      // `__proto__` is the classic hole: `'__proto__' in obj` is true for every
      // plain object, so a naive check would accept it.
      reasonKey: '__proto__' as never,
      moderator: 'Ploy',
    });
    assert.equal(result, null);
    assert.equal(moderationQueue(db, 'hidden').length, 0, 'nothing taken down');
  });

  test('the low lens shows one and two stars only, and only visible ones', () => {
    visit(USER);
    visit(OTHER);
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    writeReview(db, { userId: OTHER, placeId: PLACE, rating: 2, body: REAL });

    const low = moderationQueue(db, 'low');
    assert.equal(low.length, 1);
    assert.equal(low[0]!.rating, 2);

    hideReview(db, { reviewId: low[0]!.id, reasonKey: 'abusive', moderator: 'Ploy' });
    assert.equal(moderationQueue(db, 'low').length, 0, 'handled ones leave the lens');
    assert.equal(moderationQueue(db, 'hidden').length, 1);
  });

  test('the counts match the lenses', () => {
    visit(USER);
    visit(OTHER);
    writeReview(db, { userId: USER, placeId: PLACE, rating: 5, body: REAL });
    writeReview(db, { userId: OTHER, placeId: PLACE, rating: 1, body: REAL });
    const c = moderationCounts(db);
    assert.deepEqual(c, { appeals: 0, reported: 0, all: 2, visible: 2, hidden: 0, low: 1 });
  });
});

describe('reporting', () => {
  const THIRD = 'u3';

  beforeEach(() => {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run(THIRD, 'Anon', new Date().toISOString());
  });

  const aReview = () => {
    visit(USER);
    return writeReview(db, { userId: USER, placeId: PLACE, rating: 1, body: REAL }).review.id;
  };

  test('anyone can report — a check-in is NOT required', () => {
    const id = aReview();
    // The person most likely to spot a review naming their child is a local
    // reading it, not a tourist who happened to be on that beach. Requiring a
    // visit would silence exactly the right reporter.
    assert.equal(hasVisited(db, THIRD, PLACE), false);
    const report = reportReview(db, {
      reviewId: id, reporterId: THIRD, reasonKey: 'personal_info',
    });
    assert.ok(report);
    assert.equal(reportsFor(db, id).length, 1);
  });

  test('reporting hides NOTHING, at any number of reports', () => {
    const id = aReview();
    for (const reporter of [OTHER, THIRD]) {
      reportReview(db, { reviewId: id, reporterId: reporter, reasonKey: 'abusive' });
    }
    // THE property. No count trips a switch, so a coordinated pile-on cannot be
    // used to bury a review someone dislikes - only a moderator can remove it.
    assert.equal(reviewsFor(db, PLACE).length, 1, 'still published');
    assert.equal(summaryFor(db, PLACE).count, 1, 'still counted');
    assert.equal(moderationQueue(db, 'hidden').length, 0);
  });

  test('one voice per reader', () => {
    const id = aReview();
    reportReview(db, { reviewId: id, reporterId: THIRD, reasonKey: 'abusive' });
    assert.throws(
      () => reportReview(db, { reviewId: id, reporterId: THIRD, reasonKey: 'spam' }),
      AlreadyReported,
    );
    // Twenty reports must mean twenty people, not one person twenty times.
    assert.equal(reportsFor(db, id).length, 1);
  });

  test('you cannot report your own review', () => {
    const id = aReview();
    assert.throws(
      () => reportReview(db, { reviewId: id, reporterId: USER, reasonKey: 'abusive' }),
      CannotReportOwn,
    );
  });

  test('an unknown reason is refused, prototype keys included', () => {
    const id = aReview();
    for (const bad of ['__proto__', 'constructor', 'made_up']) {
      assert.equal(
        reportReview(db, { reviewId: id, reporterId: THIRD, reasonKey: bad as never }),
        null,
        bad,
      );
    }
    assert.equal(reportsFor(db, id).length, 0);
  });

  test('a reported review leads the desk, ahead of the low-star lens', () => {
    const id = aReview();
    reportReview(db, { reviewId: id, reporterId: THIRD, reasonKey: 'personal_info', note: 'that is my brother' });

    const queue = moderationQueue(db, 'reported');
    assert.equal(queue.length, 1);
    assert.equal(queue[0]!.reports.length, 1);
    assert.equal(queue[0]!.reports[0]!.reasonKey, 'personal_info');
    assert.equal(queue[0]!.reports[0]!.note, 'that is my brother');
    assert.equal(moderationCounts(db).reported, 1);
  });

  test('acting on a review closes its reports', () => {
    const id = aReview();
    reportReview(db, { reviewId: id, reporterId: THIRD, reasonKey: 'personal_info' });
    hideReview(db, { reviewId: id, reasonKey: 'personal_data', moderator: 'Ploy' });

    // Without this the desk shows the same handled row for ever, and a real new
    // report is lost in a backlog of ones already dealt with.
    assert.equal(reportsFor(db, id).length, 0);
    assert.equal(moderationCounts(db).reported, 0);
  });

  test('restoring closes them too', () => {
    const id = aReview();
    hideReview(db, { reviewId: id, reasonKey: 'abusive', moderator: 'Ploy' });
    reportReview(db, { reviewId: id, reporterId: THIRD, reasonKey: 'abusive' });
    restoreReview(db, id, 'Ploy');
    assert.equal(reportsFor(db, id).length, 0, 'putting it back is also a decision');
  });

  test('dismissing clears the reports and leaves the review alone', () => {
    const id = aReview();
    reportReview(db, { reviewId: id, reporterId: THIRD, reasonKey: 'untrue' });
    assert.equal(dismissReports(db, id, 'Ploy'), 1);

    // The third outcome. A desk with only hide-or-ignore leaves the row at the
    // top of the queue until someone hides it to make it go away.
    assert.equal(reportsFor(db, id).length, 0);
    assert.equal(reviewsFor(db, PLACE).length, 1, 'still published');
    assert.equal(moderationCounts(db).reported, 0);
  });

  test('a reader is told what they have already reported', () => {
    const id = aReview();
    assert.deepEqual(reportedByReader(db, THIRD, PLACE), []);
    reportReview(db, { reviewId: id, reporterId: THIRD, reasonKey: 'spam' });
    assert.deepEqual(reportedByReader(db, THIRD, PLACE), [id]);
    // ...and it stays true after the moderator resolves it, so they are not
    // invited to report the same thing twice.
    dismissReports(db, id, 'Ploy');
    assert.deepEqual(reportedByReader(db, THIRD, PLACE), [id]);
  });

  test('withdrawing a review takes its reports with it', () => {
    const id = aReview();
    reportReview(db, { reviewId: id, reporterId: THIRD, reasonKey: 'abusive' });
    withdrawReview(db, USER, PLACE);
    assert.equal(moderationCounts(db).reported, 0, 'no orphan reports');
  });
});

describe('closing the loop', () => {
  const THIRD = 'u3';

  beforeEach(() => {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run(THIRD, 'Anon', new Date().toISOString());
  });

  const reported = () => {
    visit(USER);
    const id = writeReview(db, { userId: USER, placeId: PLACE, rating: 1, body: REAL }).review.id;
    reportReview(db, { reviewId: id, reporterId: THIRD, reasonKey: 'personal_info' });
    return id;
  };

  test('the author is told when a take-down is reversed', () => {
    const id = reported();
    hideReview(db, { reviewId: id, reasonKey: 'personal_data', moderator: 'Ploy' });
    restoreReview(db, id, 'Ploy');

    const told = inbox(db, USER).find((n) => n.kind === 'review_restored');
    // The other half of review_hidden. Telling someone their words were removed
    // and never telling them they are back is the wrong way round.
    assert.ok(told, 'the author must be told');
    assert.match(told!.body.en, /Chaweng Beach/);
    assert.match(told!.body.th, /กลับมาแสดง/);
  });

  test('a reporter hears back when the review comes down', () => {
    const id = reported();
    hideReview(db, { reviewId: id, reasonKey: 'personal_data', moderator: 'Ploy' });

    const told = inbox(db, THIRD).find((n) => n.kind === 'report_reviewed')!;
    assert.match(told.body.en, /taken down/i);
    assert.match(told.body.th, /ถูกนำออก/);
    assert.doesNotMatch(told.body.en, /removed$/, 'never the raw key');
  });

  test('a reporter hears back when it stays up, too', () => {
    const id = reported();
    dismissReports(db, id, 'Ploy');

    const told = inbox(db, THIRD).find((n) => n.kind === 'report_reviewed')!;
    // "We looked and left it" is a real answer. Withholding it would let the
    // reporter conclude nobody read it, which is how a report button dies.
    assert.match(told.body.en, /can stay/i);
  });

  test('the author of a dismissed-report review is not bothered', () => {
    const id = reported();
    dismissReports(db, id, 'Ploy');
    // Nothing happened to their review. Telling them it was reported and
    // cleared would hand them a grievance they did not have.
    assert.equal(inbox(db, USER).filter((n) => n.kind.startsWith('review_')).length, 0);
  });

  test('every reporter on a review hears back, not just the first', () => {
    const id = reported();
    reportReview(db, { reviewId: id, reporterId: OTHER, reasonKey: 'abusive' });
    hideReview(db, { reviewId: id, reasonKey: 'abusive', moderator: 'Ploy' });

    for (const who of [THIRD, OTHER]) {
      assert.ok(
        inbox(db, who).some((n) => n.kind === 'report_reviewed'),
        `${who} was not told`,
      );
    }
  });

  test('a resolved report keeps the outcome it had at the time', () => {
    const id = reported();
    hideReview(db, { reviewId: id, reasonKey: 'abusive', moderator: 'Ploy' });
    restoreReview(db, id, 'Ploy');

    // The report was upheld when it was decided. A later appeal must not
    // rewrite history and turn "your report was acted on" retroactively false.
    assert.deepEqual(reporterRecord(db, THIRD), { filed: 1, upheld: 1, dismissed: 0 });
  });
});

describe('report rate limiting', () => {
  /** A place and a review to flag, without the reporter being the author. */
  const someoneElsesReview = (n: number): string => {
    const author = `author${n}`;
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
      .run(author, 'A', new Date().toISOString());
    checkIn(db, { userId: author, placeId: PLACE, ...SITE });
    return writeReview(db, { userId: author, placeId: PLACE, rating: 3, body: REAL }).review.id;
  };

  test('a reader is capped per window', () => {
    const ids = Array.from({ length: REPORT_LIMIT_PER_WINDOW + 1 }, (_, i) =>
      someoneElsesReview(i));

    for (let i = 0; i < REPORT_LIMIT_PER_WINDOW; i += 1) {
      reportReview(db, { reviewId: ids[i]!, reporterId: USER, reasonKey: 'spam' });
    }
    // One account reporting a hundred different reviews in a minute is the
    // cheapest denial-of-service a review desk has.
    assert.throws(
      () => reportReview(db, {
        reviewId: ids[REPORT_LIMIT_PER_WINDOW]!, reporterId: USER, reasonKey: 'spam',
      }),
      ReportRateLimited,
    );
  });

  test('the window rolls - yesterday does not count against today', () => {
    const ids = Array.from({ length: REPORT_LIMIT_PER_WINDOW + 1 }, (_, i) =>
      someoneElsesReview(i));
    const yesterday = new Date('2026-08-01T00:00:00Z');
    const today = new Date('2026-08-02T00:00:00Z');

    for (let i = 0; i < REPORT_LIMIT_PER_WINDOW; i += 1) {
      reportReview(db, {
        reviewId: ids[i]!, reporterId: USER, reasonKey: 'spam', now: yesterday,
      });
    }
    const ok = reportReview(db, {
      reviewId: ids[REPORT_LIMIT_PER_WINDOW]!, reporterId: USER, reasonKey: 'spam', now: today,
    });
    assert.ok(ok, 'a diligent reader is not punished for ever');
  });

  test('the cap is per reader, not global', () => {
    const ids = Array.from({ length: REPORT_LIMIT_PER_WINDOW }, (_, i) => someoneElsesReview(i));
    for (const id of ids) {
      reportReview(db, { reviewId: id, reporterId: USER, reasonKey: 'spam' });
    }
    // One noisy account must not silence everybody else.
    assert.ok(reportReview(db, { reviewId: ids[0]!, reporterId: OTHER, reasonKey: 'spam' }));
  });
});

describe('the audit log', () => {
  const aReview = () => {
    visit(USER);
    return writeReview(db, { userId: USER, placeId: PLACE, rating: 1, body: REAL }).review.id;
  };

  test('records who did what, in order', () => {
    const id = aReview();
    hideReview(db, { reviewId: id, reasonKey: 'abusive', moderator: 'Ploy', note: 'third time' });
    restoreReview(db, id, 'Anan');

    const log = moderationLog(db);
    assert.equal(log.length, 2);
    assert.equal(log[0]!.action, 'restore');
    assert.equal(log[0]!.moderator, 'Anan');
    assert.equal(log[1]!.action, 'hide');
    assert.equal(log[1]!.moderator, 'Ploy');
    assert.equal(log[1]!.reasonKey, 'abusive');
    assert.equal(log[1]!.note, 'third time');
  });

  test('survives the restore that erases the review row evidence', () => {
    const id = aReview();
    hideReview(db, { reviewId: id, reasonKey: 'abusive', moderator: 'Ploy' });
    restoreReview(db, id, 'Ploy');

    // restoreReview clears hidden_by on purpose, so no scar follows the author.
    // The audit trail must not vanish with it - that is the whole reason the
    // log is a separate append-only table rather than derived.
    assert.equal(moderationItem(db, id)!.hiddenBy, null, 'no scar on the review');
    assert.equal(moderationLog(db).filter((e) => e.action === 'hide').length, 1);
  });

  test('survives the author withdrawing the review', () => {
    const id = aReview();
    hideReview(db, { reviewId: id, reasonKey: 'abusive', moderator: 'Ploy' });
    restoreReview(db, id, 'Ploy');
    withdrawReview(db, USER, PLACE);

    // An audit trail a subject can erase by deleting the subject is not one.
    assert.ok(moderationLog(db).some((e) => e.reviewId === id));
  });

  test('a dismissal is logged too - deciding nothing is still a decision', () => {
    const id = aReview();
    reportReview(db, { reviewId: id, reporterId: OTHER, reasonKey: 'abusive' });
    dismissReports(db, id, 'Ploy');
    assert.equal(moderationLog(db)[0]!.action, 'dismiss');
  });
});

describe('take-down rate limiting', () => {
  const manyReviews = (n: number): string[] =>
    Array.from({ length: n }, (_, i) => {
      const author = `bulk${i}`;
      db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)')
        .run(author, 'B', new Date().toISOString());
      checkIn(db, { userId: author, placeId: PLACE, ...SITE });
      return writeReview(db, { userId: author, placeId: PLACE, rating: 2, body: REAL }).review.id;
    });

  test('a moderator is capped per window', () => {
    const ids = manyReviews(TAKEDOWN_LIMIT_PER_WINDOW + 1);
    for (let i = 0; i < TAKEDOWN_LIMIT_PER_WINDOW; i += 1) {
      hideReview(db, { reviewId: ids[i]!, reasonKey: 'abusive', moderator: 'Ploy' });
    }
    // A compromised moderator account clearing every review on the island is
    // the threat this exists for.
    assert.throws(
      () => hideReview(db, {
        reviewId: ids[TAKEDOWN_LIMIT_PER_WINDOW]!, reasonKey: 'abusive', moderator: 'Ploy',
      }),
      TakedownRateLimited,
    );
  });

  test('the cap is per moderator - one does not block the others', () => {
    const ids = manyReviews(TAKEDOWN_LIMIT_PER_WINDOW + 1);
    for (let i = 0; i < TAKEDOWN_LIMIT_PER_WINDOW; i += 1) {
      hideReview(db, { reviewId: ids[i]!, reasonKey: 'abusive', moderator: 'Ploy' });
    }
    assert.ok(
      hideReview(db, {
        reviewId: ids[TAKEDOWN_LIMIT_PER_WINDOW]!, reasonKey: 'abusive', moderator: 'Anan',
      }),
    );
  });

  test('restoring and dismissing are NOT capped', () => {
    const ids = manyReviews(TAKEDOWN_LIMIT_PER_WINDOW);
    for (const id of ids) {
      hideReview(db, { reviewId: id, reasonKey: 'abusive', moderator: 'Ploy' });
    }
    // Rate limiting the safe actions would push a moderator at their cap toward
    // the dangerous one, or leave them unable to undo their own mistake.
    for (const id of ids) assert.ok(restoreReview(db, id, 'Ploy'));
  });

  test('a refused take-down leaves no trace', () => {
    const ids = manyReviews(TAKEDOWN_LIMIT_PER_WINDOW + 1);
    for (let i = 0; i < TAKEDOWN_LIMIT_PER_WINDOW; i += 1) {
      hideReview(db, { reviewId: ids[i]!, reasonKey: 'abusive', moderator: 'Ploy' });
    }
    const last = ids[TAKEDOWN_LIMIT_PER_WINDOW]!;
    try {
      hideReview(db, { reviewId: last, reasonKey: 'abusive', moderator: 'Ploy' });
    } catch { /* expected */ }
    assert.equal(moderationItem(db, last)!.hiddenAt, null, 'still published');
    assert.equal(moderationLog(db).filter((e) => e.reviewId === last).length, 0);
  });
});

describe('appeals', () => {
  const hiddenReview = () => {
    visit(USER);
    const id = writeReview(db, { userId: USER, placeId: PLACE, rating: 1, body: REAL }).review.id;
    hideReview(db, { reviewId: id, reasonKey: 'personal_data', moderator: 'Ploy' });
    return id;
  };

  test('the author can answer back', () => {
    const id = hiddenReview();
    const appeal = appealTakedown(db, {
      reviewId: id, authorId: USER,
      message: 'I did not name anyone — the person I mentioned is a public sign, not a person.',
    });
    assert.equal(appeal.outcome, null);
    assert.equal(appealCount(db), 1);
    assert.equal(appealQueue(db).length, 1);
  });

  test('only the author, and only while it is down', () => {
    const id = hiddenReview();
    assert.throws(
      () => appealTakedown(db, { reviewId: id, authorId: OTHER, message: 'let me try' }),
      NotYourReview,
    );
    restoreReview(db, id, 'Ploy');
    assert.throws(
      () => appealTakedown(db, { reviewId: id, authorId: USER, message: 'nothing to fight' }),
      NothingToAppeal,
    );
  });

  test('one open appeal at a time', () => {
    const id = hiddenReview();
    appealTakedown(db, { reviewId: id, authorId: USER, message: 'first attempt at this' });
    assert.throws(
      () => appealTakedown(db, { reviewId: id, authorId: USER, message: 'and again' }),
      AppealAlreadyOpen,
    );
  });

  test('restoring upholds the appeal without a second route', () => {
    const id = hiddenReview();
    appealTakedown(db, { reviewId: id, authorId: USER, message: 'I think this was a mistake' });
    restoreReview(db, id, 'Anan');

    // There is deliberately no separate "uphold" path: two routes that both
    // restore would be two chances to forget one of them.
    assert.equal(latestAppeal(db, id, USER)!.outcome, 'upheld');
    assert.equal(appealCount(db), 0);
  });

  test('declining tells the author', () => {
    const id = hiddenReview();
    appealTakedown(db, { reviewId: id, authorId: USER, message: 'I disagree with this' });
    declineAppeal(db, { reviewId: id, moderator: 'Anan' });

    assert.equal(latestAppeal(db, id, USER)!.outcome, 'declined');
    const told = inbox(db, USER).find((n) => n.kind === 'appeal_declined');
    // Silence after an appeal is worse than the original take-down: it says the
    // answer was never going to be read.
    assert.ok(told, 'the author must hear the outcome');
    assert.match(told!.body.en, /decision stands/i);
    assert.match(told!.body.th, /ยืนตามคำตัดสินเดิม/);
  });

  test('a declined appeal is logged, and a new one may follow a new take-down', () => {
    const id = hiddenReview();
    appealTakedown(db, { reviewId: id, authorId: USER, message: 'first go at this' });
    declineAppeal(db, { reviewId: id, moderator: 'Anan' });
    assert.equal(moderationLog(db)[0]!.action, 'appeal_declined');

    // Still hidden, previous appeal closed - so they may try once more rather
    // than being silenced for ever by one refusal.
    assert.ok(appealTakedown(db, { reviewId: id, authorId: USER, message: 'second go at this' }));
  });

  test('the author sees their own hidden review, and why', () => {
    const id = hiddenReview();
    const state = myReviewState(db, USER, PLACE)!;
    // A review that silently vanishes from your own screen is the worst version
    // of this. They see it, they see why, and they can answer.
    assert.equal(state.review.id, id);
    assert.ok(state.hiddenAt);
    assert.equal(state.hiddenReasonKey, 'personal_data');
    assert.equal(state.appeal, null);

    appealTakedown(db, { reviewId: id, authorId: USER, message: 'I would like this looked at' });
    assert.equal(myReviewState(db, USER, PLACE)!.appeal!.outcome, null);
  });

  test('nobody else sees the hidden review', () => {
    hiddenReview();
    assert.equal(reviewsFor(db, PLACE).length, 0);
    assert.equal(myReviewState(db, OTHER, PLACE), null);
  });
});
