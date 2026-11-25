import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import {
  STUDENT_CONSENT, STUDENT_YEARS, STUDENT_YEAR_LABEL, facultiesOf, facultyName, hideSmallGroups, isStudentProfile,
} from './student.ts';

describe('a faculty and a year', () => {
  test('RMUTT’s twelve, in three languages, each once', () => {
    const list = facultiesOf('rmutt');
    assert.equal(list.length, 12);
    assert.equal(new Set(list.map((f) => f.key)).size, 12);
    for (const f of list) assert.ok(f.name.en && f.name.th && f.name.zh, f.key);
    assert.equal(facultyName('rmutt', 'nursing')!.th, 'พยาบาลศาสตร์');
    assert.equal(facultyName('rmutt', 'toString'), null);
    assert.deepEqual(facultiesOf('koh-sichang'), []);
  });

  test('only what is listed is accepted', () => {
    assert.ok(isStudentProfile({ university: 'rmutt', faculty: 'science', year: '2' }));
    for (const bad of [
      null, 'science', {}, { university: 'rmutt', faculty: 'magic', year: '2' },
      { university: 'rmutt', faculty: 'science', year: '9' }, { university: 'rmutt', faculty: 'science', year: 2 },
      { university: 'koh-sichang', faculty: 'science', year: '2' }, { university: '__proto__', faculty: 'x', year: '1' },
    ]) assert.equal(isStudentProfile(bad), false, JSON.stringify(bad));
  });

  test('the words agreed to say what is kept, who sees it, and how to take it back', () => {
    assert.match(STUDENT_CONSENT.th, /คณะและชั้นปี/);
    assert.match(STUDENT_CONSENT.th, /ลบออกได้ทุกเมื่อ/);
    for (const y of STUDENT_YEARS) assert.ok(STUDENT_YEAR_LABEL[y].zh);
  });
});

describe('counts that are about a handful of people', () => {
  const groups = (o: Record<string, number>) => Object.entries(o).map(([key, count]) => ({ key, count }));

  test('five is shown and four is not', () => {
    assert.deepEqual(hideSmallGroups(groups({ a: 5, b: 4, c: 3 })), [
      { key: 'a', count: 5 }, { key: 'b', count: null }, { key: 'c', count: null },
    ]);
  });

  test('one hidden group takes the next smallest with it, so a total gives nothing away', () => {
    assert.deepEqual(hideSmallGroups(groups({ a: 40, b: 12, c: 2 })), [
      { key: 'a', count: 40 }, { key: 'b', count: null }, { key: 'c', count: null },
    ]);
  });

  test('a lone small group is hidden, and nobody is left out of nothing', () => {
    assert.deepEqual(hideSmallGroups(groups({ a: 2 })), [{ key: 'a', count: null }]);
    assert.deepEqual(hideSmallGroups(groups({ a: 0 })), []);
    assert.deepEqual(hideSmallGroups([]), []);
  });
});
