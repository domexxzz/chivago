/**
 * Medal collection.
 *
 * The API remains the only source of truth for earned state and progress.
 * This screen only turns those records into a compact, visual collection:
 * one featured medal and a three-column gallery inspired by a real medal case.
 */

import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { LockKeyhole } from 'lucide-react-native';
import { ledgerDate, strings, type MedalState } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { PushHeader, TravelHeroBackdrop } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';
import firstStepsArt from '../../assets/medal-first-steps-v1.png';
import explorerArt from '../../assets/medal-explorer-v1.png';
import samuiCoastArt from '../../assets/medal-samui-coast-v1.png';
import forestWaterArt from '../../assets/medal-forest-water-v1.png';
import allSamuiArt from '../../assets/medal-all-samui-v1.png';
import allCampusArt from '../../assets/medal-all-campus-v1.png';
import hopperArt from '../../assets/medal-hopper-v1.png';

const MEDAL_ART: Record<string, ImageSourcePropType> = {
  'first-steps': firstStepsArt,
  explorer: explorerArt,
  'samui-coast': samuiCoastArt,
  'forest-and-water': forestWaterArt,
  'all-of-samui': allSamuiArt,
  'all-of-campus': allCampusArt,
  hopper: hopperArt,
};

const FALLBACK_MEDAL = MEDAL_ART['first-steps']!;

/** "2 / 3 places" or "1 / 2 areas" - the unit the rule counts in. */
export const progressLine = (m: MedalState): string =>
  m.progress.unit === 'areas'
    ? t(strings.medals.areas(m.progress.done, m.progress.total))
    : t(strings.medals.places(m.progress.done, m.progress.total));

export function MedalsScreen({ onBack, now = new Date() }: { onBack: () => void; now?: Date }) {
  const medals = useAsync(() => api.medals(), []);
  const data = medals.data;
  const featured = data?.medals.find((medal) => medal.earned) ?? data?.medals[0];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <PushHeader context={t(strings.medals.context)} onBack={onBack} />
      {medals.error ? <ErrorState message={medals.error} onRetry={medals.reload} /> : null}
      {medals.loading && !data ? <LoadingState /> : null}
      {data && featured ? (
        <>
          <FeaturedMedal
            medal={featured}
            earned={data.earned}
            total={data.total}
            basis={t(data.basis)}
            now={now}
          />

          <View style={styles.sectionHeading}>
            <View>
              <Label size={10} tracking={0.15} colour={color.brand}>
                {t({ en: 'YOUR COLLECTION', th: 'คอลเลกชันของคุณ', zh: '您的收藏' })}
              </Label>
              <Heading size={22}>
                {t({ en: 'Medal cabinet', th: 'ตู้เหรียญรางวัล', zh: '奖章柜' })}
              </Heading>
            </View>
            <View style={styles.countPill}>
              <Label size={10} tracking={0.04} colour={color.brand}>
                {data.earned}/{data.total}
              </Label>
            </View>
          </View>

          <View style={styles.grid}>
            {data.medals.map((medal) => (
              <MedalTile key={medal.key} medal={medal} now={now} />
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function FeaturedMedal({
  medal,
  earned,
  total,
  basis,
  now,
}: {
  medal: MedalState;
  earned: number;
  total: number;
  basis: string;
  now: Date;
}) {
  const status = medal.earned && medal.earnedAt
    ? t(strings.medals.earnedOn(t(ledgerDate(medal.earnedAt, now))))
    : progressLine(medal);
  const collectionPct = total > 0 ? Math.min(100, (earned / total) * 100) : 0;

  return (
    <View style={[shadow.card, styles.hero]}>
      <TravelHeroBackdrop focalPoint="center" />
      <View style={styles.heroVeil} />
      <View style={styles.heroTopLine}>
        <Label size={10} tracking={0.16} colour="#DDFBFF">
          {t({ en: 'MEDAL JOURNEY', th: 'เส้นทางเหรียญรางวัล', zh: '奖章旅程' })}
        </Label>
        <View style={styles.heroCount}>
          <Heading size={20} colour="#FFFFFF">{earned}</Heading>
          <Label size={10} tracking={0.04} colour="#DDFBFF">/ {total}</Label>
        </View>
      </View>

      <View style={styles.featuredRow}>
        <View style={styles.featuredArtFrame}>
          <Image
            source={MEDAL_ART[medal.key] ?? FALLBACK_MEDAL}
            resizeMode="contain"
            style={[styles.featuredArt, !medal.earned && styles.lockedArt]}
          />
          {!medal.earned ? (
            <View style={styles.heroLock}>
              <LockKeyhole size={15} color="#FFFFFF" strokeWidth={2.4} />
            </View>
          ) : null}
        </View>
        <View style={styles.featuredCopy}>
          <Label size={9} tracking={0.12} colour="#BFEFF7">
            {medal.earned
              ? t({ en: 'LATEST UNLOCKED', th: 'เหรียญที่ปลดล็อก', zh: '已解锁奖章' })
              : t({ en: 'NEXT MEDAL', th: 'เหรียญถัดไป', zh: '下一枚奖章' })}
          </Label>
          <Heading size={23} colour="#FFFFFF" style={{ marginTop: 3 }}>{t(medal.name)}</Heading>
          <Body size={13} colour="#E9FBFF" style={{ marginTop: 5 }}>{t(medal.how)}</Body>
          <Label size={9} tracking={0.04} colour="#FFFFFF" style={{ marginTop: 7, textTransform: 'none' }}>
            {status}
          </Label>
        </View>
      </View>

      <View style={styles.heroProgressTrack}>
        <View style={[styles.heroProgressFill, { width: `${collectionPct}%` }]} />
      </View>
      <Label size={9} tracking={0.05} colour="#FFFFFF" style={{ marginTop: 7, textTransform: 'none' }}>
        {t(strings.medals.earnedOf(earned, total))}
      </Label>
      <Body size={13} colour="#DDF4F7" style={{ marginTop: 8 }}>{basis}</Body>
    </View>
  );
}

function MedalTile({ medal, now }: { medal: MedalState; now: Date }) {
  const pct = medal.progress.total > 0
    ? Math.min(100, Math.round((medal.progress.done / medal.progress.total) * 100))
    : 0;
  const status = medal.earned && medal.earnedAt
    ? t(strings.medals.earnedOn(t(ledgerDate(medal.earnedAt, now))))
    : progressLine(medal);

  return (
    <View
      accessible
      accessibilityLabel={`${t(medal.name)}, ${medal.earned ? t(strings.medals.earned) : progressLine(medal)}`}
      accessibilityHint={t(medal.how)}
      style={[styles.medalCard, medal.earned ? styles.medalCardEarned : styles.medalCardLocked]}
    >
      <View style={styles.artArea}>
        <Image
          source={MEDAL_ART[medal.key] ?? FALLBACK_MEDAL}
          resizeMode="contain"
          style={[styles.medalArt, !medal.earned && styles.lockedArt]}
        />
        {!medal.earned ? (
          <View style={styles.lockBadge}>
            <LockKeyhole size={11} color="#587687" strokeWidth={2.2} />
          </View>
        ) : null}
      </View>
      <Heading size={13} style={styles.medalName}>{t(medal.name)}</Heading>
      <Label
        size={9}
        tracking={0.02}
        colour={medal.earned ? '#8A5A00' : color.neutral700}
        style={styles.medalStatus}
      >
        {status}
      </Label>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${pct}%`,
              backgroundColor: medal.earned ? '#F2A900' : color.brand,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingBottom: 36,
  },
  hero: {
    marginHorizontal: gutter,
    marginTop: 16,
    minHeight: 270,
    borderRadius: 26,
    padding: 18,
    overflow: 'hidden',
    backgroundColor: color.brandDeep,
  },
  heroVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 45, 64, 0.18)',
  },
  heroTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCount: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  featuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 5,
  },
  featuredArtFrame: {
    width: 132,
    height: 138,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredArt: { width: 132, height: 138 },
  featuredCopy: { flex: 1, minWidth: 0 },
  heroLock: {
    position: 'absolute',
    right: 4,
    bottom: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,78,100,0.9)',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  heroProgressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  heroProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#FFC94A',
  },
  sectionHeading: {
    marginHorizontal: gutter,
    marginTop: 22,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  countPill: {
    minWidth: 48,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#DFF4FA',
    borderWidth: 1,
    borderColor: '#BFE4EF',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    paddingHorizontal: gutter,
  },
  medalCard: {
    width: '31.4%',
    minHeight: 165,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    ...shadow.card,
  },
  medalCardEarned: {
    backgroundColor: '#FFF7DE',
    borderColor: '#F0D083',
  },
  medalCardLocked: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8EAF0',
  },
  artArea: {
    width: '100%',
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalArt: { width: 86, height: 88 },
  lockedArt: { opacity: 0.34 },
  lockBadge: {
    position: 'absolute',
    right: 4,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF5F7',
    borderWidth: 1,
    borderColor: '#CBDDE3',
  },
  medalName: {
    textAlign: 'center',
    minHeight: 30,
  },
  medalStatus: {
    marginTop: 3,
    textAlign: 'center',
    textTransform: 'none',
  },
  progressTrack: {
    width: '100%',
    height: 4,
    marginTop: 'auto',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#DCE9ED',
  },
  progressFill: { height: '100%', borderRadius: 999 },
});
