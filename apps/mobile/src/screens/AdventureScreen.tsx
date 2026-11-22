import React from 'react';
import {
  Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import * as Location from 'expo-location';
import {
  ArrowLeft, ArrowRight, BookOpen, Camera, Check, CheckCircle2, Compass,
  LockKeyhole, MapPinned, Navigation, NotebookPen, PawPrint, QrCode, Sparkles,
} from 'lucide-react-native';
import type { AdventureArc, AdventureNode, Fix, ScoredPlace } from '@chivago/core';
import { areaByKey } from '@chivago/core';
import travelHero from '../../assets/chivago-travel-hero-v2.png';
import { api, type CheckinResult } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { locationOff } from '../state/server-config.ts';
import { t } from '../i18n/locale.ts';
import { gutter, shadow } from '../theme/index.ts';
import { Body, Heading, Label } from '../components/Type.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.tsx';
import { SamuiMap } from '../components/SamuiMap.tsx';
import { Hero } from './PlaceScreen.tsx';
import { AdventureVerificationScreen } from './AdventureVerificationScreen.tsx';
import { adventureWithFallback } from '../offline/adventure-cache.ts';

type AdventureView = 'home' | 'map' | 'detail' | 'verification' | 'reward';

export function AdventureScreen({
  onBack, onOpenPlace, onOpenJournal, onOpenSeason, onOpenMissions, onOpenExplore, onToast, onPointsChanged,
}: {
  onBack: () => void;
  onOpenPlace: (id: string) => void;
  onOpenJournal: () => void;
  onOpenSeason: () => void;
  onOpenMissions: () => void;
  onOpenExplore: () => void;
  onToast: (message: string) => void;
  onPointsChanged: () => void;
}) {
  const overview = useAsync(() => adventureWithFallback('koh-sichang', () => api.adventure('koh-sichang')), []);
  const places = useAsync(() => api.places(), []);
  const explored = useAsync(() => api.explored(), []);
  const [view, setView] = React.useState<AdventureView>('home');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [reward, setReward] = React.useState<CheckinResult | null>(null);
  const [busy, setBusy] = React.useState(false);

  const adventure = overview.data?.adventure ?? null;
  const nodes = adventure?.chapters.flatMap((chapter) => chapter.nodes) ?? [];
  const selected = nodes.find((node) => node.id === selectedId)
    ?? nodes.find((node) => node.id === adventure?.currentNodeId)
    ?? nodes[0]
    ?? null;
  const placeById = React.useMemo(
    () => new Map((places.data ?? []).map((place) => [place.id, place])),
    [places.data],
  );

  const openNode = (node: AdventureNode) => {
    if (node.state === 'locked') {
      onToast(t({
        en: 'Finish the current clue before opening this stop.',
        th: 'ทำเบาะแสปัจจุบันให้สำเร็จก่อนเปิดจุดนี้',
        zh: '请先完成当前线索，再开启此地点。',
      }));
      return;
    }
    setSelectedId(node.id);
    setView('detail');
  };

  const checkIn = async () => {
    if (!selected || selected.state === 'completed') return;
    setBusy(true);
    // No GPS at all while the server has opened the fence. See server-config.ts.
    let fix: Fix | null = null;
    if (!(await locationOff())) {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setBusy(false);
        onToast(t({
          en: 'Location permission is required for a verified check-in.',
          th: 'ต้องอนุญาตตำแหน่งเพื่อเช็กอินแบบตรวจสอบได้',
          zh: '经验证的签到需要位置权限。',
        }));
        return;
      }
      let position: Location.LocationObject;
      try {
        position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch {
        setBusy(false);
        onToast(t({ en: 'A location fix is not available yet.', th: 'ยังไม่สามารถระบุตำแหน่งได้', zh: '暂时无法获取位置。' }));
        return;
      }
      fix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyM: position.coords.accuracy ?? null,
        mocked: position.mocked ?? false,
      };
    }
    const result = await api.checkIn(selected.place.id, fix);
    setBusy(false);
    if (!result.ok) { onToast(result.error); return; }
    setReward(result.data);
    overview.reload();
    explored.reload();
    if (result.data.awarded) onPointsChanged();
    setView('reward');
  };

  if ((overview.loading || places.loading) && !overview.data) return <LoadingState />;
  if (overview.error) return <ErrorState message={overview.error} onRetry={overview.reload} />;
  if (!adventure) return <EmptyState en="No published adventure is available in this area yet." th="ยังไม่มีการผจญภัยที่เผยแพร่ในพื้นที่นี้" zh="该地区暂时没有已发布的冒险。" />;

  const back = () => {
    if (view === 'home') { onBack(); return; }
    if (view === 'detail') { setView('map'); return; }
    setView(view === 'reward' ? 'detail' : 'home');
  };

  return (
    <View style={styles.root}>
      {overview.data?.offlineAt ? <View style={{ marginHorizontal: gutter, marginTop: 8, padding: 9, borderRadius: 12, backgroundColor: '#FFF2D2' }}><Body size={13} colour="#684B12">{t({ en: 'Offline snapshot · server verification and rewards remain unavailable until sync.', th: 'ข้อมูลออฟไลน์ · ต้องรอซิงก์ก่อนตรวจสอบและรับรางวัลจากเซิร์ฟเวอร์', zh: '离线快照 · 同步前无法进行服务器验证和发放奖励。' })}</Body></View> : null}
      {view === 'home' ? (
        <AdventureHome
          adventure={adventure}
          nodes={nodes}
          onBack={back}
          onMap={() => setView('map')}
          onOpenJournal={onOpenJournal}
          onOpenSeason={onOpenSeason}
          onOpenMissions={onOpenMissions}
          onOpenExplore={onOpenExplore}
          onOpenNode={openNode}
        />
      ) : null}
      {view === 'map' ? (
        <AdventureMap
          adventure={adventure}
          nodes={nodes}
          places={places.data ?? []}
          explored={explored.data?.places ?? []}
          onBack={back}
          onOpenNode={openNode}
          onOpenPlace={onOpenPlace}
        />
      ) : null}
      {view === 'detail' && selected ? (
        <ClueDetail
          node={selected}
          place={placeById.get(selected.place.id) ?? null}
          busy={busy}
          onBack={back}
          onCheckIn={checkIn}
          onVerifyActivity={() => setView('verification')}
          onOpenPlace={() => onOpenPlace(selected.place.id)}
        />
      ) : null}
      {view === 'verification' && selected ? (
        <AdventureVerificationScreen
          node={selected}
          onBack={() => setView('detail')}
          onCompleted={() => { overview.reload(); explored.reload(); onPointsChanged(); setView('detail'); }}
        />
      ) : null}
      {view === 'reward' && selected && reward ? (
        <RewardView node={selected} result={reward} onBack={back} onNext={() => {
          const next = nodes.find((node) => node.state === 'available' && node.id !== selected.id);
          if (next) { setSelectedId(next.id); setView('detail'); }
          else setView('home');
        }} />
      ) : null}
    </View>
  );
}

function AdventureHome({ adventure, nodes, onBack, onMap, onOpenJournal, onOpenSeason, onOpenMissions, onOpenExplore, onOpenNode }: {
  adventure: AdventureArc;
  nodes: AdventureNode[];
  onBack: () => void;
  onMap: () => void;
  onOpenJournal: () => void;
  onOpenSeason: () => void;
  onOpenMissions: () => void;
  onOpenExplore: () => void;
  onOpenNode: (node: AdventureNode) => void;
}) {
  const current = nodes.find((node) => node.id === adventure.currentNodeId) ?? nodes[0];
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <TopBar title={t({ en: 'Adventure', th: 'เกมและการเดินทาง', zh: '冒险旅行' })} onBack={onBack} />
      <View style={[styles.hero, wide && styles.heroWide]}>
        <Image source={travelHero} resizeMode="cover" style={StyleSheet.absoluteFillObject} accessibilityLabel={t(adventure.title)} />
        <View style={styles.heroShade} />
        <View style={styles.heroCopy}>
          <Label size={10} tracking={0.12} colour="#C9FBFF">KOH SICHANG ADVENTURE</Label>
          <Heading size={wide ? 34 : 28} colour="#FFFFFF" style={{ marginTop: 6 }}>{t(adventure.title)}</Heading>
          <Body size={14} colour="#E7FCFF" style={{ marginTop: 8, maxWidth: 600 }}>{t(adventure.summary)}</Body>
          <Pressable accessibilityRole="button" onPress={onMap} style={styles.heroButton}>
            <MapPinned size={19} color="#06395B" />
            <Text style={styles.heroButtonText}>{t({ en: 'Open story map', th: 'เปิดแผนที่เนื้อเรื่อง', zh: '打开故事地图' })}</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.modeRow}>
        <Mode icon={BookOpen} label={t({ en: 'Story', th: 'เนื้อเรื่อง', zh: '故事' })} active onPress={onMap} />
        <Mode icon={CheckCircle2} label={t({ en: 'Missions', th: 'ภารกิจ', zh: '任务' })} onPress={onOpenMissions} />
        <Mode icon={Compass} label={t({ en: 'Free explore', th: 'สำรวจอิสระ', zh: '自由探索' })} onPress={onOpenExplore} />
      </View>
      <Pressable accessibilityRole="button" onPress={onOpenJournal} style={styles.journalLink}>
        <NotebookPen size={21} color="#087C9B" />
        <View style={{ flex: 1 }}>
          <Text style={styles.journalLinkTitle}>{t({ en: 'My travel journal', th: 'สมุดบันทึกทริปของฉัน', zh: '我的旅行手账' })}</Text>
          <Text style={styles.journalLinkText}>{t({ en: 'Verified places, stories and pet memories', th: 'สถานที่ เรื่องราว และความทรงจำของ Pet ที่ตรวจสอบแล้ว', zh: '已验证的地点、故事和宠物记忆' })}</Text>
        </View>
        <ArrowRight size={20} color="#087C9B" />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onOpenSeason} style={styles.journalLink}>
        <Sparkles size={21} color="#7C55D9" />
        <View style={{ flex: 1 }}><Text style={styles.journalLinkTitle}>{t({ en: 'Seasonal adventure', th: 'กิจกรรมฤดูกาล', zh: '季节冒险' })}</Text><Text style={styles.journalLinkText}>{t({ en: 'Limited quests, collection and catch-up exchange', th: 'ภารกิจจำกัดเวลา คอลเลกชัน และการตามเก็บย้อนหลัง', zh: '限时任务、收藏与追赶兑换' })}</Text></View>
        <ArrowRight size={20} color="#7C55D9" />
      </Pressable>
      <SectionTitle title={t(adventure.chapters[0]?.title ?? adventure.title)} meta={`${adventure.completedNodes}/${adventure.totalNodes}`} />
      <Progress value={adventure.progressPercent} />
      {current ? (
        <Pressable accessibilityRole="button" onPress={() => onOpenNode(current)} style={styles.currentCard}>
          {current.place.photoUrl ? <Image source={{ uri: current.place.photoUrl }} resizeMode="cover" style={styles.currentPhoto} /> : <View style={styles.currentPhotoFallback}><MapPinned size={34} color="#05A8B8" /></View>}
          <View style={{ flex: 1 }}>
            <Label size={10} tracking={0.08} colour="#078B9D">{t({ en: 'CURRENT CLUE', th: 'เบาะแสปัจจุบัน', zh: '当前线索' })}</Label>
            <Heading size={18} style={{ marginTop: 4 }}>{t(current.title)}</Heading>
            <Body size={13} colour="#587083" numberOfLines={2} style={{ marginTop: 5 }}>{t(current.instruction)}</Body>
          </View>
          <ArrowRight size={22} color="#087C9B" />
        </Pressable>
      ) : null}
      <View style={styles.nodePreviewRow}>
        {nodes.map((node, index) => <NodeChip key={node.id} node={node} index={index + 1} onPress={() => onOpenNode(node)} />)}
      </View>
    </ScrollView>
  );
}

function AdventureMap({ adventure, nodes, places, explored, onBack, onOpenNode, onOpenPlace }: {
  adventure: AdventureArc;
  nodes: AdventureNode[];
  places: ScoredPlace[];
  explored: { placeId: string; firstAt: string; how: 'checkin' | 'self' }[];
  onBack: () => void;
  onOpenNode: (node: AdventureNode) => void;
  onOpenPlace: (id: string) => void;
}) {
  const nodeByPlace = new Map(nodes.map((node) => [node.place.id, node]));
  const storyPlaces = places.filter((place) => nodeByPlace.has(place.id));
  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <TopBar title={t(adventure.chapters[0]?.title ?? adventure.title)} onBack={onBack} />
      <View style={styles.mapFrame}>
        <SamuiMap
          places={storyPlaces}
          explored={explored}
          area={areaByKey('koh-sichang')}
          height={430}
          interactive
          highlightedPlaceIds={new Set(nodes.filter((node) => node.state === 'available').map((node) => node.place.id))}
          onSelect={(place) => {
            const node = nodeByPlace.get(place.id);
            if (node) onOpenNode(node); else onOpenPlace(place.id);
          }}
        />
      </View>
      <View style={styles.mapSummary}>
        <View style={{ flex: 1 }}>
          <Label size={10} tracking={0.1} colour="#078B9D">{t({ en: 'CHAPTER PROGRESS', th: 'ความคืบหน้าบท', zh: '章节进度' })}</Label>
          <Heading size={19} style={{ marginTop: 4 }}>{adventure.completedNodes}/{adventure.totalNodes} {t({ en: 'stops completed', th: 'จุดที่สำเร็จ', zh: '个地点已完成' })}</Heading>
        </View>
        <Text style={styles.percent}>{adventure.progressPercent}%</Text>
      </View>
      <Progress value={adventure.progressPercent} />
      <View style={styles.timeline}>
        {nodes.map((node, index) => (
          <Pressable key={node.id} accessibilityRole="button" onPress={() => onOpenNode(node)} style={styles.timelineRow}>
            <View style={[styles.timelineDot, node.state === 'completed' && styles.timelineDone, node.state === 'locked' && styles.timelineLocked]}>
              {node.state === 'completed' ? <Check size={17} color="#fff" /> : node.state === 'locked' ? <LockKeyhole size={15} color="#7892A1" /> : <Text style={styles.timelineNumber}>{index + 1}</Text>}
            </View>
            <View style={{ flex: 1 }}><Heading size={16}>{t(node.place.name)}</Heading><Body size={13} colour="#627B8B" style={{ marginTop: 3 }}>{t(node.title)}</Body></View>
            <ArrowRight size={19} color="#0A8CA6" />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function ClueDetail({ node, place, busy, onBack, onCheckIn, onVerifyActivity, onOpenPlace }: {
  node: AdventureNode;
  place: ScoredPlace | null;
  busy: boolean;
  onBack: () => void;
  onCheckIn: () => void;
  onVerifyActivity: () => void;
  onOpenPlace: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <TopBar title={t({ en: 'Location clue', th: 'เบาะแสสถานที่', zh: '地点线索' })} onBack={onBack} />
      {place ? <Hero place={place} inset={0} height={260} /> : node.place.photoUrl ? <Image source={{ uri: node.place.photoUrl }} resizeMode="cover" style={styles.detailPhoto} /> : null}
      <View style={styles.detailCard}>
        <View style={styles.placePill}><MapPinned size={15} color="#048CA5" /><Text style={styles.placePillText}>{t(node.place.name)}</Text></View>
        <Label size={10} tracking={0.1} colour="#A17600">{t({ en: 'STORY CLUE', th: 'เบาะแสเนื้อเรื่อง', zh: '故事线索' })}</Label>
        <Heading size={26} style={{ marginTop: 7 }}>{t(node.title)}</Heading>
        <Body size={14} colour="#38576B" style={{ marginTop: 12 }}>{t(node.story)}</Body>
        <View style={styles.instruction}><Sparkles size={21} color="#A97800" /><Body size={14} style={{ flex: 1 }}>{t(node.instruction)}</Body></View>
        <View style={styles.verifyGrid}>
          <Verify icon={MapPinned} label={t({ en: 'Verified GPS', th: 'GPS ตรวจสอบ', zh: 'GPS 验证' })} active={node.policy.requiresGps} />
          <Verify icon={QrCode} label={t({ en: 'QR', th: 'สแกน QR', zh: '二维码' })} active={node.policy.requiresQr} />
          <Verify icon={Camera} label={t({ en: 'Evidence', th: 'หลักฐาน', zh: '证据' })} active={node.policy.requiresEvidence || node.policy.requiresHost} />
        </View>
        {node.state === 'completed' ? (
          <View style={styles.completedBanner}><CheckCircle2 size={22} color="#137848" /><Text style={styles.completedText}>{t({ en: 'This clue is complete', th: 'เบาะแสนี้สำเร็จแล้ว', zh: '此线索已完成' })}</Text></View>
        ) : (
          <PrimaryButton
            label={busy
              ? t({ en: 'Checking location…', th: 'กำลังตรวจตำแหน่ง…', zh: '正在检查位置…' })
              : node.policy.requiresQr || node.policy.requiresEvidence || node.policy.requiresHost
                ? t({ en: 'Verify activity', th: 'ตรวจสอบกิจกรรม', zh: '验证活动' })
                : t({ en: 'Check in and unlock', th: 'เช็กอินและปลดล็อก', zh: '签到并解锁' })}
            icon={node.policy.requiresQr ? QrCode : Navigation}
            disabled={busy || node.state === 'locked'}
            onPress={node.policy.requiresQr || node.policy.requiresEvidence || node.policy.requiresHost ? onVerifyActivity : onCheckIn}
          />
        )}
        <Pressable accessibilityRole="button" onPress={onOpenPlace} style={styles.linkButton}><Text style={styles.linkText}>{t({ en: 'View full place information', th: 'ดูข้อมูลสถานที่ทั้งหมด', zh: '查看完整地点信息' })}</Text><ArrowRight size={17} color="#087C9B" /></Pressable>
      </View>
    </ScrollView>
  );
}

function RewardView({ node, result, onBack, onNext }: { node: AdventureNode; result: CheckinResult; onBack: () => void; onNext: () => void }) {
  return (
    <ScrollView contentContainerStyle={[styles.page, { alignItems: 'center' }]} showsVerticalScrollIndicator={false}>
      <TopBar title={t({ en: 'Story unlocked', th: 'ปลดล็อกเรื่องราว', zh: '故事已解锁' })} onBack={onBack} />
      <View style={styles.rewardHero}>
        <Sparkles size={52} color="#FFBE2E" />
        <Heading size={30} style={{ marginTop: 10, textAlign: 'center' }}>{t({ en: 'Story unlocked!', th: 'ปลดล็อกเรื่องราวแล้ว!', zh: '故事已解锁！' })}</Heading>
        <Body size={14} colour="#4D6678" style={{ marginTop: 8, textAlign: 'center' }}>{t(node.title)}</Body>
      </View>
      <View style={styles.rewardCard}>
        <Label size={10} tracking={0.1} colour="#9B7100">{t({ en: 'SERVER-CONFIRMED RESULT', th: 'ผลที่ยืนยันโดยเซิร์ฟเวอร์', zh: '服务器确认结果' })}</Label>
        <View style={styles.rewardRow}>
          <RewardStat value={`+${result.pointsAwarded}`} label={t({ en: 'Trip Points', th: 'แต้มทริป', zh: '旅行积分' })} />
          <RewardStat value={`+${result.expAwarded}`} label="EXP" />
          <RewardStat value={`${result.travel.petMemories.length}`} label={t({ en: 'Pet memories', th: 'ความทรงจำ Pet', zh: '宠物记忆' })} />
        </View>
        {result.travel.petMemories.length > 0 ? (
          <View style={styles.memoryConfirmed}>
            <PawPrint size={21} color="#087C9B" />
            <Body size={13} style={{ flex: 1 }}>{t({ en: 'A verified travel memory was added to your companion.', th: 'เพิ่มความทรงจำจากการเดินทางที่ตรวจสอบแล้วให้เพื่อนร่วมทางของคุณ', zh: '已为你的旅行伙伴添加一条经过验证的旅行记忆。' })}</Body>
          </View>
        ) : null}
        {!result.awarded ? <Body size={13} colour="#657D8B" style={{ textAlign: 'center', marginTop: 10 }}>{t({ en: 'This place was already rewarded today; the story state is still refreshed from the server.', th: 'วันนี้เคยได้รับรางวัลจากสถานที่นี้แล้ว ระบบได้รีเฟรชสถานะเนื้อเรื่องจากเซิร์ฟเวอร์', zh: '今天此地点已领取过奖励；故事状态仍已从服务器刷新。' })}</Body> : null}
      </View>
      <PrimaryButton label={t({ en: 'Continue the journey', th: 'ไปจุดถัดไป', zh: '继续旅程' })} icon={ArrowRight} onPress={onNext} />
    </ScrollView>
  );
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return <View style={styles.topBar}><Pressable accessibilityRole="button" accessibilityLabel={t({ en: 'Back', th: 'ย้อนกลับ', zh: '返回' })} onPress={onBack} style={styles.back}><ArrowLeft size={23} color="#06395B" /></Pressable><Heading size={22} style={{ flex: 1 }}>{title}</Heading></View>;
}
function SectionTitle({ title, meta }: { title: string; meta: string }) { return <View style={styles.sectionTitle}><Heading size={21} style={{ flex: 1 }}>{title}</Heading><Text style={styles.sectionMeta}>{meta}</Text></View>; }
function Progress({ value }: { value: number }) { return <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, value))}%` }]} /></View>; }
function Mode({ icon: Icon, label, active = false, onPress }: { icon: typeof BookOpen; label: string; active?: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.mode, active && styles.modeActive, pressed && { opacity: 0.8 }]}><Icon size={24} color={active ? '#FFFFFF' : '#087C9B'} /><Text style={[styles.modeText, active && { color: '#FFFFFF' }]}>{label}</Text></Pressable>; }
function NodeChip({ node, index, onPress }: { node: AdventureNode; index: number; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.nodeChip, node.state === 'completed' && styles.nodeChipDone]}>{node.state === 'completed' ? <Check size={17} color="#fff" /> : node.state === 'locked' ? <LockKeyhole size={15} color="#718998" /> : <Text style={styles.nodeChipNumber}>{index}</Text>}</Pressable>; }
function Verify({ icon: Icon, label, active }: { icon: typeof MapPinned; label: string; active: boolean }) { return <View style={[styles.verify, active && styles.verifyActive]}><Icon size={22} color={active ? '#078B9D' : '#91A6B1'} /><Text style={[styles.verifyText, !active && { color: '#8296A2' }]}>{label}</Text>{!active ? <Text style={styles.unavailable}>{t({ en: 'Not required', th: 'ไม่ใช้', zh: '不需要' })}</Text> : null}</View>; }
function PrimaryButton({ label, icon: Icon, onPress, disabled = false }: { label: string; icon: typeof ArrowRight; onPress: () => void; disabled?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primary, (pressed || disabled) && { opacity: disabled ? 0.5 : 0.82 }]}><Icon size={20} color="#fff" /><Text style={styles.primaryText}>{label}</Text></Pressable>; }
function RewardStat({ value, label }: { value: string; label: string }) { return <View style={styles.rewardStat}><Text style={styles.rewardValue}>{value}</Text><Text style={styles.rewardLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EFFBFE' },
  page: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: gutter, paddingTop: 14, paddingBottom: 44 },
  topBar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBEAF2', alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  hero: { minHeight: 330, borderRadius: 28, overflow: 'hidden', justifyContent: 'flex-end', ...shadow.card },
  heroWide: { minHeight: 400 },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,50,80,.48)' },
  heroCopy: { padding: 24, maxWidth: 720 },
  heroButton: { alignSelf: 'flex-start', marginTop: 18, minHeight: 48, borderRadius: 24, paddingHorizontal: 18, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 9 },
  heroButtonText: { color: '#06395B', fontWeight: '800', fontSize: 15 },
  modeRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  mode: { flex: 1, minHeight: 80, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#D4ECF3', alignItems: 'center', justifyContent: 'center', gap: 7, ...shadow.sm },
  modeActive: { backgroundColor: '#08A7B5', borderColor: '#08A7B5' },
  modeText: { fontSize: 13, color: '#163C5A', fontWeight: '800', textAlign: 'center' },
  journalLink: { marginTop: 12, minHeight: 68, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 19, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CDE9F1', flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.sm },
  journalLinkTitle: { color: '#123E5A', fontSize: 15, fontWeight: '800' },
  journalLinkText: { color: '#667F8E', fontSize: 12, marginTop: 2 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 10 },
  sectionMeta: { color: '#087C9B', fontSize: 14, fontWeight: '800' },
  progressTrack: { height: 10, borderRadius: 99, backgroundColor: '#D9ECF2', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 99, backgroundColor: '#11B995' },
  currentCard: { marginTop: 14, minHeight: 132, padding: 12, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CAE7EF', flexDirection: 'row', alignItems: 'center', gap: 14, ...shadow.card },
  currentPhoto: { width: 112, height: 104, borderRadius: 16 },
  currentPhotoFallback: { width: 112, height: 104, borderRadius: 16, backgroundColor: '#E0F8FA', alignItems: 'center', justifyContent: 'center' },
  nodePreviewRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 18 },
  nodeChip: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#8FD8E5', alignItems: 'center', justifyContent: 'center' },
  nodeChipDone: { backgroundColor: '#13AE7D', borderColor: '#13AE7D' },
  nodeChipNumber: { color: '#075B76', fontWeight: '900' },
  mapFrame: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#BFE6EF', backgroundColor: '#CDEFF5', ...shadow.card },
  mapSummary: { marginTop: 16, padding: 16, borderRadius: 20, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D5ECF2' },
  percent: { color: '#0C8CA5', fontSize: 25, fontWeight: '900' },
  timeline: { marginTop: 16, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D5ECF2', overflow: 'hidden' },
  timelineRow: { minHeight: 78, paddingHorizontal: 15, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDECF0' },
  timelineDot: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFF1BD', alignItems: 'center', justifyContent: 'center' },
  timelineDone: { backgroundColor: '#12AC7B' },
  timelineLocked: { backgroundColor: '#E8EFF2' },
  timelineNumber: { fontWeight: '900', color: '#826000' },
  detailPhoto: { width: '100%', height: 260, borderRadius: 24 },
  detailCard: { marginTop: 14, padding: 20, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CDE9F1', ...shadow.card },
  placePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 99, backgroundColor: '#E5F9FB', marginBottom: 16 },
  placePillText: { color: '#075B76', fontSize: 12, fontWeight: '800' },
  instruction: { marginTop: 18, padding: 15, borderRadius: 18, backgroundColor: '#FFF8DE', flexDirection: 'row', alignItems: 'center', gap: 12 },
  verifyGrid: { flexDirection: 'row', gap: 8, marginTop: 18 },
  verify: { flex: 1, minHeight: 94, padding: 9, borderRadius: 16, borderWidth: 1, borderColor: '#D8E7EB', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#F7FAFB' },
  verifyActive: { backgroundColor: '#E7FAFB', borderColor: '#66CFDA' },
  verifyText: { color: '#17425A', fontSize: 11, fontWeight: '800', textAlign: 'center' },
  unavailable: { color: '#8A9CA6', fontSize: 9 },
  completedBanner: { marginTop: 18, minHeight: 54, borderRadius: 27, backgroundColor: '#E1F8EC', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  completedText: { color: '#137848', fontSize: 15, fontWeight: '900' },
  primary: { width: '100%', maxWidth: 540, minHeight: 54, marginTop: 18, borderRadius: 27, backgroundColor: '#08A7B5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, ...shadow.sm },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  linkButton: { minHeight: 48, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  linkText: { color: '#087C9B', fontSize: 13, fontWeight: '800' },
  rewardHero: { width: '100%', paddingVertical: 34, paddingHorizontal: 18, borderRadius: 28, backgroundColor: '#FFF5C9', alignItems: 'center', borderWidth: 1, borderColor: '#F4D96B' },
  rewardCard: { width: '100%', marginTop: 14, padding: 18, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8D7A2', ...shadow.card },
  rewardRow: { flexDirection: 'row', gap: 9, marginTop: 14 },
  memoryConfirmed: { marginTop: 14, padding: 13, borderRadius: 16, backgroundColor: '#E7FAFB', flexDirection: 'row', alignItems: 'center', gap: 10 },
  rewardStat: { flex: 1, minHeight: 92, padding: 10, borderRadius: 16, backgroundColor: '#FFF9E8', alignItems: 'center', justifyContent: 'center' },
  rewardValue: { color: '#14395A', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  rewardLabel: { color: '#6C7781', fontSize: 11, fontWeight: '700', marginTop: 4, textAlign: 'center' },
});
