import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  DISCLOSURE_LABEL, DISCLOSURE_PHRASE, DOUBLE_COUNTING_BOUNDARY, USE_LIMIT,
  contestedNote, declaringOrgs, isDisclosureKind, standingUses, useNote, useStanding,
  type StatementUse,
} from './statement-use.ts';

/**
 * Making a second use visible without pretending to have prevented it.
 *
 * The assertions that matter here are the negative ones: what the module
 * declines to conclude from the absence of a declaration, and what it declines
 * to conclude from the presence of two.
 */

const DIGEST = 'a3f9c1d4e8b27f0e';

const use = (over: Partial<StatementUse> = {}): StatementUse => ({
  id: 'u1',
  statementId: 'CG-2026-K7M2PQ',
  digest: DIGEST,
  orgId: 'org-siam',
  orgName: { en: 'Siam Retail', th: 'สยามรีเทล' },
  kind: 'one_report',
  reportingYear: 2026,
  placeNote: null,
  declaredAt: '2026-09-27T00:00:00.000Z',
  declaredBy: 'Nok',
  withdrawnAt: null,
  withdrawnReason: null,
  ...over,
});

describe('whether a declaration is about the record beside it', () => {
  test('the same digest, not withdrawn, applies', () => {
    assert.equal(useStanding(use(), DIGEST), 'applies');
  });

  test('A DECLARATION ABOUT DIFFERENT BYTES DOES NOT TRANSFER', () => {
    assert.equal(useStanding(use(), 'other-digest'), 'digest_mismatch');
  });

  test('the digest is checked BEFORE the withdrawal', () => {
    // Same reason as signatureStanding: a declaration about a different
    // record was never this record's to withdraw, and calling it withdrawn
    // would imply it once applied here.
    const u = use({ withdrawnAt: '2026-10-01T00:00:00.000Z' });
    assert.equal(useStanding(u, 'other-digest'), 'digest_mismatch');
    assert.equal(useStanding(u, DIGEST), 'withdrawn');
  });

  test('a withdrawn declaration stays on the record', () => {
    const u = use({ withdrawnAt: '2026-10-01T00:00:00.000Z', withdrawnReason: 'report never filed' });
    assert.match(useNote(u, 'withdrawn').en, /kept because it was once made/);
    assert.match(useNote(u, 'withdrawn').th, /เคยมีการแจ้งไว้จริง/);
  });
});

describe('which declarations stand', () => {
  test('a mismatched digest and a withdrawal are both excluded', () => {
    const list = [
      use({ id: 'a' }),
      use({ id: 'b', digest: 'stale' }),
      use({ id: 'c', withdrawnAt: '2026-10-01T00:00:00.000Z' }),
    ];
    assert.deepEqual(standingUses(list, DIGEST).map((u) => u.id), ['a']);
  });

  test('nothing declared is not nothing used', () => {
    assert.deepEqual(standingUses([], DIGEST), []);
    // The absence has to carry its own caveat, because a reader will
    // otherwise supply the wrong one.
    assert.match(USE_LIMIT.en, /does not mean the statement went unused/);
    assert.match(USE_LIMIT.th, /ไม่ได้หมายความว่าเอกสารไม่ถูกนำไปใช้/);
  });
});

describe('counting by organisation, not by declaration', () => {
  test('ONE COMPANY DECLARING TWICE IS ONE ORGANISATION', () => {
    // A company naming the same statement in its One Report and again in its
    // own sustainability report is reporting its own activity twice. That is
    // its business, and it must not read as a contest.
    const list = [
      use({ id: 'a', kind: 'one_report' }),
      use({ id: 'b', kind: 'sustainability_report' }),
    ];
    assert.deepEqual(declaringOrgs(list, DIGEST), ['org-siam']);
    assert.equal(contestedNote(declaringOrgs(list, DIGEST).length), null);
  });

  test('two companies is what is worth seeing', () => {
    const list = [use({ id: 'a' }), use({ id: 'b', orgId: 'org-ptt', orgName: { en: 'PTT Green', th: 'ปตท. กรีน' } })];
    assert.deepEqual(declaringOrgs(list, DIGEST).sort(), ['org-ptt', 'org-siam']);
  });

  test('a withdrawn declaration does not keep an organisation in the count', () => {
    const list = [
      use({ id: 'a' }),
      use({ id: 'b', orgId: 'org-ptt', withdrawnAt: '2026-10-02T00:00:00.000Z' }),
    ];
    assert.deepEqual(declaringOrgs(list, DIGEST), ['org-siam']);
  });
});

describe('what a contest is and is not called', () => {
  test('one organisation gets no note at all', () => {
    assert.equal(contestedNote(0), null);
    assert.equal(contestedNote(1), null);
  });

  test('TWO ORGANISATIONS IS NOT CALLED WRONG', () => {
    // A co-funder and a host can each have reason to describe the same
    // activity. Calling that fraud would be as false as staying silent.
    const note = contestedNote(2)!;
    assert.match(note.en, /not by itself wrong/);
    assert.match(note.en, /this platform cannot tell you whether they do/);
    assert.match(note.th, /ไม่ได้ผิดในตัวเอง/);
  });

  test('the note says how many', () => {
    assert.match(contestedNote(3)!.en, /^3 organisations/);
    assert.match(contestedNote(3)!.th, /3 องค์กร/);
  });
});

describe('what a declaration attributes to whom', () => {
  test('THE DECLARER IS THE SUBJECT, NEVER CHIVAGO', () => {
    const note = useNote(use(), 'applies');
    assert.match(note.en, /^Siam Retail states it used/);
    assert.match(note.en, /ChivaGo has not read that report/);
    assert.match(note.th, /^สยามรีเทล ระบุว่า/);
  });

  test('the note never says the use was appropriate', () => {
    const note = useNote(use(), 'applies');
    assert.match(note.en, /is not saying the use was appropriate/);
    assert.match(note.th, /ไม่ได้ระบุว่าการนำไปใช้นั้นเหมาะสม/);
  });

  test('it names the declarer’s reporting year, not ours', () => {
    assert.match(useNote(use({ reportingYear: 2025 }), 'applies').en, /for 2025/);
  });

  test('every disclosure kind has both languages, as a label and in a sentence', () => {
    for (const kind of Object.keys(DISCLOSURE_LABEL)) {
      for (const map of [DISCLOSURE_LABEL, DISCLOSURE_PHRASE]) {
        const label = map[kind as keyof typeof map];
        assert.ok(label.en.length > 0, `${kind} has no English text`);
        assert.ok(label.th.length > 0, `${kind} has no Thai text`);
        assert.notEqual(label.en, label.th);
      }
    }
  });

  test('THE SENTENCE DOES NOT MANGLE A FILING’S NAME', () => {
    // Lowercasing a label to fit it into a sentence turned "56-1 One Report
    // filed with the SEC" into "...one report filed with the sec", on the one
    // page where a reader is deciding whether anybody checked anything.
    const note = useNote(use({ kind: 'one_report' }), 'applies');
    assert.match(note.en, /56-1 One Report/);
    assert.match(note.en, /SEC/);
    assert.doesNotMatch(note.en, /the sec\b/);
    assert.match(useNote(use({ kind: 'ifrs_s' }), 'applies').en, /IFRS S1 \/ S2/);
  });
});

describe('the three kinds of double counting', () => {
  test('ALL THREE ARE NAMED, AND SO IS WHICH ONE THIS COVERS', () => {
    // "We prevent double counting" means three different things, and a buyer
    // will hear whichever one they were worried about.
    const { en } = DOUBLE_COUNTING_BOUNDARY;
    assert.match(en, /Double issuance cannot arise here/);
    assert.match(en, /Double claiming at the funding step/);
    assert.match(en, /Double use/);
  });

  test('the boundary claims visibility, not prevention', () => {
    assert.match(DOUBLE_COUNTING_BOUNDARY.en, /only made VISIBLE/);
    assert.match(DOUBLE_COUNTING_BOUNDARY.en, /only when somebody declares/);
    assert.match(DOUBLE_COUNTING_BOUNDARY.th, /เห็นได้เฉพาะเมื่อมีผู้แจ้งเท่านั้น/);
  });

  test('nothing here describes this as retirement', () => {
    // A registry can retire a unit because it holds the unit. We hold a page
    // and a digest, and borrowing the word would borrow a guarantee.
    for (const text of [USE_LIMIT, DOUBLE_COUNTING_BOUNDARY, contestedNote(2)!]) {
      assert.doesNotMatch(text.en, /retire/i);
    }
  });
});

describe('isDisclosureKind', () => {
  test('accepts the five and nothing else', () => {
    for (const k of Object.keys(DISCLOSURE_LABEL)) assert.ok(isDisclosureKind(k));
    assert.equal(isDisclosureKind('carbon_credit'), false);
    assert.equal(isDisclosureKind(''), false);
    assert.equal(isDisclosureKind('ONE_REPORT'), false);
  });
});
