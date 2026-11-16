// The runtime behind `import()`. The web map is loaded lazily, and in the
// static export that lazy chunk is a separate file that only this runtime
// knows how to fetch. The dev server injects it, so `expo start` never
// misses it; `expo export` does not, and without this line the first tap on
// the Map tab in production threw "Requiring unknown module" and took the
// whole app down to a blank page. Expo's metro config hoists this import to
// the front of the bundle, so its position here is documentation, not
// ordering.
import '@expo/metro-runtime';
import './src/polyfills/location-emitter.ts';
import { registerRootComponent } from 'expo';
import App from './App';

// Installed before React so a persisted guest never races the first account
// request. In a static demo it owns every API request; in the normal app it
// wakes only for Guest Sandbox mode and otherwise passes through untouched.
const { installDemoServer, markAsDemo } = require('./src/demo/server.ts');
const { guestSandboxActive } = require('./src/demo/mode.ts');
const staticDemo = process.env.EXPO_PUBLIC_DEMO === '1';
installDemoServer(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787', {
  active: () => staticDemo || guestSandboxActive(),
  fallThroughUnknownReads: !staticDemo,
  // The normal guest experience uses the real, server-grounded Concierge and
  // its persistent transcript. The fully static export stays self-contained.
  allowLiveConcierge: !staticDemo,
});
if (staticDemo) markAsDemo();

registerRootComponent(App);
