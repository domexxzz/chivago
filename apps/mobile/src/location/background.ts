/**
 * Background location during a live SOS alert.
 *
 * WHAT THIS IS FOR, AND ITS ONE JUSTIFICATION
 * Position updates stop the moment the app is backgrounded, which is exactly
 * what happens when someone puts their phone in a pocket to deal with an
 * emergency. Without this, the trail on the duty desk freezes at the moment
 * they stopped looking at the screen.
 *
 * THIS RUNS ONLY WHILE AN ALERT IS LIVE. Never at any other time. That is not a
 * courtesy - it is the only justification that survives App Review, and the
 * only one that is honest to the user.
 *
 * CANNOT BE TESTED IN EXPO GO. Background location needs a development build.
 * Everything here degrades to a no-op when the capability is absent, so the app
 * still runs, and `backgroundAvailability()` reports why.
 *
 * PDPA + platform notes:
 *  - Android shows a persistent notification while this runs. That is required,
 *    and it is also correct: the user should be able to see that tracking is on.
 *  - The task is stopped on resolve, on cancel, and on app start if no alert is
 *    live. A tracker that outlives its emergency is a surveillance bug.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from '../api/client.ts';
import { loadDeviceKey } from '../api/account.ts';

export const SOS_LOCATION_TASK = 'chivago-sos-location';

/**
 * The task runs outside React and may be started by the OS after the app was
 * killed, so module state is not reliable. Identity is read from secure
 * storage instead.
 */
const USER_KEY = 'chivago.userId';
const QUEUE_KEY = 'chivago.sosQueue';

export async function rememberIdentity(userId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(USER_KEY, userId);
  } catch {
    // A device without a keystore still works in the foreground.
  }
}

const readIdentity = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(USER_KEY);
  } catch {
    return null;
  }
};

interface QueuedFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  recordedAt: string;
}

/**
 * Fixes recorded while offline.
 *
 * Beach and mangrove sites are exactly where signal fails and exactly where
 * someone needs finding. A dropped fix is a gap in the trail, so they are held
 * and flushed as a batch when the connection returns.
 *
 * Capped: an emergency that runs for hours on a dead connection must not fill
 * the device. The OLDEST are dropped, because the newest points are the ones
 * that say where the person is now.
 */
const MAX_QUEUE = 120;

async function readQueue(): Promise<QueuedFix[]> {
  try {
    const raw = await SecureStore.getItemAsync(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedFix[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(fixes: QueuedFix[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(fixes.slice(-MAX_QUEUE)));
  } catch {
    // Nothing useful to do; the next fix will try again.
  }
}

export const clearQueue = (): Promise<void> => writeQueue([]);

/**
 * Send fixes, queueing whatever fails.
 *
 * Exported so the foreground path can share it: the offline problem is the
 * same whether the app is open or not.
 */
export async function sendFixes(userId: string, fresh: QueuedFix[]): Promise<boolean> {
  const queued = await readQueue();
  const all = [...queued, ...fresh];
  if (all.length === 0) return true;

  try {
    // The device key, not just the user header. The server refuses the bare
    // header the moment any account exists - which every phone running this
    // app has, because it registers on first launch. Without the key every
    // fix sent during an emergency came back 401 and the desk saw only the
    // point where the button was pressed. Read fresh, because this may run in
    // a JS context the app never initialised.
    const key = await loadDeviceKey();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-chivago-user': userId,
    };
    if (key) headers['x-chivago-device-key'] = key;

    const res = await fetch(`${API_BASE}/sos/position`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fixes: all.map((f) => ({
          lat: f.lat,
          lng: f.lng,
          accuracyM: f.accuracyM,
          recordedAt: f.recordedAt,
          // Anything that sat in the queue is genuinely old and must not be
          // read as current on the desk.
          source: queued.includes(f) ? 'queued' : 'background',
        })),
      }),
    });
    if (!res.ok) {
      // 404 means the alert ended while we were offline. Drop the queue rather
      // than retrying forever against an alert that no longer exists.
      if (res.status === 404) await clearQueue();
      else await writeQueue(all);
      return false;
    }
    await clearQueue();
    return true;
  } catch {
    await writeQueue(all);
    return false;
  }
}

/**
 * The background task.
 *
 * Defined at module scope, as TaskManager requires: the OS may start the task
 * in a fresh JS context after the app was killed, and a task registered inside
 * a component would not exist.
 */
TaskManager.defineTask(SOS_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;

  const userId = await readIdentity();
  if (!userId) {
    // No identity means we cannot attribute the fix. Stop rather than
    // collecting location we can do nothing with.
    await stopBackgroundTracking();
    return;
  }

  await sendFixes(
    userId,
    locations.map((l) => ({
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      accuracyM: l.coords.accuracy ?? null,
      recordedAt: new Date(l.timestamp).toISOString(),
    })),
  );
});

export type BackgroundAvailability =
  | 'available'
  /** Granted and running. */
  | 'active'
  /** The user has not been asked, or said no. */
  | 'denied'
  /** Expo Go or a simulator: the native module is not present. */
  | 'unsupported';

/**
 * Can this build do background location at all?
 *
 * Expo Go cannot. Reporting that honestly matters, because the safety screen
 * must not offer a toggle that silently does nothing.
 */
export async function backgroundAvailability(): Promise<BackgroundAvailability> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(SOS_LOCATION_TASK);
    if (started) return 'active';
    const perm = await Location.getBackgroundPermissionsAsync();
    return perm.granted ? 'available' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * Ask for background permission.
 *
 * Asked from the SAFETY SCREEN, ahead of time, never during an emergency and
 * never at onboarding:
 *  - iOS requires "When In Use" before "Always", and shows its own upgrade
 *    prompt. Asking cold at first launch gets a permanent no.
 *  - Asking mid-emergency requires taps from someone who has other problems.
 *
 * The screen explains what it is for before this is called. A permission dialog
 * with no context is a permission dialog that gets declined.
 */
export async function requestBackgroundPermission(): Promise<BackgroundAvailability> {
  try {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) return 'denied';
    const background = await Location.requestBackgroundPermissionsAsync();
    return background.granted ? 'available' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * Start tracking. Called ONLY when an alert goes live.
 *
 * The accuracy and interval are deliberately not the highest available: in an
 * emergency the battery is part of the lifeline, and a phone that dies at 40%
 * accuracy is worse than one that survives at 60 m.
 */
export async function startBackgroundTracking(userId: string): Promise<BackgroundAvailability> {
  try {
    const perm = await Location.getBackgroundPermissionsAsync();
    if (!perm.granted) return 'denied';

    await rememberIdentity(userId);
    if (await Location.hasStartedLocationUpdatesAsync(SOS_LOCATION_TASK)) return 'active';

    await Location.startLocationUpdatesAsync(SOS_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30_000,
      distanceInterval: 25,
      // Batch on iOS so the radio wakes less often. A slightly later fix costs
      // little; a flat battery costs everything.
      deferredUpdatesInterval: 60_000,
      deferredUpdatesDistance: 50,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        // Required on Android, and correct regardless: the user should be able
        // to see that tracking is on, and stop it.
        notificationTitle: 'ChivaGo SOS active',
        notificationBody: 'Sharing your location until the alert ends',
        notificationColor: '#ec3013',
      },
    });
    return 'active';
  } catch {
    // Expo Go, a simulator, or a missing plugin.
    return 'unsupported';
  }
}

/**
 * Stop tracking.
 *
 * Called on resolve, on cancel, and on app start when no alert is live. A
 * tracker that outlives its emergency is a surveillance bug, not a feature, so
 * this is deliberately called more often than strictly necessary.
 */
export async function stopBackgroundTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(SOS_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(SOS_LOCATION_TASK);
    }
  } catch {
    // Nothing registered. Fine.
  }
  await clearQueue();
}
