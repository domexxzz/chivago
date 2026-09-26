/**
 * The indicator a quest was agreed against.
 *
 * Section 3 of the framework note of 26 September asks every quest to carry
 * six things before it runs: a KPI, its unit, the formula, a baseline, a
 * target and a period. Five of those are here. The sixth is deliberately not.
 *
 * THERE IS NO FORMULA FIELD, AND THAT IS THE DESIGN. A free-text formula is
 * an invitation to write `attendees × 3.2 kg CO2e` into a partner's contract,
 * and this platform would then print the product of a number it measured and
 * a coefficient it has never held. `esg.ts` refuses exactly that conversion
 * in prose; a formula column would reopen it as a feature.
 *
 * So a KPI names one of a CLOSED SET of measures this platform can actually
 * produce from rows it already holds. A partner who needs something outside
 * the set does not get a text box; they get a conversation, and if the answer
 * is good the set grows by a commit that can be reviewed.
 *
 * THE BASELINE IS NOT A CLAIM OF CAUSE. Somewhere between the baseline and
 * the observed figure is whatever would have happened anyway, and nothing
 * here separates the two — the additionality `esg.ts` already refuses.
 * `kpiProgress` reports movement and says, every time, that movement is not
 * attribution.
 */

import type { Bilingual } from './types.ts';

/**
 * What this platform can measure, and nothing else.
 *
 * Each one traces to rows that already exist: approvals, the people behind
 * them, the weight a host recorded on a proof, and the face value of vouchers
 * a merchant scanned.
 */
export type KpiMeasure =
  | 'verified_submissions'
  | 'distinct_participants'
  | 'weight_kg'
  | 'voucher_value_thb';

export const KPI_MEASURES: readonly KpiMeasure[] = [
  'verified_submissions', 'distinct_participants', 'weight_kg', 'voucher_value_thb',
];

export const isKpiMeasure = (v: string): v is KpiMeasure =>
  (KPI_MEASURES as readonly string[]).includes(v);

/**
 * The subset a single QUEST can be agreed against.
 *
 * `voucher_value_thb` is missing and cannot be added. A voucher is issued
 * against an OFFER and redeemed at a merchant; nothing joins it to the quest
 * whose points paid for it, and inventing that join would attribute a
 * coffee to whichever cleanup happened to be nearby. It stays a report-level
 * indicator, where `communityValue` already produces it honestly.
 *
 * A partner who wants a quest measured in baht is asking for something this
 * platform cannot see. The answer is that sentence, not a column.
 */
export const QUEST_MEASURES: readonly KpiMeasure[] = [
  'verified_submissions', 'distinct_participants', 'weight_kg',
];

export const isQuestMeasure = (v: string): v is KpiMeasure =>
  (QUEST_MEASURES as readonly string[]).includes(v);

export interface MeasureSpec {
  /** The unit, fixed by the measure. Never typed in, so the two cannot drift. */
  unit: Bilingual;
  label: Bilingual;
  /** Where the number comes from, in one sentence. */
  source: Bilingual;
  /** The thing a reader would otherwise assume it was. */
  notThis: Bilingual;
}

export const MEASURE: Record<KpiMeasure, MeasureSpec> = {
  verified_submissions: {
    unit: { en: 'submissions', th: 'รายการ' },
    label: { en: 'Submissions a host verified', th: 'งานที่ผู้จัดตรวจแล้ว' },
    source: {
      en: 'Counted from approvals dated inside the period.',
      th: 'นับจากการอนุมัติที่ลงวันที่อยู่ในช่วงเวลาที่กำหนด',
    },
    notThis: {
      en: 'Not people: somebody who did three is three submissions and one person.',
      th: 'ไม่ใช่จำนวนคน คนที่ทำสามครั้งคือสามรายการและหนึ่งคน',
    },
  },
  distinct_participants: {
    unit: { en: 'people', th: 'คน' },
    label: { en: 'People who took part', th: 'จำนวนคนที่เข้าร่วม' },
    source: {
      en: 'Counted once each across every activity in the period.',
      th: 'นับคนละหนึ่งครั้งตลอดทุกกิจกรรมในช่วงเวลา',
    },
    notThis: {
      en: 'Not reach, and not attendance at anything nobody verified.',
      th: 'ไม่ใช่การเข้าถึง และไม่นับการเข้าร่วมที่ไม่มีใครตรวจ',
    },
  },
  weight_kg: {
    unit: { en: 'kg', th: 'กก' },
    label: { en: 'Weight recorded on approved proofs', th: 'น้ำหนักที่บันทึกบนหลักฐานที่ผ่าน' },
    source: {
      en: 'Summed from the weight a host entered when approving a proof.',
      th: 'รวมจากน้ำหนักที่ผู้จัดกรอกตอนอนุมัติหลักฐาน',
    },
    notThis: {
      en: 'Not a carbon figure. Converting kg to tCO2e needs a factor this platform does not hold.',
      th: 'ไม่ใช่ตัวเลขคาร์บอน การแปลงกิโลกรัมเป็น tCO2e ต้องใช้ค่าสัมประสิทธิ์ที่แพลตฟอร์มนี้ไม่มี',
    },
  },
  voucher_value_thb: {
    unit: { en: 'THB', th: 'บาท' },
    label: { en: 'Face value of vouchers a merchant scanned', th: 'มูลค่าหน้าคูปองที่ร้านค้ารับแล้ว' },
    source: {
      en: 'Summed from vouchers redeemed in the period, where the offer carried a price.',
      th: 'รวมจากคูปองที่ถูกใช้ในช่วงเวลา เฉพาะข้อเสนอที่ระบุราคาไว้',
    },
    notThis: {
      en: 'Not what the traveller spent, and not the merchant’s revenue.',
      th: 'ไม่ใช่ยอดที่นักเดินทางจ่ายจริง และไม่ใช่รายได้ของร้าน',
    },
  },
};

/** What a quest agreed to be measured by. Absent when nobody agreed one. */
export interface QuestKpi {
  measure: KpiMeasure;
  /** Where it stood before, or null when nobody recorded a starting point. */
  baseline: number | null;
  /** What was aimed at, or null when nothing was. */
  target: number | null;
}

export interface KpiProgress {
  measure: KpiMeasure;
  unit: Bilingual;
  observed: number;
  baseline: number | null;
  target: number | null;
  /** Observed minus baseline, or null without one. Movement, not cause. */
  movedBy: number | null;
  /**
   * Observed as a share of target, 0-1 and uncapped above it, or null without
   * a target. Null rather than 0 when the target is 0: a share of nothing is
   * not a number, and printing 0% would read as failure rather than as a
   * target nobody set properly.
   */
  ofTarget: number | null;
  /** Said with every figure. */
  notes: Bilingual[];
}

export function kpiProgress(kpi: QuestKpi, observed: number): KpiProgress {
  const spec = MEASURE[kpi.measure];
  const notes: Bilingual[] = [spec.source, spec.notThis];

  if (kpi.baseline !== null) {
    notes.push({
      en: 'Movement from the baseline is not attribution. Nothing here establishes '
        + 'what would have happened without this quest.',
      th: 'การเปลี่ยนแปลงจากค่าเริ่มต้นไม่ใช่การระบุสาเหตุ '
        + 'ไม่มีสิ่งใดในที่นี้พิสูจน์ว่าถ้าไม่มีภารกิจนี้จะเกิดอะไรขึ้น',
    });
  }

  return {
    measure: kpi.measure,
    unit: spec.unit,
    observed,
    baseline: kpi.baseline,
    target: kpi.target,
    movedBy: kpi.baseline === null ? null : observed - kpi.baseline,
    ofTarget: kpi.target === null || kpi.target === 0
      ? null
      : Math.round((observed / kpi.target) * 1000) / 1000,
    notes,
  };
}

/**
 * One line a partner can read without the table.
 *
 * Leads with what was measured, because that is the only part nobody has to
 * take on trust.
 */
export function kpiHeadline(p: KpiProgress, locale: 'en' | 'th'): string {
  const unit = p.unit[locale];
  const n = p.observed.toLocaleString('en-US');
  if (p.target === null) {
    return locale === 'th'
      ? `วัดได้ ${n} ${unit} ไม่ได้ตั้งเป้าหมายไว้`
      : `${n} ${unit} measured. No target was set.`;
  }
  const t = p.target.toLocaleString('en-US');
  return locale === 'th'
    ? `วัดได้ ${n} ${unit} จากเป้าหมาย ${t}`
    : `${n} ${unit} measured, against a target of ${t}.`;
}
