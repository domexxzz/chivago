/**
 * The My Backpack icon set, taken from the reference design.
 *
 * Twenty-nine pieces of art - the backpack, the star, the flag, six rank
 * emblems, five eggs, the journal, the medal, the row icons and the
 * explorer with his dog - so that every icon on this one screen comes from
 * the same hand. Before this the page mixed three sources: 3D renders,
 * `lucide` line icons and the app's own `ChivarIcon` set, and the seams
 * showed most where they sat closest together, in the rank grid.
 *
 * WHAT THESE ARE, EXACTLY, because it decides how they may be used.
 *
 * They are PIXEL-FOR-PIXEL EXTRACTIONS from the reference image, cropped
 * out of a 1536 x 1024 picture, so each one is small: the backpack is
 * 76 x 74, the row icons are around 35 square, the eggs 43 x 51. The pack
 * also ships them as SVG, but those are not drawings - they are one path
 * per pixel, 3.1 MB for the set, and they enlarge no better than the PNG
 * does because the information is simply not there.
 *
 * So: DRAW THEM AT OR BELOW THEIR NATIVE SIZE. At 34-54 px, where this
 * screen uses them, they are close to one-to-one and look right. Asked to
 * fill a 96 px tile they will go soft, and on a three-times-density phone
 * they are softer than the vector menu icons beside them. That is the
 * honest cost of matching the reference exactly, and it is the trade the
 * design asked for; `NATIVE` below records what each one actually has, so
 * a future call site can check rather than guess.
 */

import React from 'react';
import { Image, type DimensionValue, type ImageSourcePropType } from 'react-native';

import myBackpack from '../../assets/backpack/my-backpack.png';
import starPoints from '../../assets/backpack/star-points.png';
import travelFlag from '../../assets/backpack/travel-flag.png';
import greenLeaves from '../../assets/backpack/green-points-leaves.png';
import rewardGift from '../../assets/backpack/reward-gift.png';
import myCollection from '../../assets/backpack/my-collection.png';
import rankNewcomer from '../../assets/backpack/rank-newcomer-binoculars.png';
import rankWanderer from '../../assets/backpack/rank-wanderer-hat.png';
import rankIslandExplorer from '../../assets/backpack/rank-island-explorer.png';
import rankSamuiInsider from '../../assets/backpack/rank-samui-insider-globe.png';
import rankChivaLegend from '../../assets/backpack/rank-chiva-legend-crown.png';
import rankFirstSteps from '../../assets/backpack/rank-first-steps-signpost.png';
import eggGrove from '../../assets/backpack/egg-grove.png';
import eggHillForest from '../../assets/backpack/egg-hill-forest.png';
import eggReef from '../../assets/backpack/egg-reef.png';
import eggBeach from '../../assets/backpack/egg-beach.png';
import eggField from '../../assets/backpack/egg-field.png';
import adventureJournal from '../../assets/backpack/adventure-journal.png';
import explorationMedal from '../../assets/backpack/exploration-medal.png';
import companionsIcon from '../../assets/backpack/companions.png';
import ledgerIcon from '../../assets/backpack/ledger.png';
import yourAccount from '../../assets/backpack/your-account.png';
import lockIcon from '../../assets/backpack/lock.png';
import noMascotLeaf from '../../assets/backpack/no-mascot-leaf.png';
import addPlus from '../../assets/backpack/add-plus.png';
import chevronRight from '../../assets/backpack/chevron-right.png';
import yellowSparkles from '../../assets/backpack/yellow-sparkles.png';
import explorerAndDog from '../../assets/backpack/explorer-and-dog.png';
import companionsBadge from '../../assets/backpack/travel-companions-badge.png';

export type BackpackIconKey =
  | 'my-backpack' | 'star-points' | 'travel-flag' | 'green-leaves'
  | 'reward-gift' | 'my-collection'
  | 'rank-newcomer' | 'rank-wanderer' | 'rank-island-explorer'
  | 'rank-samui-insider' | 'rank-chiva-legend' | 'rank-first-steps'
  | 'egg-grove' | 'egg-hill-forest' | 'egg-reef' | 'egg-beach' | 'egg-field'
  | 'adventure-journal' | 'exploration-medal'
  | 'companions' | 'ledger' | 'your-account'
  | 'lock' | 'no-mascot-leaf' | 'add-plus' | 'chevron-right' | 'sparkles'
  | 'explorer-and-dog' | 'companions-badge';

const ART: Record<BackpackIconKey, ImageSourcePropType> = {
  'my-backpack': myBackpack,
  'star-points': starPoints,
  'travel-flag': travelFlag,
  'green-leaves': greenLeaves,
  'reward-gift': rewardGift,
  'my-collection': myCollection,
  'rank-newcomer': rankNewcomer,
  'rank-wanderer': rankWanderer,
  'rank-island-explorer': rankIslandExplorer,
  'rank-samui-insider': rankSamuiInsider,
  'rank-chiva-legend': rankChivaLegend,
  'rank-first-steps': rankFirstSteps,
  'egg-grove': eggGrove,
  'egg-hill-forest': eggHillForest,
  'egg-reef': eggReef,
  'egg-beach': eggBeach,
  'egg-field': eggField,
  'adventure-journal': adventureJournal,
  'exploration-medal': explorationMedal,
  companions: companionsIcon,
  ledger: ledgerIcon,
  'your-account': yourAccount,
  lock: lockIcon,
  'no-mascot-leaf': noMascotLeaf,
  'add-plus': addPlus,
  'chevron-right': chevronRight,
  sparkles: yellowSparkles,
  'explorer-and-dog': explorerAndDog,
  'companions-badge': companionsBadge,
};

/**
 * What each piece actually has, in pixels, from the pack's own index.
 *
 * Not decoration: it is the ceiling above which a given icon stops being
 * sharp. The chevron has 17 x 25 to give and nothing more.
 */
export const BACKPACK_ICON_NATIVE: Record<BackpackIconKey, { w: number; h: number }> = {
  'my-backpack': { w: 76, h: 74 },
  'star-points': { w: 67, h: 66 },
  'travel-flag': { w: 73, h: 80 },
  'green-leaves': { w: 54, h: 42 },
  'reward-gift': { w: 66, h: 60 },
  'my-collection': { w: 68, h: 57 },
  'rank-newcomer': { w: 79, h: 59 },
  'rank-wanderer': { w: 86, h: 82 },
  'rank-island-explorer': { w: 78, h: 86 },
  'rank-samui-insider': { w: 82, h: 87 },
  'rank-chiva-legend': { w: 74, h: 89 },
  'rank-first-steps': { w: 58, h: 89 },
  'egg-grove': { w: 43, h: 51 },
  'egg-hill-forest': { w: 44, h: 51 },
  'egg-reef': { w: 42, h: 51 },
  'egg-beach': { w: 45, h: 51 },
  'egg-field': { w: 43, h: 51 },
  'adventure-journal': { w: 100, h: 115 },
  'exploration-medal': { w: 81, h: 112 },
  companions: { w: 41, h: 34 },
  ledger: { w: 34, h: 37 },
  'your-account': { w: 35, h: 37 },
  lock: { w: 33, h: 40 },
  'no-mascot-leaf': { w: 37, h: 38 },
  'add-plus': { w: 34, h: 35 },
  'chevron-right': { w: 17, h: 25 },
  sparkles: { w: 35, h: 37 },
  'explorer-and-dog': { w: 224, h: 220 },
  'companions-badge': { w: 45, h: 42 },
};

export const BACKPACK_ICON_KEYS = Object.keys(ART) as BackpackIconKey[];

/**
 * One icon, square unless told otherwise.
 *
 * `contain` rather than `cover`: these are cut-outs with their own margins
 * and an aspect ratio of their own, and cropping a 17 x 25 chevron to a
 * square would cut the point off it.
 */
export function BackpackIcon({
  name, size = 32, width, height,
}: {
  name: BackpackIconKey;
  size?: number;
  /**
   * An explicit box, when the icon is not square or is filling a slot.
   * A percentage is allowed for the one case that needs it: the explorer
   * and his dog, who fill the corner of the companions card.
   */
  width?: DimensionValue;
  height?: DimensionValue;
}) {
  const art = ART[name];
  // A key with no art draws nothing rather than throwing: a gap in a row is
  // survivable, an error thrown mid-screen is not.
  if (!art) return null;
  return (
    <Image
      source={art}
      resizeMode="contain"
      style={{ width: width ?? size, height: height ?? size }}
      /*
        Silent to a screen reader. Every place that draws one of these sits
        inside a control or a row that already carries its own label, and an
        icon that announced itself would have the reader say it twice.
      */
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      accessibilityRole="none"
    />
  );
}
