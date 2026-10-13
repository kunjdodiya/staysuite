import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.staysuite.host',
  appName: 'StaySuite',
  webDir: 'dist',
  ios: { contentInset: 'never' },
  android: { allowMixedContent: false },
};

export default config;
