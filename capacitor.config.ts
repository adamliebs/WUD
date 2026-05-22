import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration — wraps the Vite web build as native iOS/Android apps.
 *
 * `appId` is the bundle identifier; change it to a reverse-domain you own
 * before submitting to the stores.
 */
const config: CapacitorConfig = {
  appId: 'com.wud.app',
  appName: 'WUD',
  webDir: 'dist',
  backgroundColor: '#07060b',

  server: {
    // Serve Android over https:// so there is no mixed-content / cleartext issue.
    androidScheme: 'https',
  },

  ios: {
    backgroundColor: '#07060b',
    // The web app draws edge-to-edge and handles insets via CSS env(safe-area-*).
    contentInset: 'never',
  },
  android: {
    backgroundColor: '#07060b',
  },

  plugins: {
    SplashScreen: {
      // React hides the splash itself once the first screen is ready
      // (see src/main.tsx) — so don't auto-hide on a timer.
      launchAutoHide: false,
      backgroundColor: '#07060b',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Status bar overlays the webview; the app pads with safe-area insets.
      overlaysWebView: true,
      style: 'DARK', // dark theme → light status-bar icons
      backgroundColor: '#00000000',
    },
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;
