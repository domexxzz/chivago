/**
 * Security Shield / SOS.
 *
 * FOUR THINGS THE DESIGN ASKS FOR AND THE PROTOTYPE DOES NOT HAVE:
 *  1. A visible ring-fill during the 1200 ms hold. Without it the user has no
 *     idea whether the press registered, which in an emergency is the whole
 *     interaction.
 *  2. Haptics - a tick at 600 ms, a heavy impact on fire.
 *  3. Persistence. A fired alert lives on the server, so it survives
 *     navigation, backgrounding and a reinstall. The prototype clears it on
 *     navigate, which would silently drop a real emergency.
 *  4. The official Thai emergency numbers, shown alongside. ChivaGo dispatch
 *     runs WITH 1669 / 1155, never instead of them. A tourist safety product
 *     that hides the national ambulance number is doing harm.
 */

import React from 'react';
import { Animated, Linking, Pressable, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Phone } from 'lucide-react-native';
import { strings, type ShieldService } from '@chivago/core';
import type { SosAlertRecord } from '../api/client.ts';
import { SOS_RADIUS } from '@chivago/tokens';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, motion, radius } from '../theme/index.ts';
import { Body, Heading, Label, Thai } from '../components/Type.tsx';
import { Button } from '../components/Button.tsx';
import { ErrorState, LoadingState } from '../components/States.tsx';

export function SafetyScreen({
  alert, onFire, onCancel, onShare, firing,
}: {
  alert: SosAlertRecord | null;
  onFire: (pos?: { lat: number; lng: number }) => void;
  onCancel: () => void;
  onShare: () => void;
  firing: boolean;
}) {
  const shield = useAsync(() => api.shield(), []);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* The design's only inverted header - it carries the mode change. */}
      <View style={{ backgroundColor: color.text, paddingHorizontal: gutter, paddingVertical: 18 }}>
        <Label size={10} tracking={0.16} colour={color.bg} style={{ opacity: 0.7 }}>
          {strings.safety.kicker.en}
        </Label>
        <Heading size={26} colour={color.bg} tracking={-0.52} style={{ marginTop: 6 }}>
          {strings.safety.title.en}
        </Heading>
        <Thai size={11} colour={color.bg} style={{ opacity: 0.75, marginTop: 4 }}>
          {strings.safety.subtitle.th}
        </Thai>
      </View>

      {shield.loading ? <LoadingState /> : null}
      {shield.error ? <ErrorState message={shield.error} onRetry={shield.reload} /> : null}
      {shield.data?.map((service) => <ServiceRow key={service.key} service={service} />)}

      <SosSection
        alert={alert}
        onFire={onFire}
        onCancel={onCancel}
        onShare={onShare}
        firing={firing}
      />
      <EmergencyNumbers />

      <View
        style={{
          paddingHorizontal: gutter,
          paddingVertical: 16,
          borderTopWidth: 1,
          borderTopColor: color.neutral300,
        }}
      >
        <Body size={13} colour={color.neutral700}>{strings.safety.antiScamFooter.en}</Body>
        <Thai size={11} style={{ marginTop: 6 }}>{strings.safety.antiScamFooter.th}</Thai>
      </View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function ServiceRow({ service }: { service: ShieldService }) {
  const on = service.state === 'on';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: gutter,
        borderBottomWidth: 1,
        borderBottomColor: color.neutral300,
      }}
    >
      <View
        style={{
          width: 10,
          height: 10,
          backgroundColor: on ? color.accent : color.neutral400,
          borderRadius: radius.sm,
        }}
      />
      <View style={{ flex: 1 }}>
        <Heading size={15}>{service.label.en}</Heading>
        <Label size={11} tracking={0} style={{ textTransform: 'none', marginTop: 2 }}>
          {service.note.en}
        </Label>
      </View>
      <Label size={10} tracking={0.12}>{strings.safety.states[service.state].en}</Label>
    </View>
  );
}

/**
 * The SOS control.
 *
 * Press and hold for 1200 ms. Release early cancels. The circle is the ONE
 * permitted radius exception in the whole system, because it must read as a
 * physical emergency control rather than a UI element.
 */
function SosSection({
  alert, onFire, onCancel, onShare, firing,
}: {
  alert: SosAlertRecord | null;
  onFire: (pos?: { lat: number; lng: number }) => void;
  onCancel: () => void;
  onShare: () => void;
  firing: boolean;
}) {
  const armed = alert !== null;
  const hold = React.useRef(new Animated.Value(0)).current;
  const pulse = React.useRef(new Animated.Value(0)).current;
  const holdTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = React.useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (tickTimer.current) clearTimeout(tickTimer.current);
    holdTimer.current = null;
    tickTimer.current = null;
  }, []);

  React.useEffect(() => () => clearTimers(), [clearTimers]);

  // The expanding ring while an alert is live.
  React.useEffect(() => {
    if (!armed) { pulse.setValue(0); return; }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: motion.sosPulseMs, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [armed, pulse]);

  const startHold = () => {
    if (armed || firing) return;
    Animated.timing(hold, {
      toValue: 1,
      duration: motion.sosHoldMs,
      useNativeDriver: false,
    }).start();

    // A tick partway through, so the user feels the hold registering.
    tickTimer.current = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, motion.sosTickMs);

    holdTimer.current = setTimeout(async () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      // Best-effort location: an emergency must fire whether or not the fix
      // arrives. The server falls back to the last known area.
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted) {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          onFire({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          return;
        }
      } catch {
        // Fall through and fire without a fix rather than blocking.
      }
      onFire();
    }, motion.sosHoldMs);
  };

  const endHold = () => {
    clearTimers();
    Animated.timing(hold, { toValue: 0, duration: 160, useNativeDriver: false }).start();
  };

  return (
    <View style={{ paddingHorizontal: gutter, paddingVertical: 24 }}>
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
              borderColor: color.accent,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) },
              ],
            }}
          />
        ) : null}

        <Pressable
          onPressIn={startHold}
          onPressOut={endHold}
          disabled={armed || firing}
          accessibilityRole="button"
          accessibilityLabel={
            armed
              ? `${strings.safety.sosArmed.en}. ${strings.safety.dispatchDetail.en}`
              : `SOS. ${strings.safety.sosIdle.en}, 1.2 seconds`
          }
          style={{
            width: 150,
            height: 150,
            borderRadius: SOS_RADIUS,
            borderWidth: 3,
            borderColor: color.accent,
            backgroundColor: armed ? color.accent : color.bg,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* The progress fill the prototype has no equivalent of. */}
          {!armed ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: color.accent200,
                height: hold.interpolate({ inputRange: [0, 1], outputRange: [0, 150] }),
              }}
            />
          ) : null}
          <Heading size={34} colour={armed ? color.bg : color.accent700} tracking={0.68}>SOS</Heading>
          <Label
            size={10}
            tracking={0.14}
            colour={armed ? color.bg : color.accent700}
            style={{ marginTop: 4 }}
          >
            {armed ? strings.safety.sosArmed.en : strings.safety.sosIdle.en}
          </Label>
        </Pressable>
      </View>

      {alert ? <DispatchPanel alert={alert} onCancel={onCancel} onShare={onShare} /> : null}
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
        borderColor: color.accent,
        borderRadius: radius.md,
        padding: 16,
        marginTop: 20,
      }}
    >
      <Heading size={15} colour={color.accent700}>
        {strings.safety.dispatching(alert.locationLabel).en}
      </Heading>
      <Thai size={11} style={{ marginTop: 2 }}>
        {strings.safety.dispatching(alert.locationLabel).th}
      </Thai>

      {/* Whether a named human has it. Until then, say so plainly. */}
      <View style={{ marginTop: 14 }}>
        <Label size={10} tracking={0.12} colour={acknowledged ? color.accent700 : color.neutral700}>
          {acknowledged
            ? strings.safety.acknowledgedBy(alert.acknowledgedBy!).en
            : strings.safety.notAcknowledged.en}
        </Label>
        <Thai size={11} style={{ marginTop: 2 }}>
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
        thai={strings.safety.shareLink.th}
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
      <Thai size={11} style={{ marginTop: 4 }}>{strings.safety.cannotDispatch.th}</Thai>
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
function EmergencyNumbers() {
  const numbers: { dial: string; en: string; th: string }[] = [
    { dial: '1669', en: strings.safety.numbers.ems.en, th: strings.safety.numbers.ems.th },
    { dial: '1155', en: strings.safety.numbers.touristPolice.en, th: strings.safety.numbers.touristPolice.th },
    { dial: '191', en: strings.safety.numbers.police.en, th: strings.safety.numbers.police.th },
  ];
  return (
    <View style={{ paddingHorizontal: gutter, paddingBottom: 8 }}>
      <Label size={10} tracking={0.14}>
        {`${strings.safety.callDirect.en} · ${strings.safety.callDirect.th}`}
      </Label>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {numbers.map((n) => (
          <Pressable
            key={n.dial}
            onPress={() => void Linking.openURL(`tel:${n.dial}`)}
            accessibilityRole="button"
            accessibilityLabel={`${n.en}. ${n.th}`}
            style={{
              flex: 1,
              alignItems: 'center',
              gap: 6,
              paddingVertical: 12,
              borderWidth: layout.ruleStrong,
              borderColor: color.text,
              borderRadius: radius.sm,
            }}
          >
            <Phone size={16} color={color.text} strokeWidth={2} />
            <Heading size={16}>{n.dial}</Heading>
            <Label size={9} tracking={0.06} style={{ textAlign: 'center' }}>
              {n.en.split(' · ')[0]}
            </Label>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
