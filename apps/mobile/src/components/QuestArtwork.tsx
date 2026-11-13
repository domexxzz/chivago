import type { ImageSourcePropType } from 'react-native';
import type { Quest } from '@chivago/core';

import beachCleanup from '../../assets/mission-beach-cleanup-v1.png';
import community from '../../assets/mission-community-v1.png';
import coral from '../../assets/mission-coral-v1.png';
import sichangExplorer from '../../assets/quest-sichang-explorer.png';
import sichangSecretRecipe from '../../assets/quest-sichang-secret-recipe.png';
import sichangTrashHero from '../../assets/quest-sichang-trash-hero.png';
import sichangLocalTreasure from '../../assets/quest-sichang-local-treasure.png';
import sichangGreenJourney from '../../assets/quest-sichang-green-journey.png';

const SICHANG_ARTWORK: Record<string, ImageSourcePropType> = {
  'SG-01': sichangExplorer,
  'SG-02': sichangSecretRecipe,
  'SG-03': sichangTrashHero,
  'SG-04': sichangLocalTreasure,
  'SG-05': sichangGreenJourney,
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
  const sichang = SICHANG_ARTWORK[quest.code.toUpperCase()];
  if (sichang) return sichang;
  const family = quest.code.split('-')[0]?.toUpperCase();
  if (family === 'CR') return coral;
  if (family === 'BC' || family === 'KU' || family === 'RM') return beachCleanup;
  return community;
}

