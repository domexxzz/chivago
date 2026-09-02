/**
 * Onboarding - three taps to a wellness profile.
 *
 * The answers weight the Healthy Score (see @chivago/core healthy-score.ts) and
 * seed the quest feed. Skippable; everything is re-editable later.
 *
 * PDPA: the consent line sits on the screen that switches these features on,
 * not buried in settings, and the notice VERSION is recorded with the answer so
 * we can prove what was agreed to.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { strings, type ActivityKey, type PurposeKey, type WatchKey } from '@chivago/core';
import { color, gutter, layout, onFill, radius, ruleStrong, ruleHair } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { t } from '../i18n/locale.ts';

type StepAnswer = PurposeKey[] | ActivityKey[] | WatchKey[];

const STEPS = [
  {
    title: strings.onboarding.q1,
    cta: strings.onboarding.continueCta,
    multi: true,
    options: Object.entries(strings.onboarding.purposes) as [PurposeKey, { en: string; th: string }][],
  },
  {
    title: strings.onboarding.q2,
    cta: strings.onboarding.continueCta,
    // Activity level is single-select: "gentle" and "full days" are mutually
    // exclusive, and letting both through makes the weighting meaningless.
    multi: false,
    options: Object.entries(strings.onboarding.activities) as [ActivityKey, { en: string; th: string }][],
  },
  {
    title: strings.onboarding.q3,
    cta: strings.onboarding.enterCta,
    multi: true,
    options: Object.entries(strings.onboarding.watch) as [WatchKey, { en: string; th: string }][],
  },
] as const;

export function OnboardingScreen({
  onFinish,
}: {
  onFinish: (answers: {
    purposes: PurposeKey[]; activity: ActivityKey | null; watch: WatchKey[];
  }) => void;
}) {
  const [step, setStep] = React.useState(0);
  const [picks, setPicks] = React.useState<Record<number, string[]>>({});

  const current = STEPS[step]!;
  const selected = picks[step] ?? [];

  const toggle = (key: string) => {
    setPicks((p) => {
      const cur = p[step] ?? [];
      if (!current.multi) return { ...p, [step]: cur.includes(key) ? [] : [key] };
      return {
        ...p,
        [step]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
      };
    });
  };

  const finish = () => {
    onFinish({
      purposes: (picks[0] ?? []) as PurposeKey[],
      activity: ((picks[1] ?? [])[0] ?? null) as ActivityKey | null,
      watch: (picks[2] ?? []) as WatchKey[],
    });
  };

  const next = () => (step < 2 ? setStep(step + 1) : finish());

  return (
    <View style={{ flex: 1, paddingHorizontal: 26, paddingTop: 22, paddingBottom: 22 }}>
      {/* Progress: 3 equal bars, filled up to AND INCLUDING the current step. */}
      <View style={{ flexDirection: 'row', gap: 5, marginBottom: 26 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              // Where you are in a flow. The app narrating itself: brand.
              backgroundColor: i <= step ? color.brand : color.neutral300,
            }}
          />
        ))}
      </View>

      <Label size={11} tracking={0.14} colour={color.accent700}>
        {t(strings.onboarding.step(step + 1))}
      </Label>
      <Heading size={34} tracking={-0.85} style={{ marginTop: 8 }}>{t(current.title)}</Heading>


      <ScrollView style={[ruleStrong, { flex: 1, marginTop: 20 }]} showsVerticalScrollIndicator={false}>
        {current.options.map(([key, copy]) => {
          const on = selected.includes(key);
          return (
            <Pressable
              key={key}
              onPress={() => toggle(key)}
              accessibilityRole={current.multi ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${t(copy)}`}
              style={[
                ruleHair,
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingVertical: 13,
                  paddingHorizontal: 12,
                  backgroundColor: on ? color.accent200 : 'transparent',
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Heading size={16}>{t(copy)}</Heading>

              </View>
              <View
                style={{
                  width: 24,
                  height: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: on ? color.brand : color.neutral400,
                  backgroundColor: on ? color.brand : 'transparent',
                  borderRadius: radius.sm,
                }}
              >
                {on ? <Check size={14} color={onFill.brand} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        })}

        {/* PDPA notice, on the screen that actually collects the data. */}
        {step === 2 ? (
          <View style={{ paddingVertical: 14, paddingHorizontal: 12 }}>
            <Body size={13} colour={color.neutral700}>{t(strings.onboarding.consent)}</Body>

          </View>
        ) : null}
      </ScrollView>

      <Button label={t(current.cta)} onPress={next} height={52} style={{ marginTop: 16 }} />
      <Button
        label={`${t(strings.common.skip)}`}
        onPress={finish}
        variant="ghost"
        style={{ marginTop: 10 }}
      />
    </View>
  );
}
