import type { ImageSourcePropType } from 'react-native';
import type { Quest } from '@chivago/core';

import beachCleanup from '../../assets/mission-beach-cleanup-v1.png';
import community from '../../assets/mission-community-v1.png';
import coral from '../../assets/mission-coral-v1.png';
import sichangExplorer from '../../assets/mission-sichang-explorer-v1.png';
import sichangGreenJourney from '../../assets/mission-sichang-green-journey-v1.png';
import sichangRecipe from '../../assets/mission-sichang-recipe-v1.png';
import sichangTrashHero from '../../assets/mission-sichang-trash-hero-v1.png';
import sichangTreasure from '../../assets/mission-sichang-treasure-v1.png';

/**
 * The five Ko Sichang quests have artwork of their own, one drawing each,
 * rather than a family image shared across the area.
 *
 * Keyed on the whole code, not the family, because that is the point: the
 * drawing shows what THAT quest asks for - the ingredient game, the sorted
 * bins, the shop counter - and a family fallback would put a beach on all
 * five. If a code is ever reused for different work the picture must move
 * with the work, so this map is the thing to change, not the asset file.
 *
 * Concept drawings. They are not photographs of the island, and they picture
 * no real shop, route or participant.
 */
const SICHANG_ARTWORK: Readonly<Record<string, ImageSourcePropType>> = {
  'SC-01': sichangExplorer,
  'SC-02': sichangRecipe,
  'SC-03': sichangTrashHero,
  'SC-04': sichangTreasure,
  'SC-05': sichangGreenJourney,
};

/**
 * Stable artwork assignment for a quest.
 *
 * It keys off the server-owned quest code rather than array order, so a new
 * filter, area, or API sort cannot silently put the coral photograph on a
 * beach-cleanup record. Unknown families fall back to the community image;
 * it makes no claim about a measured result, reward, place, or participant.
 */
export function questArtworkSource(quest: Pick<Quest, 'code'>): ImageSourcePropType {
  const code = quest.code.toUpperCase();
  const sichang = SICHANG_ARTWORK[code];
  if (sichang) return sichang;
  const family = code.split('-')[0];
  if (family === 'CR') return coral;
  if (family === 'BC' || family === 'KU' || family === 'RM') return beachCleanup;
  return community;
}

