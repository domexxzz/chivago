import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { incompleteInquiry, islandDateKey, listingRefusal } from '@chivago/core';
import { DEMO_LISTINGS, createInquiryDesk } from '../src/demo/inquiries.ts';

/**
 * The demo build's example operator (src/demo/inquiries.ts).
 *
 * What is held here is what the demo must not do even though it is pretend:
 * show an operator that does not say it is made up, answer a question on a
 * person's behalf, or accept a question the real server would refuse.
 */

const opened = new Date('2026-10-01T03:00:00.000Z'); // 10:00 on the island
const hoursLater = (h: number) => new Date(opened.getTime() + h * 3_600_000);
const daysAhead = (n: number) => islandDateKey(new Date(opened.getTime() + n * 86_400_000));
const question = (over: Record<string, unknown> = {}) =>
  ({ forDate: daysAhead(3), partySize: 2, message: 'Two of us, Saturday?', ...over });

describe('the example operator', () => {
  test('EVERY DEMO LISTING SAYS IT IS AN EXAMPLE, AND SO DOES ITS OPERATOR’S NAME', () => {
    const listings = createInquiryDesk(opened).listings();
    assert.ok(listings.length > 0);
    for (const l of listings) {
      assert.equal(l.example, true, l.id);
      assert.match(l.operatorName, /Example/);
    }
  });

  test('the real listing rules pass it, and its licence number is plainly not a real one', () => {
    for (const l of DEMO_LISTINGS) assert.equal(listingRefusal(l), null, l.id);
    const tour = DEMO_LISTINGS.find((l) => l.kind === 'tour');
    assert.ok(tour, 'a tour is what shows the stated-licence line');
    assert.match(tour.licenceNo!, /^0+\/0+$/);
  });

  test('one price is stated and one is not, so both honest readings are on screen', () => {
    assert.ok(DEMO_LISTINGS.some((l) => l.fromTHB === null));
    assert.ok(DEMO_LISTINGS.some((l) => typeof l.fromTHB === 'number' && l.fromTHB > 0));
  });
});

describe('asking it', () => {
  test('A QUESTION SENT IN THE DEMO STAYS SENT: NOBODY ANSWERS FOR A BUSINESS THAT DOES NOT EXIST', () => {
    const desk = createInquiryDesk(opened);
    const sent = desk.ask('demo-listing-boat', question(), opened);
    assert.ok(sent.ok);
    const later = desk.mine(hoursLater(6)).find((i) => i.id === sent.value.id);
    assert.ok(later);
    assert.equal(later.now, 'sent');
    assert.equal(later.answer, null);
    assert.equal(later.quoteTHB, null);
  });

  test('THE DEMO REFUSES WHAT THE SERVER REFUSES, IN THE SERVER’S OWN WORDS', () => {
    const desk = createInquiryDesk(opened);
    const blank = desk.ask('demo-listing-boat', question({ message: '   ', partySize: 0 }), opened);
    assert.ok(!blank.ok);
    assert.equal(blank.code, 'INVALID_INQUIRY');
    assert.equal(blank.error, incompleteInquiry(['party_size', 'message']));

    const nowhere = desk.ask('no-such-listing', question(), opened);
    assert.ok(!nowhere.ok);
    assert.equal(nowhere.error, 'That listing is not taking questions.');
  });

  test('the message is kept as the server keeps it: trimmed', () => {
    const desk = createInquiryDesk(opened);
    const sent = desk.ask('demo-listing-room', question({ message: '  Two nights?  ' }), opened);
    assert.ok(sent.ok);
    assert.equal(sent.value.message, 'Two nights?');
  });

  test('a question can be withdrawn once, and is closed after that', () => {
    const desk = createInquiryDesk(opened);
    const sent = desk.ask('demo-listing-room', question(), opened);
    assert.ok(sent.ok);
    const first = desk.withdraw(sent.value.id, hoursLater(1));
    assert.ok(first.ok);
    assert.equal(first.value.now, 'withdrawn');
    const again = desk.withdraw(sent.value.id, hoursLater(2));
    assert.ok(!again.ok);
    assert.equal(again.error, 'That inquiry is already closed.');
  });
});

describe('what is already on screen', () => {
  test('THE ONE ANSWERED QUESTION IS HISTORY ABOUT THE EXAMPLE, WITH THE OPERATOR’S QUOTE', () => {
    const answered = createInquiryDesk(opened).mine(opened).filter((i) => i.now === 'answered');
    assert.equal(answered.length, 1);
    const [one] = answered;
    assert.equal(one!.listing.example, true);
    assert.ok(Date.parse(one!.sentAt) < opened.getTime(), 'history is from before the visitor arrived');
    assert.equal(typeof one!.quoteTHB, 'number');
    assert.ok(one!.answer);
  });

  test('the visitor’s own question comes first, newest first as the server orders them', () => {
    const desk = createInquiryDesk(opened);
    const sent = desk.ask('demo-listing-boat', question(), hoursLater(1));
    assert.ok(sent.ok);
    assert.equal(desk.mine(hoursLater(1))[0]!.id, sent.value.id);
  });

  test('NOTHING THE DESK SAYS READS AS CONFIRMED', () => {
    const desk = createInquiryDesk(opened);
    desk.ask('demo-listing-room', question(), opened);
    assert.doesNotMatch(JSON.stringify([desk.listings(), desk.mine(opened)]), /confirm/i);
  });
});
