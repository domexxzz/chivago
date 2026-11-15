/**
 * Quest detail - the core loop.
 *
 * Five stages: joined -> arrived -> proof submitted -> host verification ->
 * complete. Points release ONLY after the host verifies, and only the server
 * can make that call.
 *
 * THREE DEPARTURES FROM THE PROTOTYPE, all deliberate:
 *  1. "I'm at the site" captures real GPS and the server checks the geofence.
 *     The prototype trusts the tap.
 *  2. The verifying screen is LEAVABLE and says so. Host review can take 24h;
 *     the prototype auto-advances after 2.6 s, which trains users to wait at a
 *     screen that will not resolve.
 *  3. There is a rejection path. Real review rejects submissions; the design
 *     has no state for it.
 */

import React from 'react';
import { Animated, Image, Linking, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, ArrowRight, Camera, Check, Send } from 'lucide-react-native';
import {
  QUEST_STAGES, stageIndex, strings,
  type Bilingual, type ProofPhoto, type Quest, type QuestProgress, type QuestStage,
} from '@chivago/core';
import { API_BASE, api, type FiledStatement, type Result } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { enqueueProof, pendingFor } from '../state/outbox.ts';
import { deviceOutbox } from '../state/outbox-device.ts';
import { useServerConfig } from '../state/server-config.ts';
import { color, gutter, layout, motion, onFill, radius, shadow } from '../theme/index.ts';
import { AccentNumeral, Body, Heading, Label } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { OceanBackdrop } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';
import { useRequireAccount } from '../components/GuestActionGate.tsx';
import { questArtworkSource } from '../components/QuestArtwork.tsx';
import { sichangPilotBrief } from '../data/sichang-quests.ts';

export function QuestDetailScreen({
  questId, onBack, onOpenWallet, onToast, onPointsChanged,
}: {
  questId: string;
  onBack: () => void;
  onOpenWallet: () => void;
  onToast: (msg: string) => void;
  onPointsChanged: () => void;
}) {
  const data = useAsync(() => api.quest(questId), [questId]);
  const [busy, setBusy] = React.useState(false);
  const [photos, setPhotos] = React.useState<ProofPhoto[]>([]);
  // Proofs for this quest waiting in the outbox, so the screen can say so.
  const [pending, setPending] = React.useState(0);
  React.useEffect(() => { void pendingFor(deviceOutbox(), questId).then(setPending); }, [questId]);
  const [weight, setWeight] = React.useState('');
  // Above every early return, like every hook here (fence-band.test.ts).
  const { aiAssist } = useServerConfig();
  const requireAccount = useRequireAccount();

  const quest = data.data?.quest ?? null;
  const pilotBrief = quest ? sichangPilotBrief(quest.code) : null;
  const progress = data.data?.progress ?? null;
  const stage: QuestStage | null = progress?.stage ?? null;

  const shareQuest = async () => {
    if (!quest) return;
    try {
      await Share.share({
        message: `${t(quest.name)} — ${t(quest.where)} · ${t(quest.duration)}`,
      });
    } catch {
      onToast(t({ en: 'Could not open the share menu.', th: 'ไม่สามารถเปิดเมนูแชร์ได้', zh: '无法打开分享菜单。' }));
    }
  };

  /*
    Whose record this is on. Asked only once the host has verified, because
    before that there is nothing to be on; and read softly below, so a
    statement route that fails never takes the verification panel with it.
  */
  const filed = useAsync<{ statements: FiledStatement[] }>(() => {
    if (stage === 'complete') return api.myStatements();
    const none: Result<{ statements: FiledStatement[] }> = { ok: true, data: { statements: [] } };
    return Promise.resolve(none);
  }, [stage]);
  const onRecord = filed.data?.statements.find((s) => s.quests.some((q) => q.id === questId)) ?? null;

  const join = async () => {
    if (requireAccount({ en: 'Please sign in or create an account to join this quest.', th: 'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่อเข้าร่วมเควสต์', zh: '请登录或注册账号，以加入这个任务。' })) return;
    setBusy(true);
    const res = await api.joinQuest(questId);
    setBusy(false);
    if (res.ok) data.reload();
    else onToast(res.error);
  };

  /** Real GPS, checked server-side against the quest geofence. */
  const arrive = async () => {
    if (requireAccount({ en: 'Please sign in or create an account to check in to this quest.', th: 'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่อเช็กอินเควสต์', zh: '请登录或注册账号，以为这个任务签到。' })) return;
    setBusy(true);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      setBusy(false);
      onToast(t({
        en: 'Location permission is needed to check in at the site.',
        th: 'ต้องอนุญาตให้เข้าถึงตำแหน่งเพื่อเช็กอินที่จุดนั้น',
        zh: '需要位置权限才能在该地点签到。',
      }));
      return;
    }
    // A fix can time out or fail under tree cover. Without the catch that
    // rejection left `busy` true and the button dead until the screen was
    // reopened - at the site, with the volunteer standing there.
    let pos: Location.LocationObject;
    try {
      pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch {
      setBusy(false);
      onToast(t(strings.checkin.noFix));
      return;
    }
    const res = await api.arriveAtQuest(questId, {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy ?? null,
      mocked: pos.mocked ?? false,
    });
    setBusy(false);
    if (res.ok) data.reload();
    else onToast(res.error);
  };

  /** Camera or gallery, keeping the EXIF geotag the host review needs. */
  const addPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const picker = perm.granted
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await picker({ quality: 0.7, exif: true });
    } catch {
      // A picker that will not open (no camera, a denied gallery) is not a
      // crash. The volunteer can try the other source.
      onToast(t(strings.quest.photoUnavailable));
      return;
    }
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const exif = (asset.exif ?? {}) as Record<string, unknown>;
    setPhotos((p) => [
      ...p,
      {
        uri: asset.uri,
        lat: typeof exif.GPSLatitude === 'number' ? exif.GPSLatitude : null,
        lng: typeof exif.GPSLongitude === 'number' ? exif.GPSLongitude : null,
        takenAt: new Date().toISOString(),
      },
    ]);
  };

  const submit = async () => {
    if (requireAccount({ en: 'Please sign in or create an account to submit quest work.', th: 'กรุณาสมัครสมาชิกหรือเข้าสู่ระบบเพื่อส่งผลงานเควสต์', zh: '请登录或注册账号，以提交任务成果。' })) return;
    setBusy(true);
    // A second position, taken now. Arrival proved they got here; this
    // proves they were still here when the work was done. See docs/30.
    let pos: Location.LocationObject;
    try {
      pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch {
      setBusy(false);
      onToast(t(strings.checkin.noFix));
      return;
    }
    const payload = {
      photos,
      weightKg: weight ? Number(weight) : null,
      position: {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy ?? null,
        mocked: pos.mocked ?? false,
      },
    };
    const res = await api.submitProof(questId, payload);
    setBusy(false);
    if (res.ok) {
      setPhotos([]); setWeight(''); data.reload();
      // The party that was in the fence rides this proof: say who.
      const names = (res.data.partyPresent ?? []).map((m) => m.displayName);
      if (names.length > 0) onToast(t(strings.quest.partyRides(names)));
    }
    // An offline submission is queued, not lost - beach and mangrove sites have
    // poor signal, which is exactly where proof gets taken. Queued means
    // WRITTEN: the outbox (state/outbox.ts) holds it and tries again when
    // there is signal. For fifty commits this branch only showed the toast.
    else if (res.code === 'NETWORK' || res.code === 'TIMEOUT') {
      await enqueueProof(deviceOutbox(), questId, payload);
      setPhotos([]); setWeight('');
      setPending((n) => n + 1);
      onToast(t(strings.quest.queuedOffline));
    } else onToast(res.error);
  };

  /**
   * Tell the app the balance moved - once per arrival at `complete`.
   *
   * The callback lives in a ref on purpose. The parent hands down an inline
   * arrow that is a new function on every render, and the callback's own job
   * is to bump a counter that re-renders the parent. Keyed on the callback,
   * this effect re-fired on every render it caused: opening any finished quest
   * refetched the wallet and the inbox in a loop that never ended.
   */
  const onPointsChangedRef = React.useRef(onPointsChanged);
  React.useEffect(() => { onPointsChangedRef.current = onPointsChanged; });
  React.useEffect(() => {
    if (stage === 'complete') onPointsChangedRef.current();
  }, [stage]);

  return (
    <View style={{ flex: 1 }}>
      {data.loading ? (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: gutter, paddingTop: 18 }}><Pressable accessibilityRole="button" accessibilityLabel={t({ en: 'Back', th: 'ย้อนกลับ', zh: '返回' })} onPress={onBack}><ArrowLeft size={24} color={color.brandDeep} /></Pressable></View>
          <LoadingState />
        </View>
      ) : null}
      {data.error ? (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: gutter, paddingTop: 18 }}><Pressable accessibilityRole="button" accessibilityLabel={t({ en: 'Back', th: 'ย้อนกลับ', zh: '返回' })} onPress={onBack}><ArrowLeft size={24} color={color.brandDeep} /></Pressable></View>
          <ErrorState message={data.error} onRetry={data.reload} />
        </View>
      ) : null}

      {quest ? (
        <>
        <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          <View style={{ height: 340, position: 'relative', overflow: 'hidden', backgroundColor: color.brandDeep, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
            <Image source={questArtworkSource(quest)} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
            <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,35,52,0.16)' }} />
            <View style={{ position: 'absolute', left: 16, right: 16, top: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Pressable accessibilityRole="button" accessibilityLabel={t({ en: 'Back', th: 'ย้อนกลับ', zh: '返回' })} onPress={onBack} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)', opacity: pressed ? 0.75 : 1 })}>
                <ArrowLeft size={23} color={color.brandDeep} strokeWidth={2.4} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t({ en: 'Share quest', th: 'แชร์ภารกิจ', zh: '分享任务' })} onPress={() => { void shareQuest(); }} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)', opacity: pressed ? 0.75 : 1 })}>
                <Send size={21} color={color.brandDeep} strokeWidth={2.2} />
              </Pressable>
            </View>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 158, backgroundColor: 'rgba(0,42,55,0.42)' }} />
            <View style={{ position: 'absolute', left: gutter, right: gutter, bottom: 22 }}>
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.94)' }}><Label size={9} tracking={0.12} colour={color.brandDeep}>{quest.code}</Label></View>
              <Heading size={30} colour="#FFFFFF" tracking={-0.6} style={{ marginTop: 8 }}>{t(quest.name)}</Heading>
              <Body size={14} colour="#F1FCFF" style={{ marginTop: 4 }}>{`${t(quest.where)} · ${t(quest.duration)}`}</Body>
            </View>
          </View>

          <View style={[shadow.card, { marginHorizontal: gutter, marginTop: -1, paddingTop: 18, paddingBottom: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: color.surface, borderWidth: 1, borderTopWidth: 0, borderColor: '#DCEFF5' }]}>
            <StatBand quest={quest} />
            <View style={{ height: 1, backgroundColor: '#E3F0F4', marginHorizontal: 16, marginTop: 14 }} />
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <Label size={9} tracking={0.14}>{t(strings.quest.host)}</Label>
              <Body size={13} colour={color.neutral700} style={{ marginTop: 3 }}>{quest.host.name}</Body>
            </View>
          </View>

          {pilotBrief ? <PilotBriefPanel brief={pilotBrief} /> : null}
          <Timeline
            stage={stage}
            action={stage === null || stage === 'joined' ? {
              label: stage === null ? t(strings.quest.ctaJoin) : t(strings.quest.ctaArrive),
              onPress: stage === null ? join : arrive,
              busy,
            } : null}
          />

          <View style={{ paddingHorizontal: gutter, marginTop: 20 }}>
            {progress?.rejectedAt ? <RejectionNotice reason={progress.rejectionReason} /> : null}

            {pending > 0 ? (
              <View style={{ marginHorizontal: gutter, marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: color.brandSoft }}>
                <Body size={13} colour={color.brandDeep}>{t(strings.quest.outboxPending(pending))}</Body>
              </View>
            ) : null}
            {stage === 'arrived' ? (
              <ProofBox
                photos={photos}
                weight={weight}
                onWeight={setWeight}
                onAddPhoto={addPhoto}
                onSubmit={submit}
                busy={busy}
                aiAssist={aiAssist}
              />
            ) : null}
            {stage === 'host_verification' ? <VerifyingPanel host={quest.host.name} /> : null}
            {stage === 'complete' ? (
              <SuccessPanel
                points={quest.rewardPoints}
                weightKg={progress?.weightKg ?? null}
                onOpenWallet={onOpenWallet}
              />
            ) : null}
            {stage === 'complete' && onRecord ? <OnRecordPanel statement={onRecord} /> : null}
          </View>
        </ScrollView>
        </>
      ) : null}
    </View>
  );
}

function StatBand({ quest }: { quest: Quest }) {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 16 }}>
      <View style={{ flex: 1 }}>
        <Label size={10} tracking={0.12}>{t(strings.quest.reward)}</Label>
        <AccentNumeral size={22} style={{ marginTop: 4 }}>
          {quest.rewardExp != null
            ? `+${quest.rewardExp} XP`
            : `+${quest.rewardPoints} ${quest.rewardCurrency === 'green' ? 'G' : 'T'}`}
        </AccentNumeral>
      </View>
      <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: '#DCEFF5', paddingLeft: 14 }}>
        <Label size={10} tracking={0.12}>{t(strings.quest.duration)}</Label>
        <Heading size={22} style={{ marginTop: 4 }}>{t(quest.duration)}</Heading>
      </View>
    </View>
  );
}

function PilotBriefPanel({
  brief,
}: { brief: NonNullable<ReturnType<typeof sichangPilotBrief>> }) {
  return (
    <View style={[shadow.card, { marginHorizontal: gutter, marginTop: 14, padding: 18, borderRadius: 24, backgroundColor: '#F4FCFE', borderWidth: 1.5, borderColor: '#71D6E2' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Label size={10} tracking={0.14} colour={color.brand}>{t({ en: 'KOH SICHANG PILOT', th: 'เควสทดลองเกาะสีชัง', zh: '锡昌岛试点任务' })}</Label>
          <Heading size={19} colour={color.brandDeep} style={{ marginTop: 4 }}>{t({ en: 'Completion criteria', th: 'เงื่อนไขการสำเร็จ', zh: '完成条件' })}</Heading>
        </View>
        <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#FFF0C2' }}>
          <Label size={9} tracking={0.1} colour="#705000">PILOT</Label>
        </View>
      </View>
      <Body size={14} colour={color.neutral700} style={{ marginTop: 10 }}>{t(brief.summary)}</Body>
      <View style={{ marginTop: 14, gap: 10 }}>
        {brief.requirements.map((requirement, index) => (
          <View key={`${brief.code}-${index}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color.brand, alignItems: 'center', justifyContent: 'center' }}>
              <Label size={10} tracking={0} colour={onFill.brand}>{index + 1}</Label>
            </View>
            <Body size={14} colour={color.text} style={{ flex: 1, paddingTop: 2 }}>{t(requirement)}</Body>
          </View>
        ))}
      </View>
      {brief.note ? (
        <View style={{ marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: '#FFF7DC', borderWidth: 1, borderColor: '#F1D886' }}>
          <Body size={13} colour="#604B17">{t(brief.note)}</Body>
        </View>
      ) : null}
      <View style={{ marginTop: 16, padding: 13, borderRadius: 16, backgroundColor: '#E4F8EE', borderWidth: 1, borderColor: '#8DD8B1' }}>
        <Heading size={14} colour="#17633E">{t({ en: 'Open for participation', th: 'เปิดให้เข้าร่วมแล้ว', zh: '现已开放参与' })}</Heading>
        <Body size={13} colour={color.neutral600} style={{ marginTop: 4 }}>
          {t({
            en: 'Join, check in with a real GPS fix, complete every condition above, then upload clear evidence. The Koh Sichang host reviews it before EXP is released.',
            th: 'กดเข้าร่วม เช็กอินด้วย GPS จริง ทำเงื่อนไขด้านบนให้ครบ แล้วอัปโหลดหลักฐานที่ชัดเจน ทีมผู้ดูแลเกาะสีชังจะตรวจก่อนปล่อย EXP',
            zh: '加入任务后使用真实 GPS 签到，完成以上全部条件并上传清晰证据。锡昌岛审核团队通过后才会发放 EXP。',
          })}
        </Body>
      </View>
    </View>
  );
}

/**
 * The progress rail. Completed AND current markers fill accent; future steps
 * drop to 40% opacity, and the current label goes accent-700.
 */
function Timeline({
  stage,
  action,
}: {
  stage: QuestStage | null;
  action: { label: string; onPress: () => void; busy: boolean } | null;
}) {
  const current = stage ? stageIndex(stage) : -1;
  return (
    <View style={[shadow.card, { marginHorizontal: gutter, marginTop: 14, padding: 18, borderRadius: 24, backgroundColor: color.surface, borderWidth: 1, borderColor: '#DCEFF5' }]}>
      <Heading size={17}>{t(strings.quest.progress)}</Heading>
      <View style={{ marginTop: 14, gap: 2 }}>
        {QUEST_STAGES.map((key, i) => {
          const done = i < current;
          const now = i === current;
          const reached = i <= current;
          const copy = strings.quest.steps[key];
          return (
            <View
              key={key}
              style={{
                flexDirection: 'row',
                gap: 11,
                alignItems: 'center',
                minHeight: 38,
                paddingVertical: 5,
                paddingHorizontal: 2,
                opacity: reached ? 1 : layout.futureStepOpacity,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderWidth: 2,
                  borderRadius: radius.lg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done ? color.brand : color.surface,
                  borderColor: reached ? color.brand : color.neutral400,
                }}
              >
                {done ? <Check size={14} color={onFill.brand} strokeWidth={3} /> : now ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.brand }} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Body size={14} colour={now ? color.brandDeep : color.text}>{t(copy)}</Body>
              </View>
            </View>
          );
        })}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          disabled={action.busy}
          onPress={action.onPress}
          style={({ pressed }) => ({
            height: 50,
            marginTop: 16,
            borderRadius: 25,
            backgroundColor: color.brand,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            opacity: action.busy ? 0.55 : pressed ? 0.82 : 1,
          })}
        >
          <Heading size={15} colour={onFill.brand}>{action.label}</Heading>
          <ArrowRight size={18} color={onFill.brand} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The rejection state the design omits.
 *
 * The reason arrives BILINGUAL from the server: the host picked a preset in
 * their language, and it is rendered here in both, like every other piece of
 * copy in the app. A reviewer's free-text note is appended untranslated, so it
 * simply repeats across both lines - which is honest, and better than machine
 * translating a municipal officer's words into something they cannot check.
 */
function RejectionNotice({ reason }: { reason: Bilingual | null }) {
  return (
    <View
      style={{
        borderWidth: layout.ruleStrong,
        borderColor: color.accent,
        borderRadius: radius.md,
        padding: 14,
        marginBottom: 16,
      }}
    >
      <Label size={10} tracking={0.14} colour={color.accent700}>{t(strings.quest.rejected)}</Label>
      {reason ? (
        <>
          <Body size={13} style={{ marginTop: 10 }}>{t(reason)}</Body>
        </>
      ) : null}
      <Body size={13} colour={color.neutral700} style={{ marginTop: 10 }}>
        {t(strings.quest.resubmit)}
      </Body>
    </View>
  );
}

function ProofBox({
  photos, weight, onWeight, onAddPhoto, onSubmit, busy, aiAssist,
}: {
  photos: ProofPhoto[]; weight: string; onWeight: (v: string) => void;
  onAddPhoto: () => void; onSubmit: () => void; busy: boolean; aiAssist: boolean;
}) {
  return (
    <View
      style={{
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: color.neutral500,
        backgroundColor: color.surface,
        borderRadius: radius.md,
        padding: 20,
      }}
    >
      <Label size={10} tracking={0.14}>
        {`${t(strings.quest.submitProof)}`}
      </Label>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {[0, 1, 2].map((i) => {
          const photo = photos[i];
          const isAdd = i === photos.length && photos.length < 3;
          return (
            <View
              key={i}
              style={{
                width: 64,
                height: 64,
                backgroundColor: color.neutral300,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.sm,
              }}
            >
              {photo ? (
                <Label size={9} tracking={0.06} colour={color.text}>{`#${i + 1}`}</Label>
              ) : isAdd ? (
                <Button
                  label=""
                  accessibilityLabel={t(strings.quest.addPhoto)}
                  onPress={onAddPhoto}
                  variant="ghost"
                  icon={<Camera size={20} color={color.neutral700} strokeWidth={2} />}
                  style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      <Label size={10} tracking={0.12} style={{ marginTop: 14 }}>{t(strings.quest.weightLabel)}</Label>
      <TextInput
        value={weight}
        onChangeText={onWeight}
        keyboardType="decimal-pad"
        placeholder="0.0"
        placeholderTextColor={color.neutral500}
        accessibilityLabel={t(strings.quest.weightLabel)}
        style={{
          borderWidth: 1,
          borderColor: color.neutral400,
          borderRadius: radius.sm,
          paddingHorizontal: 10,
          paddingVertical: 8,
          marginTop: 6,
          fontSize: 15,
          color: color.text,
          backgroundColor: color.bg,
        }}
      />

      <Body size={13} colour={color.neutral700} style={{ marginTop: 12 }}>
        {t(strings.quest.proofHelper)}
      </Body>
      {/* Above the send button, so it is read before the photos leave (docs/64). */}
      {aiAssist ? (
        <Body size={13} colour={color.neutral700} style={{ marginTop: 8 }}>
          {t(strings.quest.aiAssistNotice)}
        </Body>
      ) : null}

      <Button
        label={t(strings.quest.ctaSend)}
        onPress={onSubmit}
        height={46}
        disabled={busy || photos.length === 0}
        style={{ marginTop: 14 }}
      />
    </View>
  );
}

/**
 * The verifying panel.
 *
 * The scan sweep is the design's, but the copy is not: this screen says out
 * loud that the user can leave. Host review can take 24 hours, and the
 * prototype's 2.6 s auto-advance teaches people to sit and wait at a screen
 * that will not resolve.
 */
function VerifyingPanel({ host }: { host: string }) {
  const sweep = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: motion.scanSweepMs,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  return (
    <View
      style={[shadow.card, {
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: '#DCEFF5',
        borderRadius: radius.md,
        padding: 18,
        overflow: 'hidden',
      }]}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 26,
          backgroundColor: color.accent200,
          transform: [
            { translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [-26, 200] }) },
          ],
        }}
      />
      <Heading size={16}>{t(strings.quest.verifying(host))}</Heading>
      <Body size={13} colour={color.neutral700} style={{ marginTop: 12 }}>
        {t(strings.quest.verifyingLeavable)}
      </Body>
    </View>
  );
}

/**
 * Success. A full green field - and this is the screen that earns it: a host
 * approved the submission, so the colour is making a claim the ledger can back.
 *
 * (The comment here used to say "the one place red runs as a field", left over
 * from the dark palette. Green is now scarce enough that this really is close
 * to the only place it runs as a field.)
 */
function SuccessPanel({
  points, weightKg, onOpenWallet,
}: { points: number; weightKg: number | null; onOpenWallet: () => void }) {
  return (
    <View style={{ backgroundColor: color.accent, padding: 20, borderRadius: radius.md }}>
      <Label size={10} tracking={0.16} colour={onFill.accent} style={{ opacity: 0.85 }}>
        {t(strings.quest.verified)}
      </Label>
      <Heading size={40} colour={onFill.accent} tracking={-0.8} style={{ marginTop: 8 }}>
        {`+${points}`}
      </Heading>
      <Body size={13} colour={onFill.accent} style={{ marginTop: 8 }}>
        {t(strings.quest.verifiedDetail(weightKg))}
      </Body>
      <Button
        label={t(strings.quest.ctaWallet)}
        onPress={onOpenWallet}
        inverted
        height={44}
        style={{ marginTop: 16 }}
        icon={null}
      />
    </View>
  );
}

/**
 * The guest-facing half of the evidence layer (docs/31). A host filed this
 * verification in a statement with a public id; the traveller is told so and
 * can open the same page an auditor would. Quiet, below the green field: the
 * points are theirs, the record is the host's. The static demo has no API to
 * open the page on, so there the link is left off rather than left dead.
 */
function OnRecordPanel({ statement }: { statement: FiledStatement }) {
  const url = `${API_BASE}/verify/${encodeURIComponent(statement.id)}`;
  return (
    <View style={[shadow.card, { marginTop: 12, padding: 16, backgroundColor: color.surface, borderWidth: 1, borderColor: '#DCEFF5', borderRadius: radius.md }]}>
      <Label size={10} tracking={0.16} colour={color.neutral600}>{t(strings.quest.onRecord)}</Label>
      <Body size={13} style={{ marginTop: 6 }}>
        {t(strings.quest.onRecordDetail(
          statement.host.name, statement.id, statement.period.from, statement.period.to,
        ))}
      </Body>
      {process.env.EXPO_PUBLIC_DEMO === '1' ? null : (
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(url); }} style={{ marginTop: 8 }}>
          <Body size={13} colour={color.brand}>{t(strings.quest.onRecordCheck)}</Body>
        </Pressable>
      )}
    </View>
  );
}
