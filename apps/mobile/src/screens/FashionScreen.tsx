/**
 * Fashion collection.
 *
 * Costumes are derived from the traveller's real verified record. They are
 * never bought and never certify a visit or a quest: core owns that rule and
 * this screen only renders the collection it calculates.
 */

import React from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { ChevronLeft, LockKeyhole, Shirt, Sparkles } from 'lucide-react-native';
import {
  COSTUMES, costumeCollection, costumesFor, nextCostumeStep,
  type Costume,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { IconButton } from '../components/Button.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { TravelHeroBackdrop } from '../components/Shell.tsx';
import { t } from '../i18n/locale.ts';

export function FashionScreen({ onBack }: { onBack: () => void }) {
  const { width } = useWindowDimensions();
  const account = useAsync(() => api.account(), []);
  const standing = useAsync(() => api.standing(), []);
  const ready = account.data !== null && standing.data !== null;
  const input = account.data && standing.data ? {
    travellerKey: account.data.userId,
    questsVerified: standing.data.you?.missionsVerified ?? 0,
  } : null;
  const awards = input ? costumesFor(input) : [];
  const held = new Set(awards.map((award) => award.costume.key));
  const summary = costumeCollection(awards);
  const next = input ? nextCostumeStep(input) : null;
  const cardWidth = width >= 900 ? '31.5%' as const : '48%' as const;
  const error = account.error ?? standing.error;

  const retry = () => {
    account.reload();
    standing.reload();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 20, backgroundColor: '#08748A', borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' }}>
        <TravelHeroBackdrop compact focalPoint="right" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconButton inverted onPress={onBack} accessibilityLabel={t({ en: 'Back', th: 'ย้อนกลับ', zh: '返回' })}>
            <ChevronLeft size={20} color="#FFFFFF" strokeWidth={2} />
          </IconButton>
          <View style={{ flex: 1 }}>
            <Label size={10} tracking={0.14} colour="#D5F6FF">{t({ en: 'YOUR COLLECTION', th: 'คอลเลกชันของคุณ', zh: '你的收藏' })}</Label>
            <Heading size={24} colour="#FFFFFF" style={{ marginTop: 3 }}>Fashion</Heading>
          </View>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center' }}>
            <Shirt size={23} color="#FFFFFF" strokeWidth={2} />
          </View>
        </View>
      </View>

      {(account.loading || standing.loading) && !ready ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}

      {ready ? (
        <>
          <View style={[shadow.card, { width: '92%', maxWidth: 960, alignSelf: 'center', marginTop: 16, padding: 18, borderRadius: 22, backgroundColor: color.surface, borderWidth: 1, borderColor: '#DCEFF5' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF0D7', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={23} color="#B45F06" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Heading size={22}>{`${summary.held} / ${summary.total}`}</Heading>
                <Body size={13} colour={color.neutral700}>{t({ en: 'fashion items collected', th: 'ไอเทมแฟชั่นที่สะสมแล้ว', zh: '已收集的时尚单品' })}</Body>
              </View>
            </View>
            {next ? <Body size={13} colour={color.neutral700} style={{ marginTop: 12 }}>{t(next)}</Body> : null}
          </View>

          <View style={{ width: '92%', maxWidth: 960, alignSelf: 'center', paddingTop: 18 }}>
            <Heading size={19}>{t({ en: 'Fashion collection', th: 'คอลเลกชันแฟชั่น', zh: '时尚收藏' })}</Heading>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
              {COSTUMES.map((costume) => (
                <CostumeCard key={costume.key} costume={costume} owned={held.has(costume.key)} width={cardWidth} />
              ))}
            </View>
          </View>
        </>
      ) : null}
      <View style={{ height: 36 }} />
    </ScrollView>
  );
}

function CostumeCard({
  costume, owned, width,
}: { costume: Costume; owned: boolean; width: '31.5%' | '48%' }) {
  const accent = costume.wears.accent ?? (costume.source === 'place' ? '#D8B46A' : '#48A9C5');
  return (
    <Pressable
      disabled
      accessibilityRole="summary"
      accessibilityLabel={`${t(costume.name)}, ${owned ? t({ en: 'owned', th: 'มีแล้ว', zh: '已拥有' }) : t({ en: 'locked', th: 'ยังไม่ปลดล็อก', zh: '未解锁' })}`}
      style={[shadow.sm, { width, minHeight: 178, padding: 15, borderRadius: 20, backgroundColor: owned ? color.surface : '#F4F7F8', borderWidth: owned ? 2 : 1, borderColor: owned ? accent : '#DCE6EA' }]}
    >
      <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: owned ? `${accent}2A` : color.neutral200, alignItems: 'center', justifyContent: 'center' }}>
        {owned ? <Shirt size={26} color={accent} strokeWidth={2} /> : <LockKeyhole size={22} color={color.neutral600} strokeWidth={1.8} />}
      </View>
      <Label size={9} tracking={0.1} colour={owned ? accent : color.neutral600} style={{ marginTop: 12 }}>
        {owned ? t({ en: 'COLLECTED', th: 'สะสมแล้ว', zh: '已收集' }) : t({ en: 'LOCKED', th: 'ยังไม่ปลดล็อก', zh: '未解锁' })}
      </Label>
      <Heading size={16} colour={owned ? color.text : color.neutral700} style={{ marginTop: 4 }}>{t(costume.name)}</Heading>
      <Body size={13} colour={color.neutral700} style={{ marginTop: 5 }}>{t(costume.why)}</Body>
      <View style={{ alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: color.brandSoft }}>
        <Label size={9} tracking={0.06} colour={color.brand} style={{ textTransform: 'none' }}>
          {costume.source === 'place'
            ? t({ en: 'Named place reward', th: 'รางวัลจากสถานที่ที่ระบุ', zh: '指定地点奖励' })
            : t({ en: 'Verified quest reward', th: 'รางวัลจากภารกิจที่ผ่านการตรวจ', zh: '已验证任务奖励' })}
        </Label>
      </View>
    </Pressable>
  );
}
