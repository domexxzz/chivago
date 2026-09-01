/**
 * One companion per province. Seventy-seven of them.
 *
 * The collection was five creatures, one per Samui habitat, which made it a
 * souvenir of an island. The design wants a creature per province, so that
 * going to Chonburi and going to Chiang Mai are different things to collect —
 * and that immediately raises the question every collection game answers
 * dishonestly: what is the animal for a province nobody has surveyed?
 *
 * Most products would invent seventy-five of them. This one does not know, and
 * says so. A province that is not open yet holds a SEALED egg: real, present,
 * countable, and carrying no claim about what is inside. It is not a tease and
 * not a "coming soon" — it is the literal truth that you cannot name what
 * lives somewhere until somebody has been and looked.
 *
 * The five states, and each one is a different sentence:
 *
 *   sealed     the province is not open. Nobody can hatch this yet.       (75)
 *   unclaimed  the province IS open and this traveller has not been.       (2)
 *   egg        they checked in there once.
 *   hatchling  they came back on another day.
 *   grown      a host verified work they did there.
 *
 * The last three are the same evidence ladder `companions.ts` already runs, so
 * a province creature cannot be bought, rolled for, or farmed by standing
 * still — and the species is whichever habitat they have the strongest
 * evidence in WITHIN that province, which makes the animal a record of what
 * they actually did rather than a prize the app handed out.
 */

import { SPECIES, stageFor, type CompanionStage, type Species } from './companions.ts';
import { PROVINCES, type Province } from './provinces.ts';
import type { Bilingual, LayerKey } from './types.ts';

export type ProvinceCompanionState = 'sealed' | 'unclaimed' | CompanionStage;

/** Evidence a traveller has in one habitat of one province. */
export interface ProvinceEvidence {
  /** ISO 3166-2:TH code. */
  code: string;
  layer: LayerKey;
  visitDays: number;
  questsVerified: number;
}

export interface ProvinceCompanion {
  province: Province;
  state: ProvinceCompanionState;
  /**
   * `null` for every state before `egg`, and that is the honest part.
   *
   * A sealed province has no species because nobody has surveyed it. An
   * unclaimed one has none because which habitat a traveller ends up in is
   * decided by where they go, not by the app deciding in advance.
   */
  species: Species | null;
  visitDays: number;
  questsVerified: number;
}

/**
 * The strongest evidence in a province, and the habitat it was earned in.
 *
 * Verified quests outrank visit days, because that is the ladder's own order:
 * one host-verified quest beats any number of self-verified check-ins. Ties
 * break on the layer name so the same evidence always yields the same animal
 * — a creature that changed species between two refreshes would be a bug
 * nobody could reproduce.
 */
function strongest(rows: ProvinceEvidence[]): ProvinceEvidence | null {
  if (rows.length === 0) return null;
  return [...rows].sort(
    (a, b) =>
      b.questsVerified - a.questsVerified
      || b.visitDays - a.visitDays
      || a.layer.localeCompare(b.layer),
  )[0]!;
}

/**
 * Every province, and what the traveller has there.
 *
 * Always 77 rows. A collection that only listed the provinces somebody had
 * visited would have no shape to it — the point of a collection is the empty
 * slots, and the point of THIS one is that seventy-five of the slots are
 * honest about not being fillable yet.
 */
export function provinceCompanions(evidence: ProvinceEvidence[]): ProvinceCompanion[] {
  const byProvince = new Map<string, ProvinceEvidence[]>();
  for (const row of evidence) {
    const list = byProvince.get(row.code) ?? [];
    list.push(row);
    byProvince.set(row.code, list);
  }

  return PROVINCES.map((province) => {
    const rows = byProvince.get(province.code) ?? [];
    const best = strongest(rows);
    const stage = best ? stageFor(best) : null;

    // Sealed beats everything, including evidence. If a province is somehow
    // carrying check-ins while still listed, the data is wrong and the app
    // should not quietly promote it — the province opens when it is opened.
    if (province.status !== 'open') {
      return { province, state: 'sealed', species: null, visitDays: 0, questsVerified: 0 };
    }
    if (best === null || stage === null) {
      return {
        province, state: 'unclaimed', species: null,
        visitDays: best?.visitDays ?? 0, questsVerified: 0,
      };
    }
    return {
      province,
      state: stage,
      species: SPECIES[best.layer] ?? null,
      visitDays: best.visitDays,
      questsVerified: best.questsVerified,
    };
  });
}

export interface ProvinceCollection {
  /** Companions at `egg` or better. What the traveller actually holds. */
  found: number;
  grown: number;
  /** Open provinces they have not been to. The reachable next ones. */
  unclaimed: number;
  /** Provinces that cannot be earned yet, at all, by anybody. */
  sealed: number;
  /** Always 77. Never the number we happen to have opened. */
  total: number;
}

/**
 * The collection, counted.
 *
 * `total` is 77 and never the two provinces that are open. "2 of 2" would
 * flatter the app and lie about the size of the thing being collected — the
 * same decision the passport makes about its denominator, for the same reason.
 */
export function provinceCollection(companions: ProvinceCompanion[]): ProvinceCollection {
  const held = companions.filter(
    (c) => c.state === 'egg' || c.state === 'hatchling' || c.state === 'grown',
  );
  return {
    found: held.length,
    grown: held.filter((c) => c.state === 'grown').length,
    unclaimed: companions.filter((c) => c.state === 'unclaimed').length,
    sealed: companions.filter((c) => c.state === 'sealed').length,
    total: PROVINCES.length,
  };
}

/** What a sealed egg is allowed to say about itself. Nothing about the animal. */
export const SEALED_EGG: Bilingual = {
  en: 'This province has not been surveyed, so which animal is inside is not known yet.',
  th: 'จังหวัดนี้ยังไม่ได้สำรวจ จึงยังไม่รู้ว่าข้างในเป็นสัตว์อะไร',
};

/** The one thing to do next, or null when the companion is fully grown. */
export function provinceNextStep(c: ProvinceCompanion): Bilingual | null {
  switch (c.state) {
    case 'sealed':
      return SEALED_EGG;
    case 'unclaimed':
      return {
        en: `Check in anywhere in ${c.province.name.en} to start this egg`,
        th: `เช็กอินที่ไหนก็ได้ใน${c.province.name.th} เพื่อเริ่มไข่ใบนี้`,
      };
    case 'grown':
      return null;
    case 'hatchling':
      return {
        en: `Have a host verify one quest in ${c.province.name.en}`,
        th: `ให้ผู้จัดภารกิจยืนยันภารกิจใน${c.province.name.th} หนึ่งครั้ง`,
      };
    default:
      return {
        en: `Check in again in ${c.province.name.en} on another day`,
        th: `เช็กอินใน${c.province.name.th}อีกครั้งในวันอื่น`,
      };
  }
}

/** The evidence-bearing states, in ladder order. Used by the UI and the tests. */
export const HELD_STATES: ProvinceCompanionState[] = ['egg', 'hatchling', 'grown'];
