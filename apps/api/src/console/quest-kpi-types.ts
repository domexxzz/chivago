/**
 * The shape the quests page renders, kept out of the page file so the route
 * and the view agree on one definition.
 */

import type { QuestKpiReading } from '../kpi-service.ts';

export interface QuestKpiReadingView {
  questId: string;
  nameEn: string;
  nameTh: string;
  /** Null when this quest agreed no indicator. */
  reading: QuestKpiReading | null;
}

export {
  MEASURE, QUEST_MEASURES, kpiHeadline, type KpiMeasure,
} from '@chivago/core';
