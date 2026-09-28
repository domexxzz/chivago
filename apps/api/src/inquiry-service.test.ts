import { strict as assert } from 'node:assert';
import { test, describe, beforeEach } from 'node:test';

import { openTestDb, type DB } from './db.ts';
import {
  InvalidInquiry, InvalidListing, MIN_ANSWERS_FOR_RESPONSE_TIME,
  addListing, answerInquiry, declineInquiry, inquiriesForOperator, inquiriesOfTraveller,
  inquiryById, listingsOf, medianResponseHours, publicListings, sendInquiry, setListingActive,
  withdrawInquiry,
} from './inquiry-service.ts';
import { inbox } from './notification-service.ts';

/**
 * Inquiries, met by the database and the clock.
 *
 * The assertions that carry weight: a tour cannot exist without a licence even
 * by a path that skips the service; an inquiry leaves `sent` once and never
 * changes after; an expired one cannot be answered into looking answered; and
 * an answer never lands without the traveller's inbox row beside it.
 */

let db: DB;
const NOW = new Date('2026-10-01T03:00:00.000Z');
const LATER = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

const boat = () => addListing(db, {
  operatorId: 'op-boat', kind: 'tour', titleEn: 'Longtail to Koh Taen', titleTh: 'เรือหางยาวไปเกาะแตน',
  whereLabel: 'Thong Krut pier', fromTHB: null, licenceNo: '31/01234',
}, NOW);

const ask = (listingId: string, over: Record<string, unknown> = {}) => sendInquiry(db, {
  listingId, userId: 'ana', forDate: '2026-10-04', partySize: 2,
  message: 'Two of us, Saturday morning?', ...over,
} as Parameters<typeof sendInquiry>[1], NOW);

beforeEach(() => {
  db = openTestDb();
  db.prepare("INSERT INTO hosts (id,name,type) VALUES ('op-boat','Thong Krut Boat Co-op','company')").run();
  db.prepare("INSERT INTO hosts (id,name,type) VALUES ('op-other','Someone Else','company')").run();
  for (const u of ['ana', 'bo']) {
    db.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?,?,?)').run(u, u, NOW.toISOString());
  }
});

describe('listings', () => {
  test('A TOUR WITHOUT A LICENCE IS REFUSED BY THE SERVICE, WITH A SENTENCE', () => {
    assert.throws(() => addListing(db, {
      operatorId: 'op-boat', kind: 'tour', titleEn: 'x', titleTh: 'x', whereLabel: 'x', licenceNo: '  ',
    }, NOW), /Department of Tourism licence number/);
  });

  test('AND BY THE TABLE ITSELF, FOR ANY PATH THAT SKIPS THE SERVICE', () => {
    assert.throws(() => db.prepare(
      `INSERT INTO listings (id, operator_id, kind, title_en, title_th, where_label, created_at)
       VALUES ('x','op-boat','tour','t','t','w',?)`,
    ).run(NOW.toISOString()), /CHECK/);
  });

  test('a stay needs no licence', () => {
    const l = addListing(db, {
      operatorId: 'op-boat', kind: 'stay', titleEn: 'Beach hut', titleTh: 'บ้านริมหาด', whereLabel: 'Lamai',
    }, NOW);
    assert.equal(l.licenceNo, null);
  });

  test('NO PRICE IS INVENTED: UNSAID IS NULL, NOT ZERO', () => {
    assert.equal(boat().fromTHB, null);
    assert.throws(() => addListing(db, {
      operatorId: 'op-boat', kind: 'stay', titleEn: 'x', titleTh: 'x', whereLabel: 'x', fromTHB: -5,
    }, NOW), InvalidListing);
  });

  test('a listing needs both languages and a place', () => {
    assert.throws(() => addListing(db, {
      operatorId: 'op-boat', kind: 'stay', titleEn: 'x', titleTh: '', whereLabel: 'x',
    }, NOW), /both languages/);
  });

  test('a paused listing leaves the public list and takes no inquiries', () => {
    const l = boat();
    setListingActive(db, 'op-boat', l.id, false);
    assert.equal(publicListings(db).length, 0);
    assert.equal(listingsOf(db, 'op-boat').length, 1, 'the operator still sees it');
    assert.throws(() => ask(l.id), /not taking questions/);
  });

  test('an operator cannot pause somebody else’s listing', () => {
    const l = boat();
    assert.throws(() => setListingActive(db, 'op-other', l.id, false), /not your listing/);
  });
});

describe('sending an inquiry', () => {
  test('it is sent, and reads as sent', () => {
    const i = ask(boat().id);
    assert.equal(i.state, 'sent');
    assert.equal(i.now, 'sent');
  });

  test('EVERY PROBLEM COMES BACK AT ONCE', () => {
    try {
      ask(boat().id, { partySize: 0, message: '', forDate: 'nope' });
      assert.fail('an incomplete inquiry was sent');
    } catch (e) {
      assert.ok(e instanceof InvalidInquiry);
      assert.deepEqual(e.problems, ['party_size', 'message', 'date_format']);
    }
  });

  test('a listing that does not exist takes no questions', () => {
    assert.throws(() => ask('nope'), /not taking questions/);
  });
});

describe('an operator answers', () => {
  test('THE ANSWER AND THE TRAVELLER’S NOTIFICATION LAND TOGETHER', () => {
    const i = ask(boat().id);
    answerInquiry(db, { operatorId: 'op-boat', inquiryId: i.id, answer: 'Yes, 8am works.', quoteTHB: 2400 }, LATER(2));
    const after = inquiryById(db, i.id, LATER(2))!;
    assert.equal(after.now, 'answered');
    assert.equal(after.quoteTHB, 2400);
    const items = inbox(db, 'ana');
    assert.equal(items.length, 1);
    assert.match(JSON.stringify(items[0]), /inquiry_answered/);
  });

  test('A THAI TRAVELLER READS THE LISTING’S THAI NAME IN THE THAI NOTIFICATION', () => {
    // The first version passed only the English title, so the Thai body read
    // "เรื่อง Longtail to Koh Taen". Found by reading the rendered text.
    const i = ask(boat().id);
    answerInquiry(db, { operatorId: 'op-boat', inquiryId: i.id, answer: 'Yes' }, LATER(1));
    const [item] = inbox(db, 'ana');
    assert.match(item!.body.th, /เรือหางยาวไปเกาะแตน/);
    assert.doesNotMatch(item!.body.th, /Longtail/);
    assert.match(item!.body.en, /Longtail to Koh Taen/);
    assert.equal(item!.data.screen, 'inquiry');
  });

  test('THE NOTIFICATION NEVER SAYS BOOKED', () => {
    const i = ask(boat().id);
    answerInquiry(db, { operatorId: 'op-boat', inquiryId: i.id, answer: 'Yes' }, LATER(1));
    const text = JSON.stringify(inbox(db, 'ana')).toLowerCase();
    assert.doesNotMatch(text, /\bbooked\b(?![^"]*until)/);
    assert.doesNotMatch(text, /confirmed/);
  });

  test('ONLY THE LISTING’S OWN OPERATOR CAN ANSWER', () => {
    const i = ask(boat().id);
    assert.throws(() => answerInquiry(db, { operatorId: 'op-other', inquiryId: i.id, answer: 'hi' }, LATER(1)),
      /not about your listing/);
    assert.equal(inbox(db, 'ana').length, 0, 'a refused answer still notified the traveller');
  });

  test('a decline tells the traveller plainly, and says nothing was reserved', () => {
    const i = ask(boat().id);
    declineInquiry(db, { operatorId: 'op-boat', inquiryId: i.id, reason: 'Fully booked that day' }, LATER(1));
    assert.equal(inquiryById(db, i.id, LATER(1))!.now, 'declined');
    assert.match(JSON.stringify(inbox(db, 'ana')), /inquiry_declined/);
  });

  test('a quote is whole baht or nothing', () => {
    const i = ask(boat().id);
    assert.throws(() => answerInquiry(db, {
      operatorId: 'op-boat', inquiryId: i.id, answer: 'ok', quoteTHB: 12.5,
    }, LATER(1)), /whole baht/);
  });
});

describe('an inquiry leaves sent once', () => {
  test('AN ANSWER CANNOT BE REWRITTEN AFTER THE TRAVELLER HAS READ IT', () => {
    const i = ask(boat().id);
    answerInquiry(db, { operatorId: 'op-boat', inquiryId: i.id, answer: 'Yes', quoteTHB: 2400 }, LATER(1));
    assert.throws(() => answerInquiry(db, {
      operatorId: 'op-boat', inquiryId: i.id, answer: 'Actually 5000', quoteTHB: 5000,
    }, LATER(2)), /already been dealt with/);
    // And the table refuses it even by a path that skips the service.
    assert.throws(() => db.prepare('UPDATE inquiries SET quote_thb = 5000 WHERE id = ?').run(i.id),
      /does not change again/);
  });

  test('a withdrawn question cannot be answered into looking taken up', () => {
    const i = ask(boat().id);
    withdrawInquiry(db, 'ana', i.id, LATER(1));
    assert.throws(() => answerInquiry(db, { operatorId: 'op-boat', inquiryId: i.id, answer: 'Sure' }, LATER(2)),
      /already been dealt with/);
  });

  test('only the traveller who asked can withdraw', () => {
    const i = ask(boat().id);
    assert.throws(() => withdrawInquiry(db, 'bo', i.id, LATER(1)), /No inquiry of yours/);
  });
});

describe('expiry, derived from the clock', () => {
  test('AN EXPIRED INQUIRY CANNOT BE ANSWERED', () => {
    // The traveller has already been told it went unanswered. An answer now
    // would contradict what they were shown.
    const i = ask(boat().id, { forDate: '2026-10-20' });
    const afterWindow = LATER(24 * 3 + 1);
    assert.equal(inquiryById(db, i.id, afterWindow)!.now, 'expired');
    assert.throws(() => answerInquiry(db, { operatorId: 'op-boat', inquiryId: i.id, answer: 'Late' }, afterWindow),
      /traveller has already been told it went unanswered/);
  });

  test('THE STORED STATE IS STILL SENT — EXPIRY IS NEVER WRITTEN', () => {
    const i = ask(boat().id, { forDate: '2026-10-20' });
    inquiryById(db, i.id, LATER(24 * 5));
    const stored = db.prepare('SELECT state FROM inquiries WHERE id = ?').get(i.id) as unknown as { state: string };
    assert.equal(stored.state, 'sent');
  });

  test('it expires the moment the day asked about ends on the island', () => {
    const i = ask(boat().id, { forDate: '2026-10-01' });
    assert.equal(inquiryById(db, i.id, new Date('2026-10-01T16:59:00.000Z'))!.now, 'sent');
    assert.equal(inquiryById(db, i.id, new Date('2026-10-01T17:01:00.000Z'))!.now, 'expired');
  });
});

describe('who sees what', () => {
  test('a traveller sees their own inquiries and nobody else’s', () => {
    const l = boat();
    ask(l.id);
    sendInquiry(db, { listingId: l.id, userId: 'bo', forDate: '2026-10-04', partySize: 1, message: 'Me too?' }, NOW);
    assert.equal(inquiriesOfTraveller(db, 'ana', NOW).length, 1);
  });

  test('an operator sees inquiries about their own listings only', () => {
    ask(boat().id);
    assert.equal(inquiriesForOperator(db, 'op-boat', NOW).length, 1);
    assert.equal(inquiriesForOperator(db, 'op-other', NOW).length, 0);
  });

  test('ERASING A TRAVELLER ERASES THEIR QUESTIONS', () => {
    ask(boat().id);
    db.prepare("DELETE FROM users WHERE id = 'ana'").run();
    assert.equal(inquiriesForOperator(db, 'op-boat', NOW).length, 0);
  });
});

describe('how fast an operator answers', () => {
  const answeredAfter = (hours: number[]) => {
    const l = boat();
    for (const h of hours) {
      const i = ask(l.id, { forDate: '2026-10-20' });
      answerInquiry(db, { operatorId: 'op-boat', inquiryId: i.id, answer: 'ok' }, LATER(h));
    }
  };

  test('BELOW THE MINIMUM IT SAYS NOTHING, BECAUSE ONE REPLY IS AN ANECDOTE', () => {
    answeredAfter([1, 1, 1, 1].slice(0, MIN_ANSWERS_FOR_RESPONSE_TIME - 1));
    assert.equal(medianResponseHours(db, 'op-boat'), null);
  });

  test('the median, so one late reply does not make a quick operator look slow', () => {
    // 70 hours is the slowest a reply can be: past the 72-hour window an
    // inquiry expires and cannot be answered, so the window bounds this
    // metric too. The mean here would be 15 hours; the median says 2.
    answeredAfter([1, 1, 2, 2, 70]);
    assert.equal(medianResponseHours(db, 'op-boat'), 2);
  });

  test('NO RECORDED ANSWER CAN BE SLOWER THAN THE WINDOW', () => {
    const l = boat();
    const i = ask(l.id, { forDate: '2026-10-20' });
    assert.throws(() => answerInquiry(db, { operatorId: 'op-boat', inquiryId: i.id, answer: 'late' }, LATER(80)),
      /expired/);
  });

  test('a fast decline is a fast answer; a withdrawal is not an answer at all', () => {
    const l = boat();
    for (let n = 0; n < MIN_ANSWERS_FOR_RESPONSE_TIME; n += 1) {
      const i = ask(l.id, { forDate: '2026-10-20' });
      declineInquiry(db, { operatorId: 'op-boat', inquiryId: i.id }, LATER(3));
    }
    const w = ask(l.id, { forDate: '2026-10-20' });
    withdrawInquiry(db, 'ana', w.id, LATER(10));
    assert.equal(medianResponseHours(db, 'op-boat'), 3);
  });
});
