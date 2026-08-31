/**
 * Expo native modules, which do not exist outside a device build.
 *
 * Enumerated rather than answered by a catch-all Proxy: an ES module namespace
 * is built by static analysis, so a Proxy is invisible to `import * as X`, and
 * a stub that silently answers undefined to an unexpected name moves the
 * failure somewhere far less obvious than a missing export.
 */
const noop = () => Promise.resolve(undefined);
export default noop;

/**
 * The few native answers a screen actually branches on.
 *
 * Shared object, mutated by a test and read at call time, because ES module
 * exports cannot be reassigned from outside. Defaults are the happy path -
 * permission granted, standing on Chaweng Beach - so a test only says
 * something when it wants the unhappy one.
 */
export const control = {
  permission: { granted: true, status: 'granted' },
  position: { coords: { latitude: 9.5357, longitude: 100.0617, accuracy: 12 } },
};

/** Put the defaults back. Call it in a finally, like restoring fetch. */
export const resetControl = () => {
  control.permission = { granted: true, status: 'granted' };
  control.position = { coords: { latitude: 9.5357, longitude: 100.0617, accuracy: 12 } };
};
export const setNotificationHandler = noop;
export const setNotificationChannelAsync = noop;
export const AndroidImportance = noop;
export const getPermissionsAsync = noop;
export const requestPermissionsAsync = async () => control.permission;
export const getExpoPushTokenAsync = noop;
export const addNotificationResponseReceivedListener = noop;
export const getLastNotificationResponseAsync = noop;
export const setBadgeCountAsync = noop;
export const requestForegroundPermissionsAsync = async () => control.permission;
export const requestBackgroundPermissionsAsync = async () => control.permission;
export const getCurrentPositionAsync = async () => control.position;
export const Accuracy = { Balanced: 3, High: 4, Lowest: 1 };
export const hasStartedLocationUpdatesAsync = noop;
export const startLocationUpdatesAsync = noop;
export const stopLocationUpdatesAsync = noop;
export const launchCameraAsync = noop;
export const launchImageLibraryAsync = noop;
export const requestCameraPermissionsAsync = async () => control.permission;
export const MediaTypeOptions = noop;
export const impactAsync = noop;
export const ImpactFeedbackStyle = noop;
export const notificationAsync = noop;
export const NotificationFeedbackType = noop;
export const getItemAsync = noop;
export const setItemAsync = noop;
export const deleteItemAsync = noop;
export const defineTask = noop;
export const isTaskRegisteredAsync = noop;
export const unregisterTaskAsync = noop;
export const useFonts = noop;
