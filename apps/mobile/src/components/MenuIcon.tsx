/**
 * The seven menu icons, as one set.
 *
 * The navigation used to carry two different kinds of icon at once: six
 * 3D-rendered PNGs for Home, Map, My Backpack, Community, Local Picks and
 * Profile, and a flat line icon for Games & Quests, which had never been
 * drawn. One cell therefore looked like a different product from the other
 * six - and on a wide rail, where all seven are seen together, the odd one
 * out was the first thing the eye found.
 *
 * This draws all seven from one pack, including the quest scroll that was
 * missing, so the menu reads as a set.
 *
 * WHY PNG AND NOT THE SVG THE PACK SHIPS. The pack is vector and the vector
 * is the source of truth - it sits beside these files in `assets/menu/` and
 * is what a designer edits. The app loads the PNG renders of it for one
 * practical reason: Metro will not load an `.svg` as a component without
 * `react-native-svg-transformer`, and the runtime alternative, `SvgXml`,
 * cannot be imported at all in this repository's test harness, where
 * `react-native-svg`'s CommonJS build does not re-export it - so every
 * screen test would fail at import. The renders are 768 px square with
 * transparency, which is about five times the density the largest cell
 * draws, and `Image` is the mechanism the rest of this app already uses.
 *
 * If this ever wants to be vector, the change is the transformer and these
 * seven imports - not the call sites.
 */

import React from 'react';
import { Image, type ImageSourcePropType } from 'react-native';

import homeIcon from '../../assets/menu/menu-home-v2.png';
import mapIcon from '../../assets/menu/menu-map-v2.png';
import questIcon from '../../assets/menu/menu-game-and-quest-v2.png';
import backpackIcon from '../../assets/menu/menu-my-backpack-v2.png';
import communityIcon from '../../assets/menu/menu-community-v2.png';
import localPicksIcon from '../../assets/menu/menu-local-picks-v2.png';
import profileIcon from '../../assets/menu/menu-profile-v2.png';

export type MenuIconKey =
  | 'home' | 'map' | 'game-and-quest' | 'my-backpack'
  | 'community' | 'local-picks' | 'profile';

const ART: Record<MenuIconKey, ImageSourcePropType> = {
  home: homeIcon,
  map: mapIcon,
  'game-and-quest': questIcon,
  'my-backpack': backpackIcon,
  community: communityIcon,
  'local-picks': localPicksIcon,
  profile: profileIcon,
};

export const MENU_ICON_KEYS = Object.keys(ART) as MenuIconKey[];

export function MenuIcon({ name, size = 32 }: { name: MenuIconKey; size?: number }) {
  const art = ART[name];
  // A key that is not in the pack draws nothing rather than throwing: a gap
  // in a menu is survivable, and an error thrown inside a tab bar takes the
  // whole shell down with it.
  if (!art) return null;
  return (
    <Image
      source={art}
      resizeMode="contain"
      style={{ width: size, height: size }}
      /*
        SILENT TO A SCREEN READER, on purpose. Every cell that draws one of
        these already carries its own `accessibilityLabel` - "Map", "My
        Backpack" - and an icon that announced itself as well would have the
        reader say each destination twice.
      */
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      accessibilityRole="none"
    />
  );
}
