import type { ImageSourcePropType } from 'react-native';
import type { Quest } from '@chivago/core';

import beachCleanup from '../../assets/mission-beach-cleanup-v1.png';
import community from '../../assets/mission-community-v1.png';
import coral from '../../assets/mission-coral-v1.png';

/**
 * Stable artwork assignment for a quest.
 *
 * It keys off the server-owned quest code rather than array order, so a new
 * filter, area, or API sort cannot silently put the coral photograph on a
 * beach-cleanup record. Unknown families fall back to the community image;
 * it makes no claim about a measured result, reward, place, or participant.
 */
export function questArtworkSource(quest: Pick<Quest, 'code'>): ImageSourcePropType {
  const family = quest.code.split('-')[0]?.toUpperCase();
  if (family === 'CR') return coral;
  if (family === 'BC' || family === 'KU' || family === 'RM') return beachCleanup;
  return community;
}

