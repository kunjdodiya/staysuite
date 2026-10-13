import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.staysuite.host',
  appName: 'StaySuite',
  webDir: 'dist',
  backgroundColor: '#f7f7f5',
  ios: {
    contentInset: 'never',
    scheme: 'StaySuite',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false, // hidden by the app once data has loaded
      launchShowDuration: 3000,
      backgroundColor: '#0f766e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: false,
      splashImmersive: false,
    },
    SystemBars: {
      insetsHandling: 'css',
    },
    LocalNotifications: {
      iconColor: '#0f766e',
    },
  },
};

export default config;
