import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  DECLARED_NOT_VERIFIED, parseDeclaredCsv, reviewDeclared, type DeclaredRow,
} from './declared.ts';

/**
 * A review, never a statement.
 *
 * The danger this module was written against is not a wrong number. It is a
 * right-looking one: an imported spreadsheet rendered like a ChivaGo
 * statement would be level 1 evidence wearing level 3's clothes.
 */

const YEAR = { from: '2026-01-01', to: '2026-12-31' };
const TODAY = '2026-09-26';

const row = (over: Partial<DeclaredRow> = {}): DeclaredRow => ({
  line: 1,
  activity: 'Beach cleanup',
  date: '2026-06-15',
  participants: 30,
  amount: 185,
  unit: 'kg',
  ...over,
});

describe('what an imported file is', () => {
  test('every review leads with the fact that nobody verified any of it', () => {
    const r = reviewDeclared([row()], YEAR, null, TODAY);
    assert.equal(r.standing, DECLARED_NOT_VERIFIED);
    assert.match(r.standing.en, /Nobody at ChivaGo verified any of it/);
    assert.match(r.standing.en, /level 1 evidence/);
    assert.match(r.standing.th, /ไม่มีใครที่ ChivaGo ตรวจสอบ/);
  });

  test('a clean file is clean, and is still not verified', () => {
    // THE DISTINCTION THE WHOLE MODULE EXISTS FOR. Nothing wrong on the face
    // of the file is not the same as true, and `clean` is named for what it
    // is rather than for what a reader would like it to mean.
    const r = reviewDeclared([row(), row({ line: 2, date: '2026-07-01' })], YEAR, null, TODAY);
    assert.deepEqual(r.findings, []);
    assert.equal(r.clean, 2);
    assert.match(r.standing.en, /does not make it true/);
  });

  test('the shape has nowhere to put a digest or a verify link', () => {
    // A review must not be able to grow into something that looks issued.
    const r = reviewDeclared([row()], YEAR, null, TODAY);
    assert.deepEqual(Object.keys(r).sort(), ['clean', 'findings', 'rows', 'standing']);
  });
});

describe('what can be checked without seeing one photograph', () => {
  test('a date outside the period the report claims', () => {
    const r = reviewDeclared([row(), row({ line: 2, date: '2025-11-02' })], YEAR, null, TODAY);
    const f = r.findings.find((x) => x.kind === 'outside_period')!;
    assert.deepEqual(f.lines, [2]);
    assert.match(f.detail.en, /lifetime-to-date figure inside a fiscal-year report/);
  });

  test('a row with no readable date is in no period, including this one', () => {
    const r = reviewDeclared([row({ date: null })], YEAR, null, TODAY);
    assert.ok(r.findings.some((f) => f.kind === 'no_date'));
    assert.equal(r.clean, 0);
  });

  test('a date after today', () => {
    const r = reviewDeclared([row({ date: '2026-12-01' })], YEAR, null, TODAY);
    assert.ok(r.findings.some((f) => f.kind === 'future_date'));
  });

  test('the same activity, day and figures on two rows is a QUESTION, not a deletion', () => {
    // Either a real repeat nobody distinguished or a paste that happened
    // twice. The file cannot say which, so the review does not choose.
    const r = reviewDeclared([row(), row({ line: 2 })], YEAR, null, TODAY);
    const f = r.findings.find((x) => x.kind === 'duplicate_row')!;
    assert.deepEqual(f.lines, [1, 2]);
    assert.match(f.detail.en, /the file cannot say which/);
    assert.equal(r.rows, 2, 'a row was removed rather than reported');
  });

  test('two units in one column means the total is not a number', () => {
    const r = reviewDeclared(
      [row(), row({ line: 2, unit: 'tonnes', amount: 0.2 })], YEAR, null, TODAY,
    );
    const f = r.findings.find((x) => x.kind === 'unit_mismatch')!;
    assert.match(f.detail.en, /A total across them is not a number/);
  });

  test('A STATED TOTAL THAT ITS OWN ROWS DO NOT ADD UP TO', () => {
    // The finding an assurer opens with, found before anybody signs.
    const r = reviewDeclared([row({ amount: 185 }), row({ line: 2, amount: 90, date: '2026-07-02' })],
      YEAR, 400, TODAY);
    const f = r.findings.find((x) => x.kind === 'total_mismatch')!;
    assert.deepEqual(f.lines, [], 'a whole-file finding was pinned to rows');
    assert.match(f.detail.en, /states 400 and its own rows add up to 275/);
  });

  test('no stated total is not a finding, because plenty of reports have none', () => {
    const r = reviewDeclared([row()], YEAR, null, TODAY);
    assert.ok(!r.findings.some((f) => f.kind === 'total_mismatch'));
  });

  test('rounding does not manufacture a mismatch', () => {
    const r = reviewDeclared([row({ amount: 0.1 }), row({ line: 2, amount: 0.2, date: '2026-07-02' })],
      YEAR, 0.3, TODAY);
    assert.ok(!r.findings.some((f) => f.kind === 'total_mismatch'));
  });

  test('a figure with no activity named cannot be checked by anybody', () => {
    const r = reviewDeclared([row({ activity: '   ' })], YEAR, null, TODAY);
    assert.ok(r.findings.some((f) => f.kind === 'no_activity'));
  });

  test('one row can carry more than one finding, and is counted unclean once', () => {
    const r = reviewDeclared([row({ activity: '', date: null })], YEAR, null, TODAY);
    assert.equal(r.findings.length, 2);
    assert.equal(r.clean, 0);
    assert.equal(r.rows, 1);
  });

  test('an empty file is a review of nothing, not an error', () => {
    const r = reviewDeclared([], YEAR, null, TODAY);
    assert.deepEqual([r.rows, r.clean, r.findings.length], [0, 0, 0]);
  });
});

describe('reading a pasted sheet', () => {
  test('columns are matched by NAME, in any order', () => {
    // A parser that assumed the third column was the date would silently
    // review the wrong numbers, which is worse than refusing the file.
    const sheet = parseDeclaredCsv(
      'unit,amount,date,activity\nkg,185,2026-06-15,Beach cleanup',
    );
    assert.deepEqual(sheet.missing, []);
    assert.deepEqual(
      [sheet.rows[0]!.activity, sheet.rows[0]!.date, sheet.rows[0]!.amount, sheet.rows[0]!.unit],
      ['Beach cleanup', '2026-06-15', 185, 'kg'],
    );
  });

  test('Thai headers are read too, because the file was written in Thai', () => {
    const sheet = parseDeclaredCsv('กิจกรรม,วันที่,ผู้เข้าร่วม,น้ำหนัก,หน่วย\nเก็บขยะชายหาด,15/06/2026,30,185,กก');
    assert.equal(sheet.rows[0]!.activity, 'เก็บขยะชายหาด');
    assert.equal(sheet.rows[0]!.date, '2026-06-15', 'a Thai Excel date was not read');
    assert.equal(sheet.rows[0]!.participants, 30);
  });

  test('a file with no activity or date column is refused, not guessed at', () => {
    const sheet = parseDeclaredCsv('amount,unit\n185,kg');
    assert.deepEqual(sheet.rows, []);
    assert.deepEqual(sheet.missing.sort(), ['activity', 'date']);
  });

  test('quotes and commas inside a cell survive', () => {
    const sheet = parseDeclaredCsv('activity,date\n"Cleanup, Chaweng",2026-06-15');
    assert.equal(sheet.rows[0]!.activity, 'Cleanup, Chaweng');
  });

  test('a thousands separator is a number, and a word is not', () => {
    const sheet = parseDeclaredCsv('activity,date,amount\nA,2026-06-15,"1,250"\nB,2026-06-16,about 90');
    assert.equal(sheet.rows[0]!.amount, 1250);
    assert.equal(sheet.rows[1]!.amount, null, 'a word was read as a number');
  });

  test('line numbers point at the file, header row included', () => {
    const sheet = parseDeclaredCsv('activity,date\nA,2026-06-15\nB,2026-06-16');
    assert.deepEqual(sheet.rows.map((r) => r.line), [2, 3]);
  });

  test('an unreadable date is null rather than a guess', () => {
    // Guessing between 06/07 as June and July is how a report moves a month.
    const sheet = parseDeclaredCsv('activity,date\nA,last summer');
    assert.equal(sheet.rows[0]!.date, null);
  });
});
