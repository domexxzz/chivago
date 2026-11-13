/**
 * Missions.
 *
 * Missions are posted by municipalities, NGOs, hotels and community groups —
 * the host is named on every row, because "who is vouching for this" is the
 * whole trust model.
 *
 * Under the list sit the two things the design asks for, and both of them are
 * traps if built the obvious way:
 *
 * THE LEADERBOARD ranks HOSTS, not travellers, and on APPROVALS, not points.
 * Two reasons, either of which alone would be enough. Ranking travellers by
 * points would rank them partly on Trip Points, which are self-verified — a
 * board that pays people to claim. And there is exactly one traveller on this
 * island, so a ranking of them is a mirror; `isRankable` in core makes the
 * screen say that rather than draw a podium with one step.
 *
 * PARTNER REWARDS show what the points actually buy, which is the half that
 * makes the missions worth doing. Priced in the currency each offer really
 * takes, so a Green-priced reward cannot be bought with self-reported points.
 */

import React from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronRight, Clock, MapPin } from 'lucide-react-native';
import chivagoLogo from '../../assets/chivago-logo.png';
import sichangBanner from '../../assets/quest-sichang-explorer.png';
import trashHeroLogo from '../../assets/trash-hero-logo.png';
import { greetingFor, isActiveQuestCode, isRankable, strings, type HostStanding, type Offer, type Quest, type QuestProgress } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, currencyTone, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { tintFor } from '@chivago/tokens';
import { Body, Heading, Label } from '../components/Type.tsx';
import { OceanBackdrop, TravelHeroBackdrop } from '../components/Shell.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';
import { formatInteger } from '../i18n/format.ts';
import { ProfileButton } from '../components/ProfileButton.tsx';
import { questArtworkSource } from '../components/QuestArtwork.tsx';
import { MINI_GAMES, type MiniGameKey } from '../games/index.ts';
import { ChivarIcon, questStateIcon, type ChivarIconName } from '../components/ChivarIcon.tsx';

type Filter = 'today' | 'weekend' | 'all' | 'sichang';
type StandardFilter = Exclude<Filter, 'sichang'>;
type Section = 'games' | 'quests';

export function MissionsScreen({
  onOpen, onOpenMarket, onOpenProfile, onOpenGame,
}: {
  onOpen: (id: string) => void;
  onOpenMarket: () => void;
  onOpenProfile?: () => void;
  onOpenGame?: (key: MiniGameKey) => void;
}) {
  const [section, setSection] = React.useState<Section>('quests');
  const [filter, setFilter] = React.useState<Filter>('sichang');

  // Fetch ALL quests once and filter locally. Two reasons:
  //  - the "All 24" segment must show the TOTAL, not the current filter's
  //    count; refetching per filter made it read "All 2" while showing today's
  //    two quests;
  //  - an island has tens of quests, not thousands, so switching filters should
  //    be instant rather than a network round-trip on a weak beach signal.
  const data = useAsync(() => api.quests(), []);

  // Defence in depth: deployed APIs may briefly lag a mobile release and an
  // offline snapshot can outlive its seed. Retired quests must not reappear
  // merely because one of those stores still contains historical rows.
  const all = (data.data?.quests ?? []).filter((q) => isActiveQuestCode(q.code));
  const sichangQuests = all;
  const visible = filter === 'sichang'
    ? sichangQuests
    : filter === 'all'
      ? all
      : all.filter((q) => q.kind === filter);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <View
        style={{
          paddingHorizontal: gutter,
          paddingTop: 20,
          paddingBottom: 20,
          backgroundColor: '#097097',
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
          overflow: 'hidden',
          shadowColor: '#00263E',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.14,
          shadowRadius: 10,
          elevation: 3,
        }}
      >
        <TravelHeroBackdrop compact focalPoint="right" />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#D5F6FF', fontSize: 12, fontWeight: '500', letterSpacing: 1.8, textTransform: 'uppercase' }}>
              {t(greetingFor(new Date()))}
            </Text>
            <Heading size={28} colour="#FFFFFF" style={{ marginTop: 4, fontWeight: '800' }}>
              {t(strings.tabs.quests)}
            </Heading>
            <Label size={11} tracking={0.12} colour="#E2F6FC" style={{ marginTop: 4 }}>
              {t({
                en: 'PLAY, EXPLORE & HELP THE ISLAND',
                th: 'เล่นเกม ออกสำรวจ และช่วยดูแลเกาะ',
                zh: '畅玩、探索并守护岛屿',
              })}
            </Label>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image
              source={chivagoLogo}
              resizeMode="contain"
              accessibilityLabel="ChivarGo"
              style={{ width: 68, height: 48 }}
            />
            <ProfileButton onPress={onOpenProfile} />
          </View>
        </View>
      </View>

      <SectionTabs value={section} onChange={setSection} />

      {section === 'games' ? <GamesPanel onOpenGame={onOpenGame} /> : null}

      {section === 'quests' ? (
        <>
          <SichangFeatureButton
            selected={filter === 'sichang'}
            count={sichangQuests.length}
            exp={sichangQuests.reduce((sum, quest) => sum + (quest.rewardExp ?? quest.rewardPoints), 0)}
            onPress={() => setFilter('sichang')}
          />
          <SegmentedFilter
            value={filter === 'sichang' ? null : filter}
            total={all.length}
            onChange={setFilter}
          />

          {data.loading ? <LoadingState /> : null}
          {data.error ? <ErrorState message={data.error} onRetry={data.reload} /> : null}

          {!data.loading && visible.length === 0 ? (
            <EmptyState en={t(strings.quests.empty)} th={strings.quests.empty.th} />
          ) : null}

          {visible.map((quest) => (
            <QuestRow
              key={quest.id}
              quest={quest}
              progress={data.data?.progress[quest.id] ?? null}
              onPress={() => onOpen(quest.id)}
            />
          ))}

          <View style={{ paddingHorizontal: gutter, paddingVertical: 20 }}>
            <Body size={13} colour={color.neutral700}>{t(strings.quests.footer)}</Body>
          </View>

          <Standing />
          <PartnerRewards onOpenMarket={onOpenMarket} />
        </>
      ) : null}
      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

function SichangFeatureButton({
  selected, count, exp, onPress,
}: { selected: boolean; count: number; exp: number; onPress: () => void }) {
  const title = t({ en: 'Koh Sichang', th: 'เกาะสีชัง', zh: '锡昌岛' });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={t({
        en: selected ? 'Show all quests' : 'Show the Koh Sichang pilot quests',
        th: selected ? 'แสดงเควสทั้งหมด' : 'แสดงเควสทดลองเกาะสีชัง',
        zh: selected ? '显示全部任务' : '显示锡昌岛试点任务',
      })}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        shadow.card,
        {
          width: '92%', maxWidth: 760, height: 128, alignSelf: 'center',
          marginTop: 16, borderRadius: 24, overflow: 'hidden',
          borderWidth: selected ? 3 : 2, borderColor: selected ? '#FFD166' : '#7BDDE5',
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <Image source={sichangBanner} resizeMode="cover" style={{ position: 'absolute', width: '100%', height: '100%' }} />
      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,42,68,0.68)' }} />
      <View style={{ flex: 1, paddingHorizontal: 18, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ alignSelf: 'flex-start', backgroundColor: '#FFD166', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
            <Label size={9} tracking={0.13} colour="#493300">{t({ en: 'SPECIAL PILOT', th: 'เควสพิเศษ', zh: '特别试点' })}</Label>
          </View>
          <Heading size={25} colour="#FFFFFF" style={{ marginTop: 7 }}>{title}</Heading>
          <Body size={13} colour="#E7FBFF" style={{ marginTop: 3 }}>
            {t({
              en: `${count} quests · up to ${formatInteger(exp)} XP`,
              th: `${count} เควส · สูงสุด ${formatInteger(exp)} XP`,
              zh: `${count} 个任务 · 最高 ${formatInteger(exp)} XP`,
            })}
          </Body>
        </View>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: selected ? '#FFD166' : 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronRight size={23} color="#075078" strokeWidth={2.5} />
        </View>
      </View>
    </Pressable>
  );
}

function SectionTabs({
  value, onChange,
}: { value: Section; onChange: (section: Section) => void }) {
  const options: { key: Section; label: string; hint: string; icon: ChivarIconName }[] = [
    {
      key: 'games',
      label: 'Games',
      hint: t({ en: 'Mini-games you can play anytime', th: 'มินิเกมที่เล่นได้ทุกเวลา', zh: '随时可玩的小游戏' }),
      icon: 'game',
    },
    {
      key: 'quests',
      label: 'Quests',
      hint: t({ en: 'Activities around the island', th: 'กิจกรรมที่ทำได้ทั่วเกาะ', zh: '岛上各处的活动' }),
      icon: 'quest',
    },
  ];

  return (
    <View
      accessibilityRole="tablist"
      style={{
        width: '92%',
        maxWidth: 760,
        alignSelf: 'center',
        flexDirection: 'row',
        gap: 10,
        paddingTop: 18,
        paddingBottom: 4,
      }}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityHint={option.hint}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              shadow.card,
              {
                flex: 1,
                minHeight: 50,
                paddingHorizontal: 16,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 18,
                backgroundColor: active ? color.brand : color.surface,
                borderWidth: 1,
                borderColor: active ? color.brand : '#CBE7F0',
                opacity: pressed ? 0.86 : 1,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ChivarIcon name={option.icon} size={30} />
              <Heading size={15} colour={active ? onFill.brand : color.text}>{option.label}</Heading>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Games live beside quests, but never inherit quest rewards or progress.
 * Each document is bundled with the app, so this panel remains playable even
 * when the island connection is unavailable.
 */
function GamesPanel({ onOpenGame }: { onOpenGame?: (key: MiniGameKey) => void }) {
  return (
    <View style={{ width: '92%', maxWidth: 760, alignSelf: 'center', paddingTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#D9F5FB', alignItems: 'center', justifyContent: 'center' }}>
          <ChivarIcon name="game" size={34} />
        </View>
        <View style={{ flex: 1 }}>
          <Heading size={18} colour={color.text}>{t({ en: 'Choose a game', th: 'เลือกเกมที่อยากเล่น', zh: '选择一个游戏' })}</Heading>
          <Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>
            {t({ en: 'Play anytime — no quest rewards or points.', th: 'เล่นได้ทุกเวลา โดยไม่เกี่ยวกับรางวัลหรือคะแนนภารกิจ', zh: '随时畅玩，不计入任务奖励或积分。' })}
          </Body>
        </View>
      </View>

      <View style={{ gap: 12 }}>
        {MINI_GAMES.map((game) => (
          <Pressable
            key={game.key}
            disabled={!onOpenGame}
            onPress={() => onOpenGame?.(game.key)}
            accessibilityRole="button"
            accessibilityLabel={t(game.name)}
            accessibilityHint={t(game.blurb)}
            accessibilityState={{ disabled: !onOpenGame }}
            style={({ pressed }) => [
              shadow.card,
              {
                minHeight: 94,
                backgroundColor: color.surface,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: '#CBE7F0',
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                opacity: pressed ? 0.86 : 1,
              },
            ]}
          >
            <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: '#E9FBF8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <Image
                source={trashHeroLogo}
                resizeMode="contain"
                accessibilityLabel={t(game.name)}
                style={{ width: 70, height: 70 }}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Label size={9} tracking={0.1} colour={color.brand}>{t({ en: 'MINI GAME', th: 'มินิเกม', zh: '小游戏' })}</Label>
              <Heading size={17} colour={color.text} style={{ marginTop: 3 }}>{t(game.name)}</Heading>
              <Body size={13} colour={color.neutral700} style={{ marginTop: 3 }}>{t(game.blurb)}</Body>
            </View>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={18} color={color.brand} strokeWidth={2.2} />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SegmentedFilter({
  value, total, onChange,
}: { value: StandardFilter | null; total: number; onChange: (f: StandardFilter) => void }) {
  const options: [StandardFilter, string][] = [
    ['today', t(strings.quests.filters.today)],
    ['weekend', t(strings.quests.filters.weekend)],
    ['all', `${t(strings.quests.filters.all)} ${total}`],
  ];
  return (
    <View style={{ width: '92%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', gap: 8, paddingTop: 14, paddingBottom: 6 }}>
      {options.map(([key, label]) => {
        const active = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[
              shadow.card,
              {
                minHeight: 38,
                paddingVertical: 8,
                paddingHorizontal: 16,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.lg,
                // A filter is the app sorting its own list. Brand, not evidence.
                backgroundColor: active ? color.brand : color.surface,
                borderWidth: 1,
                borderColor: active ? color.brand : '#CBE7F0',
              },
            ]}
          >
            <Label size={11} tracking={0.06} colour={active ? onFill.brand : color.neutral700} style={{ textTransform: 'none' }}>{label}</Label>
          </Pressable>
        );
      })}
    </View>
  );
}

export function QuestRow({
  quest, progress, onPress,
}: { quest: Quest; progress: QuestProgress | null; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        `${t(quest.name)}, ${quest.rewardExp != null ? `${quest.rewardExp} EXP` : `${quest.rewardPoints} ${quest.rewardCurrency === 'green' ? 'Green' : 'Trip'} Points`}, `
        + `at ${t(quest.where)}, by ${quest.host.name}`
      }
      style={({ pressed }) => [shadow.card, {
        width: '92%',
        maxWidth: 760,
        alignSelf: 'center',
        marginTop: 12,
        backgroundColor: color.surface,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: '#DCEFF5',
        overflow: 'hidden',
        opacity: pressed ? 0.88 : 1,
      }]}
    >
      <View style={{ height: 150, position: 'relative', backgroundColor: color.brandSoft }}>
        <Image source={questArtworkSource(quest)} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,38,60,0.16)' }} />
        <View style={{ position: 'absolute', top: 9, left: 9, width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center' }}>
          <ChivarIcon name={questStateIcon(progress)} size={36} />
        </View>
        <View style={{ position: 'absolute', top: 12, left: 57, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.94)' }}>
          <Label size={9} tracking={0.1} colour={tintFor(quest.code.slice(0, 2)).ink}>{quest.code}</Label>
        </View>
        <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: quest.rewardExp != null ? '#FFD166' : currencyTone(quest.rewardCurrency).fill, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999 }}>
          <Heading size={13} colour={quest.rewardExp != null ? '#493300' : currencyTone(quest.rewardCurrency).on}>
            {quest.rewardExp != null ? `+${quest.rewardExp} XP` : `+${quest.rewardPoints} ${quest.rewardCurrency === 'green' ? 'G' : 'T'}`}
          </Heading>
        </View>
      </View>
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Heading size={18} colour={color.text}>{t(quest.name)}</Heading>
            <Label size={9} tracking={0.08} colour={color.neutral600} style={{ marginTop: 5 }}>{t(strings.quests.by(quest.host.name))}</Label>
          </View>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color.brandSoft, alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={18} color={color.brand} /></View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><MapPin size={15} color={color.brand} /><Body size={13} colour={color.neutral700}>{t(quest.where)}</Body></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Clock size={15} color={color.brand} /><Body size={13} colour={color.neutral700}>{t(quest.duration)}</Body></View>
          {/*
            The drawn icon sits BESIDE the words, never instead of them: it is
            a raster that cannot recolour, and on its own it would say nothing
            to a screen reader or in a locale it was not drawn for. The pill
            keeps its label; the icon is hidden from accessibility.
          */}
          {progress && progress.stage !== 'complete' ? (
            <View style={{ paddingRight: 9, minHeight: 30, borderRadius: 999, backgroundColor: color.brandSoft, flexDirection: 'row', alignItems: 'center', gap: 2 }}><ChivarIcon name="questInProgress" size={28} /><Label size={9} tracking={0.08} colour={color.brand}>{t({ en: 'IN PROGRESS', th: 'กำลังทำอยู่', zh: '进行中' })}</Label></View>
          ) : null}
          {progress?.stage === 'complete' ? (
            <View style={{ paddingRight: 9, minHeight: 30, borderRadius: 999, backgroundColor: color.accent100, flexDirection: 'row', alignItems: 'center', gap: 2 }}><ChivarIcon name="questCompleted" size={28} /><Label size={9} tracking={0.08} colour={color.accent700}>{t({ en: 'DONE', th: 'เสร็จแล้ว', zh: '已完成' })}</Label></View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Who is doing the work
// ---------------------------------------------------------------------------

/**
 * The board.
 *
 * Hosts, ranked on submissions they approved. The basis is printed under the
 * table rather than assumed, because a leaderboard whose basis is unstated is
 * one the reader will read as "points" — the single reading this one most
 * needs to prevent.
 */
function Standing() {
  const standing = useAsync(() => api.standing(), []);
  const data = standing.data;

  return (
    <View style={{ paddingTop: 8 }}>
      <View style={{ paddingHorizontal: gutter, paddingBottom: 10 }}>
        <Label size={10} tracking={0.14}>{t({ en: 'Who is doing the work', th: 'ใครลงแรงบ้าง', zh: '谁在出力' })}</Label>

      </View>

      {standing.error ? (
        <ErrorState message={standing.error} onRetry={standing.reload} />
      ) : standing.loading || !data ? (
        <Body size={13} colour={color.neutral600} style={{ paddingHorizontal: gutter }}>
          {t(strings.common.loading)}
        </Body>
      ) : (
        <>
          {/*
            Your own record, and it is a RECORD rather than a rank: with one
            traveller on the island a position would be meaningless, and with
            a thousand it would still be the wrong thing to lead with here.
          */}
          {data.you ? (
            <View
              style={[
                shadow.card,
                {
                  marginHorizontal: gutter, marginBottom: 12, padding: 16,
                  backgroundColor: color.surface, borderRadius: radius.md,
                  borderWidth: 1, borderColor: '#CBE7F0', overflow: 'hidden',
                },
              ]}
            >
              <OceanBackdrop subtle />
              <Label size={9} tracking={0.12} colour={color.brandDeep}>{t({ en: 'YOUR RECORD', th: 'ผลงานของคุณ', zh: '你的记录' })}</Label>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                <Heading size={26} colour={color.brandDeep}>{data.you.missionsVerified}</Heading>
                <Body size={13} colour={color.brandDeep}>
                  {t({
                    en: `mission${data.you.missionsVerified === 1 ? '' : 's'} verified · ${formatInteger(data.you.greenVerified)} G earned`,
                    th: `ครั้งที่ผ่านการตรวจ · ได้ ${formatInteger(data.you.greenVerified)} แต้มเขียว`,
                    zh: `个任务已验证 · 获得 ${formatInteger(data.you.greenVerified)} 绿色积分`,
                  })}
                </Body>
              </View>
            </View>
          ) : null}

          {/*
            Said plainly. Drawing a traveller ranking with one participant
            would be the app inventing a crowd, which is the same lie as
            inventing a number.
          */}
          {!isRankable(data.participants) ? (
            <View style={{ paddingHorizontal: gutter, paddingBottom: 12 }}>
              <Body size={13} colour={color.neutral700}>
                {t({
                  en: data.participants === 1
                    ? 'One traveller has verified points so far, so there is no traveller ranking yet. The hosts below are real.'
                    : 'Nobody has verified points yet, so there is no traveller ranking. The hosts below are real.',
                  th: 'ยังจัดอันดับนักเดินทางไม่ได้ เพราะยังมีคนน้อยเกินไป ผู้จัดภารกิจด้านล่างเป็นของจริง',
                  zh: '目前还无法给旅行者排名，人数太少。下面列出的主办方是真实的。',
                })}
              </Body>
            </View>
          ) : null}

          <View
            style={[
              shadow.card,
              {
                marginHorizontal: gutter,
                backgroundColor: color.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: '#DCEFF5',
                overflow: 'hidden',
              },
            ]}
          >
            {data.hosts.map((host, i) => (
              <HostRow key={host.hostId} host={host} place={i + 1} />
            ))}
          </View>

          <View style={{ paddingHorizontal: gutter, paddingTop: 12 }}>
            <Label size={9} tracking={0.04} colour={color.neutral600} style={{ textTransform: 'none' }}>
              {t(data.rankedBy)}
            </Label>

          </View>
        </>
      )}
    </View>
  );
}

function HostRow({ host, place }: { host: HostStanding; place: number }) {
  const idle = host.verified === 0;
  return (
    <View
      accessibilityLabel={t({
        en: `${place}. ${host.name}. ${host.verified} verified, ${host.questsPosted} posted`,
        th: `${place} ${host.name} ตรวจแล้ว ${host.verified} โพสต์ ${host.questsPosted}`,
        zh: `第 ${place} 名。${host.name}。已验证 ${host.verified}，发布 ${host.questsPosted}`,
      })}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: gutter, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: color.neutral300,
      }}
    >
      <Heading size={15} colour={idle ? color.neutral500 : color.text} style={{ width: 22 }}>
        {String(place).padStart(2, '0')}
      </Heading>

      <View style={{ flex: 1 }}>
        <Heading size={15}>{host.name}</Heading>
        <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 3, textTransform: 'none' }}>
          {/*
            A host with no approvals is shown as WAITING rather than losing.
            They have put a mission on the island and nobody has done it — the
            useful thing to say about them is that they need travellers sent
            to them, not that they came last.
          */}
          {idle
            ? t({
              en: `${host.questsPosted} posted · waiting for a first submission`,
              th: `ตั้งไว้ ${host.questsPosted} ภารกิจ · ยังไม่มีใครส่งหลักฐาน`,
              zh: `发布 ${host.questsPosted} 个任务 · 还在等第一份提交`,
            })
            : t({
              en: `${host.questsPosted} posted · ${host.pending} awaiting review`,
              th: `ตั้งไว้ ${host.questsPosted} ภารกิจ · รอตรวจ ${host.pending}`,
              zh: `发布 ${host.questsPosted} 个任务 · ${host.pending} 个待审核`,
            })}
        </Label>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Heading size={17} colour={idle ? color.neutral500 : color.accent700}>{host.verified}</Heading>
        <Label size={9} tracking={0.08} colour={color.neutral600}>{t(strings.quest.verified)}</Label>
        {host.greenIssued > 0 ? (
          <Label size={9} tracking={0.06} colour={color.accent700} style={{ marginTop: 2 }}>
            {`${formatInteger(host.greenIssued)} G`}
          </Label>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// What the points buy
// ---------------------------------------------------------------------------

const REWARD_PREVIEW = 3;

/**
 * The other half of a mission.
 *
 * A points system with nothing to spend points on is a scoreboard, and the
 * partners here are local businesses whose participation is the actual point
 * of the currency. Each offer is priced in the currency it really takes, so a
 * Green-priced reward visibly cannot be bought with self-reported points.
 */
function PartnerRewards({ onOpenMarket }: { onOpenMarket: () => void }) {
  const offers = useAsync(() => api.offers(), []);
  const wallet = useAsync(() => api.wallet(), []);
  const balances = wallet.data?.balances ?? null;

  const list = (offers.data ?? []).filter((o) => o.available);
  const affordable = (o: Offer) => balances != null && balances[o.currency] >= o.costPoints;

  // Cheapest first, so the top of the list is what somebody can most nearly
  // afford rather than the most expensive thing we would like them to want.
  const shown = [...list].sort((a, b) => a.costPoints - b.costPoints).slice(0, REWARD_PREVIEW);

  return (
    <View style={{ paddingTop: 24 }}>
      <View style={{ paddingHorizontal: gutter, paddingBottom: 10 }}>
        <Label size={10} tracking={0.14}>{t({ en: 'What the points buy', th: 'แลกอะไรได้บ้าง', zh: '积分能换什么' })}</Label>

      </View>

      {offers.error ? (
        <ErrorState message={offers.error} onRetry={offers.reload} />
      ) : offers.loading ? (
        <Body size={13} colour={color.neutral600} style={{ paddingHorizontal: gutter }}>{t(strings.common.loading)}</Body>
      ) : shown.length === 0 ? (
        <Body size={13} colour={color.neutral700} style={{ paddingHorizontal: gutter }}>
          {t({ en: 'No partner rewards are available right now.', th: 'ตอนนี้ยังไม่มีสิทธิพิเศษจากพาร์ตเนอร์', zh: '目前没有可兑换的合作伙伴奖励。' })}
        </Body>
      ) : (
        <>
          {shown.map((o) => {
            const tone = currencyTone(o.currency);
            const canBuy = affordable(o);
            return (
              <Pressable
                key={o.id}
                onPress={onOpenMarket}
                accessibilityRole="button"
                accessibilityLabel={t({
                  en: `${o.name}, ${o.merchant}, ${o.costPoints} ${o.currency === 'green' ? 'Green' : 'Trip'} points.`
                    + ` ${canBuy ? 'Affordable' : 'Not enough points'}`,
                  th: `${o.name} ${o.merchant} ${o.costPoints} ${t(o.currency === 'green' ? strings.common.greenPoints : strings.common.tripPoints)}`
                    + ` ${canBuy ? 'แต้มเพียงพอ' : 'แต้มไม่พอ'}`,
                  zh: `${o.name} ${o.merchant} ${o.costPoints} ${t(o.currency === 'green' ? strings.common.greenPoints : strings.common.tripPoints)}`
                    + ` ${canBuy ? '积分足够' : '积分不足'}`,
                })}
                style={[
                  shadow.card,
                  {
                    marginHorizontal: gutter, marginBottom: 10, padding: 14,
                    backgroundColor: color.surface, borderRadius: radius.md,
                    borderWidth: 1, borderColor: '#DCEFF5',
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Heading size={15}>{o.name}</Heading>
                  <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 3, textTransform: 'none' }}>
                    {o.merchant}
                  </Label>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Heading size={14} colour={canBuy ? tone.text : color.neutral500}>
                    {`${formatInteger(o.costPoints)} ${o.currency === 'green' ? 'G' : 'T'}`}
                  </Heading>
                  {/*
                    The gap, not a lock icon. "480 more" is a number somebody
                    can act on; a padlock only says no.
                  */}
                  {balances != null && !canBuy ? (
                    <Label size={9} tracking={0.06} colour={color.neutral600} style={{ marginTop: 2, textTransform: 'none' }}>
                      {t({ en: `${formatInteger(o.costPoints - balances[o.currency])} more`, th: `ขาดอีก ${formatInteger(o.costPoints - balances[o.currency])}`, zh: `还差 ${formatInteger(o.costPoints - balances[o.currency])}` })}
                    </Label>
                  ) : null}
                </View>
              </Pressable>
            );
          })}

          <Pressable
            onPress={onOpenMarket}
            accessibilityRole="button"
            accessibilityLabel={t({
              en: `See all ${list.length} partner rewards`,
              th: `ดูของรางวัลจากพาร์ทเนอร์ทั้งหมด ${list.length} รายการ`,
              zh: `查看全部 ${list.length} 项合作伙伴奖励`,
            })}
            style={{
              marginHorizontal: gutter, minHeight: 44,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <Label size={10} tracking={0.12} colour={color.brand}>
              {t({ en: `ALL ${list.length} REWARDS`, th: `สิทธิพิเศษทั้งหมด ${list.length} รายการ`, zh: `全部 ${list.length} 项奖励` })}
            </Label>
            <ChevronRight size={16} color={color.brand} strokeWidth={2} />
          </Pressable>
        </>
      )}
    </View>
  );
}
