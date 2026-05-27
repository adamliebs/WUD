/**
 * Native-shell integration (Capacitor).
 *
 * Everything here is a no-op on the web build — `isNative` gates it — so the
 * same bundle runs unchanged in a browser and inside the iOS/Android shell.
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { meApi } from './api/endpoints';
import { useApp } from './store';

/** True when running inside the native Capacitor shell. */
export const isNative = Capacitor.isNativePlatform();

/** 'ios' | 'android' | 'web' — the platform the app is currently running on.
 *  Use this for OS-specific UX (e.g. Apple Sign In only on iOS). */
export const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

/** Whether the app is foregrounded — gates notify() so we don't double-alert. */
let appActive = true;
let nextNotifId = 1;

/**
 * Close the topmost dismissible layer (sheet / overlay). Returns true if
 * something was closed — used by the Android hardware back button.
 */
function closeTopLayer(): boolean {
  const s = useApp.getState();
  if (s.pollComposerActivityId) { s.setPollComposerActivityId(null); return true; }
  if (s.showGoLiveSheet)        { s.setShowGoLiveSheet(false); return true; }
  if (s.openLiveUserId)         { s.setOpenLiveUserId(null); return true; }
  if (s.openActivityId)         { s.openActivity(null); return true; }
  if (s.showPostSheet)          { s.setShowPostSheet(false); return true; }
  if (s.overlay)                { s.openOverlay(null); return true; }
  return false;
}

/** Route an opened deep link (`wud://plan/<id>` or `https://host/plan/<id>`). */
function handleDeepLink(url: string): void {
  try {
    const u = new URL(url);
    const parts = `${u.host}${u.pathname}`.split('/').filter(Boolean);
    const i = parts.findIndex(p => p === 'plan' || p === 'activity');
    const id = i >= 0 ? parts[i + 1] : undefined;
    if (id) {
      const s = useApp.getState();
      if (s.authState === 'app') s.openActivity(id);
    }
  } catch {
    /* ignore malformed deep links */
  }
}

/* ─────────────────────────── Remote push (FCM) ─────────────────────────── */

/** Whether we've already registered an FCM token for this session. */
let pushTokenSent: string | null = null;

/**
 * Request remote-push permission, fetch the FCM token, and post it to the
 * backend so the server can target this device with future pushes.
 *
 * Idempotent across calls — only POSTs when the token actually changes (FCM
 * occasionally rotates tokens). Safe to call before the user is signed in —
 * does nothing in that case (registerDevice requires auth).
 *
 * Failures are logged but never thrown — the app must keep working even when
 * push isn't configured (GoogleService-Info.plist missing, user denied perms).
 */
async function registerForPush(): Promise<void> {
  if (!isNative) return;
  try {
    const perm = await FirebaseMessaging.requestPermissions();
    if (perm.receive !== 'granted') return;
    // Picks up the FCM registration token. On iOS this happens after the
    // OS hands APNs an APNs token, which Firebase swaps for an FCM token.
    const { token } = await FirebaseMessaging.getToken();
    if (!token || token === pushTokenSent) return;
    // Only attempt the POST if we look authenticated — store init() resumes
    // the session before initNative()'s app-state listener fires this.
    if (useApp.getState().authState !== 'app') return;
    await meApi.registerDevice(Capacitor.getPlatform() as 'ios' | 'android', token);
    pushTokenSent = token;
  } catch (err) {
    console.warn('[push] registration failed', err);
  }
}

/**
 * Wire up native-shell behaviour. Safe to call on the web (returns early).
 * Invoked once from main.tsx before React mounts.
 */
export function initNative(): void {
  if (!isNative) return;

  // Tag <html> with `native` + the platform ('ios' | 'android') so CSS can
  // target the native shell — e.g. opaque glass fallbacks on Android, whose
  // WebView doesn't render backdrop-filter reliably.
  document.documentElement.classList.add('native', Capacitor.getPlatform());

  // Status bar: dark theme → light icons, overlaying the edge-to-edge webview.
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  if (Capacitor.getPlatform() === 'android') {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  }

  // Android hardware back button — close the topmost layer, else go back in
  // history, else send the app to the background (never kill it abruptly).
  void App.addListener('backButton', ({ canGoBack }) => {
    if (closeTopLayer()) return;
    if (canGoBack) window.history.back();
    else void App.minimizeApp();
  });

  // Deep links — opened while the app is running or on cold start.
  void App.addListener('appUrlOpen', ({ url }) => handleDeepLink(url));
  void App.getLaunchUrl().then(res => { if (res?.url) handleDeepLink(res.url); });

  // Local notifications — request permission, and track foreground state so an
  // OS banner is only raised while the app is backgrounded.
  void LocalNotifications.requestPermissions().catch(() => {});
  void App.addListener('appStateChange', ({ isActive }) => {
    appActive = isActive;
    // Refresh the FCM token on every foreground — covers token rotation
    // without polling and re-attempts registration if we weren't signed in
    // the first time.
    if (isActive) void registerForPush();
  });

  // FCM occasionally rotates the token on its own — make sure the server has
  // the latest one. Listener emits the new token; pushTokenSent gate prevents
  // duplicate POSTs when getToken() and this event fire at boot.
  void FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
    if (token === pushTokenSent) return;
    pushTokenSent = null;
    void registerForPush();
  });

  // Tapped push that opened (or foregrounded) the app — if the payload carries
  // a deep link, route to it. Mirrors the appUrlOpen handler above.
  void FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
    const data = notification?.data as Record<string, unknown> | undefined;
    const link = typeof data?.link === 'string' ? data.link : undefined;
    if (link) handleDeepLink(link);
  });

  // Initial registration kick — runs after the store has had a tick to resume
  // any saved session, so registerDevice() sees authState === 'app'.
  void registerForPush();
}

/**
 * Called by the store right after a successful login / signup so the device's
 * FCM token reaches the server for the freshly-authenticated user. (initNative
 * fires once on cold boot; this covers the "auth happened later" path.)
 */
export function registerPushAfterAuth(): void {
  // Reset the gate so registerForPush() actually re-POSTs for the new user.
  pushTokenSent = null;
  void registerForPush();
}

/** Hide the native splash screen — call once the first screen has painted. */
export function hideSplash(): void {
  if (isNative) SplashScreen.hide().catch(() => {});
}

/**
 * Raise an OS notification for an incoming alert. No-op on web, and skipped
 * while the app is foregrounded (the in-app toast already covers that).
 * Delivery while the app is fully closed needs APNs/FCM — see MOBILE.md.
 */
export function notify(title: string, body: string): void {
  if (!isNative || appActive) return;
  void LocalNotifications.schedule({
    notifications: [{ id: nextNotifId++, title, body }],
  }).catch(() => {});
}
