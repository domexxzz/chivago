import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { statementCsv, statementPdf, statementPdfLines } from './statement-export.ts';
import type { ActivityStatement } from './statement.ts';

const statement: ActivityStatement = {
  id: 'CG-2026-7H3K9M',
  digest: 'ab'.repeat(32),
  host: { id: 'municipality', name: 'Samui Municipality', type: 'municipality' },
  period: { from: '2026-08-01', to: '2026-08-31' },
  issuedAt: '2026-09-01T02:00:00.000Z',
  issuedBy: 'K. Somchai',
  lines: [
    { questId: 'q1', name: { en: 'Beach Cleanup, "Chaweng"', th: 'เก็บขยะชายหาด' }, pillar: 'environmental', day: '2026-08-12', verified: 14, weightKg: 62.5 },
    { questId: 'q4', name: { en: 'Walk, don\'t ride', th: 'เดินแทนการใช้รถ' }, pillar: null, day: '2026-08-20', verified: 3, weightKg: null },
  ],
  verified: 17,
  participants: 15,
  refused: 2,
  weightKg: 62.5,
  assurance: { en: 'Verified by the host, not an accredited assurer.', th: 'x' },
  boundary: { en: 'Activity only; no building measured.', th: 'x' },
  notClaimable: [{ en: 'A carbon figure.', th: 'x' }],
};

describe('the statement as a spreadsheet', () => {
  const csv = statementCsv(statement, 'https://api.example');
  const rows = csv.replace(/^﻿/, '').split('\r\n');

  test('one row per line, with the Thai beside the English and the quotes escaped', () => {
    assert.equal(rows[0], 'statement_id,host,period_from,period_to,day,quest_id,activity_en,activity_th,pillar,verified,weight_kg');
    assert.equal(rows[1], 'CG-2026-7H3K9M,Samui Municipality,2026-08-01,2026-08-31,2026-08-12,q1,"Beach Cleanup, ""Chaweng""",เก็บขยะชายหาด,environmental,14,62.5');
    assert.equal(rows[2], "CG-2026-7H3K9M,Samui Municipality,2026-08-01,2026-08-31,2026-08-20,q4,Walk, don't ride,เดินแทนการใช้รถ,,3,".replace("Walk, don't ride", '"Walk, don\'t ride"'));
  });

  test('the totals, the digest and where to check it are in the file, so a forwarded copy still points home', () => {
    assert.ok(rows.includes('total_verified,17'));
    assert.ok(rows.includes('distinct_participants,15'));
    assert.ok(rows.includes(`digest_sha256,${'ab'.repeat(32)}`));
    assert.ok(rows.includes('verify_url,https://api.example/verify/CG-2026-7H3K9M'));
    assert.ok(csv.startsWith('﻿'), 'a byte-order mark, so Excel reads the Thai');
  });

  test('nobody is in it', () => {
    assert.doesNotMatch(csv, /user|u1|somebody@/i);
  });
});

describe('the statement as a PDF', () => {
  const bytes = statementPdf(statement, 'https://api.example');
  const text = Buffer.from(bytes).toString('latin1');

  test('is a PDF a reader will open: header, objects, an xref whose offsets land on the objects, a trailer', () => {
    assert.ok(text.startsWith('%PDF-1.4'));
    assert.ok(text.endsWith('%%EOF\n'));
    const xrefAt = Number(/startxref\n(\d+)\n/.exec(text)![1]);
    assert.equal(text.slice(xrefAt, xrefAt + 4), 'xref');
    const entries = [...text.slice(xrefAt).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    assert.ok(entries.length >= 5, 'fonts, a page, its content, the pages, the catalog');
    entries.forEach((offset, i) => {
      assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `xref entry ${i + 1} points at byte ${offset}, which is not that object`);
    });
  });

  test('says the id, the totals, the digest and the verify URL, and that the Thai is in the record', () => {
    for (const needle of ['CG-2026-7H3K9M', 'Verified: 17', 'ab'.repeat(32), 'https://api.example/verify/CG-2026-7H3K9M', 'the Thai is in the record']) {
      assert.ok(text.includes(needle), `missing: ${needle}`);
    }
  });

  test('parentheses in a line do not break the syntax', () => {
    assert.ok(text.includes('(environmental)') === false && text.includes('\\(environmental\\)'));
  });

  test('a long statement paginates, and every page is numbered', () => {
    const long = { ...statement, lines: Array.from({ length: 120 }, (_, i) => ({ ...statement.lines[0]!, day: `2026-08-${String((i % 28) + 1).padStart(2, '0')}` })) };
    assert.ok(statementPdfLines(long, 'x').length > 100);
    const t2 = Buffer.from(statementPdf(long, 'https://api.example')).toString('latin1');
    assert.ok(/\/Count 3/.test(t2), 'three pages');
    assert.ok(t2.includes('page 3 of 3'));
  });
});
