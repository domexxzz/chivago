/**
 * Impact dashboard.
 *
 * Personal verified activity, rolled into the community total that feeds
 * the ESG report a sponsor can file.
 *
 * Every bar is COMPUTED as actual/target. The design's 83/67/74/50/40 are
 * placeholders (handoff open question 3); the targets now live in the database,
 * so correcting one is an UPDATE rather than an app release.
 */

import React from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import {
  MOODS, MOOD_KEYS, isHighScore, needsGentle, rechargeFrom, strings,
  type ChivaBalance, type MoodKey, type RechargeCandidate, type ScoredPlace,
} from '@chivago/core';
import { api, type TreeImpactView } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, radius, shadow } from '../theme/index.ts';
import { tintFor } from '@chivago/tokens';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { OceanBackdrop, TravelHeroBackdrop } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { GentleSteps } from '../components/GentleSteps.tsx';
import { t } from '../i18n/locale.ts';
import { formatInteger } from '../i18n/format.ts';

/**
 * The places, as the recharge chooser wants them.
 *
 * Only what was actually measured travels across: the crowd count the place
 * reported and its AQI. A place with no crowd row has not been counted rather
 * than been found empty, so it goes over as zero and loses on distance, and
 * `rechargeFrom` throws out anything whose air nobody read.
 */
const asCandidates = (places: ScoredPlace[]): RechargeCandidate[] => places.map((p) => ({
  id: p.id,
  name: p.name,
  layer: p.layer,
  crowd: p.crowd?.checkinsLastHour ?? 0,
  aqi: p.metrics.aqi,
  metresAway: null,
}));

export function ImpactScreen({
  onToast, refreshKey,
}: { onToast: (msg: string) => void; refreshKey: number }) {
  const mine = useAsync(() => api.myImpact(), [refreshKey]);
  const trees = useAsync(() => api.treeImpact(), [refreshKey]);
  const community = useAsync(() => api.communityImpact(), [refreshKey]);
  const [moodKey, setMoodKey] = React.useState(0);
  const balance = useAsync(() => api.balance(), [refreshKey, moodKey]);
  /*
    What they last said, this session only. Deliberately not read back from
    the server: the gentle set is a response to somebody telling us something
    just now, and having it waiting on the screen days later would be the app
    remembering a bad afternoon at them.
  */
  const [saidToday, setSaidToday] = React.useState<MoodKey | null>(null);
  // Asked for only once somebody has said they are struggling, so an ordinary
  // visit to this screen does not fetch the whole place list.
  const places = useAsync(
    async () => (saidToday && needsGentle(saidToday) ? api.places() : { ok: true as const, data: [] as ScoredPlace[] }),
    [saidToday],
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <View
        style={{
          paddingHorizontal: gutter,
          paddingTop: 22,
          paddingBottom: 20,
          backgroundColor: '#028090',
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
          overflow: 'hidden',
          shadowColor: '#004E64',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.14,
          shadowRadius: 10,
          elevation: 3,
        }}
      >
        <TravelHeroBackdrop compact focalPoint="right" />
        <Label size={10} tracking={0.16} colour="#D5F6FF">
          {t({ en: 'VERIFIED IMPACT', th: 'ผลลัพธ์ที่ตรวจสอบได้', zh: '已验证的影响' })}
        </Label>
        <Heading size={26} tracking={-0.52} colour="#FFFFFF" style={{ marginTop: 4 }}>
          {t(strings.impact.title)}
        </Heading>
      </View>

      {mine.loading || community.loading ? <LoadingState /> : null}
      {mine.error ? <ErrorState message={mine.error} onRetry={mine.reload} /> : null}

      {mine.data ? (
        <View
          style={[
            shadow.card,
            {
              flexDirection: 'row',
              flexWrap: 'wrap',
              marginHorizontal: gutter,
              marginTop: 16,
              backgroundColor: color.surface,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: '#DCEFF5',
              overflow: 'hidden',
            },
          ]}
        >
          <OceanBackdrop subtle />
          {mine.data.map((stat, i) => (
            <View
              key={stat.key}
              style={{
                width: '50%',
                paddingVertical: 18,
                paddingHorizontal: gutter,
                borderBottomWidth: i < 2 ? 1 : 0,
                borderBottomColor: '#E2EFF3',
                borderRightWidth: i % 2 === 0 ? 1 : 0,
                borderRightColor: '#E2EFF3',
              }}
            >
              <Heading size={30} tracking={-0.6}>
                {`${formatInteger(stat.value)}${stat.unit ? ` ${stat.unit}` : ''}`}
              </Heading>
              <Label size={10} tracking={0.12} style={{ marginTop: 6 }}>{t(stat.label)}</Label>
            </View>
          ))}
        </View>
      ) : null}

      <TreeImpactBlock impact={trees.data} loading={trees.loading} error={trees.error} onRetry={trees.reload} />

      <BalanceBlock
        balance={balance.data}
        loading={balance.loading}
        error={balance.error}
        onRetry={balance.reload}
        onMood={async (mood) => {
          const res = await api.recordMood(mood);
          if (!res.ok) { onToast(res.error); return; }
          setMoodKey((n) => n + 1);
          setSaidToday(mood);
          onToast(`${t(MOODS[mood].asks)}`);
        }}
      />

      {/*
        Only for the two moods that asked for it, and only after somebody
        pressed one. The app never decides on its own that a person is having
        a hard day - see `gentle.ts`.
      */}
      {saidToday && needsGentle(saidToday) ? (
        <GentleSteps mood={saidToday} recharge={rechargeFrom(asCandidates(places.data ?? []))} />
      ) : null}

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
        <View
          style={[
            shadow.card,
            {
              marginHorizontal: gutter,
              marginTop: 16,
              padding: 18,
              backgroundColor: color.surface,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: '#DCEFF5',
            },
          ]}
        >
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
                    {`${formatInteger(m.actual)}${m.unit ? ` ${m.unit}` : ''}`}
                  </Heading>
                </View>
                {/* Each metric keeps one flat tint, track and fill alike, so
                    the bars can be told apart; none of them is green, because
                    a target is a plan, not something a host verified. */}
                <View
                  style={{
                    height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 6,
                    backgroundColor: tintFor(m.key).fill,
                  }}
                >
                  <View
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      height: '100%',
                      borderRadius: 4,
                      backgroundColor: tintFor(m.key).ink,
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
        style={[
          shadow.card,
          {
            margin: gutter,
            marginTop: 18,
            marginBottom: 32,
            backgroundColor: color.surface,
            borderWidth: 1,
            borderColor: '#DCEFF5',
            borderRadius: 22,
            padding: 18,
            overflow: 'hidden',
          },
        ]}
      >
        <OceanBackdrop subtle />
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

/** A promise is pending until a named partner's physical planting is documented. */
function TreeImpactBlock({
  impact, loading, error, onRetry,
}: {
  impact: TreeImpactView | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <View
      style={[
        shadow.card,
        {
          marginHorizontal: gutter,
          marginTop: 16,
          backgroundColor: color.surface,
          borderWidth: 1,
          borderColor: '#DCEFF5',
          borderRadius: 22,
          padding: 18,
        },
      ]}
    >
      <Label size={10} tracking={0.14} colour={color.accent700}>
        {t({ en: 'Your sponsored trees', th: 'ต้นไม้จากผู้สนับสนุนของคุณ', zh: '你的赞助树木' })}
      </Label>
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={onRetry} /> : null}
      {impact && impact.lines.length === 0 ? (
        <Body size={13} colour={color.neutral700} style={{ marginTop: 8 }}>
          {t({
            en: 'No signed tree promise for your verified quests yet. No planting partner has been claimed.',
            th: 'ยังไม่มีคำมั่นปลูกต้นไม้ที่ลงนามสำหรับภารกิจที่คุณผ่านการตรวจ และยังไม่มีการอ้างชื่อผู้ปลูก',
            zh: '你已验证的任务还没有签署的植树承诺，也还没有认领任何种植方。',
          })}
        </Body>
      ) : null}
      {impact && impact.lines.length > 0 ? (
        <>
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Heading size={28}>{formatInteger(impact.pending)}</Heading>
              <Label size={10} tracking={0.1}>{t({ en: 'PROMISED · NOT YET PLANTED', th: 'รับปาก · ยังไม่ได้ปลูก', zh: '已承诺 · 尚未种植' })}</Label>
            </View>
            <View style={{ flex: 1 }}>
              <Heading size={28}>{formatInteger(impact.planted)}</Heading>
              <Label size={10} tracking={0.1}>{t({ en: 'PLANTED · WITH PROOF', th: 'ปลูกแล้ว · มีหลักฐาน', zh: '已种植 · 有凭证' })}</Label>
            </View>
          </View>
          {impact.lines.map((line) => (
            <View key={`${line.sponsorId}:${line.questId}`} style={{ borderTopWidth: 1,
              borderTopColor: color.neutral300, marginTop: 14, paddingTop: 12 }}>
              <Heading size={14}>{t(line.questName)}</Heading>
              <Body size={13} colour={color.neutral700} style={{ marginTop: 3 }}>
                {t({ en: `Sponsored by ${t(line.sponsorName)} · ${line.treesPerVerified} per verified quest`,
                  th: `สนับสนุนโดย ${t(line.sponsorName)} · ${line.treesPerVerified} ต้นต่อภารกิจที่ผ่านการตรวจ`,
                  zh: `由 ${t(line.sponsorName)} 赞助 · 每个已验证的任务 ${line.treesPerVerified} 棵` })}
              </Body>
              {line.pending > 0 ? <Body size={13} style={{ marginTop: 5 }}>
                {t({ en: `${line.pending} still promised, not planted`, th: `ยังรับปาก ${line.pending} ต้น ยังไม่ได้ปลูก`,
                  zh: `仍有 ${line.pending} 棵已承诺，尚未种植` })}
              </Body> : null}
              {line.evidence.map((proof) => (
                <View key={proof.id} style={{ marginTop: 10 }}>
                  <Body size={13}>{t({
                    en: `${proof.trees} planted by ${proof.partner} on ${proof.plantedAt.slice(0, 10)}`,
                    th: `${proof.partner} ปลูก ${proof.trees} ต้น เมื่อ ${proof.plantedAt.slice(0, 10)}`,
                    zh: `${proof.partner} 于 ${proof.plantedAt.slice(0, 10)} 种下 ${proof.trees} 棵`,
                  })}</Body>
                  <Body size={13} colour={color.neutral700}>
                    {`${proof.lat}, ${proof.lng} · ${proof.photo.credit} · ${proof.photo.licence}`}
                  </Body>
                  <Pressable accessibilityRole="link"
                    accessibilityLabel={t({ en: 'View planting photo', th: 'ดูภาพการปลูก', zh: '查看种植照片' })}
                    onPress={() => { void Linking.openURL(proof.photo.url); }}
                    style={{ marginTop: 5 }}>
                    <Body size={13} colour={color.accent700}>{t({ en: 'View planting photo', th: 'ดูภาพการปลูก', zh: '查看种植照片' })}</Body>
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </>
      ) : null}
    </View>
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
    <View
      style={[
        shadow.card,
        {
          marginHorizontal: gutter,
          marginTop: 16,
          paddingVertical: 6,
          backgroundColor: color.surface,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: '#DCEFF5',
        },
      ]}
    >
      <View style={{ paddingHorizontal: gutter, paddingTop: 14 }}>
        <Label size={10} tracking={0.16}>{t({ en: 'Chiva Balance', th: 'สมดุลชีวา', zh: 'Chiva 平衡' })}</Label>

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
                      {c.source === 'measured'
                        ? t({ en: 'MEASURED', th: 'วัดจริง', zh: '实测' })
                        : t({ en: 'YOU TOLD US', th: 'คุณแจ้งเอง', zh: '你自述' })}
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
      <Label size={10} tracking={0.14} colour={color.neutral600}>{t({ en: 'How are you today?', th: 'วันนี้เป็นอย่างไรบ้าง', zh: '今天感觉怎么样？' })}</Label>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {MOOD_KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => onMood(key)}
            accessibilityRole="button"
            accessibilityLabel={t({
              en: `I feel ${t(MOODS[key].label)}`,
              th: `ฉันรู้สึก${t(MOODS[key].label)}`,
              zh: `我感到${t(MOODS[key].label)}`,
            })}
            style={{
              paddingVertical: 9,
              paddingHorizontal: 14,
              backgroundColor: '#F0F9FC',
              borderWidth: 1,
              borderColor: '#CBE7F0',
              borderRadius: radius.lg,
            }}
          >
            <Heading size={13}>{t(MOODS[key].label)}</Heading>

          </Pressable>
        ))}
      </View>
      <Body size={13} colour={color.neutral600} style={{ marginTop: 10 }}>{t({ en: 'This shapes the day we plan for you. It is not health advice.', th: 'ใช้ปรับแผนเที่ยวให้เหมาะกับคุณ ไม่ใช่คำแนะนำทางการแพทย์', zh: '这会影响我们为你规划的行程，不是健康建议。' })}</Body>
    </View>
  );
}
