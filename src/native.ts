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
import { tokens } from './api/client';
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
  if (s.coach)                  { s.endCoach(); return true; }
  if (s.pollComposerActivityId) { s.setPollComposerActivityId(null); return true; }
  if (s.lockingFloatId)         { s.setLockingFloatId(null); return true; }
  if (s.editActivityId)         { s.setEditActivityId(null); return true; }
  if (s.showGoLiveSheet)        { s.setShowGoLiveSheet(false); return true; }
  if (s.openActivityId)         { s.openActivity(null); return true; }
  if (s.showPostSheet)          { s.setShowPostSheet(false); return true; }
  if (s.overlay)                { s.openOverlay(null); return true; }
  return false;
}

/** Route an opened deep link (`wud://plan/<id>`, `wud://invite?from=<handle>`,
 *  or the https equivalents). */
function handleDeepLink(url: string): void {
  try {
    const u = new URL(url);
    const parts = `${u.host}${u.pathname}`.split('/').filter(Boolean);
    // Invite links — stash the inviter's handle; the store friends the pair
    // immediately if signed in, or right after the next signup/bootstrap.
    if (parts.includes('invite')) {
      const from = u.searchParams.get('from');
      if (from) useApp.getState().handleInviteLink(from);
      return;
    }
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

/* ──────────────────── Deferred invite (clipboard bridge) ─────────────────── */

/** Set once we've checked the clipboard for a deferred invite, so we don't
 *  re-read it (and re-trigger iOS's "pasted from…" banner) on every launch. */
const DEFERRED_INVITE_CHECKED_KEY = 'wud:deferred-invite-checked';

/**
 * First-launch deferred-deep-link redemption.
 *
 * A fresh install can't carry `?from=<handle>` through the App/Play Store, so
 * the web invite landing page copies the invite URL to the clipboard on a
 * store-button tap. Here, on the very first launch of a logged-out native app,
 * we read the clipboard once: if it holds a WUD invite link we stash the
 * inviter's handle, which the store redeems right after the user signs up
 * (consumePendingInvite) — auto-friending them just like an in-app deep link.
 *
 * Gated hard so it's unobtrusive: native only, only when there's no saved
 * session, and only once per install (the flag above). Never clobbers the
 * user's clipboard.
 */
async function checkDeferredInvite(): Promise<void> {
  if (!isNative) return;
  if (tokens.hasSession) return;                 // already a user — nothing to defer
  try {
    if (localStorage.getItem(DEFERRED_INVITE_CHECKED_KEY)) return;
    localStorage.setItem(DEFERRED_INVITE_CHECKED_KEY, '1');
  } catch { /* private mode — proceed without the once-only guard */ }
  try {
    const { Clipboard } = await import('@capacitor/clipboard');
    const { value } = await Clipboard.read();
    if (!value) return;
    // Match both the https landing URL and the wud:// scheme form.
    const m = /invite\?from=([a-zA-Z0-9_]{2,32})/.exec(value);
    if (m) {
      console.log('[invite] redeemed deferred invite from clipboard:', m[1]);
      useApp.getState().handleInviteLink(m[1]);
    }
  } catch (err) {
    console.warn('[invite] clipboard read failed', err);
  }
}

/* ─────────────────────────── Remote push (FCM) ─────────────────────────── */

/** Whether we've already registered an FCM token for this session. */
let pushTokenSent: string | null = null;

/**
 * Request remote-push permission, fetch the FCM token, and post it to the
 * backend so the server can target this device with future pushes.
 *
 * Gated to signed-in users (authState === 'app'): the OS permission dialog is
 * one of the most consequential prompts, so we don't fire it on cold boot
 * before the user understands the app. It's requested right after onboarding
 * (registerPushAfterAuth) and re-checked on each foreground. The single
 * notification-permission grant also covers our local "starting soon" alerts
 * (both map to the same UNUserNotificationCenter / POST_NOTIFICATIONS auth).
 *
 * Idempotent across calls — only POSTs when the token actually changes (FCM
 * occasionally rotates tokens). Failures are logged but never thrown.
 */
async function registerForPush(): Promise<void> {
  if (!isNative) return;
  // Don't prompt for notifications until the user is in the app — asking on
  // the splash/welcome screen tanks the grant rate (and confuses people).
  if (useApp.getState().authState !== 'app') {
    console.log('[push] deferring permission request — not signed in yet');
    return;
  }
  const plat = Capacitor.getPlatform();
  try {
    // Step 1 — system permission. iOS shows the OS dialog the first time.
    // Logged because "permission denied" is one of the most common reasons
    // pushes never arrive in TestFlight; the Xcode console makes it obvious.
    const perm = await FirebaseMessaging.requestPermissions();
    console.log(`[push] permission (${plat}):`, perm.receive);
    if (perm.receive !== 'granted') return;

    // Step 2 — FCM token. On iOS, this resolves AFTER APNs hands the OS an
    // APNs device token. If Firebase has no APNs auth key uploaded to the
    // project (Firebase Console → Project Settings → Cloud Messaging),
    // getToken() may resolve with an empty string — that's the silent
    // failure mode that makes iOS pushes vanish into the void while
    // Android keeps working. Logging the token (truncated) confirms
    // whether we cleared this hurdle.
    const { token } = await FirebaseMessaging.getToken();
    if (!token) {
      console.warn(`[push] getToken returned empty on ${plat} — likely missing APNs key in Firebase Console`);
      return;
    }
    console.log(`[push] token (${plat}):`, token.slice(0, 16) + '…');
    if (token === pushTokenSent) return;

    // Step 3 — register with the WUD backend so it can target this device.
    // (We're already past the signed-in gate at the top of this function.)
    await meApi.registerDevice(plat as 'ios' | 'android', token);
    pushTokenSent = token;
    console.log(`[push] registered device with backend (${plat})`);
  } catch (err) {
    console.warn(`[push] registration failed on ${plat}`, err);
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

  // First-launch deferred invite: if this install came from a tapped invite
  // link (store install can't carry ?from=), the landing page left the invite
  // on the clipboard — read it once and stash it for redemption after signup.
  void checkDeferredInvite();

  // Track foreground state so an OS banner is only raised while the app is
  // backgrounded. Notification PERMISSION is intentionally NOT requested here —
  // it's deferred to registerForPush(), which only prompts once the user is
  // signed in (see #1, permission timing). registerForPush() on foreground is
  // a no-op until then.
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

  // No cold-boot push registration here: registerForPush() is a no-op until
  // signed in. A returning user registers via doBootstrap → registerPushAfterAuth;
  // a new user registers right after onboarding (same path). The foreground
  // listener above keeps the token fresh thereafter.
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
