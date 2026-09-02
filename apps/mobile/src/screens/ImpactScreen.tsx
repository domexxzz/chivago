/**
 * Impact dashboard.
 *
 * Personal verified activity, rolled into the Samui community total that feeds
 * the ESG report partner hotels and sponsors rely on.
 *
 * Every bar is COMPUTED as actual/target. The design's 83/67/74/50/40 are
 * placeholders (handoff open question 3); the targets now live in the database,
 * so correcting one is an UPDATE rather than an app release.
 */

import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  MOODS, MOOD_KEYS, isHighScore, strings,
  type ChivaBalance, type MoodKey,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';

export function ImpactScreen({
  onToast, refreshKey,
}: { onToast: (msg: string) => void; refreshKey: number }) {
  const mine = useAsync(() => api.myImpact(), [refreshKey]);
  const community = useAsync(() => api.communityImpact(), [refreshKey]);
  const [moodKey, setMoodKey] = React.useState(0);
  const balance = useAsync(() => api.balance(), [refreshKey, moodKey]);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 14 }}>
        <Heading size={26} tracking={-0.52}>{t(strings.impact.title)}</Heading>

      </View>

      {mine.loading || community.loading ? <LoadingState /> : null}
      {mine.error ? <ErrorState message={mine.error} onRetry={mine.reload} /> : null}

      {mine.data ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            borderTopWidth: layout.ruleStrong,
            borderTopColor: color.text,
          }}
        >
          {mine.data.map((stat, i) => (
            <View
              key={stat.key}
              style={{
                width: '50%',
                paddingVertical: 16,
                paddingHorizontal: gutter,
                borderBottomWidth: 1,
                borderBottomColor: color.neutral300,
                borderRightWidth: i % 2 === 0 ? 1 : 0,
                borderRightColor: color.neutral300,
              }}
            >
              <Heading size={30} tracking={-0.6}>
                {`${stat.value.toLocaleString('en-US')}${stat.unit ? ` ${stat.unit}` : ''}`}
              </Heading>
              <Label size={10} tracking={0.12} style={{ marginTop: 6 }}>{t(stat.label)}</Label>
            </View>
          ))}
        </View>
      ) : null}

      <BalanceBlock
        balance={balance.data}
        loading={balance.loading}
        error={balance.error}
        onRetry={balance.reload}
        onMood={async (mood) => {
          const res = await api.recordMood(mood);
          if (!res.ok) { onToast(res.error); return; }
          setMoodKey((n) => n + 1);
          onToast(`${t(MOODS[mood].asks)}`);
        }}
      />

      {/*
        A community block that simply disappears on failure reads as "Samui has
        done nothing this year" - a worse lie than an error message, and one
        the traveller has no way to notice. It gets the same treatment as the
        personal half.
      */}
      {community.error ? (
        <ErrorState message={community.error} onRetry={community.reload} />
      ) : null}

      {community.data ? (
        <View style={{ paddingHorizontal: gutter, paddingTop: 20 }}>
          <Label size={10} tracking={0.16}>
            {t(strings.impact.community(community.data.year))}
          </Label>

          {community.data.metrics.map((m) => {
            // Computed, never hard-coded. If a target is wrong, fix the data.
            const pct = m.target > 0 ? Math.round((m.actual / m.target) * 100) : 0;
            return (
              <View key={m.key} style={{ marginTop: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Body size={13}>{t(m.label)}</Body>
                  <Heading size={13}>
                    {`${m.actual.toLocaleString('en-US')}${m.unit ? ` ${m.unit}` : ''}`}
                  </Heading>
                </View>
                <View style={{ height: 8, backgroundColor: color.neutral300, marginTop: 6 }}>
                  <View
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      height: '100%',
                      backgroundColor: color.text,
                    }}
                  />
                </View>
                <Label size={9} tracking={0.1} style={{ marginTop: 4 }}>
                  {t(strings.impact.ofTarget(pct))}
                </Label>
              </View>
            );
          })}
        </View>
      ) : null}

      <View
        style={{
          margin: gutter,
          marginTop: 24,
          marginBottom: 32,
          borderWidth: layout.ruleStrong,
          borderColor: color.text,
          borderRadius: radius.md,
          padding: 16,
        }}
      >
        <Label size={10} tracking={0.14} colour={color.accent700}>
          {t(strings.impact.verifiedData)}
        </Label>
        <Body size={13} style={{ marginTop: 8 }}>{t(strings.impact.verifiedBlurb)}</Body>

        <Button
          label={t(strings.impact.exportCard)}
          onPress={() => onToast(t(strings.impact.exported))}
          variant="secondary"
          height={44}
          style={{ marginTop: 14 }}
        />
      </View>
    </ScrollView>
  );
}

/**
 * Chiva Balance — how the trip is going, as distinct from how a place scores.
 *
 * Every component shows whether it was measured or self-reported. Four of the
 * five come from what actually happened; one is what somebody said. A
 * wellbeing number that hides which is which should not be trusted, and this
 * one does not ask to be.
 *
 * It is NOT a health assessment and must never be written as one. It reads a
 * mood as a travel preference and nothing more.
 */
function BalanceBlock({
  balance, loading, error, onRetry, onMood,
}: {
  balance: ChivaBalance | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onMood: (mood: MoodKey) => void;
}) {
  return (
    <View style={{ marginTop: 24, borderTopWidth: layout.ruleStrong, borderTopColor: color.text }}>
      <View style={{ paddingHorizontal: gutter, paddingTop: 18 }}>
        <Label size={10} tracking={0.16}>{t({ en: 'Chiva Balance', th: 'สมดุลชีวา' })}</Label>

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} onRetry={onRetry} /> : null}

        {balance ? (
          balance.total === null ? (
            // A number built from one afternoon is a guess wearing a number's
            // clothes. Say so instead of printing a zero.
            <View style={{ marginTop: 12 }}>
              <Body colour={color.neutral700}>{t(balance.note)}</Body>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 8 }}>
                <Heading size={44} colour={color.accent}>{balance.total}</Heading>
                <Label size={10} tracking={0.12} style={{ marginBottom: 10 }}>
                  {`OVER ${balance.days} DAY${balance.days === 1 ? '' : 'S'}`}
                </Label>
              </View>

              {balance.components.map((c) => (
                <View
                  key={c.key}
                  style={{
                    marginTop: 12,
                    paddingBottom: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: color.neutral300,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    <Heading size={13}>{t(c.label)}</Heading>
                    {/* Green when the component has earned it, ink otherwise. */}
                    <Heading size={13} colour={isHighScore(c.subScore) ? color.accent700 : color.text}>
                      {c.subScore}
                    </Heading>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                    <Body size={13} colour={color.neutral600}>{c.display}</Body>
                    {/* The provenance, always shown. */}
                    <Label size={9} tracking={0.1} colour={color.neutral500}>
                      {c.source === 'measured' ? 'MEASURED' : 'YOU TOLD US'}
                    </Label>
                  </View>
                </View>
              ))}
            </>
          )
        ) : null}
      </View>

      <MoodRow onMood={onMood} />
    </View>
  );
}

/** The check-in itself. Four moods in plain travel language, never clinical. */
function MoodRow({ onMood }: { onMood: (mood: MoodKey) => void }) {
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 18, paddingBottom: 8 }}>
      <Label size={10} tracking={0.14} colour={color.neutral600}>{t({ en: 'How are you today?', th: 'วันนี้เป็นอย่างไรบ้าง' })}</Label>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {MOOD_KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => onMood(key)}
            accessibilityRole="button"
            accessibilityLabel={`I feel ${t(MOODS[key].label)}`}
            style={{
              paddingVertical: 9,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: color.neutral400,
              borderRadius: radius.lg,
            }}
          >
            <Heading size={13}>{t(MOODS[key].label)}</Heading>

          </Pressable>
        ))}
      </View>
      <Body size={13} colour={color.neutral600} style={{ marginTop: 10 }}>{t({ en: 'This shapes the day we plan for you. It is not health advice.', th: 'ใช้ปรับแผนเที่ยวให้เหมาะกับคุณ ไม่ใช่คำแนะนำทางการแพทย์' })}</Body>
    </View>
  );
}
