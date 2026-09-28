/**
 * The shape the quests page renders, kept out of the page file so the route
 * and the view agree on one definition.
 */

import type { PlanStanding } from '@chivago/core';
import type { Preflight } from '../indicator-service.ts';
import type { QuestKpiReading } from '../kpi-service.ts';

export interface QuestKpiReadingView {
  questId: string;
  nameEn: string;
  nameTh: string;
  /** Null when this quest agreed no indicator. */
  reading: QuestKpiReading | null;
  /** Whether the plan was fixed, and whether anything had happened first. */
  standing: PlanStanding;
  /** The date it was fixed, for the rows where that is a fact worth showing. */
  lockedAt: string | null;
  /** How many activities were already verified then. Only meaningful when locked. */
  verifiedAtLock: number | null;
  /** Where the partner intends to report it, checked against the rule. */
  preflight: Preflight;
}

export {
  FACT_QUESTION, FRAMEWORK_LABEL, MEASURE, PLACEMENT_LIMIT, QUEST_MEASURES, STANDING_LABEL,
  VALIDATION_LIMIT, VALIDATION_VS_VERIFICATION, VERDICT_LABEL,
  kpiHeadline, type KpiMeasure,
} from '@chivago/core';
