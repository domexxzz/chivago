/** Safety services and a local-only SOS confirmation demo. */

import React from 'react';
import { Animated, Image, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Phone } from 'lucide-react-native';
import chivagoLogo from '../../assets/chivago-logo.png';
import {
  EMERGENCY_AS_OF, emergencyNear, greetingFor, strings, type ShieldService,
} from '@chivago/core';
import type { SosAlertRecord } from '../api/client.ts';
import { SOS_RADIUS } from '@chivago/tokens';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, motion, onFill, radius, shadow } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { OceanBackdrop } from '../components/Shell.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';
// This screen prints both languages wherever a responder may read the screen,
// so it reaches for `.en`/`.th` directly. `t` is here for the few strings that
// are the TRAVELLER's alone - the spoken labels and the footnotes.
import { t } from '../i18n/locale.ts';
import { ProfileButton } from '../components/ProfileButton.tsx';

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
          paddingTop: 20,
          paddingBottom: 20,
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
        <OceanBackdrop compact />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#D5F6FF', fontSize: 12, fontWeight: '500', letterSpacing: 1.8, textTransform: 'uppercase' }}>
              {t(greetingFor(new Date()))}
            </Text>
            <Heading size={28} colour="#FFFFFF" style={{ marginTop: 4, fontWeight: '800' }}>
              {t(strings.tabs.safety)}
            </Heading>
            <View style={{ marginTop: 4 }}>
              <Label size={11} tracking={0.12} colour="#E2F6FC">
                {`${t(strings.safety.kicker)} · ${t(strings.safety.title)}`}
              </Label>
              <Text style={{ color: '#E8FBFF', fontSize: 11, opacity: 0.9, marginTop: 2 }}>
                {t(strings.safety.subtitle)}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image
              source={chivagoLogo}
              resizeMode="contain"
              accessibilityLabel="ChivaGo"
              style={{ width: 68, height: 48 }}
            />
            <ProfileButton onPress={onOpenProfile} />
          </View>
        </View>
      </View>

      {shield.loading ? <LoadingState /> : null}
      {shield.error ? <ErrorState message={shield.error} onRetry={shield.reload} /> : null}
      {shield.data?.map((service) => <ServiceRow key={service.key} service={service} />)}

      <SosSection
        alert={alert}
        onCancel={onCancel}
        onShare={onShare}
      />
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
  const dialogVisible = countdown !== null || demoTriggered;

  React.useEffect(() => {
    if (countdown === null) return;
    const timer = setTimeout(() => {
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
    setDemoTriggered(false);
    setCountdown(5);
  };
  const cancelDemo = () => {
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
          marginBottom: 20,
          padding: 20,
          backgroundColor: color.surface,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: '#DCEFF5',
          overflow: 'hidden',
        },
      ]}
    >
      <OceanBackdrop subtle />
      <Label size={10} tracking={0.16}>
        {`${strings.safety.emergency.en} · ${strings.safety.emergency.th}`}
      </Label>

      <View style={{ alignItems: 'center', marginTop: 20 }}>
        {armed ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 150,
              height: 150,
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
              : t({ en: 'Open SOS confirmation', th: 'เปิดหน้าต่างยืนยัน SOS', zh: '打开 SOS 确认' })
          }
          style={{
            width: 150,
            height: 150,
            borderRadius: SOS_RADIUS,
            borderWidth: 3,
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
            borderColor: color.accent2,
            backgroundColor: armed ? color.accent2 : color.bg,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Heading size={34} colour={armed ? onFill.accent2 : color.coralDeep} tracking={0.68}>SOS</Heading>
          <Label
            size={10}
            tracking={0.14}
            colour={armed ? onFill.accent2 : color.coralDeep}
            style={{ marginTop: 4 }}
          >
            {armed ? strings.safety.sosArmed.en : t({ en: 'Tap to start', th: 'แตะเพื่อเริ่ม', zh: '点击开始' })}
          </Label>
        </Pressable>
      </View>

      {alert ? <DispatchPanel alert={alert} onCancel={onCancel} onShare={onShare} /> : null}

      <Modal visible={dialogVisible} transparent animationType="fade" onRequestClose={cancelDemo}>
        <View style={{ flex: 1, backgroundColor: 'rgba(3, 24, 44, 0.58)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 360, borderRadius: 24, padding: 24, backgroundColor: '#fff', alignItems: 'center', borderWidth: 2, borderColor: color.accent2 }}>
            <Heading size={22} colour={color.coralDeep}>{demoTriggered ? t({ en: 'SOS activated', th: 'เปิดสัญญาณ SOS แล้ว', zh: 'SOS 已启动' }) : t({ en: 'Start SOS?', th: 'เริ่ม SOS หรือไม่?', zh: '启动 SOS？' })}</Heading>
            {demoTriggered ? <>
              <Body size={14} colour={color.neutral700} style={{ textAlign: 'center', marginTop: 12 }}>{t({ en: 'Demo only. No real SOS or emergency notification was sent.', th: 'โหมดทดลอง ไม่มีการส่ง SOS จริงหรือแจ้งหน่วยฉุกเฉิน', zh: '仅为演示，未发送真实 SOS 或紧急通知。' })}</Body>
              <Button label={t({ en: 'Close', th: 'ปิด', zh: '关闭' })} onPress={cancelDemo} height={48} style={{ alignSelf: 'stretch', marginTop: 18 }} />
            </> : <>
              <Text style={{ fontSize: 64, lineHeight: 78, fontWeight: '800', color: color.coralDeep, marginTop: 10 }}>{countdown}</Text>
              <Body size={14} colour={color.neutral700} style={{ textAlign: 'center', marginTop: 2 }}>{t({ en: 'SOS starts when the countdown ends.', th: 'ระบบจะแสดง SOS เมื่อหมดเวลา', zh: '倒计时结束后将启动 SOS。' })}</Body>
              <Button label={strings.safety.sosStop.en} bilingual thai={strings.safety.sosStop.th} onPress={cancelDemo} variant="secondary" height={52} style={{ alignSelf: 'stretch', marginTop: 18, borderWidth: layout.ruleStrong, borderColor: color.accent2 }} />
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
  const national = numbers.filter((n) => n.scope === 'national');
  const island = numbers.filter((n) => n.scope === 'island');

  return (
    <View style={{ paddingHorizontal: gutter, paddingBottom: 8 }}>
      <Label size={10} tracking={0.14}>
        {`${strings.safety.callDirect.en} · ${strings.safety.callDirect.th}`}
      </Label>

      {/*
        The national lines: free, no credit needed, answered anywhere.

        Two by two, not four across. Four across gives each button 82px on a
        390px phone and 65px on an SE, which wraps three of the four labels
        and turns the row into a puzzle on the one screen where reading speed
        is the whole point. Two by two gives each 170px and one clean line.
      */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        {national.map((n) => (
          <Pressable
            key={n.key}
            onPress={() => void Linking.openURL(`tel:${n.dial}`)}
            accessibilityRole="button"
            accessibilityLabel={`${n.name.en}. ${n.name.th}. ${n.printed}`}
            style={[
              shadow.card,
              {
                width: '48%',
                flexGrow: 1,
                alignItems: 'center',
                gap: 6,
                paddingVertical: 14,
                backgroundColor: color.surface,
                borderWidth: 1,
                borderColor: '#DCEFF5',
                borderRadius: 18,
              },
            ]}
          >
            <View
              style={{
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: color.brandSoft,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Phone size={16} color={color.brand} strokeWidth={2} />
            </View>
            <Heading size={16}>{n.dial}</Heading>
            <Label size={9} tracking={0.06} style={{ textAlign: 'center' }}>
              {n.name.en}
            </Label>
            <Thai always size={9} style={{ textAlign: 'center' }}>{n.name.th}</Thai>
          </Pressable>
        ))}
      </View>

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
