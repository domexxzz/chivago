import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import {
  STUDENT_CONSENT, STUDENT_YEARS, STUDENT_YEAR_LABEL, facultiesOf, facultyBands, facultyName, isStudentProfile,
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
  const bands = (o: Record<string, number>) => facultyBands(Object.entries(o).map(([key, count]) => ({ key, count })));

  test('nothing at all until twenty people have taken part', () => {
    assert.equal(bands({ a: 19 }), null);
    assert.equal(bands({}), null);
    assert.ok(bands({ a: 20 }));
  });

  test('a band, never a count: one more person changes nothing most of the time', () => {
    assert.deepEqual(bands({ a: 21, b: 12 }), { bands: [{ key: 'a', from: 20, to: 24 }, { key: 'b', from: 10, to: 14 }], others: false });
    assert.deepEqual(bands({ a: 22, b: 12 }), bands({ a: 21, b: 12 }));
  });

  test('a small faculty is not named', () => {
    const shown = bands({ a: 30, b: 4, c: 3 })!;
    assert.deepEqual(shown, { bands: [{ key: 'a', from: 30, to: 34 }], others: true });
  });

  test('one small group takes the next smallest with it, so a total gives nothing away', () => {
    assert.deepEqual(bands({ a: 40, b: 12, c: 2 }), { bands: [{ key: 'a', from: 40, to: 44 }], others: true });
    assert.deepEqual(bands({ a: 40, c: 2 }), { bands: [], others: true });
  });
});
