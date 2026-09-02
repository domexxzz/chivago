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
import { Animated, ScrollView, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import {
  QUEST_STAGES, stageIndex, strings,
  type Bilingual, type ProofPhoto, type Quest, type QuestProgress, type QuestStage,
} from '@chivago/core';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, motion, onFill, radius } from '../theme/index.ts';
import { AccentNumeral, Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { PushHeader } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
import { t } from '../i18n/locale.ts';

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
  const [weight, setWeight] = React.useState('');

  const quest = data.data?.quest ?? null;
  const progress = data.data?.progress ?? null;
  const stage: QuestStage | null = progress?.stage ?? null;

  const join = async () => {
    setBusy(true);
    const res = await api.joinQuest(questId);
    setBusy(false);
    if (res.ok) data.reload();
    else onToast(res.error);
  };

  /** Real GPS, checked server-side against the quest geofence. */
  const arrive = async () => {
    setBusy(true);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      setBusy(false);
      onToast('Location permission is needed to check in at the site.');
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
    setBusy(true);
    const res = await api.submitProof(questId, {
      photos,
      weightKg: weight ? Number(weight) : null,
    });
    setBusy(false);
    if (res.ok) { setPhotos([]); setWeight(''); data.reload(); }
    // An offline submission is queued, not lost - beach and mangrove sites have
    // poor signal, which is exactly where proof gets taken.
    else if (res.code === 'NETWORK' || res.code === 'TIMEOUT') {
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
      <PushHeader context={quest ? strings.quest.context(quest.code).en : ''} onBack={onBack} />

      {data.loading ? <LoadingState /> : null}
      {data.error ? <ErrorState message={data.error} onRetry={data.reload} /> : null}

      {quest ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: gutter }}>
            <Heading size={28} tracking={-0.56}>{t(quest.name)}</Heading>
          </View>

          <StatBand quest={quest} />

          <View style={{ paddingHorizontal: gutter, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.neutral300 }}>
            <Label size={10} tracking={0.14}>{`${t(strings.quest.host)}`}</Label>
            <Heading size={15} style={{ marginTop: 4 }}>{quest.host.name}</Heading>
          </View>

          <Timeline stage={stage} />

          <View style={{ paddingHorizontal: gutter, marginTop: 20 }}>
            {progress?.rejectedAt ? <RejectionNotice reason={progress.rejectionReason} /> : null}

            {stage === null ? (
              <Button label={t(strings.quest.ctaJoin)} onPress={join} height={52} disabled={busy} />
            ) : null}
            {stage === 'joined' ? (
              <Button label={t(strings.quest.ctaArrive)} onPress={arrive} height={52} disabled={busy} />
            ) : null}
            {stage === 'arrived' ? (
              <ProofBox
                photos={photos}
                weight={weight}
                onWeight={setWeight}
                onAddPhoto={addPhoto}
                onSubmit={submit}
                busy={busy}
              />
            ) : null}
            {stage === 'host_verification' ? <VerifyingPanel host={quest.host.name} /> : null}
            {stage === 'complete' ? (
              <SuccessPanel points={quest.rewardPoints} onOpenWallet={onOpenWallet} />
            ) : null}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function StatBand({ quest }: { quest: Quest }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        marginTop: 16,
        paddingVertical: 12,
        paddingHorizontal: gutter,
        borderTopWidth: layout.ruleStrong,
        borderTopColor: color.text,
        borderBottomWidth: layout.ruleStrong,
        borderBottomColor: color.text,
      }}
    >
      <View style={{ flex: 1 }}>
        <Label size={10} tracking={0.12}>{t(strings.quest.reward)}</Label>
        <AccentNumeral size={22} style={{ marginTop: 4 }}>
          {`+${quest.rewardPoints} ${quest.rewardCurrency === 'green' ? 'G' : 'T'}`}
        </AccentNumeral>
      </View>
      <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: color.neutral300, paddingLeft: 14 }}>
        <Label size={10} tracking={0.12}>{t(strings.quest.duration)}</Label>
        <Heading size={22} style={{ marginTop: 4 }}>{quest.duration}</Heading>
      </View>
    </View>
  );
}

/**
 * The progress rail. Completed AND current markers fill accent; future steps
 * drop to 40% opacity, and the current label goes accent-700.
 */
function Timeline({ stage }: { stage: QuestStage | null }) {
  const current = stage ? stageIndex(stage) : -1;
  return (
    <View style={{ paddingHorizontal: gutter, marginTop: 20 }}>
      <Label size={10} tracking={0.16}>{t(strings.quest.progress)}</Label>
      <View
        style={{
          borderLeftWidth: layout.ruleStrong,
          borderLeftColor: color.text,
          paddingLeft: 16,
          marginTop: 12,
          marginLeft: 6,
        }}
      >
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
                gap: 12,
                alignItems: 'flex-start',
                paddingVertical: 9,
                opacity: reached ? 1 : layout.futureStepOpacity,
              }}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  marginLeft: -23,
                  marginTop: 5,
                  borderWidth: 2,
                  borderRadius: radius.sm,
                  backgroundColor: done || now ? color.accent : color.bg,
                  borderColor: reached ? color.accent : color.neutral400,
                }}
              />
              <View style={{ flex: 1 }}>
                <Heading size={14} colour={now ? color.accent700 : color.text}>{t(copy)}</Heading>
              </View>
            </View>
          );
        })}
      </View>
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
  photos, weight, onWeight, onAddPhoto, onSubmit, busy,
}: {
  photos: ProofPhoto[]; weight: string; onWeight: (v: string) => void;
  onAddPhoto: () => void; onSubmit: () => void; busy: boolean;
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
      style={{
        borderWidth: layout.ruleStrong,
        borderColor: color.text,
        borderRadius: radius.md,
        padding: 18,
        overflow: 'hidden',
      }}
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
  points, onOpenWallet,
}: { points: number; onOpenWallet: () => void }) {
  return (
    <View style={{ backgroundColor: color.accent, padding: 20, borderRadius: radius.md }}>
      <Label size={10} tracking={0.16} colour={onFill.accent} style={{ opacity: 0.85 }}>
        {t(strings.quest.verified)}
      </Label>
      <Heading size={40} colour={onFill.accent} tracking={-0.8} style={{ marginTop: 8 }}>
        {`+${points}`}
      </Heading>
      <Body size={13} colour={onFill.accent} style={{ marginTop: 8 }}>
        {t(strings.quest.verifiedDetail(4.2))}
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
