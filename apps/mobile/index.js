// The runtime behind `import()`. The web map is loaded lazily, and in the
// static export that lazy chunk is a separate file that only this runtime
// knows how to fetch. The dev server injects it, so `expo start` never
// misses it; `expo export` does not, and without this line the first tap on
// the Map tab in production threw "Requiring unknown module" and took the
// whole app down to a blank page. Expo's metro config hoists this import to
// the front of the bundle, so its position here is documentation, not
// ordering.
import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import App from './App';

// The static demo build has no API behind it. Installed here rather than in
// App so it is in place before the first screen can fetch.
if (process.env.EXPO_PUBLIC_DEMO === '1') {
  const { installDemoServer, markAsDemo } = require('./src/demo/server.ts');
  installDemoServer(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787');
  markAsDemo();
}

registerRootComponent(App);
