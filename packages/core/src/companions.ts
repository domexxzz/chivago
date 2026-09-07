/**
 * Companions - an egg per habitat, hatched by the evidence you already earn.
 *
 * The design question a collection mechanic has to answer is what makes one
 * rare. Spending points would make this a shop; a random roll would make it a
 * slot machine. Neither is a thing a conservation app should teach.
 *
 * So the ladder is the EVIDENCE LADDER the rest of the app already runs on,
 * made visible as a creature:
 *
 *   egg        you checked in there. Self-verified presence, geofenced.
 *   hatchling  you came back. Presence at more than one place in that habitat.
 *   grown      a host verified work you did there. The Green-Point standard.
 *
 * A companion is therefore not a prize. It is a picture of what kind of
 * evidence somebody has accumulated in one habitat, and it cannot be bought,
 * rolled for, or farmed by standing still in one spot.
 *
 * The species are REAL animals of those Samui habitats, with scientific names
 * and one true fact each. Invented monsters would have been easier and would
 * have taught nothing; an app whose whole argument is that the island is worth
 * looking after can name what actually lives on it.
 *
 * The five are the team's own mascots, brought in on 8 September 2026
 * (docs/51): the animals people on Samui actually meet - the coconut monkey,
 * the junglefowl, the octopus, the turtle, the buffalo. Each still carries a
 * scientific name, a habitat and one checkable fact, because a mascot that
 * cannot be looked up is a cartoon, not a companion.
 */

import type { Bilingual, LayerKey } from './types.ts';

export type CompanionStage = 'egg' | 'hatchling' | 'grown';

/** IUCN Red List category. `NE` where the group is not assessed as one species. */
export type IucnStatus = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'NE';

export interface Species {
  key: string;
  /** The habitat it belongs to, which is how a place maps to a companion. */
  layer: LayerKey;
  name: Bilingual;
  scientific: string;
  /**
   * What an unhatched egg is called.
   *
   * The habitat, not the layer key: "Safe egg" is the name of a filter chip,
   * not of a place anybody has been. An egg should say WHERE it came from -
   * that is the whole idea of one per area - while still not saying WHICH
   * animal is inside.
   */
  eggName: Bilingual;
  habitat: Bilingual;
  /** One true thing. Not flavour text - a fact somebody could check. */
  fact: Bilingual;
  status: IucnStatus;
}

/**
 * The date the conservation categories below were recorded.
 *
 * IUCN status is exactly the kind of claim that ages, and this app does not
 * make claims it cannot date. Verify before showing this to anyone who would
 * know - a biologist reading a stale category is the same credibility loss as
 * a judge finding an invented photograph.
 */
export const SPECIES_AS_OF = '2026-09-08';

export const SPECIES: Record<LayerKey, Species> = {
  Green: {
    key: 'coconut-macaque',
    layer: 'Green',
    name: { en: 'Southern pig-tailed macaque', th: 'ลิงกัง' },
    scientific: 'Macaca nemestrina',
    eggName: { en: 'Grove egg', th: 'ไข่จากสวนมะพร้าว' },
    habitat: { en: 'Coconut groves and the inland forest behind them', th: 'สวนมะพร้าวและป่าในด้านหลัง' },
    fact: {
      en: 'On Samui, trained macaques have picked the coconuts from the tall palms for generations.',
      th: 'บนเกาะสมุย ลิงกังที่ฝึกแล้วเก็บมะพร้าวจากต้นสูงให้คนมาหลายชั่วอายุคน',
    },
    status: 'VU',
  },
  Wellness: {
    key: 'red-junglefowl',
    layer: 'Wellness',
    name: { en: 'Red junglefowl', th: 'ไก่ป่า' },
    scientific: 'Gallus gallus',
    eggName: { en: 'Hill forest egg', th: 'ไข่จากป่าเนิน' },
    habitat: { en: 'Hill forest edges above the south coast', th: 'ชายป่าบนเนินเหนือชายฝั่งใต้' },
    fact: {
      en: 'The wild ancestor of every chicken on earth; the cock crows from the forest edge at first light.',
      th: 'บรรพบุรุษป่าของไก่บ้านทุกตัวบนโลก ตัวผู้ขันจากชายป่าตอนฟ้าสาง',
    },
    status: 'LC',
  },
  Food: {
    key: 'day-octopus',
    layer: 'Food',
    name: { en: 'Day octopus', th: 'หมึกสาย' },
    scientific: 'Octopus cyanea',
    eggName: { en: 'Reef egg', th: 'ไข่จากแนวปะการัง' },
    habitat: { en: 'Reefs and rock off the fishing villages', th: 'แนวปะการังและโขดหินนอกหมู่บ้านประมง' },
    fact: {
      en: 'Changes the colour and texture of its skin in under a second, and lives about a year.',
      th: 'เปลี่ยนสีและผิวหนังได้ในเวลาไม่ถึงวินาที และมีอายุราวหนึ่งปี',
    },
    status: 'LC',
  },
  Safe: {
    key: 'green-turtle',
    layer: 'Safe',
    name: { en: 'Green sea turtle', th: 'เต่าตนุ' },
    scientific: 'Chelonia mydas',
    eggName: { en: 'Beach egg', th: 'ไข่จากหาดทราย' },
    habitat: { en: 'Sand beaches and the seagrass off them', th: 'หาดทรายและแหล่งหญ้าทะเลนอกชายฝั่ง' },
    fact: {
      en: 'Returns to the beach it hatched on to nest, decades later.',
      th: 'กลับมาวางไข่ที่หาดเดิมที่ตัวเองฟักออกมา หลังผ่านไปหลายสิบปี',
    },
    status: 'EN',
  },
  Quest: {
    key: 'water-buffalo',
    layer: 'Quest',
    name: { en: 'Water buffalo', th: 'ควาย' },
    scientific: 'Bubalus bubalis',
    eggName: { en: 'Field egg', th: 'ไข่จากทุ่ง' },
    habitat: { en: 'The wet fields and the village arenas', th: 'ทุ่งนาน้ำขังและสังเวียนประจำหมู่บ้าน' },
    fact: {
      en: 'Raised on the island for the village fights, where a bout ends when one of the two turns and walks away.',
      th: 'เลี้ยงบนเกาะไว้ชนในสังเวียนหมู่บ้าน การชนจบลงเมื่อตัวหนึ่งหันหลังเดินออกไป',
    },
    // The domestic buffalo is not assessed; its wild ancestor, Bubalus arnee, is EN.
    status: 'NE',
  },
};

export const LAYERS_WITH_SPECIES = Object.keys(SPECIES) as LayerKey[];

/** What somebody has done in one habitat. All of it verifiable. */
export interface HabitatEvidence {
  layer: LayerKey;
  /** Distinct island days checked in on, in this habitat. Geofenced, self-verified. */
  visitDays: number;
  /** Quests in this habitat a HOST approved. The Green-Point standard. */
  questsVerified: number;
}

export interface Companion {
  species: Species;
  stage: CompanionStage;
  evidence: HabitatEvidence;
  /** What would move it on, in the reader's language. Null once grown. */
  nextStep: Bilingual | null;
}

/**
 * Distinct DAYS in a habitat before an egg hatches.
 *
 * This counted distinct PLACES until it was tested against the island that
 * actually exists: there is one seeded place per habitat, so two places in
 * one habitat was unreachable and no egg could ever hatch. A mechanic that
 * cannot complete is worse than no mechanic - it is a promise on screen with
 * nothing behind it.
 *
 * Days keeps what places were reaching for. Two check-ins at one beach in one
 * afternoon is still one day, so it rewards coming back rather than
 * loitering, and it does not require an island bigger than this one.
 */
export const HATCH_AT_DAYS = 2;

/**
 * The stage one habitat's evidence has reached.
 *
 * Monotonic in both inputs on purpose: nothing a traveller does can move a
 * companion backwards, for the same reason spending points never lowers a
 * level. A collection that can shrink teaches people not to use the app.
 */
export function stageFor(evidence: HabitatEvidence): CompanionStage | null {
  if (evidence.questsVerified > 0) return 'grown';
  if (evidence.visitDays >= HATCH_AT_DAYS) return 'hatchling';
  if (evidence.visitDays >= 1) return 'egg';
  return null;
}

function nextStepFor(
  stage: CompanionStage,
  evidence: HabitatEvidence,
  s: Species,
): Bilingual | null {
  if (stage === 'grown') return null;
  if (stage === 'hatchling') {
    return {
      en: `Have a host verify one ${s.layer} quest to raise your ${s.name.en}`,
      th: `ให้ผู้จัดภารกิจยืนยันภารกิจสาย${s.layer} หนึ่งครั้ง เพื่อให้${s.name.th}โตเต็มวัย`,
    };
  }
  const left = HATCH_AT_DAYS - evidence.visitDays;
  return {
    en: `Check in here on ${left} more day${left === 1 ? '' : 's'} to hatch this egg`,
    th: `เช็กอินที่นี่อีก ${left} วัน เพื่อฟักไข่ใบนี้`,
  };
}

/**
 * The companions somebody has, from what they have actually done.
 *
 * Derived, never stored. A stored collection is a second record of facts the
 * ledger already holds, and two records of one fact eventually disagree - the
 * mistake this project avoided once already by reading visits out of the
 * ledger rather than keeping a visits table beside it.
 */
export function companionsFor(evidence: HabitatEvidence[]): Companion[] {
  const byLayer = new Map(evidence.map((e) => [e.layer, e]));
  return LAYERS_WITH_SPECIES.flatMap((layer) => {
    const e = byLayer.get(layer) ?? { layer, visitDays: 0, questsVerified: 0 };
    const stage = stageFor(e);
    if (stage === null) return [];
    const species = SPECIES[layer];
    return [{ species, stage, evidence: e, nextStep: nextStepFor(stage, e, species) }];
  });
}

/** How far along the whole collection is. */
export function collectionSummary(companions: Companion[]): {
  found: number;
  total: number;
  grown: number;
} {
  return {
    found: companions.length,
    total: LAYERS_WITH_SPECIES.length,
    grown: companions.filter((c) => c.stage === 'grown').length,
  };
}
