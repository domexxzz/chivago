/**
 * The fair lot the map is showing (docs/66): its code in its zone's colour,
 * who is in it, a way back to the list it came from, and a way to put the map
 * back. Shown above the map on every device - on a phone, where the campus has
 * no map yet, it is the answer on its own.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { ChevronLeft, X } from 'lucide-react-native';
import { strings, type FairLot } from '@chivago/core';
import { Body, Heading, Label } from './Type.tsx';
import { zoneTone } from './fair-tones.ts';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { t } from '../i18n/locale.ts';

export function FairBanner({ lot, marked, onClose, onList }: {
  lot: FairLot;
  /**
   * Whether the map under the banner draws the lots. Only the web map does;
   * the phone's campus list, the drawn island and the feed do not, and there
   * the banner must not point at marks nobody can see.
   */
  marked: boolean;
  onClose: () => void;
  /** Back to the fair's list, as it was left. */
  onList?: () => void;
}) {
  const tone = zoneTone(lot.zone.code);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[shadow.card, {
        marginHorizontal: gutter, marginTop: 10, padding: 12, gap: 12, flexDirection: 'row', alignItems: 'center',
        borderRadius: radius.md, backgroundColor: color.surface, borderLeftWidth: 5, borderLeftColor: tone,
      }]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: 54, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tone }}
      >
        <Heading size={17} colour="#ffffff">{lot.code}</Heading>
      </View>
      <View style={{ flex: 1 }}>
        <Heading size={15}>
          {lot.stall ? t(strings.fair.onMap(lot.code, lot.stall.name)) : t(strings.fair.onMapFree(lot.code))}
        </Heading>
        {lot.stall ? <Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>{lot.stall.sells}</Body> : null}
        <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 4, textTransform: 'none' }}>
          {marked ? `${lot.zone.icon} ${t(lot.zone.name)} · ${t(strings.fair.mapHint)}` : `${lot.zone.icon} ${t(lot.zone.name)}`}
        </Label>
        {onList ? (
          <Pressable
            onPress={onList}
            accessibilityRole="button"
            style={{ marginTop: 6, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' }}
          >
            <ChevronLeft size={18} color={color.brand} strokeWidth={2.2} />
            <Body size={14} colour={color.brand} style={{ fontWeight: '700' }}>{t(strings.fair.backToList)}</Body>
          </Pressable>
        ) : null}
      </View>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t(strings.fair.close)} hitSlop={12} style={{ padding: 4 }}>
        <X size={20} color={color.neutral600} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}
