import React from 'react';
import { Image, type ImageSourcePropType, type StyleProp, View, type ViewStyle } from 'react-native';
import type { QuestProgress } from '@chivago/core';

import malePlayer from '../../assets/chivar-icons/01-male-player.png';
import femalePlayer from '../../assets/chivar-icons/02-female-player.png';
import quest from '../../assets/chivar-icons/03-quest.png';
import culture from '../../assets/chivar-icons/04-culture.png';
import game from '../../assets/chivar-icons/05-game.png';
import food from '../../assets/chivar-icons/06-food.png';
import otop from '../../assets/chivar-icons/07-otop.png';
import workshop from '../../assets/chivar-icons/08-workshop.png';
import eco from '../../assets/chivar-icons/09-eco.png';
import viewpoint from '../../assets/chivar-icons/10-viewpoint.png';
import pier from '../../assets/chivar-icons/11-pier.png';
import transport from '../../assets/chivar-icons/12-transport.png';
import hospital from '../../assets/chivar-icons/13-hospital.png';
import toilet from '../../assets/chivar-icons/14-toilet.png';
import info from '../../assets/chivar-icons/15-info.png';
import treasure from '../../assets/chivar-icons/16-treasure.png';
import questNew from '../../assets/chivar-icons/17-quest-new.png';
import questInProgress from '../../assets/chivar-icons/18-quest-in-progress.png';
import questCompleted from '../../assets/chivar-icons/19-quest-completed.png';
import questLocked from '../../assets/chivar-icons/20-quest-locked.png';
import questNewClue from '../../assets/chivar-icons/21-quest-new-clue.png';

/**
 * The approved ChivarGo icon pack. Keeping the registry here prevents screens,
 * map markers and quest states from quietly choosing different artwork for the
 * same concept.
 */
export const CHIVAR_ICON_SOURCES = {
  malePlayer,
  femalePlayer,
  quest,
  culture,
  game,
  food,
  otop,
  workshop,
  eco,
  viewpoint,
  pier,
  transport,
  hospital,
  toilet,
  info,
  treasure,
  questNew,
  questInProgress,
  questCompleted,
  questLocked,
  questNewClue,
} satisfies Record<string, ImageSourcePropType>;

export type ChivarIconName = keyof typeof CHIVAR_ICON_SOURCES;

/**
 * Source files intentionally retain a generous transparent 512px artboard.
 * The oversized image is centred inside a clipped viewport so the actual 3D
 * artwork remains legible at navigation and map-marker sizes without editing
 * the supplied originals.
 */
export function ChivarIcon({
  name,
  size = 32,
  style,
  accessibilityLabel,
}: {
  name: ChivarIconName;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const artboard = size * 3.35;
  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[{ width: size, height: size, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Image
        source={CHIVAR_ICON_SOURCES[name]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        style={{ width: artboard, height: artboard }}
      />
    </View>
  );
}

/** A URI is needed by the HTML markers used inside MapLibre and the WebView. */
export function chivarIconUri(name: ChivarIconName): string {
  const source = CHIVAR_ICON_SOURCES[name];
  if (typeof source === 'string') return source;
  const rawSource: unknown = source;
  if (typeof rawSource === 'object' && rawSource !== null && !Array.isArray(rawSource) && 'uri' in rawSource) {
    return String((rawSource as { uri: unknown }).uri);
  }
  const resolve = (Image as typeof Image & {
    resolveAssetSource?: (asset: ImageSourcePropType) => { uri: string };
  }).resolveAssetSource;
  // react-native-web's Node renderer has no resolver. The actual web bundle
  // turns imported PNGs into URLs; only the render-only test stub reaches this
  // fallback, where an empty decorative src is sufficient and deterministic.
  return resolve ? resolve(source).uri : '';
}

export function questStateIcon(progress: QuestProgress | null | undefined): ChivarIconName {
  if (!progress) return 'questNew';
  if (progress.stage === 'complete') return 'questCompleted';
  return 'questInProgress';
}

/**
 * Convert the real service/category text to the matching icon. This accepts
 * both the Thai backend values and common English values used by imported
 * Koh Sichang datasets.
 */
export function serviceIconName(category: string): ChivarIconName | null {
  const value = category.trim().toLocaleLowerCase();
  if (/hospital|clinic|medical|โรงพยาบาล|คลินิก/.test(value)) return 'hospital';
  if (/toilet|restroom|ห้องน้ำ/.test(value)) return 'toilet';
  if (/pier|ferry|boat|ท่าเรือ|เรือ/.test(value)) return 'pier';
  if (/transport|transfer|car|rental|รถ|เช่ารถ/.test(value)) return 'transport';
  if (/food|restaurant|cafe|coffee|อาหาร|ร้านอาหาร|คาเฟ่/.test(value)) return 'food';
  if (/otop|souvenir|shopping|shop|ของฝาก|ร้านขายของ/.test(value)) return 'otop';
  if (/workshop|craft|activity|เวิร์กช็อป|หัตถกรรม/.test(value)) return 'workshop';
  if (/eco|green|nature|marine|สิ่งแวดล้อม|ธรรมชาติ|ทะเล/.test(value)) return 'eco';
  if (/viewpoint|photo|camera|จุดชมวิว|ถ่ายรูป/.test(value)) return 'viewpoint';
  if (/culture|temple|palace|museum|วัฒนธรรม|วัด|พระจุฑาธุช|พิพิธภัณฑ์/.test(value)) return 'culture';
  if (/game|เกม/.test(value)) return 'game';
  if (/quest|ภารกิจ|เควส/.test(value)) return 'quest';
  if (/treasure|สมบัติ/.test(value)) return 'treasure';
  if (/info|guide|information|ไกด์|ข้อมูล/.test(value)) return 'info';
  return null;
}

export function placeIconName(place: {
  id: string;
  name: { en: string; th: string; zh?: string };
  meta?: string;
  tags?: readonly string[];
  layer?: string;
}): ChivarIconName {
  const searchable = [
    place.id,
    place.name.en,
    place.name.th,
    place.name.zh ?? '',
    place.meta ?? '',
    ...(place.tags ?? []),
  ].join(' ');
  const matched = serviceIconName(searchable);
  if (matched) return matched;
  if (place.layer === 'Food') return 'food';
  if (place.layer === 'Green') return 'eco';
  if (place.layer === 'Quest') return 'quest';
  if (place.layer === 'Wellness') return 'viewpoint';
  return 'info';
}
