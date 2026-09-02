/**
 * App state.
 *
 * The prototype holds everything in one component. Production splits it, per
 * the handoff: navigation, session/profile, wallet, quests, safety. This file
 * is the composition root; each slice is a plain hook so it can be tested and
 * replaced independently.
 *
 * WHAT LIVES WHERE
 *  - Navigation, toast, map layer filters: client state. Ephemeral or personal.
 *  - Points, quest stage, ledger, SOS: SERVER state, mirrored here for render.
 *    Never mutated locally to "look responsive" - a fake balance that later
 *    corrects itself is worse than a spinner.
 */

import React from 'react';
import { api, type InboxItem, type Result } from '../api/client.ts';
import { ensureAccount } from '../api/account.ts';
import {
  onNotificationTap, registerForPush, setBadge, unregisterPush, type DeepLink,
} from '../notifications/push.ts';
import {
  rememberIdentity, sendFixes, startBackgroundTracking, stopBackgroundTracking,
} from '../location/background.ts';
import { deviceUserId, setDeviceUser } from '../api/client.ts';
import { motion } from '../theme/index.ts';
import type { WellnessProfile } from '@chivago/core';
import { strings } from '@chivago/core';
import { Share } from 'react-native';
import * as Location from 'expo-location';
import type { SosAlertRecord } from '../api/client.ts';
import { EMPTY_PROFILE } from '@chivago/core';

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export type ScreenKey =
  | 'onboarding' | 'home' | 'map' | 'place' | 'quests' | 'quest'
  | 'wallet' | 'market' | 'impact' | 'safety' | 'trip' | 'concierge'
  | 'companion' | 'passport' | 'account' | 'party';

/**
 * Five tabs, and Impact is no longer one of them.
 *
 * Home had to go somewhere, and six tabs is one more than a 375px bar can
 * carry without the labels becoming decoration. Impact is the Chiva Balance -
 * a summary somebody checks, not a place they live - so it moved to a door on
 * Home, which is where summaries belong. Nothing about the screen changed and
 * it is one line to put back.
 */
export type TabKey = 'home' | 'map' | 'quests' | 'wallet' | 'safety';

interface NavState {
  screen: ScreenKey;
  stack: ScreenKey[];
  /** Route params, not state - they belong to the route, not the app. */
  placeId: string | null;
  questId: string | null;
}

export interface Nav extends NavState {
  /** Push onto the stack. Used by place / quest / market / trip. */
  push: (screen: ScreenKey, params?: { placeId?: string; questId?: string }) => void;
  /** Pop back. Falls back to the map if the stack is empty. */
  pop: () => void;
  /** A tab tap RESETS the stack, per the handoff. */
  selectTab: (tab: TabKey) => void;
  activeTab: TabKey;
}

const TAB_SCREENS: TabKey[] = ['home', 'map', 'quests', 'wallet', 'safety'];

/** Which tab should read as active while a pushed screen is on top. */
const OWNING_TAB: Record<ScreenKey, TabKey> = {
  onboarding: 'home', home: 'home', map: 'map', place: 'map', trip: 'map',
  // All three are reached from a door on Home, so Home stays lit behind them
  // and a tab tap returns there rather than stranding the reader on a screen
  // no tab owns. `impact` in particular has no tab of its own any more.
  concierge: 'home', impact: 'home', passport: 'home', party: 'home',
  quests: 'quests', quest: 'quests',
  wallet: 'wallet', market: 'wallet',
  // Both reached from the wallet, so its tab stays lit behind them.
  companion: 'wallet', account: 'wallet',
  safety: 'safety',
};

export function useNav(initial: ScreenKey = 'onboarding'): Nav {
  const [state, setState] = React.useState<NavState>({
    screen: initial, stack: [], placeId: null, questId: null,
  });

  const push = React.useCallback(
    (screen: ScreenKey, params?: { placeId?: string; questId?: string }) => {
      setState((s) => ({
        screen,
        stack: [...s.stack, s.screen],
        placeId: params?.placeId ?? s.placeId,
        questId: params?.questId ?? s.questId,
      }));
    },
    [],
  );

  const pop = React.useCallback(() => {
    setState((s) => ({
      ...s,
      screen: s.stack[s.stack.length - 1] ?? 'map',
      stack: s.stack.slice(0, -1),
    }));
  }, []);

  const selectTab = React.useCallback((tab: TabKey) => {
    setState((s) => ({ ...s, screen: tab, stack: [] }));
  }, []);

  return {
    ...state,
    push,
    pop,
    selectTab,
    activeTab: OWNING_TAB[state.screen] ?? 'map',
  };
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

export function useToast() {
  const [message, setMessage] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = React.useCallback((text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), motion.toastMs);
  }, []);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { message, show };
}

// ---------------------------------------------------------------------------
// Async data
// ---------------------------------------------------------------------------

export interface Async<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Load server data with an explicit error state.
 *
 * Deliberately has no "retry silently" behaviour: on a beach with one bar, a
 * silent retry loop drains the battery and the user never learns why the screen
 * is empty. Show the error, offer the retry.
 */
export function useAsync<T>(
  fetcher: () => Promise<Result<T>>,
  deps: React.DependencyList = [],
): Async<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetcher().then((res) => {
      if (cancelled) return;
      if (res.ok) { setData(res.data); setError(null); }
      else setError(res.error);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** Bump when the privacy notice changes - PDPA consent is version-specific. */
export const CONSENT_VERSION = '2026-08-01';

/**
 * Get this phone a key before anything else asks the server a question.
 *
 * Every other request carries the device key in a header, so it has to exist
 * first — a profile fetched before registration would go out unauthenticated
 * and, once the pilot's header path closes, come back 401.
 *
 * `ready` turns true even when registration FAILED, which is deliberate: an
 * offline first launch should get the app, not a sign-in wall it cannot pass.
 * The app runs signed-out and tries again next launch.
 */
export function useAccount() {
  const [ready, setReady] = React.useState(false);
  const [registered, setRegistered] = React.useState(false);

  React.useEffect(() => {
    void ensureAccount(api, { locale: 'en' }).then(async (res) => {
      // Learn who this key belongs to. The user id is what the background
      // task attributes fixes to and what `rememberIdentity` writes to disk;
      // before this was wired, `deviceUserId()` answered 'demo-user' for the
      // life of the app, on every phone.
      if (res.key) {
        const who = await api.account();
        if (who.ok) {
          setDeviceUser(who.data.userId);
          void rememberIdentity(who.data.userId);
        }
      }
      setRegistered(res.registered);
      setReady(true);
    });
  }, []);

  return { ready, registered };
}

/** `enabled` gates the first fetch on the account existing. */
export function useProfile(enabled = true) {
  const [profile, setProfile] = React.useState<WellnessProfile>(EMPTY_PROFILE);
  /**
   * Whether the server has answered yet.
   *
   * Without it there is no way to tell "this traveller has not onboarded" from
   * "we have not asked yet", and the app has to guess. It guessed onboarding,
   * every launch, for ever.
   */
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    void api.getProfile().then((res) => {
      if (res.ok) setProfile(res.data);
      // Loaded either way: a failed request must not hold the app on a
      // spinner. An offline traveller sees onboarding, which is wrong but
      // recoverable; a permanent splash is neither.
      setLoaded(true);
    });
  }, [enabled]);

  const save = React.useCallback(async (next: Partial<WellnessProfile>) => {
    // Optimistic locally - a wellness preference is not money, and the screen
    // must not stall on a slow link. The server remains authoritative.
    setProfile((p) => ({ ...p, ...next }));
    const res = await api.saveProfile({ ...next, consentVersion: CONSENT_VERSION });
    if (res.ok) setProfile(res.data);
    return res;
  }, []);

  return { profile, loaded, save };
}

// ---------------------------------------------------------------------------
// SOS - global, persistent
// ---------------------------------------------------------------------------

/**
 * A live alert follows the user everywhere and survives an app restart.
 *
 * The prototype clears `sosActive` on every navigation. In a real emergency
 * that silently cancels the UI for an alert that is still dispatching, so the
 * source of truth is the server and this polls it.
 */
export function useSos(onError: (message: string) => void) {
  const [alert, setAlert] = React.useState<SosAlertRecord | null>(null);
  const [firing, setFiring] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const res = await api.activeSos();
    if (res.ok) setAlert(res.data);
  }, []);

  // The background task runs outside React and may start in a fresh JS context
  // after the app was killed, so identity has to be on disk before it needs it.
  React.useEffect(() => { void rememberIdentity(deviceUserId()); }, []);

  /**
   * What the effects below key on.
   *
   * NOT the alert object. `refresh()` sets a fresh object on every poll, and
   * an effect keyed on the object is torn down and re-run on every one of
   * them - which turned the 20-second position stream into a tight loop that
   * posted a fix, refetched, and posted again with no pause, on the battery of
   * someone who needed it. The id and status are the two facts the effects
   * actually care about, and they only change when something happened.
   */
  const alertId = alert?.id ?? null;
  const alertStatus = alert?.status ?? null;
  const live = alertStatus === 'dispatching' || alertStatus === 'acknowledged';

  // Once, on mount: is there an alert already running from before?
  React.useEffect(() => { void refresh(); }, [refresh]);

  React.useEffect(() => {
    // Poll while an alert is live, so an operator picking it up reaches the
    // user without them touching anything. Idle polling is off - a battery
    // cost for nothing, and battery matters most in an emergency.
    if (!alertId) return;
    const id = setInterval(() => { void refresh(); }, 15_000);
    return () => clearInterval(id);
  }, [refresh, alertId]);

  /**
   * Background tracking follows the alert's life exactly.
   *
   * Started when one goes live, stopped when it ends - and stopped on mount
   * too, so a tracker left running by a crash or a force-quit does not outlive
   * the emergency it belonged to. That is a surveillance bug, not a feature.
   */
  React.useEffect(() => {
    if (live) {
      void startBackgroundTracking(deviceUserId());
    } else {
      void stopBackgroundTracking();
    }
  }, [live]);

  /**
   * Stream position while an alert runs.
   *
   * Someone in trouble may be walking to a road or on the back of a pickup. A
   * dispatch panel frozen at the firing point sends help to where they were.
   * 20s balances usefulness against draining the battery they may need.
   */
  React.useEffect(() => {
    if (!live) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        // Goes through the queueing sender, so a foreground fix taken with no
        // signal is held and flushed later rather than lost - the app is used
        // on beaches and in mangroves, which is where signal fails and where
        // someone needs finding.
        await sendFixes(deviceUserId(), [{
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy ?? null,
          recordedAt: new Date(pos.timestamp).toISOString(),
        }]);
        if (!cancelled) await refresh();
      } catch {
        // A missed position update is not worth an error to someone in an
        // emergency. The last known position stands.
      }
    };

    void tick();
    const id = setInterval(tick, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [live, alertId, refresh]);

  const fire = React.useCallback(
    async (pos?: { lat: number; lng: number }, note?: string) => {
      setFiring(true);
      const res = await api.fireSos(pos, note);
      setFiring(false);
      if (res.ok) setAlert(res.data);
      else onError(res.error);
      return res;
    },
    [onError],
  );

  const cancel = React.useCallback(async () => {
    const res = await api.cancelSos();
    if (res.ok) setAlert(null);
    else onError(res.error);
  }, [onError]);

  /**
   * Hand the live link to the OS share sheet.
   *
   * THE CHANNEL THAT ACTUALLY WORKS. No SMS provider, no account on the other
   * end - the user sends it through LINE, WhatsApp or a text from their own
   * phone, and in Thailand that reaches further than anything we could buy.
   */
  const shareLink = React.useCallback(async () => {
    if (!alert?.shareUrl) return;
    try {
      await Share.share({
        message: `${strings.safety.shareMessage.en}
${alert.shareUrl}`,
        url: alert.shareUrl,
      });
    } catch {
      onError(strings.safety.shareFailed.en);
    }
  }, [alert, onError]);

  return { alert, firing, fire, cancel, refresh, shareLink };
}

// ---------------------------------------------------------------------------
// Map layer filters - local, personal
// ---------------------------------------------------------------------------

export type LayerKey = 'Green' | 'Wellness' | 'Food' | 'Safe' | 'Quest';

export function useLayers() {
  const [layers, setLayers] = React.useState<Record<LayerKey, boolean>>({
    Green: true, Wellness: true, Food: true, Safe: true, Quest: true,
  });
  const toggle = React.useCallback((key: LayerKey) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  }, []);
  return { layers, toggle };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * The inbox, push registration, and deep-link routing.
 *
 * The inbox is the source of truth, not the push. A push can be denied,
 * expired, or arrive while the phone is in a bag for a day; the inbox is
 * fetched on launch and after every decision, so the news reaches the user
 * either way.
 */
export function useNotifications(onOpen: (link: DeepLink) => void) {
  const [items, setItems] = React.useState<InboxItem[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [pushGranted, setPushGranted] = React.useState<boolean | null>(null);
  const tokenRef = React.useRef<string | null>(null);

  const refresh = React.useCallback(async () => {
    const res = await api.notifications();
    if (!res.ok) return;
    setItems(res.data.items);
    setUnread(res.data.unread);
    void setBadge(res.data.unread);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Registration is deferred until AFTER onboarding.
   *
   * Asking for notification permission on first launch, before the user knows
   * what the app does, is how you get a permanent no - and the OS only lets you
   * ask once.
   */
  const enablePush = React.useCallback(async (locale: 'th' | 'en') => {
    const result = await registerForPush(locale);
    setPushGranted(result.granted);
    tokenRef.current = result.token;
    return result;
  }, []);

  const disablePush = React.useCallback(async () => {
    if (tokenRef.current) await unregisterPush(tokenRef.current);
    setPushGranted(false);
  }, []);

  // Taps, including the cold start that launched the app.
  React.useEffect(() => {
    return onNotificationTap((link) => {
      if (link.notificationId) void api.markNotificationRead(link.notificationId);
      onOpen(link);
      void refresh();
    });
  }, [onOpen, refresh]);

  const markRead = React.useCallback(async (id: string) => {
    // Optimistic: the badge should drop the instant it is tapped.
    setItems((list) => list.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread((n) => Math.max(0, n - 1));
    const res = await api.markNotificationRead(id);
    if (res.ok) { setUnread(res.data.unread); void setBadge(res.data.unread); }
  }, []);

  const markAllRead = React.useCallback(async () => {
    setItems((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
    void setBadge(0);
    await api.markAllNotificationsRead();
  }, []);

  return { items, unread, pushGranted, refresh, enablePush, disablePush, markRead, markAllRead };
}
