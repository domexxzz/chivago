/**
 * Fixing what a quest will be measured by, before anybody has seen a result.
 *
 * WHY THIS EXISTS. The carbon standards draw a line this codebase had not:
 * VALIDATION checks the plan and the design of a project, up front.
 * VERIFICATION checks what actually happened, afterwards. They are different
 * jobs, usually on different dates, and the second is worth very little
 * without the first - because whoever chose the indicator could have chosen
 * it knowing how the numbers came out.
 *
 * Everything this platform had was verification. `evidence-level.ts` has said
 * since it was written that the required rung is "agreed before the project
 * starts, beside the KPI", and `migrations.ts` repeats it beside the KPI
 * columns. Nothing enforced it or recorded when it happened, so a host could
 * pick the measure, the target and the required rung after the activity had
 * been approved, and no page could tell.
 *
 * WHAT A LOCK IS. A record that, at a stated moment, this plan was fixed -
 * plus the number of activities already verified at that moment. That second
 * number is what makes the record worth anything, because it is what
 * separates a plan from a rationalisation.
 *
 * WHAT IT REFUSES.
 *
 *   IT DOES NOT SAY THE PLAN IS GOOD. A wrong indicator fixed early is still
 *   a wrong indicator. This records WHEN a choice was made, not whether it
 *   was the right one.
 *
 *   LOCKING LATE IS ALLOWED, AND SHOWN. Refusing would push the fact off the
 *   system: the host would fix their plan in an email and we would hold
 *   nothing. So a late lock is recorded with the count that makes it late,
 *   and `planStanding` never calls it what an early one is.
 *
 *   A LOCK IS NOT A VERIFICATION AND DOES NOT BECOME ONE. Nothing here says
 *   any activity happened. The quest may run and produce nothing.
 */

import { canonicalJson } from './statement.ts';
import type { EvidenceLevel } from './evidence-level.ts';
import type { KpiMeasure } from './kpi.ts';
import type { Bilingual } from './types.ts';

/**
 * The four things fixed together.
 *
 * Together, because fixing the measure while leaving the target open would
 * let the target arrive once the figure was known, and a target chosen that
 * way is a description rather than a commitment.
 */
export interface MeasurementPlan {
  measure: KpiMeasure;
  baseline: number | null;
  target: number | null;
  /** The rung on the ladder in `evidence-level.ts` the quest agreed to. */
  requiredLevel: EvidenceLevel | null;
}

/**
 * The bytes a plan is fixed as.
 *
 * Field order is fixed by `canonicalJson` sorting keys, so this is the same
 * string whatever order the object was built in, and a caller cannot change
 * the digest by rearranging a literal.
 */
export const planBytes = (plan: MeasurementPlan): string => canonicalJson({
  measure: plan.measure,
  baseline: plan.baseline,
  target: plan.target,
  requiredLevel: plan.requiredLevel,
});

export interface PlanLock {
  id: string;
  questId: string;
  /** SHA-256 of `planBytes` at the moment of locking. */
  digest: string;
  /**
   * How many of this quest's activities had already been verified when the
   * plan was fixed. The number that separates a plan from a rationalisation.
   */
  verifiedAtLock: number;
  lockedAt: string;
  lockedBy: string | null;
  supersededAt: string | null;
  supersededReason: string | null;
}

/**
 * What can honestly be said about when this plan was chosen.
 *
 * `drifted` should be unreachable - the trigger in `migrations.ts` refuses to
 * change a locked quest's plan columns - and is here anyway, because a
 * standing that can only be produced by a bug is the one worth being able to
 * display rather than crash on.
 */
export type PlanStanding = 'fixed_before' | 'fixed_after' | 'superseded' | 'unfixed' | 'drifted';

export function planStanding(
  lock: PlanLock | null, currentDigest: string | null,
): PlanStanding {
  if (lock === null) return 'unfixed';
  if (lock.supersededAt !== null) return 'superseded';
  if (currentDigest !== null && lock.digest !== currentDigest) return 'drifted';
  return lock.verifiedAtLock === 0 ? 'fixed_before' : 'fixed_after';
}

/**
 * The sentence a report can carry, and none of them overstate.
 *
 * `fixed_before` is the only one that earns the strong claim, and even it
 * says only that the choice preceded the results - not that it was a good
 * choice.
 */
export function planNote(lock: PlanLock | null, standing: PlanStanding): Bilingual {
  if (standing === 'unfixed') {
    return {
      en: 'No measurement plan was fixed for this quest, so nothing here shows whether the '
        + 'indicator and the required evidence were chosen before the results were known.',
      th: 'ภารกิจนี้ไม่ได้ล็อกแผนการวัดไว้ จึงไม่มีสิ่งใดแสดงว่าตัวชี้วัดและระดับหลักฐานที่ต้องการ '
        + 'ถูกเลือกไว้ก่อนที่จะทราบผลหรือไม่',
    };
  }
  const at = (lock?.lockedAt ?? '').slice(0, 10);
  if (standing === 'drifted') {
    return {
      en: `The plan fixed on ${at} is not the plan this quest now carries. Treat the lock as `
        + 'covering nothing until somebody has explained the difference.',
      th: `แผนที่ล็อกไว้เมื่อ ${at} ไม่ตรงกับแผนที่ภารกิจนี้ใช้อยู่ `
        + 'ให้ถือว่าการล็อกไม่ครอบคลุมสิ่งใดจนกว่าจะมีผู้อธิบายความต่าง',
    };
  }
  if (standing === 'superseded') {
    return {
      en: `The plan fixed on ${at} was superseded, so it no longer describes how this quest is `
        + 'measured. The record of it is kept because it once applied.',
      th: `แผนที่ล็อกไว้เมื่อ ${at} ถูกแทนที่แล้ว จึงไม่ได้อธิบายวิธีวัดของภารกิจนี้อีกต่อไป `
        + 'บันทึกยังคงอยู่เพราะเคยมีผลใช้จริง',
    };
  }
  if (standing === 'fixed_after') {
    const n = lock?.verifiedAtLock ?? 0;
    return {
      en: `The measurement plan was fixed on ${at}, after ${n} ${n === 1 ? 'activity' : 'activities'} `
        + 'had already been verified. It is a plan, but it was not chosen before the results existed.',
      th: `แผนการวัดถูกล็อกเมื่อ ${at} ซึ่งเป็นเวลาที่มีกิจกรรมผ่านการตรวจแล้ว ${n} รายการ `
        + 'ถือเป็นแผนก็จริง แต่ไม่ได้ถูกเลือกก่อนที่ผลจะเกิดขึ้น',
    };
  }
  return {
    en: `The measurement plan was fixed on ${at}, before any activity on this quest had been `
      + 'verified. That says when the indicator was chosen, not that it is the right one.',
    th: `แผนการวัดถูกล็อกเมื่อ ${at} ก่อนที่จะมีกิจกรรมใดของภารกิจนี้ผ่านการตรวจ `
      + 'ข้อความนี้บอกเพียงว่าตัวชี้วัดถูกเลือกเมื่อใด ไม่ได้บอกว่าเป็นตัวชี้วัดที่ถูกต้อง',
  };
}

/** Short enough for a table cell, and still not overstating. */
export const STANDING_LABEL: Record<PlanStanding, Bilingual> = {
  fixed_before: { en: 'Fixed before results', th: 'ล็อกก่อนมีผล' },
  fixed_after: { en: 'Fixed after results existed', th: 'ล็อกหลังมีผลแล้ว' },
  superseded: { en: 'Superseded', th: 'ถูกแทนที่' },
  unfixed: { en: 'Not fixed', th: 'ยังไม่ได้ล็อก' },
  drifted: { en: 'Does not match the quest', th: 'ไม่ตรงกับภารกิจ' },
};

/**
 * The distinction the whole module exists to make, in the words the standards
 * use, so a reader who knows those words recognises which one they are being
 * shown - and a reader who does not is told.
 */
export const VALIDATION_VS_VERIFICATION: Bilingual = {
  en: 'Two different checks. Validation asks whether the plan was sound and settled up front; '
    + 'verification asks whether what it claims actually happened. A lock here is the first kind '
    + 'and only the first: it fixes what will be measured and when that was decided. Every figure '
    + 'this platform reports is still verified by the host who ran the activity.',
  th: 'เป็นการตรวจสองแบบที่ต่างกัน การตรวจสอบความใช้ได้ (Validation) ถามว่าแผนสมเหตุสมผลและตกลงไว้ล่วงหน้าหรือไม่ '
    + 'ส่วนการทวนสอบ (Verification) ถามว่าสิ่งที่อ้างเกิดขึ้นจริงหรือไม่ การล็อกตรงนี้คือแบบแรกและเป็นแบบแรกเท่านั้น '
    + 'คือกำหนดว่าจะวัดอะไรและตัดสินใจเมื่อใด ตัวเลขทุกตัวที่แพลตฟอร์มนี้รายงานยังคงตรวจโดยผู้จัดกิจกรรมเช่นเดิม',
};

/** Shipped with every lock, including the early ones, and especially those. */
export const VALIDATION_LIMIT: Bilingual = {
  en: 'A lock records when a plan was fixed. It does not say the indicator suits the activity, '
    + 'that the target is demanding, or that anybody outside ChivaGo agreed to either.',
  th: 'การล็อกเป็นการบันทึกว่าแผนถูกกำหนดเมื่อใด ไม่ได้ระบุว่าตัวชี้วัดเหมาะกับกิจกรรม '
    + 'ว่าเป้าหมายท้าทายเพียงพอ หรือว่ามีใครนอก ChivaGo เห็นชอบกับสิ่งใดในนั้น',
};
