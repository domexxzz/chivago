import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  APPLICATION_LIMITS, APPLICATION_NOT_A_YES, APPLICATION_STATE_LABEL,
  applicationProblems, type OperatorApplicationInput,
} from './operator-application.ts';
import { listingRefusal } from './inquiry.ts';

const THAI = /[฀-๿]/;

const BOATS: OperatorApplicationInput = {
  businessName: 'สหกรณ์เรือท้องครุฏ',
  kind: 'transfer',
  whereLabel: 'ท่าเรือท้องครุฏ',
  contactName: 'สมชาย',
  contactPhone: '081 234 5678',
  contactEmail: null,
  licenceNo: null,
  note: null,
};

describe('what an application must say', () => {
  test('a complete one has nothing wrong with it', () => {
    assert.deepEqual(applicationProblems(BOATS), []);
  });

  test('EVERY problem is returned, not the first', () => {
    // The whole point: a business owner on a phone finds out once.
    const problems = applicationProblems({
      ...BOATS, businessName: '  ', whereLabel: '', contactName: '', contactPhone: 'x',
    });
    assert.equal(problems.length, 4, JSON.stringify(problems));
  });

  test('a phone number is required, in any shape a Thai number is written', () => {
    for (const phone of ['0812345678', '081 234 5678', '+66 81 234 5678', '02-123-4567']) {
      assert.deepEqual(applicationProblems({ ...BOATS, contactPhone: phone }), [], phone);
    }
    for (const phone of ['', '   ', '1234', 'โทรมาเลย']) {
      assert.equal(applicationProblems({ ...BOATS, contactPhone: phone }).length, 1, phone);
    }
  });

  test('an email is optional, but an unreadable one is refused', () => {
    assert.deepEqual(applicationProblems({ ...BOATS, contactEmail: null }), []);
    assert.deepEqual(applicationProblems({ ...BOATS, contactEmail: 'a@b.co' }), []);
    assert.equal(applicationProblems({ ...BOATS, contactEmail: 'somchai' }).length, 1);
    assert.equal(applicationProblems({ ...BOATS, contactEmail: 'a@b' }).length, 1);
  });

  test('A TOUR IS REFUSED BY THE SAME SENTENCE A LISTING IS', () => {
    // Not a copy of the rule: the same function. A tour approved into an
    // account whose first listing is then refused is a wasted phone call.
    const problems = applicationProblems({ ...BOATS, kind: 'tour', licenceNo: null });
    assert.deepEqual(problems, [listingRefusal({ kind: 'tour', licenceNo: null })]);
  });

  test('a tour that states a licence number is fine', () => {
    assert.deepEqual(applicationProblems({ ...BOATS, kind: 'tour', licenceNo: '14/01234' }), []);
  });

  test('an overlong field is REFUSED, never truncated', () => {
    // Storing a shortened business name stores a name the owner never typed,
    // and they would have no way to find out.
    const problems = applicationProblems({
      ...BOATS, businessName: 'ก'.repeat(APPLICATION_LIMITS.businessName + 1),
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0]!.en, new RegExp(String(APPLICATION_LIMITS.businessName)));
  });

  test('a field exactly at the limit is accepted', () => {
    assert.deepEqual(
      applicationProblems({ ...BOATS, note: 'ก'.repeat(APPLICATION_LIMITS.note) }),
      [],
    );
  });
});

describe('both languages, always', () => {
  test('every problem is written in Thai and in English', () => {
    const problems = applicationProblems({
      ...BOATS, businessName: '', whereLabel: '', contactName: '', contactPhone: '',
      contactEmail: 'nope', kind: 'tour', licenceNo: null,
      note: 'x'.repeat(APPLICATION_LIMITS.note + 1),
    });
    assert.ok(problems.length >= 6);
    for (const p of problems) {
      assert.ok(THAI.test(p.th), `no Thai in: ${p.th}`);
      assert.ok(!THAI.test(p.en), `Thai leaked into English: ${p.en}`);
    }
  });

  test('the warning above the button, and every state label, carry both', () => {
    for (const copy of [APPLICATION_NOT_A_YES, ...Object.values(APPLICATION_STATE_LABEL)]) {
      assert.ok(THAI.test(copy.th), copy.th);
      assert.ok(copy.en.trim().length > 0 && !THAI.test(copy.en), copy.en);
    }
  });

  test('the warning says what sending the form does NOT do', () => {
    assert.match(APPLICATION_NOT_A_YES.en, /does not create an account/);
    assert.match(APPLICATION_NOT_A_YES.th, /ยังไม่ได้เปิดบัญชี/);
  });
});
