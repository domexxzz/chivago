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
