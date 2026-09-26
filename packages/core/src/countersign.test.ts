import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  CHANNEL_LABEL, COUNTERSIGNATURE_LIMIT, OPINION_LABEL, STANDARD_LABEL,
  isAssuranceOpinion, isAssuranceStandard, signatureNote, signatureStanding,
  type Countersignature,
} from './countersign.ts';

/**
 * Somebody else's opinion, carried without being made.
 *
 * Every assertion here is about the boundary between recording a claim and
 * endorsing one.
 */

const DIGEST = 'a3f9c1d4e8b27f0e';

const sig = (over: Partial<Countersignature> = {}): Countersignature => ({
  id: 'cs1',
  statementId: 'CG-2026-K7M2PQ',
  digest: DIGEST,
  signerName: 'Somsak Wattana',
  signerFirm: 'Andaman Assurance',
  standard: 'isae3000_limited',
  opinion: 'unmodified',
  scopeNote: null,
  channel: 'entered_by_staff',
  recordedAt: '2026-09-26T00:00:00.000Z',
  recordedBy: 'Nok',
  withdrawnAt: null,
  withdrawnReason: null,
  ...over,
});

describe('whether a signature applies to the record beside it', () => {
  test('the same digest, not withdrawn, applies', () => {
    assert.equal(signatureStanding(sig(), DIGEST), 'applies');
  });

  test('A SIGNATURE GIVEN FOR A DIFFERENT RECORD DOES NOT TRANSFER', () => {
    // A signature names the digest it was given. Without this it would
    // quietly follow whichever record it was displayed beside.
    assert.equal(signatureStanding(sig(), 'some-other-digest'), 'digest_mismatch');
  });

  test('the digest is checked BEFORE the withdrawal', () => {
    // A signature given for a different record was never this record's to
    // withdraw, and reporting it as withdrawn would imply it once applied.
    const s = sig({ withdrawnAt: '2026-10-01T00:00:00.000Z' });
    assert.equal(signatureStanding(s, 'another-digest'), 'digest_mismatch');
    assert.equal(signatureStanding(s, DIGEST), 'withdrawn');
  });

  test('a withdrawn conclusion is still on the record', () => {
    const s = sig({ withdrawnAt: '2026-10-01T00:00:00.000Z', withdrawnReason: 'scope changed' });
    assert.equal(signatureStanding(s, DIGEST), 'withdrawn');
    assert.match(signatureNote(s, 'withdrawn').en, /kept on the record because it was once given/);
  });
});

describe('what the platform says by carrying it', () => {
  test('THE SUBJECT OF THE SENTENCE IS THE SIGNER, NEVER US', () => {
    // Never "this statement is assured". The firm is the one making the
    // claim, so the firm is the grammatical subject.
    const said = signatureNote(sig(), 'applies');
    assert.ok(said.en.startsWith('Andaman Assurance states'), said.en);
    assert.match(said.en, /ChivaGo did not perform it/);
    assert.match(said.en, /has not verified the firm’s accreditation/);
    assert.match(said.th, /ChivaGo ไม่ได้เป็นผู้ปฏิบัติงาน/);
  });

  test('the limit ships with every signature, including the clean ones', () => {
    assert.match(COUNTERSIGNATURE_LIMIT.en, /records this conclusion; it does not make it/);
    assert.match(COUNTERSIGNATURE_LIMIT.en, /does not .*change any figure/s);
    assert.match(COUNTERSIGNATURE_LIMIT.th, /ไม่ได้เปลี่ยนตัวเลขใดในเอกสาร/);
  });

  test('a mismatched signature says so plainly rather than being hidden', () => {
    assert.match(signatureNote(sig(), 'digest_mismatch').en, /signed a different version/);
    assert.match(signatureNote(sig(), 'digest_mismatch').th, /ไม่ครอบคลุมเอกสารฉบับนี้/);
  });

  test('the channel says the signer did not type it here', () => {
    assert.match(CHANNEL_LABEL.entered_by_staff.en, /The signer did not enter it here/);
    assert.match(CHANNEL_LABEL.entered_by_staff.th, /ผู้ลงนามไม่ได้เป็นผู้กรอกในระบบนี้/);
  });
});

describe('the vocabulary', () => {
  test('ALL FOUR OPINIONS EXIST, INCLUDING THE THREE NOBODY WANTS', () => {
    // A platform that only modelled `unmodified` would be one where a
    // qualified opinion had nowhere to go, which is how a qualification
    // quietly becomes a clean one.
    for (const o of ['unmodified', 'modified', 'adverse', 'disclaimer'] as const) {
      assert.ok(OPINION_LABEL[o].en.length > 0);
      assert.ok(OPINION_LABEL[o].th.length > 0);
      assert.equal(isAssuranceOpinion(o), true);
    }
    assert.equal(isAssuranceOpinion('clean'), false);
  });

  test('an engagement that was not ISAE 3000 can say so', () => {
    // Otherwise a signer picks the nearest label and the record overstates
    // what was performed.
    assert.equal(isAssuranceStandard('other'), true);
    assert.match(STANDARD_LABEL.other.en, /stated by the signer/);
    assert.equal(isAssuranceStandard('iso14064'), false);
  });

  test('an adverse conclusion reads as adverse in the sentence', () => {
    assert.match(signatureNote(sig({ opinion: 'adverse' }), 'applies').en, /adverse conclusion/);
    assert.match(signatureNote(sig({ opinion: 'adverse' }), 'applies').th, /ไม่ถูกต้อง/);
  });
});
