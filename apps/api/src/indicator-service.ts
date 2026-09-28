/**
 * Where a partner intends to report a quest's figure, checked before it runs.
 *
 * Stage three of `docs/60`. The rule in `indicator.ts` is the same one the
 * review page runs on a pasted file; what changes here is where the facts
 * come from and WHEN the question is asked. On side A a finding arrives at
 * filing season, after the activity and after the figure. On this side it
 * arrives when the measurement plan is fixed - before anything is measured,
 * which is the only moment a wrong indicator is free to correct.
 *
 * WHAT IS READ AND WHAT IS FIXED.
 *
 *   The MEASURE is the quest's own KPI. No KPI, no measure, nothing to place -
 *   and that is said rather than guessed around. A quest agreed against no
 *   indicator has not been placed anywhere, and inventing a measure for it
 *   would run a rule about a figure nobody agreed to produce.
 *
 *   Three FACTS are stored on the quest, because a quest is durable and whose
 *   material a beach cleanup collects does not change between page loads.
 *
 *   `measuredBy` is FIXED to host-verified and never stored or asked. It is
 *   not a fact about this quest; it is a fact about which side of the
 *   business the figure came from.
 */

import {
  INDICATOR_RULES, QUEST_MEASURED_BY, assess, isFramework, isMaterialOrigin,
  isOrganisationRole, isQuestMeasure,
  type ActivityFacts, type Framework, type KpiMeasure, type Placement,
} from '@chivago/core';
import { row, type DB } from './db.ts';

export class InvalidIntent extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIntent';
  }
}

export interface IndicatorIntent {
  framework: Framework;
  line: string;
  facts: ActivityFacts;
}

interface Row {
  kpi_measure: string | null;
  indicator_framework: string | null;
  indicator_line: string | null;
  material_origin: string | null;
  organisation_role: string | null;
  inside_boundary: number | null;
}

const read = (db: DB, questId: string): Row | undefined => row<Row>(
  db.prepare(
    `SELECT kpi_measure, indicator_framework, indicator_line,
            material_origin, organisation_role, inside_boundary
       FROM quests WHERE id = ?`,
  ).get(questId),
);

/**
 * The facts as they stand. An unanswered one is `unknown`, never a default.
 *
 * `inside_boundary` is INTEGER in SQLite: 1, 0, or NULL. NULL is the third
 * value and it has to stay distinct from 0, because "not answered" and
 * "outside the boundary" lead the rule down different branches - one asks a
 * question, the other refuses.
 */
function factsOf(r: Row): ActivityFacts {
  return {
    materialOrigin: r.material_origin !== null && isMaterialOrigin(r.material_origin)
      ? r.material_origin : 'unknown',
    organisationRole: r.organisation_role !== null && isOrganisationRole(r.organisation_role)
      ? r.organisation_role : 'unknown',
    insideBoundary: r.inside_boundary === 1 ? true : r.inside_boundary === 0 ? false : 'unknown',
    measuredBy: QUEST_MEASURED_BY,
  };
}

/** Where the partner intends to file, or null when nobody has said. */
export function intentFor(db: DB, questId: string): IndicatorIntent | null {
  const r = read(db, questId);
  if (!r || r.indicator_framework === null || r.indicator_line === null) return null;
  if (!isFramework(r.indicator_framework)) return null;
  return { framework: r.indicator_framework, line: r.indicator_line, facts: factsOf(r) };
}

export function setIntent(
  db: DB,
  questId: string,
  args: {
    framework: string;
    line: string;
    materialOrigin: string;
    organisationRole: string;
    /** 'yes' | 'no' | anything else, which means not answered. */
    insideBoundary: string;
  },
): IndicatorIntent {
  if (!read(db, questId)) throw new InvalidIntent(`No quest has the id ${questId}.`);
  if (!isFramework(args.framework)) {
    throw new InvalidIntent(`${args.framework} is not a standard this knows.`);
  }
  const line = args.line.trim();
  // A line is a reference into a standard, not prose. Anything long enough
  // to be a sentence is somebody typing a note into the wrong box.
  if (line === '' || line.length > 32) {
    throw new InvalidIntent('Name the line in the standard, for example 306-3.');
  }
  // Unknown is stored as NULL rather than as the string, so "not answered"
  // has exactly one representation and cannot drift into two.
  const origin = isMaterialOrigin(args.materialOrigin) && args.materialOrigin !== 'unknown'
    ? args.materialOrigin : null;
  const role = isOrganisationRole(args.organisationRole) && args.organisationRole !== 'unknown'
    ? args.organisationRole : null;
  const bound = args.insideBoundary === 'yes' ? 1 : args.insideBoundary === 'no' ? 0 : null;

  db.prepare(
    `UPDATE quests SET indicator_framework = ?, indicator_line = ?,
            material_origin = ?, organisation_role = ?, inside_boundary = ?
      WHERE id = ?`,
  ).run(args.framework, line, origin, role, bound, questId);

  return intentFor(db, questId)!;
}

/** Forget where it was going. The measurement plan is untouched. */
export function clearIntent(db: DB, questId: string): void {
  db.prepare(
    `UPDATE quests SET indicator_framework = NULL, indicator_line = NULL,
            material_origin = NULL, organisation_role = NULL, inside_boundary = NULL
      WHERE id = ?`,
  ).run(questId);
}

export type Preflight =
  | { state: 'no_intent' }
  | { state: 'no_measure'; intent: IndicatorIntent }
  | { state: 'placed'; intent: IndicatorIntent; measure: KpiMeasure; placement: Placement };

/**
 * Run the rule against what this quest is about to measure.
 *
 * Three outcomes, and the first two are not failures to be hidden. A quest
 * nobody has said where they will report is simply not yet placed. A quest
 * with an intended line but no KPI has nothing to place on it yet - and
 * saying so is how a moderator learns the KPI is missing, which is the more
 * useful of the two findings.
 */
export function preflightFor(db: DB, questId: string, asOf = new Date()): Preflight {
  const intent = intentFor(db, questId);
  if (intent === null) return { state: 'no_intent' };
  const r = read(db, questId)!;
  if (r.kpi_measure === null || !isQuestMeasure(r.kpi_measure)) {
    return { state: 'no_measure', intent };
  }
  const measure = r.kpi_measure as KpiMeasure;
  return {
    state: 'placed',
    intent,
    measure,
    placement: assess(INDICATOR_RULES, measure, intent.framework, intent.line, intent.facts, asOf),
  };
}
