/**
 * Whether a figure belongs on the line somebody wants to put it on.
 *
 * `docs/60` is the design and this is its first stage: ONE researched rule,
 * carried end to end, plus every piece of machinery that one rule forces into
 * existence. The rule is GRI 306-3 and beach-cleanup kilograms, which is the
 * case `docs/57` researched.
 *
 * THE THING THIS IS NOT. It is not a table from our measures to indicators.
 * That build answers `weight_kg` -> 306-3 and gets the case backwards:
 * kilograms were never the problem. A company's own office waste in kilograms
 * IS 306-3, correctly and without argument. What disqualifies a beach cleanup
 * is WHOSE WASTE IT WAS - and a table keyed on our measure cannot see the
 * fact that decides it, so it would answer confidently and wrongly in both
 * directions.
 *
 * So rules are keyed on FACTS ABOUT THE ACTIVITY, the same move
 * `evidence-level.ts` made with `EvidenceFacts`.
 *
 * THERE IS NO `fits`. The nearest thing to a yes this module can produce is
 * `conditional` with its conditions met, and even that says NOTHING HERE
 * REFUSES IT rather than THIS IS CORRECT. A recommendation is a liability a
 * refusal is not: `docs/57` is explicit that its GRI reading is a reading and
 * not a ruling, and a layer that says "file it under 306-3" invites a company
 * to file on our say-so - where if we are wrong, they are the one who filed.
 *
 * NO RULE MAY OUTPUT A NUMBER, and that is structural rather than a promise:
 * nothing in `Placement` is a quantity except the age of the reading. The
 * moment a mapping layer can say "and therefore 2.4 tCO2e" it has become the
 * emission-factor table `esg.ts` has refused since it was written.
 */

import type { KpiMeasure } from './kpi.ts';
import type { Bilingual } from './types.ts';

/** The standards this module knows how to be wrong about. */
export type Framework = 'gri' | 'ifrs_s' | 'ghg_protocol' | 'sec_56_1';

export const FRAMEWORK_LABEL: Record<Framework, string> = {
  gri: 'GRI',
  ifrs_s: 'IFRS S1 / S2',
  ghg_protocol: 'GHG Protocol',
  sec_56_1: '56-1 One Report',
};

/* ---------------------------------------------------------------- facts -- */

/**
 * Who discarded the material.
 *
 * The fact the 306-3 case turns on, and the reason this module exists in this
 * shape rather than as a lookup.
 */
export type MaterialOrigin = 'own_operations' | 'third_party' | 'mixed' | 'unknown';

/** What the reporting organisation was to the activity. */
export type OrganisationRole = 'generator' | 'manager' | 'funder' | 'unknown';

/** Where the figure came from. `evidence-level.ts` and `declared.ts` feed this. */
export type MeasuredBy = 'host_verified' | 'declared' | 'unknown';

export interface ActivityFacts {
  materialOrigin: MaterialOrigin;
  organisationRole: OrganisationRole;
  /** Whether the activity sits inside the reporting entity's operational boundary. */
  insideBoundary: boolean | 'unknown';
  measuredBy: MeasuredBy;
}

/** The names a rule can point at when it needs one more answer. */
export type FactName = keyof ActivityFacts;

export const FACT_QUESTION: Record<FactName, Bilingual> = {
  materialOrigin: {
    en: 'Was the material discarded by your own operations, or by somebody else?',
    th: 'วัสดุนั้นถูกทิ้งโดยการดำเนินงานของคุณเอง หรือโดยผู้อื่น',
  },
  organisationRole: {
    en: 'In this activity, were you the generator of the material, the manager of '
      + 'somebody else’s, or the funder?',
    th: 'ในกิจกรรมนี้ คุณเป็นผู้ก่อวัสดุนั้น ผู้จัดการวัสดุของผู้อื่น หรือผู้ให้ทุน',
  },
  insideBoundary: {
    en: 'Does this activity sit inside the operational boundary you report on?',
    th: 'กิจกรรมนี้อยู่ในขอบเขตการดำเนินงานที่คุณรายงานหรือไม่',
  },
  measuredBy: {
    en: 'Was the figure verified by the host who ran the activity, or declared by you?',
    th: 'ตัวเลขนี้ผู้จัดกิจกรรมเป็นผู้ตรวจ หรือคุณเป็นผู้แจ้งเอง',
  },
};

export const UNKNOWN_FACTS: ActivityFacts = {
  materialOrigin: 'unknown',
  organisationRole: 'unknown',
  insideBoundary: 'unknown',
  measuredBy: 'unknown',
};

/* -------------------------------------------------------------- verdicts -- */

/**
 * Four, where `docs/60` designed three.
 *
 * Building it separated two cases the design had run together. `unknown` is a
 * rule that exists and needs one more answer - which is the valuable state,
 * because it names the question. `unexamined` is nobody here having looked at
 * this pair at all.
 *
 * They read the same to an optimist and must not: one is a question we can
 * ask, the other is a gap in our coverage. Neither is approval, which was the
 * design's actual principle and is unchanged.
 */
export type Verdict = 'refuses' | 'conditional' | 'unknown' | 'unexamined';

export const VERDICT_LABEL: Record<Verdict, Bilingual> = {
  refuses: { en: 'Cannot go here', th: 'ใส่ตรงนี้ไม่ได้' },
  conditional: { en: 'Only if stated', th: 'ได้ ถ้าระบุเงื่อนไข' },
  unknown: { en: 'One answer missing', th: 'ยังขาดคำตอบหนึ่งข้อ' },
  unexamined: { en: 'Not examined', th: 'ยังไม่ได้ตรวจสอบคู่นี้' },
};

/**
 * Said on every `unexamined` result, because silence would be read as assent.
 *
 * Same discipline as `statement-use.ts`, where an empty list of declarations
 * had to be stopped from meaning nobody had used the record.
 */
export const UNEXAMINED_NOTE: Bilingual = {
  en: 'Nobody here has examined this figure against this line. That is a gap in what '
    + 'ChivaGo has studied, not a finding that the placement is sound.',
  th: 'ยังไม่มีผู้ใดที่นี่ตรวจสอบตัวเลขนี้เทียบกับรายการนี้ นี่คือช่องว่างของสิ่งที่ ChivaGo ศึกษาไว้ '
    + 'ไม่ใช่ข้อสรุปว่าการจัดวางนั้นถูกต้อง',
};

/** Shipped with every result, including the ones that look like permission. */
export const PLACEMENT_LIMIT: Bilingual = {
  en: 'This is ChivaGo’s reading of a published standard, not a ruling and not an '
    + 'assurance opinion. Nothing here files anything, and nothing here converts a '
    + 'figure into another unit.',
  th: 'นี่คือการอ่านมาตรฐานที่เผยแพร่แล้วตามความเห็นของ ChivaGo ไม่ใช่คำวินิจฉัยและไม่ใช่ '
    + 'ความเห็นให้ความเชื่อมั่น ไม่มีสิ่งใดตรงนี้เป็นการยื่นรายงาน และไม่มีการแปลงตัวเลขเป็นหน่วยอื่น',
};

/* ----------------------------------------------------------------- rules -- */

/**
 * Where a rule's reasoning comes from, carried as data rather than as a
 * comment nobody can render.
 *
 * `notChecked` is not decoration. `docs/57` could not read the SEC's own
 * pages - they refuse automated access - and wrote the gap into the document
 * instead of letting it sit silently inside a conclusion.
 */
export interface RuleSource {
  /** The clause, quoted short enough to be checked and long enough to mean something. */
  clause: string;
  /** Where to go and read it. */
  where: string;
  /** ISO date this reading was made. A rule nobody can date is a rule nobody can retire. */
  readOn: string;
  readBy: string;
  /** What this reading did NOT cover. */
  notChecked: Bilingual;
}

export interface RuleOutcome {
  verdict: Exclude<Verdict, 'unexamined'>;
  /** The definitional reason. Always traceable to the clause. */
  because: Bilingual;
  /** For `conditional`: what has to be said alongside. */
  conditions?: Bilingual[];
  /** For `refuses`: where the figure could honestly go instead. */
  insteadTry?: Bilingual[];
  /** For `unknown`: the one fact that would settle it. */
  settledBy?: FactName;
}

export interface IndicatorRule {
  id: string;
  framework: Framework;
  /** The line itself: '306-3'. */
  line: string;
  /** Which of our measures this rule is about. */
  measures: readonly KpiMeasure[];
  source: RuleSource;
  test: (facts: ActivityFacts) => RuleOutcome;
}

/**
 * A reading older than this says so, every time it answers.
 *
 * A year because these standards move on roughly that cadence - IFRS S1/S2
 * are being adopted in Thailand on a timetable, GRI revises sector standards,
 * the Thailand Taxonomy is on phase two. A stale rule still answers, because
 * an old reading of a clause that did not change is still right; it just
 * cannot be trusted silently.
 */
export const STALE_AFTER_DAYS = 365;

export interface Placement {
  ruleId: string | null;
  framework: Framework;
  line: string;
  verdict: Verdict;
  because: Bilingual;
  conditions: Bilingual[];
  insteadTry: Bilingual[];
  settledBy: FactName | null;
  /** The question to put to the customer, when there is one. */
  ask: Bilingual | null;
  source: RuleSource | null;
  /** Days between the reading and the moment of asking. Null with no rule. */
  readingAgeDays: number | null;
  stale: boolean;
}

const DAY_MS = 86_400_000;

/**
 * Run one rule against one set of facts.
 *
 * `asOf` is a parameter rather than `new Date()` inside, so staleness is
 * testable and so a report generated for a past period can say how old the
 * reading was THEN.
 */
export function placeAgainst(
  rule: IndicatorRule, facts: ActivityFacts, asOf: Date = new Date(),
): Placement {
  const out = rule.test(facts);
  const ageMs = asOf.getTime() - Date.parse(rule.source.readOn);
  // Floored at zero: a rule read today is nought days old, never minus one,
  // and a clock skew must not present as a fresher reading than exists.
  const readingAgeDays = Math.max(0, Math.floor(ageMs / DAY_MS));
  return {
    ruleId: rule.id,
    framework: rule.framework,
    line: rule.line,
    verdict: out.verdict,
    because: out.because,
    conditions: out.conditions ?? [],
    insteadTry: out.insteadTry ?? [],
    settledBy: out.settledBy ?? null,
    ask: out.settledBy ? FACT_QUESTION[out.settledBy] : null,
    source: rule.source,
    readingAgeDays,
    stale: readingAgeDays > STALE_AFTER_DAYS,
  };
}

/**
 * The answer when nothing has been studied.
 *
 * A separate constructor rather than a rule that returns `unexamined`,
 * because a rule that could return it would be a rule claiming to have looked.
 */
export function unexamined(framework: Framework, line: string): Placement {
  return {
    ruleId: null,
    framework,
    line,
    verdict: 'unexamined',
    because: UNEXAMINED_NOTE,
    conditions: [],
    insteadTry: [],
    settledBy: null,
    ask: null,
    source: null,
    readingAgeDays: null,
    stale: false,
  };
}

/**
 * Every rule that could speak to this measure on this line.
 *
 * Returns `unexamined` when none does. It never returns nothing, because a
 * caller handed nothing tends to render nothing, and a blank space where a
 * refusal might have been is the failure this whole module is about.
 */
export function assess(
  rules: readonly IndicatorRule[],
  measure: KpiMeasure,
  framework: Framework,
  line: string,
  facts: ActivityFacts,
  asOf: Date = new Date(),
): Placement {
  const rule = rules.find(
    (r) => r.framework === framework && r.line === line && r.measures.includes(measure),
  );
  return rule ? placeAgainst(rule, facts, asOf) : unexamined(framework, line);
}

/* ------------------------------------------------------------ the rule -- */

/**
 * GRI 306-3, and kilograms collected from somewhere nobody's company owns.
 *
 * The finding is `docs/57`'s: GRI defines waste as what THE HOLDER discards,
 * and 306-3 covers waste generated in the organisation's own activities.
 * Beach litter was discarded by somebody else, so it was never that
 * organisation's waste however carefully it was weighed.
 *
 * Read the branches as one sentence each, all of them leaning on that single
 * definition. A branch that needs a different clause needs a different rule.
 */
export const GRI_306_3: IndicatorRule = {
  id: 'gri-306-3-waste-generated',
  framework: 'gri',
  line: '306-3',
  measures: ['weight_kg'],
  source: {
    clause: 'waste: anything that the holder discards, intends to discard, '
      + 'or is required to discard',
    where: 'GRI 306: Waste 2020 — definitions, read with 306-3 Waste generated',
    readOn: '2026-09-26',
    readBy: 'ChivaGo research, docs/57',
    notChecked: {
      en: 'Published guidance only. No ruling, no assurance provider’s opinion, and no '
        + 'GRI sector standard was checked for a narrower reading.',
      th: 'อ่านจากแนวปฏิบัติที่เผยแพร่เท่านั้น ไม่มีคำวินิจฉัย ไม่มีความเห็นจากผู้ให้ความเชื่อมั่น '
        + 'และยังไม่ได้ตรวจมาตรฐานรายสาขาของ GRI ว่ามีการตีความที่แคบกว่านี้หรือไม่',
    },
  },
  test(facts) {
    if (facts.materialOrigin === 'unknown') {
      return {
        verdict: 'unknown',
        settledBy: 'materialOrigin',
        because: {
          en: 'GRI defines waste as what the holder discards, so whose material this was '
            + 'decides whether 306-3 is available at all. Nothing here can refuse it or '
            + 'permit it until that is answered.',
          th: 'GRI นิยามขยะว่าคือสิ่งที่ผู้ถือครองทิ้ง ดังนั้นวัสดุนี้เป็นของผู้ใดจึงเป็นตัวตัดสินว่า '
            + 'ใช้ 306-3 ได้หรือไม่ ตราบที่ยังไม่มีคำตอบ ที่นี่ปฏิเสธไม่ได้และอนุญาตไม่ได้',
        },
      };
    }

    if (facts.materialOrigin === 'third_party') {
      return {
        verdict: 'refuses',
        because: {
          en: 'GRI defines waste as what the holder discards, and 306-3 covers waste '
            + 'generated in the organisation’s own activities. Material discarded by '
            + 'somebody else was never this organisation’s waste, so 306-3 cannot hold it '
            + 'however carefully it was weighed.',
          th: 'GRI นิยามขยะว่าคือสิ่งที่ผู้ถือครองทิ้ง และ 306-3 ครอบคลุมขยะที่เกิดจากกิจกรรมของ '
            + 'องค์กรเอง วัสดุที่ผู้อื่นทิ้งไว้ไม่เคยเป็นขยะขององค์กรนี้ 306-3 จึงรองรับไม่ได้ '
            + 'ไม่ว่าจะชั่งน้ำหนักมาอย่างระมัดระวังเพียงใด',
        },
        insteadTry: [
          {
            en: 'GRI 3-3-e-ii, as a supplementary indicator describing action taken on a '
              + 'material topic.',
            th: 'GRI 3-3-e-ii ในฐานะตัวชี้วัดเสริมที่อธิบายการดำเนินการต่อประเด็นสำคัญ',
          },
          {
            en: 'GRI 306 in the role of a waste MANAGER, said explicitly and kept separate '
              + 'from the organisation’s own operational waste.',
            th: 'GRI 306 ในบทบาท "ผู้จัดการขยะ" โดยระบุให้ชัด และแยกจากขยะจากการดำเนินงานของ '
              + 'องค์กรเอง',
          },
        ],
      };
    }

    if (facts.materialOrigin === 'mixed') {
      return {
        verdict: 'conditional',
        because: {
          en: 'Only the part discarded by the organisation’s own operations is waste under '
            + 'GRI’s definition. The rest is somebody else’s, and a single combined figure '
            + 'reports both as though they were the first.',
          th: 'เฉพาะส่วนที่การดำเนินงานขององค์กรเองเป็นผู้ทิ้งเท่านั้นที่เป็นขยะตามนิยามของ GRI '
            + 'ส่วนที่เหลือเป็นของผู้อื่น การรายงานเป็นตัวเลขรวมตัวเดียวเท่ากับรายงานทั้งสองส่วน '
            + 'ราวกับเป็นส่วนแรกทั้งหมด',
        },
        conditions: [
          {
            en: 'Separate the two, and put only the own-operations weight in 306-3.',
            th: 'แยกสองส่วนออกจากกัน และใส่เฉพาะน้ำหนักจากการดำเนินงานขององค์กรเองใน 306-3',
          },
          {
            en: 'Say where the rest went, so the total can still be reconciled.',
            th: 'ระบุว่าส่วนที่เหลือไปอยู่ที่ใด เพื่อให้ยอดรวมยังกระทบยอดได้',
          },
        ],
      };
    }

    // From here the material is the organisation's own.
    if (facts.organisationRole === 'unknown') {
      return {
        verdict: 'unknown',
        settledBy: 'organisationRole',
        because: {
          en: '306-3 is waste GENERATED by the organisation. Material from its own '
            + 'operations still needs the organisation to have been the generator rather '
            + 'than the manager or the funder of somebody else’s handling of it.',
          th: '306-3 คือขยะที่องค์กร "ก่อขึ้น" วัสดุจากการดำเนินงานขององค์กรเองยังต้องอาศัยว่า '
            + 'องค์กรเป็นผู้ก่อ ไม่ใช่ผู้จัดการหรือผู้ให้ทุนแก่การจัดการของผู้อื่น',
        },
      };
    }

    if (facts.organisationRole === 'manager' || facts.organisationRole === 'funder') {
      return {
        verdict: 'refuses',
        because: {
          en: '306-3 reports waste the organisation generated. Managing or funding the '
            + 'handling of material is not generating it, and reporting it here would '
            + 'count somebody else’s waste as the organisation’s own.',
          th: '306-3 รายงานขยะที่องค์กรเป็นผู้ก่อ การจัดการหรือการให้ทุนแก่การจัดการวัสดุไม่ใช่ '
            + 'การก่อขยะ การรายงานไว้ตรงนี้เท่ากับนับขยะของผู้อื่นเป็นขยะขององค์กรเอง',
        },
        insteadTry: [
          {
            en: 'GRI 306 in the role of a waste manager, said explicitly.',
            th: 'GRI 306 ในบทบาทผู้จัดการขยะ โดยระบุให้ชัด',
          },
        ],
      };
    }

    if (facts.insideBoundary === false) {
      return {
        verdict: 'refuses',
        because: {
          en: 'The organisation generated this material, but the activity sits outside the '
            + 'operational boundary the report covers. 306-3 describes what happened inside '
            + 'that boundary.',
          th: 'องค์กรเป็นผู้ก่อวัสดุนี้ แต่กิจกรรมอยู่นอกขอบเขตการดำเนินงานที่รายงานครอบคลุม '
            + '306-3 อธิบายสิ่งที่เกิดขึ้นภายในขอบเขตนั้น',
        },
        insteadTry: [
          {
            en: 'State it outside the inventory, with the boundary difference named.',
            th: 'ระบุไว้นอกบัญชี พร้อมระบุความต่างของขอบเขตให้ชัด',
          },
        ],
      };
    }

    if (facts.insideBoundary === 'unknown') {
      return {
        verdict: 'unknown',
        settledBy: 'insideBoundary',
        because: {
          en: 'The material is the organisation’s own and it generated it. What is left is '
            + 'whether the activity is inside the boundary the report covers.',
          th: 'วัสดุเป็นขององค์กรเองและองค์กรเป็นผู้ก่อ เหลือเพียงว่ากิจกรรมอยู่ในขอบเขตที่ '
            + 'รายงานครอบคลุมหรือไม่',
        },
      };
    }

    return {
      verdict: 'conditional',
      because: {
        en: 'Own operations, generated by the organisation, inside the reported boundary: '
          + 'nothing in this reading refuses 306-3 for this figure. That is not the same as '
          + 'confirming the placement is correct.',
        th: 'เป็นการดำเนินงานขององค์กรเอง องค์กรเป็นผู้ก่อ และอยู่ในขอบเขตที่รายงาน '
          + 'การอ่านครั้งนี้ไม่มีข้อใดปฏิเสธการใช้ 306-3 กับตัวเลขนี้ ซึ่งไม่เท่ากับการยืนยันว่า '
          + 'การจัดวางนั้นถูกต้อง',
      },
      conditions: [
        {
          en: 'Say how the weight was arrived at, beside the figure.',
          th: 'ระบุวิธีที่ได้มาซึ่งน้ำหนักไว้ข้างตัวเลข',
        },
        ...(facts.measuredBy === 'host_verified'
          ? [{
            en: 'Verified by the host who ran the activity, which is not independent '
              + 'assurance under ISAE 3000.',
            th: 'ตรวจโดยผู้จัดกิจกรรม ซึ่งไม่ใช่การให้ความเชื่อมั่นโดยอิสระตาม ISAE 3000',
          }]
          : []),
        ...(facts.measuredBy === 'declared'
          ? [{
            en: 'Self-declared and not verified by anybody here. Say so on the face of it.',
            th: 'เป็นข้อมูลที่แจ้งเอง ไม่มีผู้ใดที่นี่ตรวจสอบ ให้ระบุไว้บนหน้าเอกสาร',
          }]
          : []),
        ...(facts.measuredBy === 'unknown'
          ? [{
            en: 'Nobody has said where the figure came from, and a 306-3 line is expected '
              + 'to carry its basis.',
            th: 'ยังไม่มีผู้ใดระบุที่มาของตัวเลข ทั้งที่รายการ 306-3 ควรระบุฐานที่มาไว้ด้วย',
          }]
          : []),
      ],
    };
  },
};

/** Every rule this build carries. One, and it is researched. */
export const INDICATOR_RULES: readonly IndicatorRule[] = [GRI_306_3];

/* ------------------------------------------- from somebody else's sheet -- */

/**
 * Which of our measures a declared file's unit column is talking about.
 *
 * `declared.ts` reads a partner's sheet and hands back whatever they wrote in
 * the unit column. To ask whether their figure belongs on a line, we first
 * have to know what kind of figure it is - and their spreadsheet is the only
 * thing that says.
 *
 * EXACT MATCHES ONLY, AFTER TRIMMING AND LOWERCASING. No fuzzy matching, no
 * prefixes, no "starts with kg". A guess here is not a small guess: it picks
 * which rule runs, and the wrong rule would answer confidently about a figure
 * it was never about. `parseDeclaredCsv` already refuses to guess which
 * COLUMN is which for the same reason, and this is the same decision one
 * level down.
 *
 * `null` for anything unrecognised, which the page must say out loud rather
 * than quietly assessing nothing.
 */
const UNIT_TO_MEASURE: Record<string, KpiMeasure> = {
  kg: 'weight_kg',
  kgs: 'weight_kg',
  kilogram: 'weight_kg',
  kilograms: 'weight_kg',
  'กก': 'weight_kg',
  'กก.': 'weight_kg',
  'กิโล': 'weight_kg',
  'กิโลกรัม': 'weight_kg',
  people: 'distinct_participants',
  person: 'distinct_participants',
  persons: 'distinct_participants',
  participants: 'distinct_participants',
  'คน': 'distinct_participants',
  submissions: 'verified_submissions',
  submission: 'verified_submissions',
  activities: 'verified_submissions',
  'รายการ': 'verified_submissions',
  'ครั้ง': 'verified_submissions',
};

export function measureFromUnit(unit: string | null | undefined): KpiMeasure | null {
  if (unit === null || unit === undefined) return null;
  return UNIT_TO_MEASURE[unit.trim().toLowerCase()] ?? null;
}

export const UNIT_UNRECOGNISED: Bilingual = {
  en: 'The unit in this file is not one this platform measures, so nothing here can say '
    + 'whether the figure belongs on that line. Guessing which measure was meant would run '
    + 'a rule written about a different kind of figure.',
  th: 'หน่วยในไฟล์นี้ไม่ใช่หน่วยที่แพลตฟอร์มนี้วัด จึงไม่มีสิ่งใดตรงนี้บอกได้ว่าตัวเลขควรอยู่ในรายการนั้นหรือไม่ '
    + 'การเดาว่าหมายถึงตัววัดใดจะเป็นการเรียกใช้กฎที่เขียนไว้สำหรับตัวเลขคนละชนิด',
};

/**
 * Why a declared file is never asked how its figure was measured.
 *
 * The first thing building the console column found. `measuredBy` looked like
 * a fourth question to put to the customer, and it is not one: a file
 * somebody pasted is `declared` by definition, and `DECLARED_NOT_VERIFIED`
 * has said so on that page since #73. Asking would invite the answer
 * "verified", which the page exists to refuse.
 */
export const DECLARED_MEASURED_BY: MeasuredBy = 'declared';

export const DECLARED_FACTS_NOTE: Bilingual = {
  en: 'How the figure was measured is not asked here and cannot be answered here: a pasted '
    + 'file is self-declared, whatever it says about itself.',
  th: 'ที่นี่ไม่ถามว่าตัวเลขวัดมาอย่างไร และตอบที่นี่ไม่ได้ เพราะไฟล์ที่วางเข้ามาคือข้อมูลที่แจ้งเอง '
    + 'ไม่ว่าในไฟล์จะระบุว่าอย่างไรก็ตาม',
};

export const isFramework = (v: string): v is Framework =>
  v === 'gri' || v === 'ifrs_s' || v === 'ghg_protocol' || v === 'sec_56_1';
