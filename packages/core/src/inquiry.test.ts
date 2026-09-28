import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  ANSWER_WINDOW_DAYS, INQUIRY_IS_NOT_A_BOOKING, LICENCE_STATED, LISTING_KIND_LABEL, MAX_PARTY,
  OPERATOR_PRIVACY, PROBLEM_LABEL, STATE_LABEL,
  answerNote, inquiryProblems, inquiryState, isListingKind, listingRefusal,
  type Inquiry,
} from './inquiry.ts';

/**
 * A question, not a booking.
 *
 * The assertions that carry weight are the ones about words and states that
 * DO NOT exist: there is no `confirmed`, no screen says "booked", and a quote
 * is never "the price".
 */

const NOW = new Date('2026-10-01T03:00:00.000Z'); // 10:00 on the island

const inq = (over: Partial<Inquiry> = {}): Pick<Inquiry, 'state' | 'sentAt' | 'forDate'> => ({
  state: 'sent',
  sentAt: '2026-10-01T02:00:00.000Z',
  forDate: '2026-10-04',
  ...over,
});

describe('what an inquiry is', () => {
  test('THERE IS NO CONFIRMED STATE', () => {
    // An answered inquiry is not a contract, and the state machine does not
    // pretend it is.
    assert.deepEqual(Object.keys(STATE_LABEL).sort(),
      ['answered', 'declined', 'expired', 'sent', 'withdrawn']);
    for (const label of Object.values(STATE_LABEL)) {
      assert.doesNotMatch(label.en, /confirm|book(ed|ing)?\b(?!.*not)/i, label.en);
    }
  });

  test('A SENT INQUIRY SAYS NOTHING IS RESERVED, IN ITS OWN LABEL', () => {
    assert.match(STATE_LABEL.sent.en, /nothing is reserved/);
    assert.match(STATE_LABEL.sent.th, /ยังไม่มีการจองใดๆ/);
  });

  test('the refusal that travels with every inquiry', () => {
    assert.match(INQUIRY_IS_NOT_A_BOOKING.en, /This is a question, not a booking/);
    assert.match(INQUIRY_IS_NOT_A_BOOKING.en, /no money moves through\s+ChivaGo/);
    assert.match(INQUIRY_IS_NOT_A_BOOKING.th, /ไม่ใช่การจอง/);
  });
});

describe('expiry is derived, never written', () => {
  test('a fresh inquiry about a day ahead is still sent', () => {
    assert.equal(inquiryState(inq(), NOW), 'sent');
  });

  test('IT EXPIRES WHEN THE OPERATOR RUNS OUT OF WINDOW', () => {
    const late = new Date(Date.parse('2026-10-01T02:00:00.000Z') + (ANSWER_WINDOW_DAYS * 86_400_000) + 1);
    assert.equal(inquiryState(inq({ forDate: '2026-10-20' }), late), 'expired');
  });

  test('IT EXPIRES WHEN THE DAY ASKED ABOUT HAS ENDED, WHATEVER THE WINDOW', () => {
    // An inquiry about Saturday that is still "sent" on Sunday is not waiting
    // for anything.
    const sunday = new Date('2026-10-04T17:30:00.000Z'); // 00:30 on the 5th, island time
    assert.equal(inquiryState(inq({ sentAt: '2026-10-04T01:00:00.000Z' }), sunday), 'expired');
  });

  test('the day asked about ends at midnight ON THE ISLAND, not in UTC', () => {
    // 23:30 on the 4th in Samui is 16:30 UTC. Still the 4th; still open.
    const lateEvening = new Date('2026-10-04T16:30:00.000Z');
    assert.equal(inquiryState(inq({ sentAt: '2026-10-04T01:00:00.000Z' }), lateEvening), 'sent');
  });

  test('ONLY A SENT INQUIRY CAN EXPIRE', () => {
    // Relabelling an answered or declined one as expired would lose why it
    // ended.
    const long = new Date('2027-01-01T00:00:00.000Z');
    for (const state of ['answered', 'declined', 'withdrawn'] as const) {
      assert.equal(inquiryState(inq({ state }), long), state);
    }
  });
});

describe('what a new inquiry must say', () => {
  const ok = { forDate: '2026-10-04', partySize: 2, message: 'Two of us, morning if possible?' };

  test('a sensible inquiry has no problems', () => {
    assert.deepEqual(inquiryProblems(ok, NOW), []);
  });

  test('EVERY PROBLEM IS REPORTED AT ONCE, NOT ONE PER SUBMIT', () => {
    const all = inquiryProblems({ forDate: 'someday', partySize: 0, message: '  ' }, NOW);
    assert.deepEqual(all, ['party_size', 'message', 'date_format']);
  });

  test('party size is a whole number from one to the limit', () => {
    for (const bad of [0, -1, 1.5, MAX_PARTY + 1, Number.NaN]) {
      assert.ok(inquiryProblems({ ...ok, partySize: bad }, NOW).includes('party_size'), String(bad));
    }
    assert.deepEqual(inquiryProblems({ ...ok, partySize: MAX_PARTY }, NOW), []);
  });

  test('a day already over, and a day too far ahead, are both refused', () => {
    assert.deepEqual(inquiryProblems({ ...ok, forDate: '2026-09-30' }, NOW), ['date_past']);
    assert.deepEqual(inquiryProblems({ ...ok, forDate: '2028-01-01' }, NOW), ['date_far']);
  });

  test('TODAY IS STILL ASKABLE UNTIL IT ENDS ON THE ISLAND', () => {
    assert.deepEqual(inquiryProblems({ ...ok, forDate: '2026-10-01' }, NOW), []);
  });

  test('every problem has words in both languages', () => {
    for (const [k, v] of Object.entries(PROBLEM_LABEL)) {
      assert.ok(v.en.length > 0 && v.th.length > 0, k);
    }
  });
});

describe('listings', () => {
  test('A TOUR WITH NO STATED LICENCE IS NOT LISTED', () => {
    for (const licenceNo of [null, '', '   ']) {
      const why = listingRefusal({ kind: 'tour', licenceNo });
      assert.ok(why, `a tour with licence ${JSON.stringify(licenceNo)} was listable`);
      assert.match(why!.en, /Department of Tourism licence number/);
    }
  });

  test('a tour with a stated licence is listed', () => {
    assert.equal(listingRefusal({ kind: 'tour', licenceNo: '12/34567' }), null);
  });

  test('ONLY TOURS CARRY THE LICENCE RULE', () => {
    // Which activities count as a tour is a question for the lawyer; the
    // category is explicit so the answer changes one rule.
    for (const kind of ['stay', 'experience', 'transfer'] as const) {
      assert.equal(listingRefusal({ kind, licenceNo: null }), null, kind);
    }
  });

  test('a stated licence is never presented as verified', () => {
    assert.match(LICENCE_STATED.en, /as stated by the operator/);
    assert.match(LICENCE_STATED.en, /has not verified it/);
  });

  test('every kind has both languages', () => {
    for (const [k, v] of Object.entries(LISTING_KIND_LABEL)) {
      assert.ok(isListingKind(k) && v.en.length > 0 && v.th.length > 0, k);
    }
    assert.equal(isListingKind('hotel'), false);
  });
});

describe('an operator’s answer', () => {
  test('THE OPERATOR IS THE SUBJECT OF THEIR OWN QUOTE', () => {
    const note = answerNote('Thong Krut Boat Co-op', 2400);
    assert.match(note.en, /^Thong Krut Boat Co-op answered and quotes 2,400 THB/);
    assert.doesNotMatch(note.en, /the price is/i);
  });

  test('it says nothing is booked, and that ChivaGo takes no payment', () => {
    const note = answerNote('Thong Krut Boat Co-op', null);
    assert.match(note.en, /Nothing is booked until you agree it with them directly/);
    assert.match(note.en, /ChivaGo takes no payment/);
    assert.match(note.th, /ยังไม่มีการจอง/);
  });

  test('no quote means no number at all, not a zero', () => {
    assert.doesNotMatch(answerNote('X', null).en, /\d/);
  });

  test('the operator is told what they are not given', () => {
    assert.match(OPERATOR_PRIVACY.en, /does not give you their\s+phone or email/);
  });
});
