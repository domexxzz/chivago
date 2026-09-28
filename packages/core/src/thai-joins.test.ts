import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Thai strings broken across source lines, checked where they are broken.
 *
 * Long bilingual copy in this package is written as a string literal split
 * over several lines with `' + '`. In English a space at the join is always
 * right, because English separates every word with a space. In Thai a space
 * marks a PHRASE break - so a space left at a join that falls in the middle
 * of a phrase tears the sentence in two.
 *
 * Twelve of those shipped in the first two indicator rules (#83, #86), and four
 * more were written into the third before it merged. No test caught them, and
 * neither did `scripts/thai-review.mjs`: it compares
 * English against Thai pair by pair, and a concatenated literal never reaches
 * it as one string, so the one place this defect lives is the one place that
 * checker cannot see. A Thai reader caught them.
 *
 * Thai spaces cannot simply be forbidden - they separate clauses, and most of
 * the joins in this package are correct. What can be forbidden is a join that
 * leaves a space directly after a word that BINDS to what follows it, or
 * lands the comparative at the start of a new piece. Those are the shapes
 * that shipped. This does not replace reading the Thai; it stops these
 * particular shapes coming back.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const TH = '[\\u0E00-\\u0E7F]';

// A Thai literal ending in a binding word and a space, joined with + to a
// literal that starts with Thai. The word is torn from the phrase it opens.
const BINDING_JOIN = new RegExp(
  `(ของ|เป็น|ซึ่ง|เพราะ|ไม่ใช่|ว่า) (['\`])\\s*\\n\\s*\\+\\s*(['\`])${TH}`, 'g',
);
// A join that puts the comparative at the start of the next piece.
const COMPARATIVE_JOIN = new RegExp(` (['\`])\\s*\\n\\s*\\+\\s*(['\`])กว่า`, 'g');

const sources = (): { name: string; text: string }[] =>
  readdirSync(HERE)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((name) => ({ name, text: readFileSync(join(HERE, name), 'utf8') }));

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

describe('Thai joins in the source of this package', () => {
  test('it reads the package it is meant to guard', () => {
    // A guard that silently read no files would pass for ever.
    const names = sources().map((s) => s.name);
    assert.ok(names.length > 20, `only ${names.length} source files were read`);
    assert.ok(names.includes('indicator.ts'));
    assert.ok(names.includes('adjustment.ts'));
  });

  test('NO JOIN TEARS A WORD FROM THE PHRASE IT OPENS', () => {
    const found: string[] = [];
    for (const { name, text } of sources()) {
      for (const m of text.matchAll(BINDING_JOIN)) {
        found.push(`${name}:${lineOf(text, m.index!)} after "${m[1]}"`);
      }
    }
    assert.deepEqual(found, [], `a Thai phrase is split at a line join:\n${found.join('\n')}`);
  });

  test('no join splits a comparative from its adjective', () => {
    const found: string[] = [];
    for (const { name, text } of sources()) {
      for (const m of text.matchAll(COMPARATIVE_JOIN)) found.push(`${name}:${lineOf(text, m.index!)}`);
    }
    assert.deepEqual(found, [], found.join('\n'));
  });

  test('the patterns catch the shapes that shipped', () => {
    // Proof neither pattern is vacuous, using the joins as they were written.
    const shipped = [
      "'ครอบคลุมขยะที่เกิดจากกิจกรรมของ '\n            + 'องค์กรเอง'",
      "'ซึ่งไม่เท่ากับการยืนยันว่า '\n          + 'การจัดวางนั้นถูกต้อง'",
      "'GRI 3 ข้อ 3-3 ซึ่ง '\n        + 'มาตรฐานนี้กำหนด'",
    ];
    for (const s of shipped) {
      assert.ok([...s.matchAll(BINDING_JOIN)].length === 1, s);
    }
    assert.ok([..."'ว่ามีการตีความที่แคบ '\n        + 'กว่านี้หรือไม่'".matchAll(COMPARATIVE_JOIN)].length === 1);
  });

  test('a join at a clause boundary is left alone', () => {
    // A space before "และ" or "ซึ่ง", or at a sentence end, is correct Thai.
    for (const ok of [
      "'การจัดการวัสดุไม่ใช่การก่อขยะ '\n      + 'การรายงานไว้ตรงนี้'",
      "'แสดงว่าร่วมกัน '\n    + 'ไม่ใช่ของฝ่ายใดฝ่ายเดียว'",
      "'ในรายงานของตน '\n    + 'และถูกบันทึกไว้'",
    ]) {
      assert.equal([...ok.matchAll(BINDING_JOIN)].length, 0, ok);
    }
  });
});
