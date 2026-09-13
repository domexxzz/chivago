/**
 * The gentle set: what shows after somebody says they are drained or tense.
 *
 * Everything about this block is quieter than the rest of the app on purpose.
 * No points chip, no progress bar, no tick boxes, no "3 of 4 done" - the
 * steps are listed and that is all, because `gentle.ts` in core refuses to
 * pay for any of them and a UI that counted them would put the reward back in
 * through the side door.
 *
 * There is nothing to press except the helpline and, when the app has one
 * measured, a place to go. A screen that asks a tired person to tap four
 * times before anything happens has misread the room.
 */

import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Phone } from 'lucide-react-native';
import { SUPPORT_LINE, gentleStepsFor, type MoodKey, type RechargeCandidate } from '@chivago/core';
import { color, gutter, layout, radius } from '../theme/index.ts';
import { Body, Heading, Label } from './Type.tsx';
import { t } from '../i18n/locale.ts';

export function GentleSteps({
  mood, recharge, onOpenPlace,
}: {
  mood: MoodKey;
  /** The nearest measured place worth sitting in, or null when none qualifies. */
  recharge: RechargeCandidate | null;
  onOpenPlace?: (placeId: string) => void;
}) {
  const steps = gentleStepsFor(mood);
  if (steps.length === 0) return null;

  return (
    <View
      style={{
        marginHorizontal: gutter,
        marginTop: 14,
        padding: 16,
        borderRadius: radius.md,
        borderWidth: layout.ruleHair,
        borderColor: color.neutral300,
        backgroundColor: color.surface,
      }}
    >
      <Label size={10} tracking={0.14} colour={color.neutral600}>
        {t({ en: 'No rush', th: 'ไม่ต้องรีบ' })}
      </Label>
      <Heading size={15} style={{ marginTop: 4 }}>
        {t({ en: 'Small things, none of them scored', th: 'เรื่องเล็กๆ ที่ไม่ถูกให้คะแนน' })}
      </Heading>

      {steps.map((step) => (
        <View key={step.key} style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Heading size={14} style={{ flex: 1 }}>{t(step.title)}</Heading>
            <Label size={9} tracking={0.06} colour={color.neutral600} style={{ textTransform: 'none' }}>
              {t({ en: `${step.minutes} min`, th: `${step.minutes} นาที` })}
            </Label>
          </View>
          <Body size={13} colour={color.neutral700} style={{ marginTop: 3 }}>{t(step.detail)}</Body>
        </View>
      ))}

      {/*
        The one place the app is willing to name, and only when it measured
        it. `rechargeFrom` returns null rather than a second-best, so a null
        here means nothing qualified and the block simply says less.
      */}
      {recharge ? (
        <Pressable
          onPress={() => onOpenPlace?.(recharge.id)}
          accessibilityRole="button"
          accessibilityLabel={`${t({ en: 'Somewhere quiet', th: 'ที่เงียบๆ' })}: ${t(recharge.name)}`}
          style={{
            marginTop: 16, paddingTop: 14,
            borderTopWidth: layout.ruleHair, borderTopColor: color.neutral300,
          }}
        >
          <Label size={9} tracking={0.12} colour={color.brand}>
            {t({ en: 'Quietest place we measured', th: 'ที่ที่เงียบที่สุดเท่าที่วัดไว้' })}
          </Label>
          <Heading size={14} style={{ marginTop: 3 }}>{t(recharge.name)}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 2 }}>
            {t({
              en: `${recharge.crowd} people seen in the last hour${recharge.aqi === null ? '' : ` · air ${recharge.aqi}`}`,
              th: `เห็นคน ${recharge.crowd} คนในชั่วโมงที่ผ่านมา${recharge.aqi === null ? '' : ` · อากาศ ${recharge.aqi}`}`,
            })}
          </Body>
        </Pressable>
      ) : null}

      {/*
        Always, never held back for a state this app has no way to detect.
        Four words on a check-in cannot tell anybody how somebody is doing.
      */}
      <Pressable
        onPress={() => void Linking.openURL(`tel:${SUPPORT_LINE.dial}`)}
        accessibilityRole="button"
        accessibilityLabel={`${t(SUPPORT_LINE.name)} ${SUPPORT_LINE.dial}`}
        style={{
          marginTop: 16, paddingTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
          borderTopWidth: layout.ruleHair, borderTopColor: color.neutral300,
        }}
      >
        <Phone size={18} color={color.brand} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Heading size={14}>{`${t(SUPPORT_LINE.name)} · ${SUPPORT_LINE.dial}`}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 2 }}>{t(SUPPORT_LINE.note)}</Body>
        </View>
      </Pressable>
    </View>
  );
}
