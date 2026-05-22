/**
 * Native-shell integration (Capacitor).
 *
 * Everything here is a no-op on the web build — `isNative` gates it — so the
 * same bundle runs unchanged in a browser and inside the iOS/Android shell.
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useApp } from './store';

/** True when running inside the native Capacitor shell. */
export const isNative = Capacitor.isNativePlatform();

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

  // Tag the document so CSS can target the native shell if ever needed.
  document.documentElement.classList.add('native');

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
}

/** Hide the native splash screen — call once the first screen has painted. */
export function hideSplash(): void {
  if (isNative) SplashScreen.hide().catch(() => {});
}
