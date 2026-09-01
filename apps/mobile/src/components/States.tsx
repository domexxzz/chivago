/**
 * Loading, error and empty states.
 *
 * The prototype has none of these - it is a self-contained demo. A real app on
 * a beach with one bar of signal spends real time in all three, so they are
 * first-class here rather than an afterthought.
 */

import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { strings } from '@chivago/core';
import { color, gutter } from '../theme/index.ts';
import { Body, Label, Thai } from './Type.tsx';
import { Button } from './Button.tsx';

export function LoadingState({ label }: { label?: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? strings.common.loading.en}
      style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}
    >
      <ActivityIndicator color={color.brand} />
      <Label size={10} tracking={0.14}>{label ?? strings.common.loading.en}</Label>
    </View>
  );
}

/**
 * An error the user can act on.
 * Never shows a status code or a stack - it tells them what happened and gives
 * them the one button that might fix it.
 */
export function ErrorState({
  message, onRetry,
}: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingVertical: 32 }}>
      <Body colour={color.text}>{message}</Body>
      <Thai size={11} style={{ marginTop: 6 }}>{strings.common.offline.th}</Thai>
      {onRetry ? (
        <Button
          label={strings.common.retry.en}
          onPress={onRetry}
          variant="secondary"
          height={44}
          style={{ marginTop: 16 }}
        />
      ) : null}
    </View>
  );
}

export function EmptyState({ en, th }: { en: string; th: string }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingVertical: 40 }}>
      <Body colour={color.neutral700}>{en}</Body>
      <Thai size={11} style={{ marginTop: 6 }}>{th}</Thai>
    </View>
  );
}
