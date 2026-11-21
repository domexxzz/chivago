/**
 * Who you are travelling with.
 *
 * The first question anybody asks about a group in a points app is "do we all
 * get the points", and the answer is no — everyone earns their own from work a
 * host verified for them. That is not a limitation to bury; it is the reason
 * the points are worth having, so it sits on the screen in a panel of its own
 * rather than in a help page.
 *
 * What a party actually adds is the one number that IS more than the sum of
 * its parts: provinces reached BETWEEN you, counted once each. Four people who
 * each went somewhere different have covered four; two who went together have
 * covered one. That is the only figure here that rewards splitting up, and it
 * is the honest reason to travel as a group in this app.
 *
 * Solo is a first-class state, not an empty one. It is what everybody starts
 * as, so it gets a real screen with two doors rather than a shrug.
 */

import React from 'react';
import { Image, Linking, Pressable, ScrollView, Share, TextInput, View, type ImageSourcePropType } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { Camera, Check, ChevronRight, Share2, Users } from 'lucide-react-native';
import { MAX_PARTY_SIZE, PARTY_KIND_LABEL, nextTogether, type Bilingual, type PartyQuestInstance, type PartyQuestProgressSummary, type PartySummary, type PartyTripSummary } from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, onFill, radius, shadow } from '../theme/index.ts';
import { gameHabitat, gameRadius, gameShadow } from '@chivago/tokens';
import { Body, Heading, Label } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { OceanBackdrop, PushHeader, TravelHeroBackdrop } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';
import { useRequireAccount } from '../components/GuestActionGate.tsx';
import { PartyLivePanel, TripSummaryCard } from '../components/party/PartyLivePanel.tsx';
import { PartyQuestStatusCard } from '../components/party/PartyHub.tsx';
import { stopPartyBackgroundLocation } from '../location/party-background.ts';
import travelPartyIcon from '../../assets/party/01-travel-map-pin.png';
import questPartyIcon from '../../assets/party/03-quest-scroll.png';
import qrJoinIcon from '../../assets/party/12-qr-join-illustration.png';

/** Provinces open today. Two, and the passport says so on its own screen. */
const OPEN_PROVINCES = 2;

export function PartyScreen({
  onBack, onToast, onFind, initialInviteCode, onInviteCodeConsumed,
}: {
  onBack: () => void;
  onToast: (msg: string) => void;
  onFind: () => void;
  initialInviteCode?: string;
  onInviteCodeConsumed?: () => void;
}) {
  const party = useAsync(() => api.party(), []);
  const data = party.data;
  const currentQuest = useAsync<{ partyQuest: PartyQuestInstance | null; progress: PartyQuestProgressSummary | null }>(
    async () => {
      if (!data?.party) return { ok: true, data: { partyQuest: null, progress: null } };
      const current = await api.currentPartyQuest();
      if (!current.ok) return current;
      if (!current.data.partyQuest) return { ok: true, data: { partyQuest: null, progress: null } };
      const progress = await api.partyQuestProgress(current.data.partyQuest.id);
      return { ok: true, data: { partyQuest: current.data.partyQuest, progress: progress.ok ? progress.data.progress : null } };
    },
    [data?.party?.id],
  );
  const [tripSummary, setTripSummary] = React.useState<PartyTripSummary | null>(null);
  const [incomingCode, setIncomingCode] = React.useState('');
  React.useEffect(() => {
    if (!initialInviteCode) return;
    setIncomingCode(initialInviteCode);
    onInviteCodeConsumed?.();
  }, [initialInviteCode, onInviteCodeConsumed]);
  React.useEffect(() => {
    const accept = (url: string | null) => { if (!url) return; const match = /[?&]code=([^&#]+)/i.exec(url); if (match?.[1]) setIncomingCode(decodeURIComponent(match[1])); };
    void Linking.getInitialURL().then(accept);
    const subscription = Linking.addEventListener('url', ({ url }) => accept(url));
    return () => subscription.remove();
  }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      <PushHeader context={t({ en: 'Travelling with', th: 'ไปกับใคร', zh: '与谁同行' })} onBack={onBack} />

      {party.error ? <ErrorState message={party.error} onRetry={party.reload} /> : null}
      {party.loading && !data ? <LoadingState /> : null}

      {data ? (
        data.party === null
          ? (
            <>
              <Alone onChanged={party.reload} onToast={onToast} initialCode={incomingCode} />
              <FindDoor onFind={onFind} />
            </>
          )
          : (
            <>
              <Together
                name={data.party.name}
                summary={data.summary}
                partyQuest={currentQuest.data?.partyQuest ?? null}
                partyQuestProgress={currentQuest.data?.progress ?? null}
                owner={data.party.createdBy === data.summary.members.find((member) => member.you)?.userId}
                onQuestChanged={currentQuest.reload}
                onToast={onToast}
              />
              <Members
                summary={data.summary}
                owner={data.party.createdBy === data.summary.members.find((member) => member.you)?.userId}
                onChanged={party.reload}
                onToast={onToast}
              />
              <InviteTools owner={data.party.createdBy === data.summary.members.find((member) => member.you)?.userId} onToast={onToast} />
              <PartyLivePanel owner={data.party.createdBy === data.summary.members.find((member) => member.you)?.userId} onToast={onToast} onFinished={(summary) => { setTripSummary(summary); party.reload(); }} />
              <Requests onToast={onToast} onChanged={party.reload} />
              <FindDoor onFind={onFind} />
              <DoesNot items={data.doesNot} />
              <Leave
                owner={data.party.createdBy === data.summary.members.find((member) => member.you)?.userId}
                onChanged={party.reload}
                onToast={onToast}
              />
            </>
          )
      ) : null}

      {tripSummary ? <TripSummaryCard summary={tripSummary} /> : null}

      <View style={{ height: 8 }} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Solo
// ---------------------------------------------------------------------------

function Alone({
  onChanged, onToast, initialCode,
}: { onChanged: () => void; onToast: (msg: string) => void; initialCode?: string }) {
  const requireAccount = useRequireAccount();
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [made, setMade] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [photo, setPhoto] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  React.useEffect(() => { if (initialCode) setCode(initialCode); }, [initialCode]);

  const start = async () => {
    if (requireAccount({ en: 'Please sign in or create an account to create a party.', th: 'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่อสร้างปาร์ตี้', zh: '请先登录或注册账号，再创建队伍。' })) return;
    if (busy) return;
    setBusy(true);
    const res = await api.createParty(name.trim() || t({ en: 'Our trip', th: 'ทริปของเรา', zh: '我们的旅行' }));
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    // The code stays on screen rather than bouncing straight to the group:
    // the traveller started this to give somebody a code, and navigating away
    // from it is taking away the thing they came for.
    if (photo) {
      const uploaded = await api.uploadPartyPhoto(photo.uri, photo.mimeType ?? 'image/jpeg');
      if (!uploaded.ok) onToast(uploaded.error);
    }
    setMade(res.data.code);
    onChanged();
  };

  const join = async () => {
    if (requireAccount({ en: 'Please sign in or create an account to join a party.', th: 'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่อเข้าร่วมปาร์ตี้', zh: '请先登录或注册账号，再加入队伍。' })) return;
    if (busy || code.trim().length === 0) return;
    setBusy(true);
    const res = await api.joinParty(code.trim());
    setBusy(false);
    // The server writes four different sentences for four different problems;
    // passing its own words through is more use than "could not join".
    if (!res.ok) { onToast(res.error); return; }
    setCode('');
    onToast(t({
      en: `You are travelling with ${res.data.party.name}.`,
      th: `คุณเดินทางร่วมกับ ${res.data.party.name} แล้ว`,
      zh: `你正在与 ${res.data.party.name} 同行。`,
    }));
    onChanged();
  };

  return (
    <>
      <View
        style={[shadow.card, {
          margin: gutter, padding: 20, borderRadius: 22, backgroundColor: color.paper,
          overflow: 'hidden',
        }]}
      >
        <TravelHeroBackdrop compact focalPoint="right" />
        <Label size={10} tracking={0.16} colour={color.brandSoft}>
          {t(PARTY_KIND_LABEL.solo).toUpperCase()}
        </Label>
        <Heading size={26} colour={color.surface} tracking={-0.5} style={{ marginTop: 8 }}>
          {t({ en: 'Create or join a travel party', th: 'สร้างหรือเข้าร่วมปาร์ตี้เดินทาง', zh: '创建或加入旅行队伍' })}
        </Heading>
        <Body size={13} colour="#E3F8FF" style={{ marginTop: 7 }}>{t({ en: 'You are travelling on your own. Share a live map, chat and plan real places together.', th: 'ตอนนี้คุณเดินทางคนเดียว ชวนเพื่อนมาแชร์แผนที่สด แชท และวางแผนสถานที่จริงด้วยกันได้', zh: '你正在独自旅行。邀请朋友共享实时地图、聊天并一起规划真实地点。' })}</Body>
      </View>

      <View style={[shadow.card, { marginHorizontal: gutter, padding: 17, borderRadius: 20, backgroundColor: color.surface, borderWidth: 1, borderColor: '#DCEFF5' }]}>
        <Label size={10} tracking={0.14} colour={color.brand}>{t({ en: 'CREATE PARTY', th: 'สร้างปาร์ตี้', zh: '创建队伍' })}</Label>
        <View style={{ flexDirection: 'row', gap: 9, marginTop: 12 }}>
          <PartyTypeChoice source={travelPartyIcon} title={t({ en: 'Travel Party', th: 'ปาร์ตี้เดินทาง', zh: '旅行队伍' })} detail={t({ en: 'Live location and planning', th: 'แชร์ตำแหน่งและวางแผน', zh: '实时位置与规划' })} selected />
          <PartyTypeChoice source={questPartyIcon} title={t({ en: 'Quest Party', th: 'ปาร์ตี้ทำเควส', zh: '任务队伍' })} detail={t({ en: 'Task progress is not live yet', th: 'ความคืบหน้ายังไม่เปิดใช้', zh: '任务进度尚未开放' })} />
        </View>
        <View style={{ marginTop: 11, padding: 11, borderRadius: 14, backgroundColor: '#F2F9FC', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1 }}><Label size={9} colour={color.neutral600}>{t({ en: 'MEMBER CAPACITY', th: 'จำนวนสมาชิกสูงสุด', zh: '成员上限' })}</Label><Body size={13} colour={color.neutral700} style={{ marginTop: 2 }}>{t({ en: 'Fixed by the Party service', th: 'กำหนดโดยระบบปาร์ตี้', zh: '由队伍服务固定' })}</Body></View>
          <View style={{ minWidth: 62, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center' }}><Heading size={18} colour={color.brand}>{MAX_PARTY_SIZE}</Heading><Label size={9} colour={color.neutral600}>{t({ en: 'PEOPLE', th: 'คน', zh: '人' })}</Label></View>
        </View>
        <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>{t({ en: 'A group does not share points—everyone keeps their own rewards. It adds the count of provinces you have reached between you, never a shared wallet.', th: 'กลุ่มไม่แชร์แต้ม ทุกคนเก็บรางวัลของตัวเอง สิ่งที่เพิ่มคือจำนวนจังหวัดที่ไปถึงรวมกัน ไม่ใช่วอลเล็ตส่วนกลาง', zh: '队伍不共享积分；每个人保留自己的奖励。队伍增加的是共同到达过的府数，而不是共享钱包。' })}</Body>

        {made === null ? (
          <>
            <Label size={9} colour={color.neutral700} style={{ marginTop: 14 }}>{t({ en: 'PARTY NAME', th: 'ชื่อปาร์ตี้', zh: '队伍名称' })}</Label>
            <TextInput value={name} onChangeText={setName} maxLength={80} accessibilityLabel="Party name" placeholder={t({ en: 'For example: Sichang weekend', th: 'เช่น เที่ยวสีชังด้วยกัน', zh: '例如：锡昌周末游' })} style={{ marginTop: 6, minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: '#BFDCE7', borderRadius: 14, backgroundColor: '#F7FBFC' }} />
            <Pressable onPress={async () => { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return; const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 }); if (!result.canceled) setPhoto(result.assets[0] ?? null); }} style={{ marginTop: 10, minHeight: 74, borderWidth: 1, borderStyle: 'dashed', borderColor: color.brand, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 110 }} resizeMode="cover" /> : <><Camera size={22} color={color.brand} /><Label size={10} colour={color.brand} style={{ marginTop: 5 }}>{t({ en: 'ADD PARTY PICTURE', th: 'เพิ่มรูปปาร์ตี้', zh: '添加队伍图片' })}</Label></>}</Pressable>
            <Button label={busy ? 'Starting…' : 'Start a group'} thai="สร้างกลุ่ม" onPress={start} disabled={busy} height={48} style={{ marginTop: 14 }} />
          </>
        ) : (
          <InviteCode code={made} />
        )}
      </View>

      <View style={[shadow.card, { marginHorizontal: gutter, marginTop: 12, padding: 17, borderRadius: 20, backgroundColor: color.surface, borderWidth: 1, borderColor: '#DCEFF5' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Image source={qrJoinIcon} resizeMode="contain" style={{ width: 52, height: 52 }} /><View style={{ flex: 1 }}><Label size={10} tracking={0.14} colour={color.brand}>{t({ en: 'JOIN WITH A CODE', th: 'เข้าร่วมด้วยรหัส', zh: '使用代码加入' })}</Label><Body size={13} colour={color.neutral700} style={{ marginTop: 4 }}>{t({ en: 'Have a code? Enter it here, or open a Party QR deep link.', th: 'มีรหัสอยู่แล้ว? กรอกได้ที่นี่ หรือเปิดลิงก์จาก QR ของปาร์ตี้', zh: '已有代码？请在此输入，或打开队伍二维码深层链接。' })}</Body></View></View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 11 }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            onSubmitEditing={join}
            returnKeyType="go"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            placeholder="K7M2QP"
            placeholderTextColor={color.neutral500}
            accessibilityLabel={t({ en: 'Group code', th: 'รหัสกลุ่ม', zh: '队伍代码' })}
            style={{
              // minWidth 0 lets the field yield width to a longer button label
              // (Thai's "เข้าร่วม" against English's "Join"); without it flex:1
              // holds its content width and the button overflows the row.
              flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 14,
              borderWidth: 1, borderColor: '#BFDCE7', borderRadius: 14, backgroundColor: '#F7FBFC',
              color: color.text, fontSize: 18, letterSpacing: 3,
            }}
          />
          <Pressable
            onPress={join}
            disabled={busy || code.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel={t({ en: 'Join that group', th: 'เข้าร่วมกลุ่มนั้น', zh: '加入该队伍' })}
            style={{
              minWidth: 76, minHeight: 48, flexShrink: 0, paddingHorizontal: 12,
              alignItems: 'center', justifyContent: 'center',
              borderRadius: 14,
              backgroundColor: code.trim().length === 0 ? color.neutral300 : color.cta,
            }}
          >
            <Heading size={14} colour={code.trim().length === 0 ? color.neutral600 : onFill.cta}>
              {t({ en: 'Join', th: 'เข้าร่วม', zh: '加入' })}
            </Heading>
          </Pressable>
        </View>
      </View>
    </>
  );
}

function PartyTypeChoice({ source, title, detail, selected = false }: { source: ImageSourcePropType; title: string; detail: string; selected?: boolean }) {
  return (
    <View
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !selected }}
      style={{
        flex: 1, minHeight: 126, padding: 11, borderRadius: 18,
        borderWidth: selected ? 2 : 1, borderColor: selected ? color.brand : '#D8D2F2',
        backgroundColor: selected ? '#E6F7FE' : '#F4F0FC', alignItems: 'center', opacity: selected ? 1 : 0.76,
      }}
    >
      <View style={{ width: 58, height: 58, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><Image source={source} resizeMode="contain" style={{ width: 53, height: 53 }} /></View>
      <Heading size={14} style={{ marginTop: 7, textAlign: 'center' }}>{title}</Heading>
      <Body size={13} colour={color.neutral600} style={{ marginTop: 2, textAlign: 'center' }}>{detail}</Body>
      {selected ? <View style={{ position: 'absolute', top: 8, right: 8, width: 19, height: 19, borderRadius: 10, backgroundColor: color.brand, alignItems: 'center', justifyContent: 'center' }}><Check size={12} color="#FFFFFF" strokeWidth={3} /></View> : null}
    </View>
  );
}

function InviteCode({ code }: { code: string }) {
  const link = `chivago://party/join?code=${encodeURIComponent(code)}`;
  return <View style={{ marginTop: 16, paddingVertical: 18, alignItems: 'center', borderWidth: layout.ruleStrong, borderColor: color.brand, borderRadius: radius.md, backgroundColor: color.surface }}>
    <Label size={10} tracking={0.12} colour={color.neutral600}>{t({ en: 'SCAN OR ENTER THIS CODE', th: 'สแกนหรือกรอกรหัสนี้', zh: '扫描或输入此代码' })}</Label>
    <View style={{ marginTop: 12, padding: 10, backgroundColor: '#fff', borderRadius: 12 }}><QRCode value={link} size={150} color={color.brandDeep} /></View>
    <Heading size={30} colour={color.brandDeep} tracking={5} style={{ marginTop: 10 }}>{code}</Heading>
    <Body size={13} colour={color.neutral700} style={{ marginTop: 4 }}>{t({ en: 'Share this code or QR with your travel companions.', th: 'แชร์รหัสนี้หรือ QR ให้เพื่อนร่วมเดินทาง', zh: '把此代码或二维码分享给同行伙伴。' })}</Body>
    <Pressable onPress={() => void Share.share({ message: `${t({ en: 'Join my ChivarGo party', th: 'เข้าร่วมปาร์ตี้ ChivarGo ของฉัน', zh: '加入我的 ChivarGo 队伍' })}: ${link}\n${code}` })} style={{ flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 8, padding: 10 }}><Share2 size={18} color={color.brand} /><Label size={11} colour={color.brand}>{t({ en: 'SHARE INVITE LINK', th: 'แชร์ลิงก์เชิญ', zh: '分享邀请链接' })}</Label></Pressable>
  </View>;
}

function InviteTools({ owner, onToast }: { owner: boolean; onToast: (message: string) => void }) {
  const [code, setCode] = React.useState<string | null>(null);
  if (!owner) return null;
  return <View style={{ marginHorizontal: gutter, marginTop: 10 }}>{code ? <InviteCode code={code} /> : <Button label="Show QR and invite link" thai="แสดง QR และลิงก์เชิญ" chinese="显示二维码和邀请链接" variant="secondary" height={44} onPress={async () => { const result = await api.rotatePartyCode(); if (!result.ok) onToast(result.error); else setCode(result.data.code); }} />}</View>;
}

// ---------------------------------------------------------------------------
// Together
// ---------------------------------------------------------------------------

function Together({
  name, summary, partyQuest, partyQuestProgress, owner, onQuestChanged, onToast,
}: {
  name: string;
  summary: PartySummary;
  partyQuest: PartyQuestInstance | null;
  partyQuestProgress: PartyQuestProgressSummary | null;
  owner: boolean;
  onQuestChanged: () => void;
  onToast: (message: string) => void;
}) {
  const next = nextTogether(summary, OPEN_PROVINCES);

  return (
    <View
      style={[shadow.card, {
        margin: gutter, padding: 20, borderRadius: radius.md, backgroundColor: color.paper,
        overflow: 'hidden',
      }]}
    >
      <TravelHeroBackdrop compact focalPoint="right" />
      <Label size={10} tracking={0.16} colour={color.brandSoft}>
        {`${t(PARTY_KIND_LABEL[summary.kind]).toUpperCase()} · ${summary.size}`}
      </Label>
      <Heading size={26} colour={color.surface} tracking={-0.5} style={{ marginTop: 8 }}>
        {name}
      </Heading>

      {/*
        Provinces first, and biggest. It is the only figure on this screen that
        is genuinely more than the sum of its parts — the others are additions
        anybody could do in their head, and leading with a total would suggest
        the group has a shared pot, which is the one thing it does not have.
      */}
      <View style={{ flexDirection: 'row', gap: 22, marginTop: 18 }}>
        <Figure value={summary.provincesTogether} en="Provinces between you" th="จังหวัดรวมกัน" zh="你们共同走过的府" lead />
        <Figure value={summary.missionsVerified} en="Missions verified" th="ภารกิจที่ผ่านการตรวจ" zh="已验证的任务" />
      </View>

      {next ? (
        <>
          <Body size={13} colour={color.brandSoft} style={{ marginTop: 16 }}>{t(next)}</Body>
        </>
      ) : null}
      {partyQuest ? <PartyQuestStatusCard quest={partyQuest} progress={partyQuestProgress} /> : null}
      {partyQuest && partyQuestProgress ? (
        <PartyQuestActions
          quest={partyQuest}
          progress={partyQuestProgress}
          owner={owner}
          onChanged={onQuestChanged}
          onToast={onToast}
        />
      ) : null}
    </View>
  );
}

function PartyQuestActions({
  quest, progress, owner, onChanged, onToast,
}: {
  quest: PartyQuestInstance;
  progress: PartyQuestProgressSummary;
  owner: boolean;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const [assignments, setAssignments] = React.useState<Record<string, string>>(() => Object.fromEntries(
    progress.participants.map((participant) => [participant.userId, participant.assignment ?? '']),
  ));
  const [saving, setSaving] = React.useState<string | null>(null);
  const [completing, setCompleting] = React.useState(false);
  React.useEffect(() => {
    setAssignments(Object.fromEntries(progress.participants.map((participant) => [participant.userId, participant.assignment ?? ''])));
  }, [progress.partyQuestId, progress.participants]);

  const saveAssignment = async (memberId: string) => {
    const assignment = assignments[memberId]?.trim() ?? '';
    if (!assignment) {
      onToast(t({ en: 'Describe the member’s responsibility first.', th: 'ระบุหน้าที่ของสมาชิกก่อน', zh: '请先填写成员职责。' }));
      return;
    }
    setSaving(memberId);
    const result = await api.assignPartyQuestMember(quest.id, memberId, assignment);
    setSaving(null);
    if (!result.ok) onToast(result.error);
    else {
      onToast(t({ en: 'Assignment saved.', th: 'บันทึกหน้าที่แล้ว', zh: '分工已保存。' }));
      onChanged();
    }
  };

  const complete = async () => {
    setCompleting(true);
    const result = await api.completePartyQuest(quest.id);
    setCompleting(false);
    if (!result.ok) onToast(result.error);
    else {
      onToast(t({ en: 'Team completion verified and rewards recorded.', th: 'ตรวจสอบทีมสำเร็จและบันทึกรางวัลแล้ว', zh: '团队完成已验证，奖励已记录。' }));
      onChanged();
    }
  };

  return (
    <View style={{ marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF' }}>
      {owner && quest.questMode === 'cooperative' && quest.state === 'in_progress' ? (
        <View>
          <Label size={9} colour={color.brand}>{t({ en: 'MEMBER ASSIGNMENTS', th: 'หน้าที่ของสมาชิก', zh: '成员分工' })}</Label>
          {progress.participants.map((participant) => (
            <View key={participant.userId} style={{ marginTop: 9 }}>
              <Body size={13} colour={color.neutral700}>{participant.displayName}</Body>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
                <TextInput
                  value={assignments[participant.userId] ?? ''}
                  onChangeText={(value) => setAssignments((current) => ({ ...current, [participant.userId]: value }))}
                  maxLength={120}
                  placeholder={t({ en: 'Assign a different task', th: 'มอบหมายหน้าที่', zh: '分配任务' })}
                  style={{ flex: 1, minHeight: 42, paddingHorizontal: 11, borderWidth: 1, borderColor: '#CFE7F0', borderRadius: 12, color: color.text, backgroundColor: '#F8FCFD' }}
                />
                <Button
                  label={saving === participant.userId ? t({ en: 'Saving…', th: 'กำลังบันทึก…', zh: '保存中…' }) : t({ en: 'Save', th: 'บันทึก', zh: '保存' })}
                  onPress={() => void saveAssignment(participant.userId)}
                  disabled={saving !== null}
                  height={42}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {quest.state === 'in_progress' ? (
        <View style={{ marginTop: owner && quest.questMode === 'cooperative' ? 12 : 0 }}>
          <Button
            label={completing
              ? t({ en: 'Verifying…', th: 'กำลังตรวจสอบ…', zh: '验证中…' })
              : t({ en: 'Verify team completion', th: 'ตรวจสอบการสำเร็จของทีม', zh: '验证团队完成' })}
            onPress={() => void complete()}
            disabled={!progress.completionReady || completing}
            height={44}
          />
          {!progress.completionReady ? <Body size={13} colour={color.neutral600} style={{ marginTop: 6, textAlign: 'center' }}>{t({ en: 'The server will enable completion after every rule is satisfied.', th: 'เซิร์ฟเวอร์จะเปิดให้จบเมื่อผ่านเงื่อนไขครบ', zh: '满足全部服务器规则后即可完成。' })}</Body> : null}
        </View>
      ) : null}
    </View>
  );
}

function Figure({
  value, en, th, zh, lead = false,
}: { value: number; en: string; th: string; zh?: string; lead?: boolean }) {
  return (
    <View>
      <Heading size={lead ? 40 : 26} colour={color.surface} tracking={-0.8}>{value}</Heading>
      <Label size={9} tracking={0.08} colour={color.brandSoft} style={{ marginTop: 2 }}>{t({ en, th, zh })}</Label>
    </View>
  );
}

/** A ground for each member's initial, in turn, from the habitat tiles. */
const AVATAR_TONES = Object.values(gameHabitat);

function Members({
  summary, owner, onChanged, onToast,
}: { summary: PartySummary; owner: boolean; onChanged: () => void; onToast: (message: string) => void }) {
  const [transferring, setTransferring] = React.useState<string | null>(null);
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 8 }}>
      <Label size={10} tracking={0.14}>{t({ en: 'Who is here', th: 'ใครอยู่ในกลุ่ม', zh: '谁在队伍里' })}</Label>

      {summary.members.map((m, i) => (
        <View
          key={m.userId}
          style={[gameShadow.lift, {
            flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginTop: 10,
            borderRadius: gameRadius.panel, backgroundColor: color.surface,
            borderWidth: m.you ? 2 : 0, borderColor: color.gold,
          }]}
        >
          <View
            style={{
              width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
              backgroundColor: AVATAR_TONES[i % AVATAR_TONES.length]!.fill,
            }}
          >
            <Heading size={17} colour={AVATAR_TONES[i % AVATAR_TONES.length]!.ink}>
              {m.displayName.trim().slice(0, 1).toUpperCase() || '?'}
            </Heading>
          </View>
          <View style={{ flex: 1 }}>
            <Heading size={15}>{m.displayName}</Heading>
            <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 3, textTransform: 'none' }}>
              {`${m.provinces.length} province${m.provinces.length === 1 ? '' : 's'}`}
            </Label>
          </View>

          {m.you ? <Label size={9} tracking={0.1} colour={color.brand}>{t({ en: 'You', th: 'คุณ', zh: '你' })}</Label> : null}

          {/*
            What they EARNED, never what they hold. Earned is an achievement and
            already public on the host standing; a balance would also reveal
            what somebody has spent, and joining a trip is not consent to show
            your friends your wallet.
          */}
          <View style={{ alignItems: 'flex-end', minWidth: 66 }}>
            <Heading size={15} colour={m.greenEarned > 0 ? color.accent700 : color.neutral500}>
              {m.missionsVerified}
            </Heading>
            <Label size={9} tracking={0.06} colour={color.neutral600}>{t({ en: 'Verified', th: 'ยืนยันแล้ว', zh: '已验证' })}</Label>
          </View>
          {owner && !m.you ? (
            <Pressable
              accessibilityRole="button"
              disabled={transferring !== null}
              onPress={async () => {
                setTransferring(m.userId);
                const result = await api.transferPartyOwnership(m.userId);
                setTransferring(null);
                if (!result.ok) { onToast(result.error); return; }
                onToast(t({
                  en: `${m.displayName} is now the Party Owner.`,
                  th: `${m.displayName} เป็นเจ้าของปาร์ตี้แล้ว`,
                  zh: `${m.displayName} 现在是队伍所有者。`,
                }));
                onChanged();
              }}
              style={{ paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: color.brandSoft }}
            >
              <Label size={9} colour={color.brandDeep}>
                {transferring === m.userId
                  ? t({ en: 'TRANSFERRING…', th: 'กำลังโอน…', zh: '转移中…' })
                  : t({ en: 'MAKE OWNER', th: 'ตั้งเป็นเจ้าของ', zh: '设为所有者' })}
              </Label>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function DoesNot({ items }: { items: Bilingual[] }) {
  return (
    <View
      style={[shadow.card, {
        marginHorizontal: gutter, marginTop: 24, padding: 16,
        borderRadius: radius.md, backgroundColor: color.surface,
        borderWidth: 1, borderColor: '#DCEFF5',
      }]}
    >
      <Label size={10} tracking={0.14} colour={color.neutral700}>{t({ en: 'WHAT A GROUP DOES NOT DO', th: 'สิ่งที่กลุ่มไม่ได้ทำ', zh: '队伍不会做的事' })}</Label>
      {items.map((d) => (
        <View key={t(d)} style={{ marginTop: 10 }}>
          <Body size={13} colour={color.neutral800}>{t(d)}</Body>
        </View>
      ))}
    </View>
  );
}

function Leave({
  owner, onChanged, onToast,
}: { owner: boolean; onChanged: () => void; onToast: (msg: string) => void }) {
  const requireAccount = useRequireAccount();
  const [busy, setBusy] = React.useState(false);
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
      <Button
        label="Leave this group"
        thai="ออกจากกลุ่ม"
        chinese="退出此小组"
        variant="secondary"
        height={48}
        disabled={owner || busy}
        onPress={async () => {
          if (requireAccount({ en: 'Please sign in or create an account to manage your party.', th: 'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่อจัดการปาร์ตี้', zh: '请先登录或注册账号，再管理你的队伍。' })) return;
          if (busy) return;
          setBusy(true);
          const res = await api.leaveParty();
          if (res.ok) await stopPartyBackgroundLocation();
          setBusy(false);
          onToast(res.ok
            ? t({ en: 'You are travelling on your own again.', th: 'คุณกลับมาเดินทางคนเดียวแล้ว', zh: '你又开始独自旅行了。' })
            : res.error);
          if (res.ok) onChanged();
        }}
      />
      {/*
        Said before they tap, not in a confirmation afterwards. Leaving costs
        nothing — every point, stamp and companion was always theirs — and a
        scary modal would imply otherwise.
      */}
      <Label size={9} tracking={0.04} colour={color.neutral600} style={{ marginTop: 8, textTransform: 'none' }}>
        {owner ? t({
          en: 'Transfer ownership to another active member before leaving. If you are alone, end the Party instead.',
          th: 'โอนสิทธิ์เจ้าของให้สมาชิกที่ยังอยู่ก่อนออกจากกลุ่ม หากอยู่คนเดียวให้ยุติปาร์ตี้แทน',
          zh: '离队前请将所有权转给另一名活跃成员；如果只有你一人，请结束队伍。',
        }) : t({
          en: 'Your points, stamps and companions stay with you. They always were yours.',
          th: 'แต้ม แสตมป์ และเพื่อนร่วมทางยังอยู่กับคุณ เป็นของคุณมาตลอด',
          zh: '你的积分、护照印章和伙伴都还在你这里，它们一直都是你的。',
        })}
      </Label>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Finding people, and answering the ones who found you
// ---------------------------------------------------------------------------

/**
 * The door to the discovery screen.
 *
 * On BOTH branches, and the solo one matters more: somebody travelling alone
 * is exactly who needs this, and before it existed the only way into a party
 * was to already know a person who would read you a code.
 */
function FindDoor({ onFind }: { onFind: () => void }) {
  // A door, the way Collect's are: an icon on a tile, not a grey button.
  const label = t({ en: 'Find a party', th: 'หาปาร์ตี้', zh: '寻找队伍' });
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 18 }}>
      <Pressable
        onPress={onFind}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[gameShadow.lift, {
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
          borderRadius: gameRadius.panel, backgroundColor: color.brandSoft,
        }]}
      >
        <Users size={26} color={color.brandDeep} strokeWidth={2} />
        <Heading size={16} colour={color.brandDeep} style={{ flex: 1 }}>{label}</Heading>
        <ChevronRight size={18} color={color.brandDeep} strokeWidth={2} />
      </Pressable>
      <Body size={13} colour={color.neutral600} style={{ marginTop: 8 }}>
        {t({
          en: 'Parties post at a place, never at a person. Nobody sees where you are.',
          th: 'ปาร์ตี้ประกาศที่สถานที่ ไม่ได้ประกาศที่ตัวคน ไม่มีใครเห็นว่าคุณอยู่ที่ไหน',
          zh: '队伍发布在地点上，不会发布在某个人身上。没有人会看到你在哪里。',
        })}
      </Body>
    </View>
  );
}

/**
 * Who has asked to come along.
 *
 * Absent entirely when nobody has asked — an empty "0 requests" panel is a
 * permanent reminder that nobody wants to travel with you, which is not a
 * thing a screen should say to somebody on holiday.
 *
 * What the party is shown about an asker is a name they chose and a count a
 * host verified. Not a balance, not a location, not a history. The party is
 * deciding whether to spend a day with somebody, not auditing them, and the
 * asker never agreed to be audited.
 */
function Requests({
  onToast, onChanged,
}: { onToast: (msg: string) => void; onChanged: () => void }) {
  const requireAccount = useRequireAccount();
  const waiting = useAsync(() => api.inviteRequests(), []);
  const [busy, setBusy] = React.useState<string | null>(null);

  const decide = async (inviteId: string, userId: string, accept: boolean) => {
    if (requireAccount({ en: 'Please sign in or create an account to manage party requests.', th: 'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่อจัดการคำขอเข้าปาร์ตี้', zh: '请先登录或注册账号，再处理入队申请。' })) return;
    if (busy !== null) return;
    setBusy(userId);
    const res = await api.decideRequest(inviteId, userId, accept);
    setBusy(null);
    if (!res.ok) { onToast(res.error); return; }
    waiting.reload();
    // Accepting changes the party itself, so the screen above has to re-read.
    if (accept) onChanged();
  };

  const items = waiting.data?.waiting ?? [];
  if (items.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 22 }}>
      <Label size={10} tracking={0.14}>
        {t({ en: 'ASKED TO COME ALONG', th: 'ขอมาร่วมทาง', zh: '申请同行' })}
      </Label>

      {items.map((who) => (
        <View
          key={`${who.inviteId}:${who.userId}`}
          style={{
            marginTop: 8, padding: 12, borderRadius: radius.sm,
            backgroundColor: color.surface,
            borderWidth: 1, borderColor: color.neutral300,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Heading size={15} tracking={-0.1} style={{ flex: 1 }}>{who.displayName}</Heading>
            <View
              style={{
                paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm,
                backgroundColor: who.missionsVerified === 0 ? color.neutral200 : color.accent100,
              }}
            >
              <Label
                size={10}
                tracking={0.06}
                colour={who.missionsVerified === 0 ? color.neutral700 : color.accent700}
              >
                {who.missionsVerified === 0
                  ? t({ en: 'NOTHING VERIFIED YET', th: 'ยังไม่มีงานที่ตรวจแล้ว', zh: '尚无已验证记录' })
                  : t({ en: `${who.missionsVerified} VERIFIED`, th: `ตรวจแล้ว ${who.missionsVerified}`, zh: `已验证 ${who.missionsVerified}` })}
              </Label>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Button
              label="Yes"
              thai="รับ"
              chinese="接受"
              onPress={() => decide(who.inviteId, who.userId, true)}
              disabled={busy !== null}
              height={44}
              style={{ flex: 1 }}
            />
            <Button
              label="No"
              thai="ไม่รับ"
              chinese="拒绝"
              variant="secondary"
              onPress={() => decide(who.inviteId, who.userId, false)}
              disabled={busy !== null}
              height={44}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
