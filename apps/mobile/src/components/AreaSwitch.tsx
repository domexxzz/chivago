/**
 * The area chips: the island and the surveyed campuses.
 *
 * The chosen capsule is filled. A traveller standing on a campus
 * should never have to find this - the QR code carries `?area=` and the
 * choice is remembered - but the chip is how a phone that opened on Samui
 * gets to a campus, and how a judge in the room flips among the areas.
 *
 * THE CHIPS WRAP; THEY DO NOT SCROLL. With four areas a sideways scroller
 * cut off exactly between two chips on a phone, so RMUTT and KU Bangkhen
 * were rendered and invisible, and nothing said the row could move. An area
 * nobody can see is an area nobody has. Wrapping keeps every area on screen
 * at any width, and the next campus adds to the wrap instead of to the
 * hidden end of a row.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { AREAS, type AreaKey } from '@chivago/core';
import { color, onFill, radius } from '../theme/index.ts';
import { Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';

export function AreaSwitch({
  area, onChange, tone = 'light',
}: {
  area: AreaKey;
  onChange: (next: AreaKey) => void;
  /** `light` sits on a white ground; `inverted` sits on the brand hero. */
  tone?: 'light' | 'inverted';
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 2, paddingVertical: 4 }}
    >
      {AREAS.map((a) => {
        const on = a.key === area;
        const fill = on ? '#0061A8' : '#FFFFFF';
        const ink = on ? '#FFFFFF' : '#52749D';
        const border = on ? '#0061A8' : '#BED4EB';
        return (
          <Pressable
            key={a.key}
            onPress={() => onChange(a.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(a.name)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              minHeight: 38,
              paddingVertical: 7,
              paddingHorizontal: 16,
              borderRadius: 100,
              backgroundColor: fill,
              borderWidth: 1.5,
              borderColor: border,
              shadowColor: '#0061A8',
              shadowOffset: { width: 0, height: on ? 2 : 1 },
              shadowOpacity: on ? 0.16 : 0.04,
              shadowRadius: 4,
              elevation: on ? 2 : 1,
            }}
          >
            {on ? <MapPin size={14} color="#FFFFFF" strokeWidth={2.4} /> : null}
            <Label size={11} tracking={0.04} colour={ink} style={{ fontWeight: on ? '700' : '500' }}>
              {t(a.name)}
            </Label>
          </Pressable>
        );
      })}
    </View>
  );
}
