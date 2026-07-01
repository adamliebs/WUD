/**
 * Initialize the Firebase JS SDK for the WEB build.
 *
 * `@capacitor-firebase/authentication` delegates to the Firebase JS SDK when
 * it runs in a browser, so email/Google sign-in on the web needs the JS app
 * initialized once at startup. On native this is a no-op — the plugin reads
 * GoogleService-Info.plist / google-services.json instead, and we never call
 * this (see main.tsx).
 *
 * The config below is PUBLIC (safe to ship in client JS) — Firebase Auth is
 * secured by its authorized-domains allowlist, not by hiding these values.
 * Project-level fields are baked from the native config; the web `appId`
 * (and optionally an apiKey override) come from Vite env so a build can point
 * at a different Firebase web app without code changes:
 *
 *   VITE_FIREBASE_APP_ID   (required for web auth — register a Web app in the
 *                           Firebase console: Project settings → Your apps → Web)
 *   VITE_FIREBASE_API_KEY  (optional override; defaults to the project key)
 *
 * Until VITE_FIREBASE_APP_ID is set, web social/email signup stays disabled
 * and the UI degrades gracefully (legacy email login still reaches the
 * server's /v1/auth/email endpoints).
 */
import { getApps, initializeApp } from 'firebase/app';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyD25IbQNjT1ePR7ZLRdplIONt5IHch9YzI',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'whatudoingapp.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'whatudoingapp',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'whatudoingapp.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID ?? '267273833603',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

/** True once a web Firebase app is configured — the AuthScreen uses this to
 *  decide whether to offer Google / email signup on the web. */
export const firebaseWebReady = !!config.appId;

export function initFirebaseWeb(): void {
  if (!config.appId) {
    console.warn(
      '[firebase-web] VITE_FIREBASE_APP_ID not set — web signup/social login is '
      + 'disabled until you register a Web app in the Firebase console and set it.',
    );
    return;
  }
  if (getApps().length) return; // already initialized (HMR / double-invoke)
  initializeApp(config);
}
