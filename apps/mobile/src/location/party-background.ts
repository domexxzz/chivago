import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from '../api/client.ts';
import { loadDeviceKey } from '../api/account.ts';

export const PARTY_LOCATION_TASK = 'chivago-party-location';
const PARTY_USER_KEY = 'chivago.partyLocationUser';

async function sendLocation(userId: string, location: Location.LocationObject): Promise<'ok' | 'ended' | 'retry'> {
  try {
    const deviceKey = await loadDeviceKey();
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-chivago-user': userId };
    if (deviceKey) headers['x-chivago-device-key'] = deviceKey;
    const response = await fetch(`${API_BASE}/party/location`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        latitude: location.coords.latitude, longitude: location.coords.longitude,
        accuracy: location.coords.accuracy, heading: location.coords.heading, speed: location.coords.speed,
      }),
    });
    if (response.status === 404 || response.status === 409) return 'ended';
    return response.ok || response.status === 429 ? 'ok' : 'retry';
  } catch { return 'retry'; }
}

TaskManager.defineTask(PARTY_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;
  const userId = await SecureStore.getItemAsync(PARTY_USER_KEY).catch(() => null);
  if (!userId) { await stopPartyBackgroundLocation(); return; }
  const result = await sendLocation(userId, locations.at(-1)!);
  if (result === 'ended') await stopPartyBackgroundLocation();
});

export async function requestPartyBackgroundPermission(): Promise<'available' | 'denied' | 'unsupported'> {
  try {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) return 'denied';
    const background = await Location.requestBackgroundPermissionsAsync();
    return background.granted ? 'available' : 'denied';
  } catch { return 'unsupported'; }
}

export async function startPartyBackgroundLocation(userId: string): Promise<'active' | 'denied' | 'unsupported'> {
  try {
    const permission = await Location.getBackgroundPermissionsAsync();
    if (!permission.granted) return 'denied';
    await SecureStore.setItemAsync(PARTY_USER_KEY, userId);
    if (await Location.hasStartedLocationUpdatesAsync(PARTY_LOCATION_TASK)) return 'active';
    await Location.startLocationUpdatesAsync(PARTY_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15_000,
      distanceInterval: 15,
      deferredUpdatesInterval: 30_000,
      deferredUpdatesDistance: 30,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'ChivarGo Party location sharing',
        notificationBody: 'Your party can see your latest location. Turn it off from Party settings.',
        notificationColor: '#0089A7',
      },
    });
    return 'active';
  } catch { return 'unsupported'; }
}

export async function stopPartyBackgroundLocation(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(PARTY_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(PARTY_LOCATION_TASK);
    }
  } catch {}
  await SecureStore.deleteItemAsync(PARTY_USER_KEY).catch(() => undefined);
}
