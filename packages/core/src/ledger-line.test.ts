import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { ledgerLine } from './wallet.ts';

/**
 * What a ledger row says, in the reader's language.
 *
 * The server writes an English sentence and, since the app stopped printing
 * both languages, that sentence was the last place a Thai reader met English
 * in their own wallet. These hold the two halves of the fix: the sentence is
 * rebuilt from the row's kind and subject, and a row that cannot be rebuilt
 * still says exactly what it said when it was written.
 */

describe('a row the app can phrase itself', () => {
  test('a check-in reads as a check-in in both languages', () => {
    const line = ledgerLine({ kind: 'checkin', subject: 'Lamai Beach', label: 'Checked in · Lamai Beach' });
    assert.equal(line.en, 'Checked in · Lamai Beach');
    assert.match(line.th, /เช็กอิน/);
    assert.match(line.th, /Lamai Beach/, 'the place keeps its own name');
  });

  test('a review and a redemption each get their own phrasing', () => {
    assert.match(ledgerLine({ kind: 'review', subject: 'Na Muang', label: 'Review · Na Muang' }).th, /^รีวิว /);
    assert.match(ledgerLine({ kind: 'redemption', subject: 'Free coffee', label: 'Free coffee redeemed' }).th, /^แลก /);
  });

  test("a quest's own name is the whole line, with nothing wrapped around it", () => {
    // Quest names are already bilingual data elsewhere; inventing a Thai
    // sentence around one would be phrasing a title that is not ours.
    const line = ledgerLine({ kind: 'quest_reward', subject: 'Beach Cleanup', label: 'Beach Cleanup' });
    assert.equal(line.en, 'Beach Cleanup');
    assert.equal(line.th, 'Beach Cleanup');
  });
});

describe('a row the app cannot phrase still says what it said', () => {
  test('no subject falls back to the stored label', () => {
    // The pilot opening balance, and every row written before the column.
    const line = ledgerLine({ kind: 'adjustment', subject: null, label: 'Pilot opening balance' });
    assert.equal(line.en, 'Pilot opening balance');
    assert.equal(line.th, 'Pilot opening balance');
  });

  test('a missing subject field, not just a null one, is the same case', () => {
    const line = ledgerLine({ kind: 'checkin', label: 'Checked in · Chaweng Beach' });
    assert.equal(line.th, 'Checked in · Chaweng Beach');
  });

  test('an empty subject is treated as no subject, not as an empty sentence', () => {
    // `Checked in · ` with nothing after it would be worse than the English.
    const line = ledgerLine({ kind: 'checkin', subject: '   ', label: 'Checked in · Chaweng Beach' });
    assert.equal(line.th, 'Checked in · Chaweng Beach');
  });

  test('a kind with no phrasing keeps the label rather than inventing one', () => {
    const line = ledgerLine({ kind: 'adjustment', subject: 'Beach Cleanup', label: 'Beach Cleanup — reversed' });
    assert.equal(line.th, 'Beach Cleanup — reversed');
  });
});
