import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { analyse, collectPairs } from './lib/thai-pairs.mjs';
import { applyCorrections } from './thai-apply.mjs';

/**
 * The Thai review tooling, against a source tree built for the test.
 *
 * The checks are heuristics and the apply step rewrites source files, so
 * both deserve a fixture that exercises the edges: an interpolation that must
 * NOT read as English left in, a dropped number that must, a phrase rendered
 * two ways, and a correction whose target has moved.
 */

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'chivago-thai-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'strings.ts'), [
    "const t = (en: string, th: string) => ({ en, th });",
    "export const s = {",
    "  fine: t('Check in here', 'เช็กอินที่นี่'),",
    "  layer: t(`Scores ${n} today`, `วันนี้ได้ ${n} คะแนน`),",
    "  dropped: t(`You need ${m} more points`, 'คุณต้องการแต้มเพิ่ม'),",
    "  latin: t('Open the map', 'เปิด map'),",
    "  code: { en: 'Code: ${s.layer}', th: 'รหัส: ${s.layer}' },",
    "  a: t('Weekend', 'สุดสัปดาห์'),",
    "  b: t('Weekend', 'วันหยุด'),",
    "  digits: t('1669', '1669'),",
    "};",
  ].join('\n'));
  return root;
}

describe('collecting and checking', () => {
  const root = fixtureRoot();
  const pairs = collectPairs(root, ['src']);
  const findings = analyse(pairs);
  const kinds = (en) => findings.filter((f) => f.en === en).map((f) => f.kind);

  test('every pair is found, in source order, with its line', () => {
    assert.equal(pairs.length, 8);
    assert.equal(pairs[0].en, 'Check in here');
    assert.equal(pairs[0].line, 3);
  });

  test('a dropped interpolation is the unambiguous error', () => {
    assert.deepEqual(kinds('You need ${m} more points'), ['lost-value']);
  });

  test('an interpolation is code, not English left in', () => {
    // `${s.layer}` used to be reported as "untranslated: layer" - most of the
    // noise in the first version of this check.
    assert.deepEqual(kinds('Code: ${s.layer}'), []);
    assert.deepEqual(kinds('Scores ${n} today'), []);
  });

  test('a real English word inside the Thai is flagged', () => {
    assert.deepEqual(kinds('Open the map'), ['english-left-in']);
  });

  test('one phrase rendered two ways is flagged once, naming both', () => {
    const inc = findings.filter((f) => f.kind === 'inconsistent');
    assert.equal(inc.length, 1);
    assert.equal(inc[0].variants.length, 2);
  });

  test('a string of digits is the same in both languages and is not "not Thai"', () => {
    assert.deepEqual(kinds('1669'), []);
  });
});

const pair = (en, th) => ({ id: `${en}|${th}`, file: 'src/strings.ts', line: 1, en, th, thQuote: "'", context: '' });

describe('what the checker has learned not to flag', () => {
  test('a {slot} in a notification template is code, not English left in', () => {
    const findings = analyse([pair('{host} approved {quest}.', '{host} อนุมัติ {quest} แล้ว')]);
    assert.deepEqual(findings.filter((f) => f.kind === 'english-left-in'), []);
  });

  test('a reporting standard\'s initials stay as they are', () => {
    const findings = analyse([pair('Not assured under ISAE 3000.', 'ไม่ได้รับรองตาม ISAE 3000'), pair('ESG report', 'รายงาน ESG')]);
    assert.deepEqual(findings.filter((f) => f.kind === 'english-left-in'), []);
  });

  test('a template that is nothing but interpolations carries its Thai in the values', () => {
    const findings = analyse([pair('${preset.en} — ${note}', '${preset.th} — ${note}')]);
    assert.deepEqual(findings.filter((f) => f.kind === 'not-thai'), []);
  });

  test('a second rendering marked intentional is a decision, not drift', () => {
    const a = { ...pair('Good evening', 'สวัสดีตอนเย็น'), line: 1 };
    const b = { ...pair('Good evening', 'สวัสดีตอนค่ำ'), line: 2, intentional: true };
    assert.deepEqual(analyse([a, b]).filter((f) => f.kind === 'inconsistent'), []);
    const c = { ...pair('Good evening', 'สวัสดีตอนค่ำ'), line: 2 };
    assert.equal(analyse([a, c]).filter((f) => f.kind === 'inconsistent').length, 1, 'unmarked, it is still drift');
  });
});

describe('writing corrections back', () => {
  test('a correction lands on its literal and keeps the quote style', () => {
    const root = fixtureRoot();
    const { applied, refused } = applyCorrections(root, [
      { file: 'src/strings.ts', line: 6, th: 'เปิด map', newTh: 'เปิดแผนที่' },
    ]);
    assert.equal(applied.length, 1);
    assert.equal(refused.length, 0);
    const after = readFileSync(join(root, 'src', 'strings.ts'), 'utf8').split('\n')[5];
    assert.equal(after, "  latin: t('Open the map', 'เปิดแผนที่'),");
  });

  test('a correction whose original has moved is refused, and nothing is written', () => {
    const root = fixtureRoot();
    const before = readFileSync(join(root, 'src', 'strings.ts'), 'utf8');
    const { applied, refused } = applyCorrections(root, [
      { file: 'src/strings.ts', line: 3, th: 'ข้อความที่ไม่มี', newTh: 'อะไรก็ได้' },
    ]);
    assert.equal(applied.length, 0);
    assert.match(refused[0].why, /no longer on that line/);
    assert.equal(readFileSync(join(root, 'src', 'strings.ts'), 'utf8'), before);
  });

  test('a correction with no Thai in it is refused', () => {
    const root = fixtureRoot();
    const { refused } = applyCorrections(root, [
      { file: 'src/strings.ts', line: 3, th: 'เช็กอินที่นี่', newTh: 'Check in here' },
    ]);
    assert.match(refused[0].why, /no Thai/);
  });

  test('an apostrophe in the correction is escaped, not rejected', () => {
    const root = fixtureRoot();
    const { applied } = applyCorrections(root, [
      { file: 'src/strings.ts', line: 3, th: 'เช็กอินที่นี่', newTh: "เช็กอิน 'ที่นี่'" },
    ]);
    assert.equal(applied.length, 1);
    const after = readFileSync(join(root, 'src', 'strings.ts'), 'utf8').split('\n')[2];
    assert.equal(after, "  fine: t('Check in here', 'เช็กอิน \\'ที่นี่\\''),");
  });

  test('a template literal is edited in a template literal', () => {
    const root = fixtureRoot();
    const { applied } = applyCorrections(root, [
      { file: 'src/strings.ts', line: 4, th: 'วันนี้ได้ ${n} คะแนน', newTh: 'วันนี้ได้ ${n} แต้ม' },
    ]);
    assert.equal(applied.length, 1);
    const after = readFileSync(join(root, 'src', 'strings.ts'), 'utf8').split('\n')[3];
    assert.equal(after, '  layer: t(`Scores ${n} today`, `วันนี้ได้ ${n} แต้ม`),');
  });
});
