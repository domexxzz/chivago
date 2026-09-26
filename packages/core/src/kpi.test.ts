import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import {
  KPI_MEASURES, MEASURE, QUEST_MEASURES, isKpiMeasure, isQuestMeasure, kpiHeadline,
  kpiProgress, type QuestKpi,
} from './kpi.ts';

/**
 * The indicator a quest was agreed against.
 *
 * Almost every assertion here is about a refusal. The arithmetic is two
 * subtractions and a division.
 */

const kpi = (over: Partial<QuestKpi> = {}): QuestKpi =>
  ({ measure: 'weight_kg', baseline: null, target: null, ...over });

describe('the measures are a closed set, on purpose', () => {
  test('THERE IS NO FORMULA FIELD ANYWHERE IN THE SHAPE', () => {
    // A free-text formula is an invitation to write "attendees × 3.2 kg CO2e"
    // into a contract, and the platform would then print the product of a
    // number it measured and a coefficient it has never held. `esg.ts`
    // refuses that conversion in prose; a formula column reopens it as a
    // feature. The shape has nowhere to put one.
    const shape = kpi();
    assert.deepEqual(Object.keys(shape).sort(), ['baseline', 'measure', 'target']);
  });

  test('a measure outside the set is refused', () => {
    assert.equal(isKpiMeasure('weight_kg'), true);
    assert.equal(isKpiMeasure('carbon_tco2e'), false);
    assert.equal(isKpiMeasure(''), false);
  });

  test('every measure says where it comes from and what it is not', () => {
    for (const m of KPI_MEASURES) {
      const spec = MEASURE[m];
      for (const [key, value] of Object.entries(spec)) {
        assert.ok(value.en.length > 0, `${m}.${key} has no English`);
        assert.ok(value.th.length > 0, `${m}.${key} has no Thai`);
      }
    }
  });

  test('weight says it is not carbon, because that is the conversion people make', () => {
    assert.match(MEASURE.weight_kg.notThis.en, /Not a carbon figure/);
    assert.match(MEASURE.weight_kg.notThis.en, /factor this platform does not hold/);
    assert.match(MEASURE.weight_kg.notThis.th, /ไม่ใช่ตัวเลขคาร์บอน/);
  });

  test('submissions say they are not people, which is the other easy slip', () => {
    assert.match(MEASURE.verified_submissions.notThis.en, /Not people/);
  });
});

describe('progress against what was agreed', () => {
  test('with no baseline and no target, the figure stands alone', () => {
    const p = kpiProgress(kpi(), 185);
    assert.equal(p.observed, 185);
    assert.equal(p.movedBy, null);
    assert.equal(p.ofTarget, null);
    assert.match(kpiHeadline(p, 'en'), /185 kg measured\. No target was set\./);
    assert.match(kpiHeadline(p, 'th'), /ไม่ได้ตั้งเป้าหมายไว้/);
  });

  test('a baseline gives movement, and movement is not cause', () => {
    const p = kpiProgress(kpi({ baseline: 100 }), 185);
    assert.equal(p.movedBy, 85);
    assert.ok(
      p.notes.some((n) => /not attribution/.test(n.en)),
      'movement was reported without saying it is not attribution',
    );
  });

  test('with no baseline, nothing claims movement AND nothing claims cause', () => {
    const p = kpiProgress(kpi(), 185);
    assert.equal(p.movedBy, null);
    assert.ok(
      !p.notes.some((n) => /attribution/.test(n.en)),
      'an attribution note appeared where there was no movement to attribute',
    );
  });

  test('a target gives a share, uncapped above it', () => {
    assert.equal(kpiProgress(kpi({ target: 200 }), 185).ofTarget, 0.925);
    assert.equal(kpiProgress(kpi({ target: 200 }), 260).ofTarget, 1.3, 'beating the target was capped');
  });

  test('A TARGET OF ZERO IS NULL, NOT ZERO PER CENT', () => {
    // A share of nothing is not a number. Printing 0% would read as failure
    // rather than as a target nobody set properly.
    assert.equal(kpiProgress(kpi({ target: 0 }), 185).ofTarget, null);
  });

  test('the unit comes from the measure, so the two cannot drift', () => {
    assert.equal(kpiProgress(kpi({ measure: 'voucher_value_thb' }), 18_500).unit.th, 'บาท');
    assert.equal(kpiProgress(kpi({ measure: 'distinct_participants' }), 20).unit.en, 'people');
  });

  test('the headline leads with what was measured', () => {
    const p = kpiProgress(kpi({ measure: 'distinct_participants', target: 30 }), 20);
    const said = kpiHeadline(p, 'en');
    assert.ok(said.indexOf('20 people') < said.indexOf('30'), 'the target came before the measurement');
  });
});

describe('what a single quest can be measured by', () => {
  test('A QUEST CANNOT BE MEASURED IN BAHT, AND THAT IS NOT AN OMISSION', () => {
    // A voucher is issued against an OFFER and redeemed at a merchant.
    // Nothing joins it to the quest whose points paid for it, and inventing
    // that join would attribute a coffee to whichever cleanup happened to be
    // nearby. It stays a report-level indicator, where `communityValue`
    // produces it honestly.
    assert.equal(isQuestMeasure('voucher_value_thb'), false);
    assert.equal(isKpiMeasure('voucher_value_thb'), true, 'the measure itself is still real');
  });

  test('the three that are quest-scoped are, and nothing else is', () => {
    assert.deepEqual([...QUEST_MEASURES].sort(), [
      'distinct_participants', 'verified_submissions', 'weight_kg',
    ]);
    for (const m of QUEST_MEASURES) assert.ok(KPI_MEASURES.includes(m));
  });
});
