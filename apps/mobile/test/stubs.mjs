/** Which specifiers are replaced, and by which stub file. */

const STUBS = new Map([
  ['lucide-react-native', './stubs/icons.mjs'],
  ['react-native-svg', './stubs/views.mjs'],
  ['react-native-safe-area-context', './stubs/views.mjs'],
  ['expo-location', './stubs/native.mjs'],
  ['expo-image-picker', './stubs/native.mjs'],
  ['expo-haptics', './stubs/native.mjs'],
  ['expo-notifications', './stubs/native.mjs'],
  ['expo-secure-store', './stubs/native.mjs'],
  ['expo-task-manager', './stubs/native.mjs'],
  ['expo-device', './stubs/native.mjs'],
  ['expo-font', './stubs/native.mjs'],
]);

/** Real files, not data: URLs — a data: URL cannot resolve `react`. */
export const stubFor = (specifier) => STUBS.get(specifier) ?? null;
