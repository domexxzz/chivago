import React from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowLeft, Check, Clock3, Coins, Gift, LockKeyhole, Sparkles } from 'lucide-react-native';
import type { SeasonCollectionItem, SeasonOverview } from '@chivago/core';
import travelHero from '../../assets/chivago-travel-hero-v2.png';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { t } from '../i18n/locale.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx';
import { Button } from '../components/Button.tsx';
import { color, gutter, shadow } from '../theme/index.ts';

export function SeasonScreen({ onBack, onToast }: { onBack: () => void; onToast: (message: string) => void }) {
  const state = useAsync(async () => {
    const current = await api.currentSeason();
    if (!current.ok) return current;
    const history = await api.seasonHistory();
    if (!history.ok) return history;
    return { ok: true as const, data: { current: current.data.season, history: history.data.seasons } };
  }, []);
  const [selected, setSelected] = React.useState<SeasonOverview | null>(null);
  const season = selected ?? state.data?.current ?? state.data?.history[0] ?? null;

  if (state.loading && !state.data) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (!season) return <EmptyState en="No seasonal adventure is published yet." th="ยังไม่มีกิจกรรมตามฤดูกาลที่เผยแพร่" zh="暂时没有已发布的季节活动。" />;

  const exchange = async (item: SeasonCollectionItem) => {
    const result = await api.exchangeSeasonItem(item.id, `season-${item.id}-${Date.now()}`);
    if (!result.ok) { onToast(result.error); return; }
    setSelected(result.data.season);
    onToast(t({ en: 'Added to your collection.', th: 'เพิ่มเข้าคอลเลกชันแล้ว', zh: '已加入收藏。' }));
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.top}><Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><ArrowLeft size={21} color="#08365C" /></Pressable><Heading size={22}>{t({ en: 'Seasonal adventure', th: 'กิจกรรมฤดูกาล', zh: '季节冒险' })}</Heading></View>
      <ImageBackground source={travelHero} resizeMode="cover" style={styles.hero} imageStyle={styles.heroImage}>
        <View style={styles.shade} />
        <View style={styles.heroCopy}><Label size={10} colour="#C8FAFF">{season.theme.toUpperCase()}</Label><Heading size={29} colour="#FFFFFF" style={{ marginTop: 7 }}>{t(season.name)}</Heading><Body size={14} colour="#E4FAFF" style={{ marginTop: 7 }}>{t(season.description)}</Body></View>
      </ImageBackground>
      <View style={styles.stats}>
        <Stat icon={<Sparkles size={20} color="#008EA2" />} value={`${season.completedQuests}/${season.totalQuests}`} label={t({ en: 'Season quests', th: 'ภารกิจฤดูกาล', zh: '季节任务' })} />
        <Stat icon={<Coins size={20} color="#C58B00" />} value={String(season.memoryCoins)} label={t({ en: 'Memory Coins', th: 'เหรียญความทรงจำ', zh: '记忆币' })} />
        <Stat icon={<Clock3 size={20} color="#008EA2" />} value={new Date(season.endsAt).toLocaleDateString()} label={t({ en: 'Ends', th: 'สิ้นสุด', zh: '结束' })} />
      </View>
      <View style={styles.progress}><View style={[styles.fill, { width: `${season.progressPercent}%` }]} /></View>
      <Heading size={21} style={{ marginTop: 21 }}>{t({ en: 'Season collection', th: 'คอลเลกชันฤดูกาล', zh: '季节收藏' })}</Heading>
      <View style={styles.grid}>{season.items.map((item) => <Item key={item.id} item={item} season={season} onExchange={() => void exchange(item)} />)}</View>
      {state.data?.history.length ? <><Heading size={19} style={{ marginTop: 24 }}>{t({ en: 'Past adventures', th: 'ฤดูกาลที่ผ่านมา', zh: '往期冒险' })}</Heading><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingVertical: 10 }}>{state.data.history.map((past) => <Pressable key={past.id} onPress={() => setSelected(past)} style={styles.history}><Body size={13}>{t(past.name)}</Body><Label size={9} colour={color.neutral600}>{past.completedQuests}/{past.totalQuests}</Label></Pressable>)}</ScrollView></> : null}
    </ScrollView>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) { return <View style={styles.stat}>{icon}<Heading size={18}>{value}</Heading><Body size={13} colour={color.neutral600} style={{ textAlign: 'center' }}>{label}</Body></View>; }

function Item({ item, season, onExchange }: { item: SeasonCollectionItem; season: SeasonOverview; onExchange: () => void }) {
  const catchUp = !item.owned && item.catchUpAllowed && ['ended', 'archived'].includes(season.status);
  return <View style={styles.item}><View style={[styles.itemIcon, item.owned && styles.itemOwned]}>{item.owned ? <Check size={25} color="#FFFFFF" /> : catchUp ? <Gift size={25} color="#7C55D9" /> : <LockKeyhole size={23} color="#7A92A1" />}</View><Heading size={16} style={{ marginTop: 8 }}>{t(item.name)}</Heading><Body size={13} colour={color.neutral600} style={{ marginTop: 4 }}>{t(item.description)}</Body>{item.owned ? <Label size={9} colour="#16875C" style={{ marginTop: 9 }}>{t({ en: 'COLLECTED', th: 'สะสมแล้ว', zh: '已收藏' })}</Label> : catchUp ? <Button label={`${item.coinCost} ${t({ en: 'Memory Coins', th: 'เหรียญความทรงจำ', zh: '记忆币' })}`} onPress={onExchange} disabled={season.memoryCoins < item.coinCost} height={40} style={{ marginTop: 10 }} /> : <Label size={9} colour={color.neutral600} style={{ marginTop: 9 }}>{t({ en: 'Complete season quests', th: 'ทำภารกิจฤดูกาลเพื่อปลดล็อก', zh: '完成季节任务以解锁' })}</Label>}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EAF8FC' }, page: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: gutter, paddingBottom: 48 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }, back: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  hero: { minHeight: 255, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 27 }, heroImage: { borderRadius: 27 }, shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(1,51,78,.48)' }, heroCopy: { padding: 22 },
  stats: { flexDirection: 'row', gap: 9, marginTop: 12 }, stat: { ...shadow.card, flex: 1, minWidth: 0, padding: 11, alignItems: 'center', gap: 4, borderRadius: 17, backgroundColor: '#FFFFFF' },
  progress: { height: 11, marginTop: 12, borderRadius: 999, backgroundColor: '#CFE8EF', overflow: 'hidden' }, fill: { height: '100%', borderRadius: 999, backgroundColor: '#08A9B5' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 11 }, item: { ...shadow.card, flexGrow: 1, flexBasis: 220, padding: 15, borderRadius: 20, backgroundColor: '#FFFFFF' }, itemIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8EFF3' }, itemOwned: { backgroundColor: '#15A86A' },
  history: { minWidth: 165, padding: 12, gap: 4, borderRadius: 15, backgroundColor: '#FFFFFF' },
});
