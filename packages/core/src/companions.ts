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
export const SPECIES_AS_OF = '2026-09-01';

export const SPECIES: Record<LayerKey, Species> = {
  Green: {
    key: 'dusky-langur',
    layer: 'Green',
    name: { en: 'Dusky langur', th: 'ค่างแว่นถิ่นใต้' },
    scientific: 'Trachypithecus obscurus',
    eggName: { en: 'Forest egg', th: 'ไข่จากป่า' },
    habitat: { en: 'Inland forest and waterfall canopy', th: 'ป่าในและเรือนยอดรอบน้ำตก' },
    fact: {
      en: 'Born bright orange, turning grey over its first six months.',
      th: 'เกิดมาขนสีส้มสด แล้วค่อยเปลี่ยนเป็นสีเทาในหกเดือนแรก',
    },
    status: 'EN',
  },
  Wellness: {
    key: 'pied-hornbill',
    layer: 'Wellness',
    name: { en: 'Oriental pied hornbill', th: 'นกแก๊ก' },
    scientific: 'Anthracoceros albirostris',
    eggName: { en: 'Hill forest egg', th: 'ไข่จากป่าเนิน' },
    habitat: { en: 'Hill forest edges above the south coast', th: 'ชายป่าบนเนินเหนือชายฝั่งใต้' },
    fact: {
      en: 'The female seals herself into a tree hollow to nest, fed through a slit by the male.',
      th: 'ตัวเมียปิดตัวเองในโพรงไม้เพื่อทำรัง โดยตัวผู้ป้อนอาหารผ่านช่องแคบ',
    },
    status: 'LC',
  },
  Food: {
    key: 'brahminy-kite',
    layer: 'Food',
    name: { en: 'Brahminy kite', th: 'เหยี่ยวแดง' },
    scientific: 'Haliastur indus',
    eggName: { en: 'Shore egg', th: 'ไข่จากชายฝั่ง' },
    habitat: { en: 'Fishing villages and the shoreline they work', th: 'หมู่บ้านประมงและแนวชายฝั่งที่ทำกิน' },
    fact: {
      en: 'Follows the boats in, and takes what the nets leave behind.',
      th: 'บินตามเรือประมงเข้าฝั่ง และกินสิ่งที่เหลือจากอวน',
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
    key: 'fiddler-crab',
    layer: 'Quest',
    name: { en: 'Fiddler crab', th: 'ปูก้ามดาบ' },
    scientific: 'Austruca / Tubuca spp.',
    eggName: { en: 'Mangrove egg', th: 'ไข่จากป่าชายเลน' },
    habitat: { en: 'Mangrove mud at the tide line', th: 'เลนป่าชายเลนแนวน้ำขึ้นน้ำลง' },
    fact: {
      en: 'Its burrowing aerates the mud that mangrove roots breathe through.',
      th: 'การขุดรูของมันเติมอากาศให้เลนที่รากโกงกางใช้หายใจ',
    },
    status: 'NE',
  },
};

export const LAYERS_WITH_SPECIES = Object.keys(SPECIES) as LayerKey[];

/** What somebody has done in one habitat. All of it verifiable. */
export interface HabitatEvidence {
  layer: LayerKey;
  /** Distinct places checked in at, in this habitat. Geofenced, self-verified. */
  placesVisited: number;
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

/** Distinct places in a habitat needed before an egg hatches. */
export const HATCH_AT_PLACES = 2;

/**
 * The stage one habitat's evidence has reached.
 *
 * Monotonic in both inputs on purpose: nothing a traveller does can move a
 * companion backwards, for the same reason spending points never lowers a
 * level. A collection that can shrink teaches people not to use the app.
 */
export function stageFor(evidence: HabitatEvidence): CompanionStage | null {
  if (evidence.questsVerified > 0) return 'grown';
  if (evidence.placesVisited >= HATCH_AT_PLACES) return 'hatchling';
  if (evidence.placesVisited >= 1) return 'egg';
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
  const left = HATCH_AT_PLACES - evidence.placesVisited;
  return {
    en: `Check in at ${left} more ${s.layer} place${left === 1 ? '' : 's'} to hatch this egg`,
    th: `เช็กอินสถานที่สาย${s.layer} อีก ${left} แห่ง เพื่อฟักไข่ใบนี้`,
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
    const e = byLayer.get(layer) ?? { layer, placesVisited: 0, questsVerified: 0 };
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
