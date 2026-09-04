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
import { Image, Pressable, ScrollView, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { strings, type ActivityKey, type PurposeKey, type ScoredPlace, type WatchKey } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, onFill, radius, shadow } from '../theme/index.ts';
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

  /*
    The reference opens on a photograph and a question. This opens on the
    same, with the one difference that matters: the photograph is one of the
    island's licensed ones, credit and all, or no photograph at all. A stock
    beach on the first screen would be the app's first invented claim.
  */
  const places = useAsync(() => api.places(), []);
  const photo = (places.data as ScoredPlace[] | null)?.find((pl) => pl.photo) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <View style={{ height: 200, backgroundColor: color.brand, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' }}>
        {photo?.photo ? (
          <>
            <Image source={{ uri: photo.photo.url }} resizeMode="cover" style={{ width: '100%', height: '100%' }}
              accessibilityLabel={`${t(photo.name)}, photographed by ${photo.photo.credit}`} />
            <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.85)', paddingVertical: 3, paddingHorizontal: 8, borderTopLeftRadius: radius.sm }}>
              <Label size={9} tracking={0.06} colour={color.neutral700} style={{ textTransform: 'none' }}>{`${photo.photo.credit} · ${photo.photo.licence}`}</Label>
            </View>
          </>
        ) : null}
        <View style={{ position: 'absolute', left: 26, bottom: 18 }}>
          <Heading size={30} tracking={-0.6} colour={onFill.brand}>ChivaGo</Heading>
          <Label size={10} tracking={0.14} colour={color.brandSoft}>{t({ en: 'Koh Samui', th: 'เกาะสมุย' })}</Label>
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 26, paddingTop: 18, paddingBottom: 22 }}>
      {/* Progress: 3 equal bars, filled up to AND INCLUDING the current step. */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 18 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 5,
              borderRadius: radius.lg,
              // Where you are in a flow. The app narrating itself: brand.
              backgroundColor: i <= step ? color.brand : color.neutral300,
            }}
          />
        ))}
      </View>

      <Label size={11} tracking={0.14} colour={color.brand}>
        {t(strings.onboarding.step(step + 1))}
      </Label>
      <Heading size={28} tracking={-0.6} style={{ marginTop: 6 }}>{t(current.title)}</Heading>

      <ScrollView style={{ flex: 1, marginTop: 14 }} showsVerticalScrollIndicator={false}>
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
                shadow.card,
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginTop: 8,
                  paddingVertical: 13,
                  paddingHorizontal: 14,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  // A choice is the traveller's, so it is brand - not the
                  // evidence green, which it was.
                  borderColor: on ? color.brand : color.surface,
                  backgroundColor: on ? color.brandSoft : color.surface,
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
                  borderRadius: radius.lg,
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
        style={{ marginTop: 10, alignSelf: 'center' }}
      />
      </View>
    </View>
  );
}
