/**
 * Push registration and handling.
 *
 * WHAT THIS IS FOR
 * Host verification can take up to 24 hours. Without a push, a volunteer who
 * cleaned a beach in the morning finds out they were paid only if they happen
 * to reopen the app. That gap is what makes the points feel imaginary.
 *
 * PDPA: the OS permission prompt IS the consent step, and the token is only
 * sent to the server after it is granted. Declining is a normal outcome, not an
 * error - the in-app inbox carries the same news either way.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from '../api/client.ts';

/**
 * Foreground behaviour.
 *
 * A banner still shows while the app is open. The alternative - suppressing it
 * because "they can see the screen" - means someone browsing the map misses the
 * approval they have been waiting for.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface PushRegistration {
  granted: boolean;
  token: string | null;
  /** Why registration did not happen, for the settings screen to explain. */
  reason: 'ok' | 'denied' | 'simulator' | 'unavailable';
}

/**
 * Ask for permission and register the device.
 *
 * Never throws. Push is an enhancement; the app works without it, and a
 * volunteer on a borrowed phone that cannot register must not see a crash.
 */
export async function registerForPush(locale: 'th' | 'en'): Promise<PushRegistration> {
  try {
    // A simulator cannot receive a push, and asking there produces a confusing
    // prompt during development.
    if (!Device.isDevice) {
      return { granted: false, token: null, reason: 'simulator' };
    }

    if (Platform.OS === 'android') {
      // Android 8+ requires a channel before anything is delivered.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'ChivaGo',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    // Only prompt if we have not already been answered. Re-prompting a user who
    // said no is both useless (the OS will not show it) and rude.
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') {
      return { granted: false, token: null, reason: 'denied' };
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await api.registerDevice({ token, locale, platform: Platform.OS });
    return { granted: true, token, reason: 'ok' };
  } catch {
    // A missing projectId in a bare build, a network failure at startup - none
    // of it should stop the app opening.
    return { granted: false, token: null, reason: 'unavailable' };
  }
}

/** Revoke. The inbox keeps working; only the push stops. */
export async function unregisterPush(token: string): Promise<void> {
  await api.unregisterDevice(token);
}

export interface DeepLink {
  screen: 'quest' | 'wallet' | 'map';
  questId?: string;
  notificationId?: string;
}

/** Read the deep link out of a notification payload, defensively. */
export function parseDeepLink(data: unknown): DeepLink | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const screen = d.screen;
  if (screen !== 'quest' && screen !== 'wallet' && screen !== 'map') return null;
  return {
    screen,
    questId: typeof d.questId === 'string' ? d.questId : undefined,
    notificationId: typeof d.notificationId === 'string' ? d.notificationId : undefined,
  };
}

/**
 * Subscribe to taps.
 *
 * Covers both cases: the app was already running, and the app was launched
 * cold BY the notification. Missing the second is the classic bug - the user
 * taps "Quest verified", the app opens on the map, and the news is lost.
 */
/**
 * Whether the cold-start notification has already been consumed.
 *
 * Module scope, so it survives the effect re-subscribing. Without it, any
 * re-render that re-runs the subscription replays the notification that
 * launched the app — navigating the user away from wherever they had got to,
 * over and over, for a tap they made once.
 */
let coldStartHandled = false;

export function onNotificationTap(handler: (link: DeepLink) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const link = parseDeepLink(response.notification.request.content.data);
    if (link) handler(link);
  });

  // Cold start: the app was launched BY a notification.
  //
  // `void` silences the floating-promise lint and catches nothing. On web, and
  // anywhere the native module is missing, this rejects with ERR_UNAVAILABLE —
  // an unhandled rejection on every subscribe, which is noise at best and a
  // wedged renderer at worst. `setBadge` below already degrades quietly for
  // exactly this reason; this did not.
  if (!coldStartHandled) {
    coldStartHandled = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const link = parseDeepLink(response.notification.request.content.data);
        if (link) handler(link);
      })
      .catch(() => {
        // No notifications module here — web, or a build without it. The app
        // works; it simply cannot have been launched by a tap.
      });
  }

  return () => subscription.remove();
}

/** Keep the OS badge in step with the unread count. */
export async function setBadge(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Unsupported on some Android launchers. Not worth surfacing.
  }
}
