/** Safety services and a local-only SOS confirmation demo. */

import React from 'react';
import { Animated, Image, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { AlertTriangle, Bell, ChevronRight, Phone, ShieldCheck } from 'lucide-react-native';
import chivagoLogo from '../../assets/chivago-logo.png';
import {
  EMERGENCY_AS_OF, emergencyNear, greetingFor, strings, type ShieldService,
} from '@chivago/core';
import type { SosAlertRecord } from '../api/client.ts';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, motion, onFill, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { TravelHeroBackdrop } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
// This screen prints both languages wherever a responder may read the screen,
// so it reaches for `.en`/`.th` directly. `t` is here for the few strings that
// are the TRAVELLER's alone - the spoken labels and the footnotes.
import { t } from '../i18n/locale.ts';
import { ProfileButton } from '../components/ProfileButton.tsx';

const SOS_RADIUS = 34;

export function SafetyScreen({
  alert, onCancel, onShare, onOpenProfile,
}: {
  alert: SosAlertRecord | null;
  onFire: (pos?: { lat: number; lng: number }) => void;
  onCancel: () => void;
  onShare: () => void;
  firing: boolean;
  onOpenProfile?: () => void;
}) {
  const shield = useAsync(() => api.shield(), []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} showsVerticalScrollIndicator={false}>
      <View
        style={{
          backgroundColor: '#097097',
          paddingHorizontal: gutter,
          paddingTop: 18,
          paddingBottom: 18,
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
            <Label size={10} tracking={0.14} colour="#D5F6FF">{t(greetingFor(new Date()))}</Label>
            <Heading size={25} colour="#FFFFFF" style={{ marginTop: 3, fontWeight: '800' }}>
              {t(strings.tabs.safety)}
            </Heading>
            <Body size={13} colour="#E8FBFF" style={{ marginTop: 4 }}>{t(strings.safety.subtitle)}</Body>
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

      <SosSection
        alert={alert}
        onCancel={onCancel}
        onShare={onShare}
      />
      <QuickEmergencyNumbers />
      <SafetyGuide />

      <View style={{ paddingHorizontal: gutter, marginTop: 24, marginBottom: 2 }}>
        <Heading size={17}>{t({ en: 'Safety services', th: 'บริการความปลอดภัย', zh: '安全服务' })}</Heading>
        <Body size={13} colour={color.neutral600} style={{ marginTop: 4 }}>{t({ en: 'Live status from available safety services.', th: 'สถานะล่าสุดจากบริการความปลอดภัยที่เปิดใช้งาน', zh: '可用安全服务的实时状态。' })}</Body>
      </View>
      {shield.loading ? <LoadingState /> : null}
      {shield.error ? <ErrorState message={shield.error} onRetry={shield.reload} /> : null}
      {shield.data?.map((service) => <ServiceRow key={service.key} service={service} />)}
      {/*
        Once an alert is live we know where the caller is, so the island
        stations sort by distance from them. With no alert there is no
        position to sort by, and the list stays in its printed order rather
        than asking for GPS the user has not offered.
      */}
      <EmergencyNumbers
        at={alert && alert.lat !== null && alert.lng !== null ? { lat: alert.lat, lng: alert.lng } : null}
      />

      <View
        style={{
          paddingHorizontal: gutter,
          paddingVertical: 16,
          borderTopWidth: 1,
          borderTopColor: color.neutral300,
        }}
      >
        <Body size={13} colour={color.neutral700}>{strings.safety.antiScamFooter.en}</Body>
        <Thai always size={11} style={{ marginTop: 6 }}>{strings.safety.antiScamFooter.th}</Thai>
      </View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function QuickEmergencyNumbers() {
  const national = emergencyNear(null).filter((n) => n.scope === 'national');
  const numbers = ['1669', '1155', '191']
    .map((dial) => national.find((number) => number.dial === dial))
    .filter((number): number is (typeof national)[number] => Boolean(number));
  return (
    <View style={{ paddingHorizontal: gutter }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {numbers.map((n, index) => {
          const tone = index === 0 ? '#E84D43' : index === 1 ? '#2476C8' : '#008AB2';
          const soft = index === 0 ? '#FFF1EF' : index === 1 ? '#EDF6FF' : '#EAF9FC';
          const Mark = index === 0 ? Phone : index === 1 ? ShieldCheck : AlertTriangle;
          return (
            <Pressable
              key={n.key}
              onPress={() => void Linking.openURL(`tel:${n.dial}`)}
              accessibilityRole="button"
              accessibilityLabel={`${n.name.en}. ${n.name.th}. ${n.printed}`}
              style={[shadow.card, { flex: 1, minWidth: 0, minHeight: 116, paddingVertical: 12, paddingHorizontal: 7, borderRadius: 18, borderWidth: 1, borderColor: `${tone}33`, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }]}
            >
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><Mark size={20} color={tone} strokeWidth={2.3} /></View>
              <Heading size={20} colour={tone} style={{ marginTop: 7 }}>{n.dial}</Heading>
              <Thai always size={10} style={{ marginTop: 2, textAlign: 'center', fontWeight: '700' }}>{n.name.th}</Thai>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SafetyGuide() {
  const [open, setOpen] = React.useState(false);
  return (
    <View style={{ marginHorizontal: gutter, marginTop: 14 }}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t({ en: 'Safety guidance', th: 'คำแนะนำความปลอดภัย', zh: '安全指南' })}
        style={[shadow.card, { minHeight: 72, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: '#DCE8ED', backgroundColor: color.surface, flexDirection: 'row', alignItems: 'center', gap: 12 }]}
      >
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#E8F5F8', alignItems: 'center', justifyContent: 'center' }}><ShieldCheck size={21} color={color.brand} /></View>
        <View style={{ flex: 1 }}><Heading size={15}>{t({ en: 'Safety guidance', th: 'คำแนะนำความปลอดภัย', zh: '安全指南' })}</Heading><Body size={13} colour={color.neutral600} style={{ marginTop: 2 }}>{t({ en: 'What to do during an emergency', th: 'สิ่งที่ควรทำเมื่อเกิดเหตุฉุกเฉิน', zh: '紧急情况下的应对方法' })}</Body></View>
        <ChevronRight size={19} color={color.neutral500} style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: 8, padding: 15, borderRadius: 18, backgroundColor: '#F7FBFC', borderWidth: 1, borderColor: '#DCE8ED', gap: 9 }}>
          {[t({ en: 'Call 1669 for a medical emergency.', th: 'โทร 1669 เมื่อมีเหตุฉุกเฉินทางการแพทย์', zh: '医疗紧急情况请拨打 1669。' }), t({ en: 'Call 1155 for Tourist Police assistance.', th: 'โทร 1155 เมื่อต้องการความช่วยเหลือจากตำรวจท่องเที่ยว', zh: '需要旅游警察协助请拨打 1155。' }), t({ en: 'Share your exact location and stay where responders can find you.', th: 'แจ้งตำแหน่งที่ชัดเจนและอยู่ในจุดที่เจ้าหน้าที่ค้นหาได้', zh: '分享准确位置，并留在救援人员能找到您的地方。' })].map((tip) => <View key={tip} style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}><View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, backgroundColor: color.brand }} /><Body size={13} colour={color.neutral800} style={{ flex: 1 }}>{tip}</Body></View>)}
        </View>
      ) : null}
    </View>
  );
}

function ServiceRow({ service }: { service: ShieldService }) {
  const on = service.state === 'on';
  return (
    <View
      style={[shadow.card, {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginHorizontal: gutter,
        marginTop: 10,
        padding: 15,
        borderRadius: radius.md,
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: '#DCEFF5',
      }]}
    >
      <View
        style={{
          width: 10,
          height: 10,
          backgroundColor: on ? color.brand : color.neutral400,
          borderRadius: radius.lg,
        }}
      />
      <View style={{ flex: 1 }}>
        <Heading size={15}>{service.label.en}</Heading>
        <Thai always size={10} style={{ marginTop: 1 }}>{service.label.th}</Thai>
        <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 3 }}>
          {service.note.en}
        </Label>
        <Thai always size={10} style={{ marginTop: 1 }}>{service.note.th}</Thai>
      </View>
      <View style={{ alignItems: 'center', paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.lg, backgroundColor: on ? color.brandSoft : color.neutral200 }}>
        <Label size={10} tracking={0.12} colour={on ? color.brand : color.neutral700}>{strings.safety.states[service.state].en}</Label>
        <Thai always size={9} colour={on ? color.brand : color.neutral700}>{strings.safety.states[service.state].th}</Thai>
      </View>
    </View>
  );
}

/** SOS confirmation demo: a tap opens a five-second cancel window. */
function SosSection({
  alert, onCancel, onShare,
}: {
  alert: SosAlertRecord | null;
  onCancel: () => void;
  onShare: () => void;
}) {
  const armed = alert !== null;
  const pulse = React.useRef(new Animated.Value(0)).current;
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [demoTriggered, setDemoTriggered] = React.useState(false);
  const demoCancelled = React.useRef(false);
  const dialogVisible = countdown !== null || demoTriggered;

  React.useEffect(() => {
    if (countdown === null) return;
    const timer = setTimeout(() => {
      if (demoCancelled.current) return;
      setCountdown((seconds) => {
        if (seconds === null) return null;
        if (seconds <= 1) {
          setDemoTriggered(true);
          return null;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // The expanding ring is only for an SOS alert that already exists on the server.
  React.useEffect(() => {
    if (!armed) { pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: motion.sosPulseMs, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [armed, pulse]);

  const startDemo = () => {
    if (armed) return;
    demoCancelled.current = false;
    setDemoTriggered(false);
    setCountdown(5);
  };
  const cancelDemo = () => {
    demoCancelled.current = true;
    setCountdown(null);
    setDemoTriggered(false);
  };

  return (
    <View
      style={[
        shadow.card,
        {
          marginHorizontal: gutter,
          marginTop: 16,
          marginBottom: 14,
          padding: 0,
          backgroundColor: 'transparent',
          borderRadius: SOS_RADIUS,
          overflow: 'visible',
        },
      ]}
    >
      <View style={{ alignItems: 'center' }}>
        {armed ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0, right: 0, height: 96,
              borderRadius: SOS_RADIUS,
              borderWidth: 2,
              borderColor: color.accent2,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) },
              ],
            }}
          />
        ) : null}

        <Pressable
          onPress={startDemo}
          disabled={armed}
          accessibilityRole="button"
          accessibilityLabel={
            armed
              ? `${t(strings.safety.sosArmed)}. ${t(strings.safety.dispatchDetail)}`
              : `SOS. ${t({ en: 'Open simulation; no emergency notification', th: 'เปิดการทดลอง ไม่มีการแจ้งหน่วยฉุกเฉิน', zh: '打开演示，不会通知急救部门' })}`
          }
          style={{
            width: '100%',
            minHeight: 96,
            borderRadius: SOS_RADIUS,
            borderWidth: 1,
            /*
              One colour for the whole control, in every state.
              It used to sit GREEN at rest and turn coral only while counting
              down - and then go green again once armed, so the strongest
              success colour in the palette marked a live emergency. An SOS
              button is red before anything happens to it, the way every
              physical one a traveller has ever seen is red.
              The states are told apart by FILL, which is a bigger change than
              a hue swap anyway: ring, then sweeping fill, then solid.
            */
            borderColor: 'rgba(255,255,255,0.5)',
            backgroundColor: '#FF746B',
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            overflow: 'hidden',
            shadowColor: '#E3473E',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.24,
            shadowRadius: 16,
            elevation: 6,
          }}
        >
          <View pointerEvents="none" style={{ position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.08)', top: -88, right: -24 }} />
          <View pointerEvents="none" style={{ position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(255,255,255,0.07)', bottom: -60, left: 110 }} />
          <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)', alignItems: 'center', justifyContent: 'center' }}><Bell size={35} color="#FFFFFF" strokeWidth={1.8} /></View>
          <View style={{ flex: 1, alignItems: 'center', paddingRight: 36 }}>
            <Heading size={25} colour="#FFFFFF" tracking={0}>{armed ? t(strings.safety.sosArmed) : t({ en: 'SOS (Simulation)', th: 'SOS (จำลอง)', zh: 'SOS（演示）' })}</Heading>
            <Body size={13} colour="#FFFFFF" style={{ marginTop: 3, textAlign: 'center', opacity: 0.92 }}>{armed ? t(strings.safety.dispatchDetail) : t({ en: 'Tap to try it · no real alert is sent', th: 'กดเพื่อทดลอง · ไม่มีการส่งแจ้งเตือนจริง', zh: '点击体验 · 不会发送真实警报' })}</Body>
          </View>
        </Pressable>
      </View>

      {alert ? <DispatchPanel alert={alert} onCancel={onCancel} onShare={onShare} /> : null}

      <Modal visible={dialogVisible} transparent animationType="fade" onRequestClose={cancelDemo}>
        <View style={{ flex: 1, backgroundColor: 'rgba(3, 24, 44, 0.58)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 360, borderRadius: 28, padding: 24, backgroundColor: '#fff', alignItems: 'center', borderWidth: 1, borderColor: demoTriggered ? '#A7E8CB' : '#FFD0CC', boxShadow: '0 18px 48px rgba(3,24,44,0.22)' }}>
            <View style={{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: demoTriggered ? '#ECFDF5' : '#FFF1F0' }}>{demoTriggered ? <ShieldCheck size={29} color="#047857" /> : <AlertTriangle size={29} color={color.coralDeep} />}</View>
            <Heading size={22} colour={demoTriggered ? '#047857' : color.coralDeep} style={{ textAlign: 'center', marginTop: 14 }}>{demoTriggered ? t({ en: 'Simulation complete', th: 'การทดลองเสร็จสิ้น', zh: '演示已完成' }) : t({ en: 'SOS simulation — no emergency services notified', th: 'ทดลอง SOS — ไม่มีการแจ้งหน่วยฉุกเฉิน', zh: 'SOS 演示 — 不会通知急救部门' })}</Heading>
            {demoTriggered ? <>
              <Body size={14} colour={color.neutral700} style={{ textAlign: 'center', marginTop: 12 }}>{t({ en: 'No request for help was sent.', th: 'ไม่มีการส่งคำขอความช่วยเหลือ', zh: '未发送求助请求。' })}</Body>
              <Button label={t({ en: 'Close', th: 'ปิด', zh: '关闭' })} onPress={cancelDemo} height={48} style={{ alignSelf: 'stretch', marginTop: 18 }} />
            </> : <>
              <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: '#FFF1F0', borderWidth: 5, borderColor: '#FFD0CC', alignItems: 'center', justifyContent: 'center', marginTop: 16 }}><Text style={{ fontSize: 58, lineHeight: 68, fontWeight: '800', color: color.coralDeep }}>{countdown}</Text></View>
              <Body size={14} colour={color.neutral700} style={{ textAlign: 'center', marginTop: 2 }}>{t({ en: 'This countdown is a simulation only.', th: 'การนับถอยหลังนี้เป็นการทดลองเท่านั้น', zh: '倒计时仅用于演示。' })}</Body>
              <Button label={t({ en: 'Cancel simulation', th: 'ยกเลิกการทดลอง', zh: '取消演示' })} onPress={cancelDemo} variant="secondary" height={60} style={{ alignSelf: 'stretch', marginTop: 22, borderWidth: 2, borderColor: color.accent2, backgroundColor: '#FFF' }} />
            </>}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * What actually happened.
 *
 * The prototype states "Live location shared with 2 contacts" as fixed copy.
 * This reports the real outcome of every channel, including the ones that
 * failed, because a panel that claims help was reached when nothing was sent is
 * worse than no panel at all - it is the reason somebody does not call 1669.
 */
function DispatchPanel({
  alert, onCancel, onShare,
}: { alert: SosAlertRecord; onCancel: () => void; onShare: () => void }) {
  const acknowledged = alert.status === 'acknowledged' && alert.acknowledgedBy;
  return (
    <View
      style={{
        borderWidth: layout.ruleStrong,
        /*
          Coral: this frame is up while an emergency is running and possibly
          unacknowledged. The one line inside it that DOES go green is the one
          that says a named human has the alert - which is the only verified
          good news on the screen, and now the only green on it.
        */
        borderColor: color.accent2,
        borderRadius: radius.md,
        padding: 16,
        marginTop: 20,
      }}
    >
      <Heading size={15} colour={color.coralDeep}>
        {strings.safety.dispatching(alert.locationLabel).en}
      </Heading>
      <Thai always size={11} style={{ marginTop: 2 }}>
        {strings.safety.dispatching(alert.locationLabel).th}
      </Thai>

      {/* Whether a named human has it. Until then, say so plainly. */}
      <View style={{ marginTop: 14 }}>
        <Label size={10} tracking={0.12} colour={acknowledged ? color.accent700 : color.neutral700}>
          {acknowledged
            ? strings.safety.acknowledgedBy(alert.acknowledgedBy!).en
            : strings.safety.notAcknowledged.en}
        </Label>
        <Thai always size={11} style={{ marginTop: 2 }}>
          {acknowledged
            ? strings.safety.acknowledgedBy(alert.acknowledgedBy!).th
            : strings.safety.notAcknowledged.th}
        </Thai>
      </View>

      {/* Counted, never asserted. */}
      <View style={{ marginTop: 12 }}>
        <Label size={10} tracking={0.12}>
          {alert.contactsTotal === 0
            ? strings.safety.noContacts.en
            : strings.safety.contactsReached(alert.contactsReached, alert.contactsTotal).en}
        </Label>
      </View>

      {/* Per-channel truth, including "we could not send this". */}
      {alert.dispatches
        .filter((d) => d.channel !== 'share_link')
        .map((d) => (
          <View
            key={`${d.channel}-${d.target}`}
            style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 8 }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                marginTop: 6,
                backgroundColor:
                  d.status === 'delivered' ? color.accent
                  : d.status === 'unavailable' ? color.neutral400
                  : color.neutral600,
              }}
            />
            <View style={{ flex: 1 }}>
              <Body size={13}>{d.targetLabel}</Body>
              {d.detail ? (
                <Label size={10} tracking={0} style={{ textTransform: 'none', marginTop: 2 }}>
                  {d.detail}
                </Label>
              ) : null}
            </View>
          </View>
        ))}

      {/* The channel that always works: their own messenger. */}
      <Button
        label={strings.safety.shareLink.en}
        bilingual
        thai={strings.safety.shareLink.th}
        chinese={strings.safety.shareLink.zh}
        onPress={onShare}
        height={48}
        style={{ marginTop: 16 }}
      />

      <Button
        label={strings.safety.cancelAlert.en}
        onPress={onCancel}
        variant="secondary"
        height={40}
        style={{ marginTop: 10 }}
      />

      {/* Never buried. */}
      <Body size={13} colour={color.accent700} style={{ marginTop: 14 }}>
        {strings.safety.cannotDispatch.en}
      </Body>
      <Thai always size={11} style={{ marginTop: 4 }}>{strings.safety.cannotDispatch.th}</Thai>
    </View>
  );
}

/**
 * The official numbers, always reachable.
 *
 * 1669 (EMS), 1155 (Tourist Police - English-speaking, 24h) and 191 (police)
 * are free to call in Thailand and work without airtime credit. They are shown
 * here because an app-mediated dispatch can fail - no signal, dead battery, our
 * own outage - and the user must never be left with only our button.
 */
function EmergencyNumbers({ at }: { at: { lat: number; lng: number } | null }) {
  const numbers = emergencyNear(at);
  const island = numbers.filter((n) => n.scope === 'island');

  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: 22, paddingBottom: 8 }}>
      <Heading size={17}>{t({ en: 'Local responders', th: 'หน่วยช่วยเหลือในพื้นที่', zh: '当地救援单位' })}</Heading>
      <Body size={13} colour={color.neutral600} style={{ marginTop: 4, marginBottom: 10 }}>{t({ en: 'Shown in nearest-first order when your SOS includes a location.', th: 'เมื่อ SOS มีตำแหน่ง ระบบจะแสดงหน่วยที่ใกล้ที่สุดก่อน', zh: '当 SOS 包含位置时，将优先显示最近的救援单位。' })}</Body>

      {/*
        The stations on the island, nearest first once we know where you are.
        A hotline dispatches; these are the people who actually arrive, and on
        Samui the difference is twenty minutes of road.
      */}
      {island.map((n) => (
        <Pressable
          key={n.key}
          onPress={() => void Linking.openURL(`tel:${n.dial}`)}
          accessibilityRole="button"
          accessibilityLabel={`${n.name.en}. ${n.name.th}. ${n.printed}`}
          style={[
            shadow.card,
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginTop: 8,
              paddingVertical: 13,
              paddingHorizontal: 14,
              backgroundColor: color.surface,
              borderWidth: 1,
              borderColor: '#DCEFF5',
              borderRadius: 16,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Heading size={14}>{n.name.en}</Heading>
            <Thai always size={10} style={{ marginTop: 2 }}>{n.name.th}</Thai>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {/* A phone number is a thing to tap, not a thing a host verified. */}
            <Heading size={13} colour={color.brand}>{n.printed}</Heading>
            {n.km !== null ? (
              <Label size={9} tracking={0.06} colour={color.neutral600}>
                {t({ en: `${n.km} km away`, th: `ห่าง ${n.km} กม.`, zh: `相距 ${n.km} km` })}
              </Label>
            ) : null}
          </View>
        </Pressable>
      ))}

      {/*
        Where the numbers came from, and when. They change.

        neutral600, not the neutral500 this started as: at 9px on the near-black
        ground that was about 4:1, under AA. This is the line that says whether
        the numbers above it can still be trusted, on the screen where trusting
        a stale number costs the most. It is small on purpose; it should not
        also be faint.
      */}
      <Label
        size={9}
        tracking={0.06}
        colour={color.neutral600}
        style={{ marginTop: 12, textTransform: 'none' }}
      >
        {t({
          en: `Official numbers, checked ${EMERGENCY_AS_OF}.`,
          th: `หมายเลขทางการ ตรวจสอบเมื่อ ${EMERGENCY_AS_OF}`,
          zh: `官方号码，核对于 ${EMERGENCY_AS_OF}。`,
        })}
      </Label>
    </View>
  );
}
