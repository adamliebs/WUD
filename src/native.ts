/**
 * Native-shell integration (Capacitor).
 *
 * Everything here is a no-op on the web build — `isNative` gates it — so the
 * same bundle runs unchanged in a browser and inside the iOS/Android shell.
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useApp } from './store';

/** True when running inside the native Capacitor shell. */
export const isNative = Capacitor.isNativePlatform();

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
  void App.addListener('appStateChange', ({ isActive }) => { appActive = isActive; });
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
