import React from 'react';
import {
  Image, Pressable, ScrollView, useWindowDimensions, View,
  type ImageSourcePropType, type ViewStyle,
} from 'react-native';
import {
  ChevronRight, Compass, LockKeyhole, MapPinned, MessageCircle,
  Plus, Route, Search, ShieldCheck, Sparkles, Users, Waves,
} from 'lucide-react-native';
import {
  MAX_PARTY_SIZE,
  type CoastalIntelligence,
  type PartyQuestInstance,
  type PartyQuestProgressSummary,
  type PartySummary,
  type ScoredPlace,
} from '@chivago/core';

import partyHero from '../../../assets/party-adventure-hero-v1.png';
import coastalWatchHero from '../../../assets/coastal-watch-party-hero-v1.png';
import travelPartyIcon from '../../../assets/party/01-travel-map-pin.png';
import questPartyIcon from '../../../assets/party/03-quest-scroll.png';
import partyGroupIcon from '../../../assets/party/04-party-group.png';
import trophyIcon from '../../../assets/party/07-trophy.png';
import starIcon from '../../../assets/party/08-star-points.png';
import qrJoinIcon from '../../../assets/party/12-qr-join-illustration.png';
import islandMapIcon from '../../../assets/party/17-island-map.png';
import { api, type Result } from '../../api/client.ts';
import { useAuthedImage } from '../../api/authed-image.ts';
import { useAsync } from '../../state/store.tsx';
import { t } from '../../i18n/locale.ts';
import { color, gutter, shadow } from '../../theme/index.ts';
import { Body, Heading, Label } from '../Type.tsx';
import { ErrorState, LoadingState } from '../States.tsx';
import { kohSichangPartyPlaces } from './party-place-scope.ts';

type PartyOverview = {
  party: { id: string; name: string; createdBy: string; createdAt: string } | null;
  summary: PartySummary;
  partyQuest: PartyQuestInstance | null;
  partyQuestProgress: PartyQuestProgressSummary | null;
};

type Discovery = {
  places: ScoredPlace[];
  pins: { placeId: string; invitesOpen: number; checkinsLastHour: number }[];
};

/**
 * Party dashboard inside Game & Quest. It only displays server-owned facts.
 * In particular, it never invents quest percentages, Party EXP or rewards to
 * make the reference art look populated.
 */
export function PartyHub({
  onOpenParty, onFindParty,
}: {
  onOpenParty: () => void;
  onFindParty: () => void;
}) {
  const overview = useAsync<PartyOverview>(async () => {
    const party = await api.party();
    if (!party.ok) return party;
    let partyQuest: PartyQuestInstance | null = null;
    let partyQuestProgress: PartyQuestProgressSummary | null = null;
    if (party.data.party) {
      const current = await api.currentPartyQuest();
      if (current.ok) {
        partyQuest = current.data.partyQuest;
        if (partyQuest) {
          const progress = await api.partyQuestProgress(partyQuest.id);
          if (progress.ok) partyQuestProgress = progress.data.progress;
        }
      }
    }
    return { ok: true, data: { ...party.data, partyQuest, partyQuestProgress } };
  }, []);
  const discovery = useAsync<Discovery>(loadDiscovery, []);
  const coastal = useAsync<CoastalIntelligence>(() => api.coastalIntelligence(), []);
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  return (
    <View style={{ width: '100%', maxWidth: 1220, alignSelf: 'center', paddingHorizontal: wide ? 18 : gutter, paddingTop: 14 }}>
      <PartyHero onOpenParty={onOpenParty} wide={wide} />
      {wide
        ? <PartyNavigation onOpenParty={onOpenParty} onFindParty={onFindParty} />
        : <MobileShortcuts onOpenParty={onOpenParty} />}

      <CoastalWatchSpotlight data={coastal.data} loading={coastal.loading} onOpenParty={onOpenParty} />

      {overview.loading && !overview.data ? <LoadingState /> : null}
      {overview.error ? <ErrorState message={overview.error} onRetry={overview.reload} /> : null}

      {overview.data ? (
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 15, alignItems: 'stretch' }}>
          <View style={{ flex: wide ? 0.95 : undefined, gap: 15 }}>
            <StartParty onOpenParty={onOpenParty} wide={wide} />
            <RecommendedPlaces
              data={discovery.data}
              loading={discovery.loading}
              error={discovery.error}
              onRetry={discovery.reload}
              onFindParty={onFindParty}
            />
          </View>
          <View style={{ flex: wide ? 1.08 : undefined }}>
            {overview.data.party
              ? <CurrentParty {...overview.data} party={overview.data.party} onOpenParty={onOpenParty} />
              : <NoCurrentParty onOpenParty={onOpenParty} onFindParty={onFindParty} />}
          </View>
        </View>
      ) : null}
      <View style={{ height: wide ? 30 : 18 }} />
    </View>
  );
}

async function loadDiscovery(): Promise<Result<Discovery>> {
  const places = await api.places();
  if (!places.ok) return places;
  const islandPlaces = kohSichangPartyPlaces(places.data);
  const pins = await api.invitePins(islandPlaces.map((place) => place.id));
  if (!pins.ok) return pins;
  return { ok: true, data: { places: islandPlaces, pins: pins.data.pins } };
}

function PartyHero({ onOpenParty, wide }: { onOpenParty: () => void; wide: boolean }) {
  return (
    <Pressable
      onPress={onOpenParty}
      accessibilityRole="button"
      accessibilityLabel={t({ en: 'Party adventure banner', th: 'แบนเนอร์ปาร์ตี้ผจญภัย', zh: '结伴冒险横幅' })}
      accessibilityHint={t({ en: 'Open my party', th: 'เปิดปาร์ตี้ของฉัน', zh: '打开我的队伍' })}
      style={({ pressed }) => [shadow.card, {
        width: '100%', height: wide ? 198 : undefined, aspectRatio: wide ? undefined : 1.55,
        borderRadius: wide ? 28 : 24, overflow: 'hidden', backgroundColor: '#149DE2',
        borderWidth: 1, borderColor: '#79D7EE', opacity: pressed ? 0.92 : 1,
      }]}
    >
      <Image
        source={partyHero}
        resizeMode="cover"
        accessibilityLabel={t({ en: 'ChivaGo friends exploring Koh Sichang', th: 'เพื่อน ChivaGo เที่ยวเกาะสีชังด้วยกัน', zh: 'ChivaGo 好友结伴探索锡昌岛' })}
        style={{ width: '100%', height: '100%' }}
      />
      {!wide ? <View style={{ pointerEvents: 'none', position: 'absolute', inset: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', borderRadius: 24 }} /> : null}
    </Pressable>
  );
}

function PartyNavigation({ onOpenParty, onFindParty }: { onOpenParty: () => void; onFindParty: () => void }) {
  const actions = [
    { label: t({ en: 'Overview', th: 'ภาพรวม', zh: '总览' }), icon: starIcon, active: true, onPress: () => undefined },
    { label: t({ en: 'My party', th: 'ปาร์ตี้ของฉัน', zh: '我的队伍' }), icon: partyGroupIcon, onPress: onOpenParty },
    { label: t({ en: 'Find a party', th: 'ค้นหาปาร์ตี้', zh: '寻找队伍' }), icon: islandMapIcon, onPress: onFindParty },
    { label: t({ en: 'Join with code', th: 'เข้าร่วมด้วยรหัส', zh: '使用代码加入' }), icon: qrJoinIcon, onPress: onOpenParty },
  ];
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 9, paddingVertical: 13 }}>
      {actions.map(({ label, icon, active, onPress }) => (
        <Pressable
          key={label}
          onPress={onPress}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected: Boolean(active) }}
          style={({ pressed }) => [shadow.card, {
            minHeight: 44, flex: 1, paddingHorizontal: 14, borderRadius: 999,
            borderWidth: 1, borderColor: active ? color.brand : '#CBE7F0',
            backgroundColor: active ? color.brand : pressed ? '#E7F7FA' : color.surface,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
          }]}
        >
          <PartyIcon source={icon} size={25} />
          <Heading size={12} colour={active ? '#FFFFFF' : color.brand}>{label}</Heading>
        </Pressable>
      ))}
    </View>
  );
}

function MobileShortcuts({ onOpenParty }: { onOpenParty: () => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 13 }}>
      <Shortcut
        icon={<Plus size={22} color="#FFFFFF" strokeWidth={2.7} />}
        label={t({ en: 'Create party', th: 'สร้างปาร์ตี้', zh: '创建队伍' })}
        detail={t({ en: 'Start a new trip', th: 'เริ่มทีมใหม่', zh: '开始新旅程' })}
        onPress={onOpenParty}
        primary
      />
      <Shortcut
        icon={<Image source={qrJoinIcon} resizeMode="contain" style={{ width: 30, height: 30 }} />}
        label={t({ en: 'Join party', th: 'เข้าร่วมปาร์ตี้', zh: '加入队伍' })}
        detail={t({ en: 'Code or QR link', th: 'ใช้รหัส / QR', zh: '代码或二维码' })}
        onPress={onOpenParty}
      />
    </View>
  );
}

/**
 * A live, read-only field briefing. It deliberately opens the existing Party
 * experience: teams use the real map, meeting point and verified Quest proof
 * flow instead of a second environmental mini-app.
 */
function CoastalWatchSpotlight({ data, loading, onOpenParty }: { data: CoastalIntelligence | null; loading: boolean; onOpenParty: () => void }) {
  const live = data?.status === 'live';
  const current = data?.current;
  const speed = current?.speedKmh;
  const direction = current?.directionLabel ? t(current.directionLabel) : null;
  return (
    <View style={[shadow.card, {
      marginBottom: 14, minHeight: 168, borderRadius: 25, overflow: 'hidden',
      backgroundColor: '#063F5E', borderWidth: 1, borderColor: '#3BC3D6',
    }]}>
      <Image
        source={coastalWatchHero}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.76 }}
      />
      <View style={{ pointerEvents: 'none', position: 'absolute', inset: 0, backgroundColor: 'rgba(1,35,55,0.4)' }} />
      <View style={{ pointerEvents: 'none', position: 'absolute', top: 0, bottom: 0, left: 0, width: '58%', backgroundColor: 'rgba(1,43,66,0.5)' }} />
      <View style={{ padding: 17, flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'stretch' }}>
        <View style={{ flex: 1.2, minWidth: 260 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}><Waves size={23} color="#8FF5F0" /></View>
            <View style={{ flex: 1 }}>
              <Label size={9} tracking={0.12} colour="#8FF5F0">{t({ en: 'COASTAL WATCH · KO SICHANG', th: 'เฝ้าระวังชายฝั่ง · เกาะสีชัง', zh: '锡昌岛海岸监测' })}</Label>
              <Heading size={20} colour="#FFFFFF" style={{ marginTop: 2 }}>{t({ en: 'Turn ocean data into team action', th: 'เปลี่ยนข้อมูลทะเลเป็นภารกิจของทีม', zh: '把海洋数据转化为团队行动' })}</Heading>
            </View>
          </View>
          <Body size={13} colour="#D6F7FB" style={{ marginTop: 9, maxWidth: 630 }}>
            {t({ en: 'Live current context and real shoreline checkpoints help plan an Eco Quest. Rewards still require geofence, photo evidence and host approval.', th: 'ดูกระแสน้ำสดและจุดสำรวจชายฝั่งจริงเพื่อวางแผน Eco Quest โดยแต้มจะเกิดเมื่อผ่าน geofence หลักฐานภาพ และผู้ดูแลอนุมัติเท่านั้น', zh: '用实时海流和真实海岸检查点规划环保任务；奖励仍须通过地理围栏、照片证据和主办方审核。' })}
          </Body>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
            {(data?.zones ?? []).map((zone) => <View key={zone.id} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(143,245,240,0.25)' }}><Label size={9} colour="#FFFFFF">{t(zone.nearBeach)}</Label></View>)}
          </View>
        </View>
        <View style={{ minWidth: 230, flex: 0.75, padding: 13, borderRadius: 19, backgroundColor: 'rgba(3,49,72,0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: live ? '#4DF0A0' : '#FFD85A' }} />
            <Label size={9} colour={live ? '#B9FFD9' : '#FFF0B1'}>{loading ? t({ en: 'READING CURRENT…', th: 'กำลังอ่านกระแสน้ำ…', zh: '正在读取海流…' }) : live ? t({ en: 'LIVE MARINE FEED', th: 'ข้อมูลทะเลสด', zh: '实时海洋数据' }) : t({ en: 'SOURCE UNAVAILABLE', th: 'แหล่งข้อมูลไม่พร้อม', zh: '数据源不可用' })}</Label>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1, padding: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' }}><Waves size={18} color="#8FF5F0" /><Heading size={19} colour="#FFFFFF" style={{ marginTop: 4 }}>{typeof speed === 'number' ? speed.toFixed(1) : '—'}</Heading><Label size={9} colour="#BFEAF2">{t({ en: 'KM/H', th: 'กม./ชม.', zh: '公里/小时' })}</Label></View>
            <View style={{ flex: 1, padding: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' }}><Compass size={18} color="#8FF5F0" /><Heading size={15} colour="#FFFFFF" style={{ marginTop: 6 }}>{direction ?? '—'}</Heading><Label size={9} colour="#BFEAF2">{typeof current?.directionDeg === 'number' ? `${Math.round(current.directionDeg)}°` : t({ en: 'DIRECTION', th: 'ทิศทาง', zh: '方向' })}</Label></View>
          </View>
          <Pressable onPress={onOpenParty} accessibilityRole="button" accessibilityLabel={t({ en: 'Open Eco Party field tools', th: 'เปิดเครื่องมือลงพื้นที่ของ Eco Party', zh: '打开环保队伍现场工具' })} style={({ pressed }) => ({ marginTop: 10, minHeight: 42, borderRadius: 13, backgroundColor: pressed ? '#D6F8F6' : '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 })}>
            <ShieldCheck size={17} color="#056D8B" /><Heading size={12} colour="#056D8B">{t({ en: 'Open field mission', th: 'เปิดภารกิจลงพื้นที่', zh: '打开现场任务' })}</Heading>
          </Pressable>
        </View>
      </View>
      <View style={{ paddingHorizontal: 17, paddingVertical: 8, backgroundColor: 'rgba(0,18,35,0.3)', flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Sparkles size={14} color="#FFD85A" />
        <Body size={13} colour="#D7ECF3" style={{ flex: 1 }}>{t({ en: 'Research guidance, not a debris probability · Open-Meteo + published Ko Sichang survey geometry', th: 'ข้อมูลช่วยวางแผน ไม่ใช่ความน่าจะเป็นของขยะ · Open-Meteo + แนวสำรวจเกาะสีชังที่เผยแพร่แล้ว', zh: '仅供研究规划，并非垃圾概率 · Open-Meteo + 已发布的锡昌岛调查几何数据' })}</Body>
      </View>
    </View>
  );
}

function Shortcut({ icon, label, detail, onPress, primary = false }: { icon: React.ReactNode; label: string; detail: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [shadow.card, {
        flex: 1, minHeight: 78, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20,
        borderWidth: 1, borderColor: primary ? '#0585C2' : '#CBE7F0',
        backgroundColor: primary ? (pressed ? '#0078A9' : '#058DC8') : (pressed ? '#E7F7FA' : '#FFFFFF'),
        flexDirection: 'row', alignItems: 'center', gap: 9,
      }]}
    >
      <View style={{ width: 39, height: 39, borderRadius: 13, backgroundColor: primary ? 'rgba(255,255,255,0.18)' : '#E9F8FC', alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Heading size={13} colour={primary ? '#FFFFFF' : color.text}>{label}</Heading>
        <Body size={13} colour={primary ? '#DDF7FF' : color.neutral600} style={{ marginTop: 2 }}>{detail}</Body>
      </View>
    </Pressable>
  );
}

function PartyIcon({ source, size }: { source: ImageSourcePropType; size: number }) {
  return <Image source={source} resizeMode="contain" accessibilityIgnoresInvertColors style={{ width: size, height: size }} />;
}

const panel: ViewStyle = {
  ...shadow.card, borderRadius: 24, backgroundColor: color.surface,
  borderWidth: 1, borderColor: '#D5EAF2', padding: 17,
};

function StartParty({ onOpenParty, wide }: { onOpenParty: () => void; wide: boolean }) {
  return (
    <View style={panel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Sparkles size={20} color="#F2A900" />
        <Heading size={18}>{t({ en: 'Start a new party', th: 'เริ่มปาร์ตี้ใหม่', zh: '创建新队伍' })}</Heading>
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 9, marginTop: 13 }}>
        <CreationCard
          source={travelPartyIcon}
          title={t({ en: 'Travel Party', th: 'ปาร์ตี้เดินทาง', zh: '旅行队伍' })}
          detail={t({ en: `Live map and shared plan · up to ${MAX_PARTY_SIZE}`, th: `แชร์ตำแหน่งและวางแผนร่วมกัน · สูงสุด ${MAX_PARTY_SIZE} คน`, zh: `实时地图和共享计划 · 最多 ${MAX_PARTY_SIZE} 人` })}
          onPress={onOpenParty}
          tone="blue"
        />
        <CreationCard
          source={questPartyIcon}
          title={t({ en: 'Quest Party', th: 'ปาร์ตี้ทำเควส', zh: '任务队伍' })}
          detail={t({ en: 'Quest roster foundation is ready; task progress is not live yet.', th: 'ระบบรายชื่อเควสพร้อมแล้ว แต่ความคืบหน้างานยังไม่เปิดใช้', zh: '任务名单基础已就绪，任务进度尚未开放。' })}
          tone="purple"
          disabled
        />
      </View>
    </View>
  );
}

function CreationCard({ source, title, detail, onPress, tone, disabled = false }: { source: ImageSourcePropType; title: string; detail: string; onPress?: () => void; tone: 'blue' | 'purple'; disabled?: boolean }) {
  const fill = tone === 'blue' ? '#E4F6FE' : '#F2EEFD';
  const edge = tone === 'blue' ? '#A7DDEC' : '#D9CEF5';
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        flex: 1, minHeight: 108, padding: 13, borderRadius: 19, backgroundColor: pressed ? '#D6F0FA' : fill,
        borderWidth: 1, borderColor: edge, flexDirection: 'row', alignItems: 'center', gap: 11,
        opacity: disabled ? 0.82 : 1,
      })}
    >
      <View style={{ width: 67, height: 67, borderRadius: 17, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <PartyIcon source={source} size={59} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Heading size={15}>{title}</Heading>
        <Body size={13} colour={color.neutral700} style={{ marginTop: 3 }}>{detail}</Body>
        {disabled ? <Label size={9} colour="#7255A8" style={{ marginTop: 6 }}>{t({ en: 'FOUNDATION ONLY', th: 'เฉพาะระบบพื้นฐาน', zh: '仅基础功能' })}</Label> : null}
      </View>
      {!disabled ? <ChevronRight size={19} color={color.brand} /> : <LockKeyhole size={17} color="#7255A8" />}
    </Pressable>
  );
}

function RecommendedPlaces({ data, loading, error, onRetry, onFindParty }: { data: Discovery | null; loading: boolean; error: string | null; onRetry: () => void; onFindParty: () => void }) {
  const pins = data?.pins ?? [];
  const places = data?.places ?? [];
  const candidates = [...pins]
    .filter((pin) => pin.invitesOpen > 0)
    .sort((a, b) => b.invitesOpen - a.invitesOpen)
    .slice(0, 2)
    .map((pin) => ({ pin, place: places.find((place) => place.id === pin.placeId) }))
    .filter((item): item is { pin: Discovery['pins'][number]; place: ScoredPlace } => Boolean(item.place));

  return (
    <View style={panel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Compass size={20} color="#F2A900" />
        <Heading size={18} style={{ flex: 1 }}>{t({ en: 'Parties at real places', th: 'ปาร์ตี้ตามสถานที่จริง', zh: '真实地点的队伍' })}</Heading>
        <Pressable onPress={onFindParty} accessibilityRole="button" accessibilityLabel={t({ en: 'See all places', th: 'ดูสถานที่ทั้งหมด', zh: '查看全部地点' })}>
          <Label size={9} colour={color.brand}>{t({ en: 'SEE ALL', th: 'ดูทั้งหมด', zh: '查看全部' })}</Label>
        </Pressable>
      </View>
      {loading && !data ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={onRetry} /> : null}
      {!loading && !error && candidates.length === 0 ? (
        <View style={{ marginTop: 12, padding: 14, borderRadius: 17, backgroundColor: '#F1F9FC', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PartyIcon source={islandMapIcon} size={62} />
          <View style={{ flex: 1 }}>
            <Heading size={14}>{t({ en: 'No open invitations right now', th: 'ตอนนี้ยังไม่มีประกาศเปิดรับ', zh: '目前没有开放邀请' })}</Heading>
            <Body size={13} colour={color.neutral600} style={{ marginTop: 3 }}>{t({ en: 'Browse a ChivaGo place to start one.', th: 'เลือกสถานที่จริงใน ChivaGo แล้วเริ่มประกาศได้', zh: '浏览 ChivaGo 地点并发起邀请。' })}</Body>
          </View>
        </View>
      ) : null}
      {candidates.map(({ pin, place }) => (
        <Pressable
          key={place.id}
          onPress={onFindParty}
          accessibilityRole="button"
          accessibilityLabel={`${t(place.name)} · ${pin.invitesOpen}`}
          style={({ pressed }) => ({
            marginTop: 11, padding: 12, minHeight: 78, borderRadius: 17,
            borderWidth: 1, borderColor: '#D8ECF2', backgroundColor: pressed ? '#E8F7FA' : '#F8FCFD',
            flexDirection: 'row', alignItems: 'center', gap: 11,
          })}
        >
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#DDF5FA', alignItems: 'center', justifyContent: 'center' }}>
            <MapPinned size={27} color={color.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Heading size={14}>{t(place.name)}</Heading>
            <Body size={13} colour={color.neutral600} style={{ marginTop: 3 }}>{t({ en: `${pin.invitesOpen} open invitation${pin.invitesOpen === 1 ? '' : 's'}`, th: `มีประกาศเปิดรับ ${pin.invitesOpen} ปาร์ตี้`, zh: `${pin.invitesOpen} 个开放邀请` })}</Body>
          </View>
          <ChevronRight size={18} color={color.brand} />
        </Pressable>
      ))}
      <Pressable onPress={onFindParty} accessibilityRole="button" style={({ pressed }) => ({ marginTop: 12, minHeight: 43, borderRadius: 14, backgroundColor: pressed ? '#00769C' : color.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 })}>
        <Search size={17} color="#FFFFFF" />
        <Heading size={13} colour="#FFFFFF">{t({ en: 'Find travel companions', th: 'ค้นหาเพื่อนร่วมทาง', zh: '寻找旅伴' })}</Heading>
      </Pressable>
    </View>
  );
}

function CurrentParty({ party, summary, partyQuest, partyQuestProgress, onOpenParty }: PartyOverview & { party: NonNullable<PartyOverview['party']>; onOpenParty: () => void }) {
  const me = summary.members.find((member) => member.you);
  const owner = me?.userId === party.createdBy;
  return (
    <View style={[panel, { minHeight: '100%', overflow: 'hidden' }]}>
      <View style={{ marginHorizontal: -17, marginTop: -17, height: 108, overflow: 'hidden', backgroundColor: '#0A91CA' }}>
        <Image source={partyHero} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,59,88,0.16)' }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: -20 }}>
        <View style={{ width: 66, height: 66, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <PartyIcon source={partyGroupIcon} size={61} />
        </View>
        <View style={{ flex: 1, marginTop: 24 }}>
          <Label size={9} tracking={0.11} colour={color.brand}>{t({ en: 'MY PARTY', th: 'ปาร์ตี้ของฉัน', zh: '我的队伍' })}</Label>
          <Heading size={20} style={{ marginTop: 2 }}>{party.name}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 2 }}>{summary.size}/{MAX_PARTY_SIZE} {t({ en: 'members', th: 'คน', zh: '名成员' })}{owner ? ` · ${t({ en: 'Owner', th: 'หัวหน้าปาร์ตี้', zh: '队长' })}` : ''}</Body>
        </View>
        <View style={{ marginTop: 25, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#DDF8E8' }}>
          <Label size={9} colour="#16875C">{t({ en: 'ACTIVE', th: 'กำลังเดินทาง', zh: '进行中' })}</Label>
        </View>
      </View>

      <Label size={9} tracking={0.1} colour={color.neutral600} style={{ marginTop: 16 }}>{t({ en: 'MEMBERS', th: 'สมาชิกในปาร์ตี้', zh: '队伍成员' })}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 9 }}>
        {summary.members.map((member) => <MemberAvatar key={member.userId} member={member} />)}
      </ScrollView>

      {partyQuest ? <PartyQuestStatusCard quest={partyQuest} progress={partyQuestProgress} /> : <TravelStatus summary={summary} />}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 13 }}>
        <ActionButton icon={<MessageCircle size={17} color={color.brand} />} label={t({ en: 'Team chat', th: 'แชททีม', zh: '队伍聊天' })} onPress={onOpenParty} />
        <ActionButton icon={<MapPinned size={17} color="#FFFFFF" />} label={t({ en: 'Party map', th: 'แผนที่ปาร์ตี้', zh: '队伍地图' })} onPress={onOpenParty} primary />
      </View>
      <Pressable onPress={onOpenParty} accessibilityRole="button" accessibilityLabel={t({ en: 'Manage party', th: 'จัดการปาร์ตี้', zh: '管理队伍' })} style={({ pressed }) => ({ marginTop: 8, minHeight: 43, borderRadius: 14, borderWidth: 1, borderColor: '#CBE7F0', backgroundColor: pressed ? '#E8F7FA' : '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 })}>
        <Users size={17} color={color.brand} />
        <Heading size={12} colour={color.brand}>{t({ en: 'Manage party', th: 'จัดการปาร์ตี้', zh: '管理队伍' })}</Heading>
      </Pressable>
    </View>
  );
}

function TravelStatus({ summary }: { summary: PartySummary }) {
  return (
    <View style={{ marginTop: 15, padding: 13, borderRadius: 18, backgroundColor: '#EDF8FC' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Route size={19} color={color.brand} /><Heading size={15}>{t({ en: 'Travel Party', th: 'ปาร์ตี้เดินทาง', zh: '旅行队伍' })}</Heading></View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Metric icon={starIcon} value={summary.missionsVerified} label={t({ en: 'Verified quests', th: 'เควสที่ผ่าน', zh: '已验证任务' })} />
        <Metric icon={trophyIcon} value={summary.provincesTogether} label={t({ en: 'Provinces', th: 'จังหวัด', zh: '府' })} />
      </View>
      <Body size={13} colour={color.neutral600} style={{ marginTop: 9 }}>{t({ en: 'Live map, meeting point, chat and shared itinerary are ready.', th: 'พร้อมใช้แผนที่สด จุดนัดพบ แชท และแผนเที่ยวร่วมกัน', zh: '实时地图、集合点、聊天与共享行程均可使用。' })}</Body>
    </View>
  );
}

export function PartyQuestStatusCard({ quest, progress = null }: { quest: PartyQuestInstance; progress?: PartyQuestProgressSummary | null }) {
  const completed = progress?.completedCount ?? quest.participants.filter((participant) => participant.completedAt !== null).length;
  const state = quest.state.replaceAll('_', ' ');
  return (
    <View style={{ marginTop: 15, padding: 14, borderRadius: 18, backgroundColor: '#F2F8FB', borderWidth: 1, borderColor: '#CFE7F0' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <PartyIcon source={questPartyIcon} size={42} />
        <View style={{ flex: 1 }}>
          <Label size={9} colour={color.brand}>{t({ en: 'PARTY QUEST', th: 'เควสปาร์ตี้', zh: '队伍任务' })}</Label>
          <Heading size={15} style={{ marginTop: 2 }}>{questName(quest)}</Heading>
          <Body size={13} colour={color.neutral600} style={{ marginTop: 2 }}>{quest.questType.toUpperCase()} · {quest.questMode.replaceAll('_', ' ').toUpperCase()}</Body>
        </View>
        <View style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: quest.state === 'in_progress' ? '#DDF8E8' : '#FFF3CE' }}>
          <Label size={9} colour={quest.state === 'in_progress' ? '#16875C' : '#8B6411'}>{state.toUpperCase()}</Label>
        </View>
      </View>
      <View style={{ marginTop: 11, padding: 11, borderRadius: 14, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ShieldCheck size={19} color={color.brand} />
        <Body size={13} colour={color.neutral700} style={{ flex: 1 }}>
          {quest.rosterLockedAt
            ? t({ en: `${quest.participants.length} members locked in the roster · ${completed} server-confirmed complete`, th: `ล็อกรายชื่อ ${quest.participants.length} คน · สำเร็จโดยเซิร์ฟเวอร์ยืนยัน ${completed} คน`, zh: `名单已锁定 ${quest.participants.length} 人 · ${completed} 人已由服务器确认完成` })
            : t({ en: 'Selected by the owner. The roster locks when the quest starts.', th: 'เจ้าของเลือกแล้ว รายชื่อจะล็อกเมื่อเริ่มเควส', zh: '队长已选择；任务开始时锁定名单。' })}
        </Body>
      </View>
      {progress ? <>
        <View style={{ height: 9, borderRadius: 999, backgroundColor: '#DCECF1', overflow: 'hidden', marginTop: 11 }}><View style={{ width: `${progress.progressPercent}%`, height: '100%', borderRadius: 999, backgroundColor: '#20B875' }} /></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 }}>
          <Label size={9} colour="#16875C">{progress.progressPercent}% {t({ en: 'SERVER VERIFIED', th: 'เซิร์ฟเวอร์ยืนยัน', zh: '服务器已验证' })}</Label>
          <Body size={13} colour={color.neutral600} style={{ flex: 1, textAlign: 'right' }}>{progress.pendingReviewCount > 0 ? t({ en: `${progress.pendingReviewCount} awaiting host review`, th: `รอผู้ดูแลตรวจ ${progress.pendingReviewCount} คน`, zh: `${progress.pendingReviewCount} 人等待审核` }) : t({ en: 'No evidence waiting for review', th: 'ไม่มีหลักฐานรอตรวจ', zh: '没有待审核证据' })}</Body>
        </View>
        {progress.totalVerifiedWeightKg !== null ? <View style={{ marginTop: 9, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13, backgroundColor: '#E8F8EF', flexDirection: 'row', alignItems: 'center', gap: 7 }}><Waves size={17} color="#16875C" /><Body size={13} colour="#116A49" style={{ flex: 1 }}>{t({ en: `${progress.totalVerifiedWeightKg.toFixed(2)} kg from host-approved evidence`, th: `หลักฐานที่ผู้ดูแลอนุมัติแล้ว ${progress.totalVerifiedWeightKg.toFixed(2)} กก.`, zh: `主办方已审核证据 ${progress.totalVerifiedWeightKg.toFixed(2)} 千克` })}</Body></View> : null}
        {progress.deadlineAt ? <Body size={13} colour={color.neutral600} style={{ marginTop: 8 }}>{t({ en: `Deadline: ${new Date(progress.deadlineAt).toLocaleString()}`, th: `กำหนดเวลา: ${new Date(progress.deadlineAt).toLocaleString('th-TH')}`, zh: `截止时间：${new Date(progress.deadlineAt).toLocaleString('zh-CN')}` })}</Body> : null}
        <View style={{ marginTop: 9, gap: 6 }}>
          {progress.participants.map((participant) => (
            <View key={participant.userId} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Body size={13} colour={color.neutral700} numberOfLines={1}>{participant.displayName}</Body>
                {participant.assignment ? <Body size={13} colour={color.neutral600} numberOfLines={1}>{participant.assignment}</Body> : null}
              </View>
              <Label size={9} colour={participant.stage === 'complete' ? '#16875C' : color.neutral600}>
                {participant.stage === 'complete'
                  ? t({ en: `DONE · ${participant.contribution}`, th: `สำเร็จ · ${participant.contribution}`, zh: `完成 · ${participant.contribution}` })
                  : t({ en: 'PENDING', th: 'รอดำเนินการ', zh: '待完成' })}
              </Label>
            </View>
          ))}
        </View>
      </> : <Body size={13} colour={color.neutral600} style={{ marginTop: 8 }}>{t({ en: 'Verified progress will appear when members start this Quest.', th: 'ความคืบหน้าที่ตรวจสอบแล้วจะแสดงเมื่อสมาชิกเริ่มทำเควสนี้', zh: '成员开始此任务后将显示已验证进度。' })}</Body>}
    </View>
  );
}

function questName(quest: PartyQuestInstance): string {
  const name = quest.questSnapshot.name;
  if (typeof name === 'string') return name;
  if (name && typeof name === 'object') {
    const value = name as Record<string, unknown>;
    const fallback = typeof value.en === 'string' ? value.en : quest.questId;
    return t({
      en: fallback,
      th: typeof value.th === 'string' ? value.th : fallback,
      zh: typeof value.zh === 'string' ? value.zh : fallback,
    });
  }
  return quest.questId;
}

function ActionButton({ icon, label, onPress, primary = false }: { icon: React.ReactNode; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: primary ? color.brand : '#CBE7F0', backgroundColor: primary ? (pressed ? '#00769C' : color.brand) : (pressed ? '#E8F7FA' : '#FFFFFF'), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 })}>
      {icon}<Heading size={12} colour={primary ? '#FFFFFF' : color.brand}>{label}</Heading>
    </Pressable>
  );
}

function Metric({ icon, value, label }: { icon: ImageSourcePropType; value: number; label: string }) {
  return <View style={{ flex: 1, minWidth: 0, paddingVertical: 8, paddingHorizontal: 7, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center' }}><PartyIcon source={icon} size={27} /><Heading size={18} colour={color.brand}>{value}</Heading><Label size={9} colour={color.neutral600} style={{ marginTop: 2, textAlign: 'center' }}>{label}</Label></View>;
}

function MemberAvatar({ member }: { member: PartySummary['members'][number] }) {
  const source = useAuthedImage(member.profilePhotoUrl);
  const initial = member.displayName.trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={{ width: 62, alignItems: 'center' }}>
      {source
        ? <Image source={source} style={{ width: 45, height: 45, borderRadius: 23, backgroundColor: '#DDF4F7', borderWidth: member.you ? 2 : 0, borderColor: '#F2A900' }} />
        : <View style={{ width: 45, height: 45, borderRadius: 23, backgroundColor: member.you ? '#FFD85A' : '#CDEFF5', alignItems: 'center', justifyContent: 'center', borderWidth: member.you ? 2 : 0, borderColor: '#F2A900' }}><Heading size={15} colour="#123B64">{initial}</Heading></View>}
      <Body size={13} numberOfLines={1} style={{ marginTop: 4, maxWidth: 62 }}>{member.you ? t({ en: 'You', th: 'คุณ', zh: '你' }) : member.displayName}</Body>
    </View>
  );
}

function NoCurrentParty({ onOpenParty, onFindParty }: { onOpenParty: () => void; onFindParty: () => void }) {
  return (
    <View style={[panel, { minHeight: 330, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, overflow: 'hidden' }]}>
      <View style={{ position: 'absolute', width: 250, height: 250, borderRadius: 125, backgroundColor: '#E9F8FC', top: -82, right: -55 }} />
      <PartyIcon source={partyGroupIcon} size={92} />
      <Heading size={21} style={{ marginTop: 9, textAlign: 'center' }}>{t({ en: 'Your adventure party starts here', th: 'ปาร์ตี้ผจญภัยของคุณเริ่มตรงนี้', zh: '你的冒险队伍从这里开始' })}</Heading>
      <Body size={13} colour={color.neutral700} style={{ marginTop: 7, textAlign: 'center', maxWidth: 430 }}>{t({ en: 'Create a group, find travellers at a real ChivaGo place, or join with an invite code.', th: 'สร้างกลุ่ม ค้นหาเพื่อนตามสถานที่จริงใน ChivaGo หรือเข้าร่วมด้วยรหัสเชิญ', zh: '创建队伍、在真实 ChivaGo 地点寻找旅伴，或使用邀请码加入。' })}</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 17 }}>
        <Pressable onPress={onOpenParty} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 17, borderRadius: 14, backgroundColor: pressed ? '#00769C' : color.brand, flexDirection: 'row', alignItems: 'center', gap: 7 })}><Plus size={17} color="#FFFFFF" /><Heading size={12} colour="#FFFFFF">{t({ en: 'Create party', th: 'เปิดปาร์ตี้', zh: '创建队伍' })}</Heading></Pressable>
        <Pressable onPress={onFindParty} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 17, borderRadius: 14, borderWidth: 1, borderColor: color.brand, backgroundColor: pressed ? '#E7F7FA' : color.surface, flexDirection: 'row', alignItems: 'center', gap: 7 })}><Search size={17} color={color.brand} /><Heading size={12} colour={color.brand}>{t({ en: 'Find a party', th: 'ค้นหาปาร์ตี้', zh: '寻找队伍' })}</Heading></Pressable>
      </View>
      <Pressable onPress={onOpenParty} accessibilityRole="button" style={{ marginTop: 11, flexDirection: 'row', gap: 6, alignItems: 'center', padding: 6 }}><PartyIcon source={qrJoinIcon} size={27} /><Label size={9} colour={color.brand}>{t({ en: 'JOIN WITH CODE OR QR LINK', th: 'เข้าร่วมด้วยรหัสหรือลิงก์ QR', zh: '使用代码或二维码链接加入' })}</Label></Pressable>
    </View>
  );
}
