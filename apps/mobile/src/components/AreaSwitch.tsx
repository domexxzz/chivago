/**
 * The area chips: the island and the surveyed campuses.
 *
 * The chosen capsule is filled. A traveller standing on a campus
 * should never have to find this - the QR code carries `?area=` and the
 * choice is remembered - but the chip is how a phone that opened on Samui
 * gets to a campus, and how a judge in the room flips among the areas.
 */

import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView } from 'react-native';
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
  const scroll = useRef<ScrollView>(null);
  const positions = useRef<Partial<Record<AreaKey, number>>>({});
  useEffect(() => {
    scroll.current?.scrollTo({ x: positions.current[area] ?? 0, animated: true });
  }, [area]);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      contentContainerStyle={{ gap: 8 }}
      onContentSizeChange={() => scroll.current?.scrollTo({ x: positions.current[area] ?? 0, animated: false })}
    >
      {AREAS.map((a) => {
        const on = a.key === area;
        const fill = tone === 'inverted'
          ? (on ? color.surface : 'rgba(255,255,255,0.16)')
          : (on ? color.brand : color.surface);
        const ink = tone === 'inverted'
          ? (on ? color.brand : onFill.brand)
          : (on ? onFill.brand : color.neutral700);
        return (
          <Pressable
            key={a.key}
            onPress={() => onChange(a.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(a.name)}
            onLayout={(event) => {
              positions.current[a.key] = event.nativeEvent.layout.x;
              if (on) scroll.current?.scrollTo({ x: event.nativeEvent.layout.x, animated: false });
            }}
            style={{
              minHeight: 32, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.lg,
              backgroundColor: fill,
              borderWidth: 1,
              borderColor: tone === 'inverted' ? 'rgba(255,255,255,0.28)' : (on ? color.brand : color.neutral300),
            }}
          >
            <Label size={11} tracking={0.08} colour={ink}>{t(a.name)}</Label>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
