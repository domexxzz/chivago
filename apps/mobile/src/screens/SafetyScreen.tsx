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
import {
  EMERGENCY_AS_OF, emergencyNear, strings, type ShieldService,
} from '@chivago/core';
import type { SosAlertRecord } from '../api/client.ts';
import { SOS_RADIUS } from '@chivago/tokens';
import { api } from '../api/client.ts';
import { useAsync } from '../state/store.tsx';
import { color, gutter, layout, motion, onFill, radius } from '../theme/index.ts';
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
        <Label size={10} tracking={0.16} colour={onFill.text} style={{ opacity: 0.7 }}>
          {strings.safety.kicker.en}
        </Label>
        <Heading size={26} colour={onFill.text} tracking={-0.52} style={{ marginTop: 6 }}>
          {strings.safety.title.en}
        </Heading>
        <Thai always size={11} colour={onFill.text} style={{ opacity: 0.75, marginTop: 4 }}>
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
          backgroundColor: on ? color.brand : color.neutral400,
          borderRadius: radius.sm,
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
      <View style={{ alignItems: 'flex-end' }}>
        <Label size={10} tracking={0.12}>{strings.safety.states[service.state].en}</Label>
        <Thai always size={9}>{strings.safety.states[service.state].th}</Thai>
      </View>
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

  /**
   * Seconds left before the alert goes out, or null when nothing is counting.
   *
   * The hold proves intent. It does not prove the intent was right: a pocket
   * press and a real emergency clear 1200 ms identically. This is the window
   * to take it back, and it is the only thing standing between a false alarm
   * and a dispatch nobody asked for.
   */
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const countdownTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  /** The fix fetched during the countdown, so the wait buys something. */
  const fix = React.useRef<{ lat: number; lng: number } | null>(null);

  const clearTimers = React.useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (tickTimer.current) clearTimeout(tickTimer.current);
    holdTimer.current = null;
    tickTimer.current = null;
  }, []);

  const stopCountdown = React.useCallback(() => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    countdownTimer.current = null;
    fix.current = null;
    setCountdown(null);
  }, []);

  // A timer that outlives its screen would fire an alert nobody is looking at.
  React.useEffect(() => () => { clearTimers(); stopCountdown(); }, [clearTimers, stopCountdown]);

  // The expanding ring while an alert is live.
  React.useEffect(() => {
    if (!armed) { pulse.setValue(0); return; }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: motion.sosPulseMs, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [armed, pulse]);

  /**
   * Ask for a position while the countdown runs.
   *
   * Best-effort on purpose. An emergency must fire whether or not the fix
   * arrives - the server falls back to the last known area - so nothing here
   * is allowed to block or throw into the countdown.
   */
  const locate = async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      fix.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      // No fix. Fire without one rather than wait for one.
    }
  };

  const beginCountdown = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    void locate();
    const seconds = Math.round(motion.sosCountdownMs / 1000);
    setCountdown(seconds);
    let left = seconds;
    countdownTimer.current = setInterval(() => {
      left -= 1;
      if (left > 0) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCountdown(left);
        return;
      }
      // Read the fix before clearing, then fire with whatever we managed to get.
      const at = fix.current ?? undefined;
      stopCountdown();
      onFire(at);
    }, 1000);
  };

  const startHold = () => {
    if (armed || firing || countdown !== null) return;
    Animated.timing(hold, {
      toValue: 1,
      duration: motion.sosHoldMs,
      useNativeDriver: false,
    }).start();

    // A tick partway through, so the user feels the hold registering.
    tickTimer.current = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, motion.sosTickMs);

    holdTimer.current = setTimeout(beginCountdown, motion.sosHoldMs);
  };

  const endHold = () => {
    // Lifting a finger cancels the HOLD, never the countdown. Once the
    // countdown has started the alert is committed: somebody knocked over, or
    // dropping the phone, must not silently lose the help they just asked for.
    // It stops at the Stop control, deliberately, or it does not stop.
    if (countdown !== null) return;
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
              borderColor: color.accent2,
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
          disabled={armed || firing || countdown !== null}
          accessibilityRole="button"
          accessibilityLabel={
            armed
              ? `${strings.safety.sosArmed.en}. ${strings.safety.dispatchDetail.en}`
              : countdown !== null
                ? `SOS. ${strings.safety.sosSending(countdown).en}. ${strings.safety.sosStop.en} to take it back`
                : `SOS. ${strings.safety.sosIdle.en}, 1.2 seconds`
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
          {/* The progress fill the prototype has no equivalent of. */}
          {!armed ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: countdown !== null ? color.accent2 : color.coralSoft,
                height: hold.interpolate({ inputRange: [0, 1], outputRange: [0, 150] }),
              }}
            />
          ) : null}
          {/*
            While counting, the number IS the control's face. "SOS" is what you
            press; the seconds are what is happening, and nothing else in the
            circle should compete with them.
          */}
          <Heading
            size={countdown !== null ? 52 : 34}
            colour={countdown !== null ? onFill.accent2 : armed ? onFill.accent2 : color.coralDeep}
            tracking={countdown !== null ? -1 : 0.68}
          >
            {countdown !== null ? String(countdown) : 'SOS'}
          </Heading>
          <Label
            size={10}
            tracking={0.14}
            colour={countdown !== null || armed ? onFill.accent2 : color.coralDeep}
            style={{ marginTop: 4 }}
          >
            {countdown !== null
              ? strings.safety.sosSending(countdown).en
              : armed ? strings.safety.sosArmed.en : strings.safety.sosIdle.en}
          </Label>
        </Pressable>
      </View>

      {/*
        The way out. Full width and directly under the thumb, because a person
        who has just realised their pocket called an ambulance has about four
        seconds and no patience for a small target.
      */}
      {countdown !== null ? (
        <View style={{ marginTop: 16 }}>
          <Button
            label={strings.safety.sosStop.en}
            bilingual thai={strings.safety.sosStop.th}
            variant="secondary"
            height={56}
            onPress={stopCountdown}
            // Carries the countdown ring's coral, so the eye that is already
            // on the circle finds this without reading anything.
            style={{
              borderWidth: layout.ruleStrong,
              borderColor: color.accent2,
              backgroundColor: color.surface,
            }}
          />
          <Thai always size={10} colour={color.neutral600} style={{ marginTop: 8, textAlign: 'center' }}>
            {strings.safety.sosSending(countdown).th}
          </Thai>
        </View>
      ) : null}

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
        bilingual thai={strings.safety.shareLink.th}
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
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {national.map((n) => (
          <Pressable
            key={n.key}
            onPress={() => void Linking.openURL(`tel:${n.dial}`)}
            accessibilityRole="button"
            accessibilityLabel={`${n.name.en}. ${n.name.th}. ${n.printed}`}
            style={{
              width: '48%',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 14,
              borderWidth: layout.ruleStrong,
              borderColor: color.text,
              borderRadius: radius.sm,
            }}
          >
            <Phone size={16} color={color.text} strokeWidth={2} />
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
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginTop: 8,
            paddingVertical: 11,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: color.neutral400,
            borderRadius: radius.sm,
          }}
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
                {`${n.km} km away`}
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
        {`Official numbers, checked ${EMERGENCY_AS_OF}.`}
      </Label>
    </View>
  );
}
