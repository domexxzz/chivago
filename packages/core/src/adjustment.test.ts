import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  ADJUSTMENT_CHANNEL_LABEL, ADJUSTMENT_LIMIT, CLAIM_STATE_LABEL, NOT_ARTICLE_SIX,
  adjustedClaimState, adjustmentApplies, adjustmentNote, claimingFundersAt,
  type ClaimAdjustment,
} from './adjustment.ts';
import { claimState, exclusivityNote, type Funder } from './claims.ts';

/**
 * Somebody standing down so somebody else can claim.
 *
 * The assertions that carry weight are the ones about what a stand-down does
 * NOT do: it does not create a claim, it does not hand a single-funder quest
 * to anybody, and it never lets the report say "funded by this partner alone"
 * about work a co-funder paid for.
 */

const JAN = '2026-01-01T00:00:00.000Z';
const JUN = '2026-06-01T00:00:00.000Z';
const DEC = '2026-12-01T00:00:00.000Z';

const funder = (id: string, startedAt = JAN): Funder => ({ sponsorId: id, startedAt });

const adj = (over: Partial<ClaimAdjustment> = {}): ClaimAdjustment => ({
  id: 'a1',
  orgId: 'org-ptt',
  questId: 'q1',
  effectiveFrom: JAN,
  reason: 'reported by our parent company instead',
  channel: 'entered_by_staff',
  recordedAt: JAN,
  recordedBy: 'Nok',
  resumedAt: null,
  resumedReason: null,
  voidedAt: null,
  voidedReason: null,
  ...over,
});

describe('when an adjustment applies', () => {
  test('from the effective instant, inclusive', () => {
    const a = adj({ effectiveFrom: JUN });
    assert.equal(adjustmentApplies(a, JAN), false);
    assert.equal(adjustmentApplies(a, JUN), true);
    assert.equal(adjustmentApplies(a, DEC), true);
  });

  test('RESUMING IS NOT RETROACTIVE', () => {
    // A partner who stood down for 2026 and claims again from 2027 has not
    // undone 2026 — a filing was made on it.
    const a = adj({ effectiveFrom: JAN, resumedAt: DEC });
    assert.equal(adjustmentApplies(a, JUN), true);
    assert.equal(adjustmentApplies(a, DEC), false);
  });

  test('VOIDING IS RETROACTIVE, BECAUSE A TYPO MUST NOT STRIP A CLAIM FOREVER', () => {
    const a = adj({ effectiveFrom: JAN, voidedAt: DEC });
    assert.equal(adjustmentApplies(a, JUN), false);
    assert.equal(adjustmentApplies(a, DEC), false);
  });

  test('voiding beats resuming, whatever the dates say', () => {
    const a = adj({ resumedAt: JUN, voidedAt: DEC });
    assert.equal(adjustmentApplies(a, JAN), false);
  });
});

describe('who is left claiming', () => {
  const two = [funder('org-siam'), funder('org-ptt')];

  test('a stand-down removes exactly one name', () => {
    assert.deepEqual(claimingFundersAt(two, [adj()], JUN), ['org-siam']);
  });

  test('A STAND-DOWN FROM A QUEST THEY NEVER FUNDED CHANGES NOTHING', () => {
    // There was no claim to give up.
    assert.deepEqual(
      claimingFundersAt(two, [adj({ orgId: 'org-someone-else' })], JUN).sort(),
      ['org-ptt', 'org-siam'],
    );
  });

  test('a partner who joined after the approval is not there to stand down', () => {
    const late = [funder('org-siam'), funder('org-ptt', DEC)];
    assert.deepEqual(claimingFundersAt(late, [adj()], JUN), ['org-siam']);
  });
});

describe('what the claim state becomes', () => {
  const two = [funder('org-siam'), funder('org-ptt')];

  test('co-funded with nobody standing down is still shared', () => {
    assert.equal(adjustedClaimState(two, [], JUN), 'shared');
  });

  test('one of two stands down, and the other is the sole claimant', () => {
    assert.equal(adjustedClaimState(two, [adj()], JUN), 'exclusive_by_adjustment');
  });

  test('SOLE CLAIMANT BY LETTER IS NOT THE SAME STATE AS SOLE FUNDER', () => {
    // The report is not allowed to lose this difference: "funded by this
    // partner alone" would be false about the second one.
    assert.equal(adjustedClaimState([funder('org-siam')], [], JUN), 'exclusive');
    assert.notEqual(
      adjustedClaimState(two, [adj()], JUN),
      adjustedClaimState([funder('org-siam')], [], JUN),
    );
  });

  test('EVERY FUNDER STANDING DOWN LEAVES IT CLAIMED BY NOBODY', () => {
    // Not exclusive for whoever asks first, and not `unfunded` either — it
    // was funded, and the funders gave it up.
    const both = [adj({ id: 'a1', orgId: 'org-siam' }), adj({ id: 'a2', orgId: 'org-ptt' })];
    assert.equal(adjustedClaimState(two, both, JUN), 'relinquished');
  });

  test('a lone funder standing down relinquishes rather than enriching anybody', () => {
    const solo = [funder('org-siam')];
    assert.equal(adjustedClaimState(solo, [adj({ orgId: 'org-siam' })], JUN), 'relinquished');
  });

  test('nobody funding it at all is still unfunded, not relinquished', () => {
    const late = [funder('org-siam', DEC)];
    assert.equal(adjustedClaimState(late, [], JUN), 'unfunded');
    assert.equal(adjustedClaimState(late, [adj({ orgId: 'org-siam' })], JUN), 'unfunded');
  });

  test('three funders, one stands down, still shared', () => {
    const three = [funder('a'), funder('b'), funder('c')];
    assert.equal(adjustedClaimState(three, [adj({ orgId: 'a' })], JUN), 'shared');
  });

  test('a voided adjustment leaves the state exactly as it was', () => {
    assert.equal(adjustedClaimState(two, [adj({ voidedAt: DEC })], JUN), 'shared');
  });

  test('it agrees with the unadjusted function when there is nothing to adjust', () => {
    for (const [funders, at] of [
      [two, JUN], [[funder('org-siam')], JUN], [[funder('org-siam', DEC)], JUN],
    ] as const) {
      assert.equal(adjustedClaimState(funders, [], at), claimState(funders, at));
    }
  });
});

describe('what the report is allowed to say', () => {
  test('THE STRONG SENTENCE IS NEVER USED FOR WORK A CO-FUNDER PAID FOR', () => {
    // The failure this guards: an adjustment quietly moves a co-funded
    // approval into the exclusive count, and the report then says it was
    // "funded by this partner alone".
    const note = exclusivityNote(0, 40, 9);
    assert.doesNotMatch(note.en, /Every one of these/);
    assert.match(note.en, /31 of these 40 approvals were funded by this partner alone/);
    assert.match(note.en, /A further 9 were co-funded/);
    assert.match(note.en, /not claiming them/);
  });

  test('it says who made the statement and that we did not witness it', () => {
    const note = exclusivityNote(0, 40, 9);
    assert.match(note.en, /not witnessed by ChivaGo/);
    assert.match(note.th, /ChivaGo ไม่ได้เป็นพยาน/);
  });

  test('shared work that is still shared is still reported as shared', () => {
    const note = exclusivityNote(5, 40, 9);
    assert.match(note.en, /The remaining 5 are still shared/);
    assert.match(note.th, /ที่เหลืออีก 5 รายการยังใช้ร่วมกันอยู่/);
  });

  test('ONE REMAINING SHARED APPROVAL IS SINGULAR', () => {
    // This sentence goes into a company's filing. "The remaining 1 are"
    // reads as something nobody proofread.
    assert.match(exclusivityNote(1, 40, 9).en, /The remaining 1 is still shared/);
  });

  test('NO ADJUSTMENTS MEANS THE OLD SENTENCES, WORD FOR WORD', () => {
    // Every caller written before stand-downs existed keeps saying exactly
    // what it said.
    assert.match(exclusivityNote(0, 40).en, /Every one of these 40 approvals was funded by this partner alone/);
    assert.match(exclusivityNote(9, 40).en, /9 of these 40 approvals were co-funded/);
    assert.match(exclusivityNote(0, 0).en, /nothing here is claimed by anybody/);
  });
});

describe('the borrowed name, handed back at the door', () => {
  test('IT SAYS IT IS NOT AN ARTICLE 6 ADJUSTMENT', () => {
    assert.match(NOT_ARTICLE_SIX.en, /borrowed from Article 6/);
    assert.match(NOT_ARTICLE_SIX.en, /Nothing of the kind happens here/);
    assert.match(NOT_ARTICLE_SIX.th, /ที่นี่ไม่มีสิ่งนั้นเกิดขึ้น/);
  });

  test('the limit says a stand-down creates nothing', () => {
    assert.match(ADJUSTMENT_LIMIT.en, /removes a claim; it never creates one/);
    assert.match(ADJUSTMENT_LIMIT.en, /does not move money/);
    assert.match(ADJUSTMENT_LIMIT.th, /ไม่ได้โยกย้ายเงิน/);
  });

  test('the channel says the partner did not enter it and we did not witness it', () => {
    const c = ADJUSTMENT_CHANNEL_LABEL.entered_by_staff;
    assert.match(c.en, /did not enter it here/);
    assert.match(c.en, /did not witness it/);
    assert.match(c.th, /ไม่ได้เป็นพยาน/);
  });
});

describe('the sentence on one adjustment', () => {
  const name = { en: 'PTT Green', th: 'ปตท. กรีน' };

  test('THE RELINQUISHING PARTNER IS THE SUBJECT, NEVER CHIVAGO', () => {
    const note = adjustmentNote(adj(), name);
    assert.match(note.en, /^PTT Green states it is not claiming/);
    assert.match(note.en, /it did not witness it/);
    assert.match(note.th, /^ปตท. กรีน ระบุว่า/);
  });

  test('it never implies the other partner agreed', () => {
    assert.match(adjustmentNote(adj(), name).en, /has not asked any other partner whether they agree/);
  });

  test('an open stand-down reads as onwards, a resumed one names the date', () => {
    assert.match(adjustmentNote(adj(), name).en, /from 2026-01-01 onwards/);
    assert.match(adjustmentNote(adj({ resumedAt: DEC }), name).en, /until 2026-12-01/);
  });

  test('a voided one says it never applied', () => {
    const note = adjustmentNote(adj({ voidedAt: DEC }), name);
    assert.match(note.en, /never applied to any approval/);
    assert.match(note.en, /kept visible because it was once entered/);
  });
});

describe('the short labels', () => {
  test('every state has one in both languages, and they differ', () => {
    const seen = new Set<string>();
    for (const [k, label] of Object.entries(CLAIM_STATE_LABEL)) {
      assert.ok(label.en.length > 0 && label.th.length > 0, `${k} is missing a language`);
      assert.ok(!seen.has(label.en), `${k} reuses ${label.en}`);
      seen.add(label.en);
    }
  });

  test('THE TWO EXCLUSIVE LABELS DO NOT READ THE SAME AT A GLANCE', () => {
    assert.match(CLAIM_STATE_LABEL.exclusive.en, /Sole funder/);
    assert.match(CLAIM_STATE_LABEL.exclusive_by_adjustment.en, /standing down/);
  });
});
