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
    // 'http' lets the bundled app reach an http backend with no mixed-content
    // block. A production https API still works (http→https isn't mixed content).
    androidScheme: 'http',
    // Permit cleartext (http) requests — needed to reach a local dev backend
    // such as http://10.0.2.2:4000 from the Android emulator.
    cleartext: true,
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
