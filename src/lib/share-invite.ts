import type { User } from '../types';
import { useApp } from '../store';

/**
 * Open the native share sheet (or web share / clipboard fallback) with the
 * user's personal invite link. The recipient lands on the personalized
 * /invite page; opening the app from it makes the pair friends automatically
 * (see store.handleInviteLink → POST /v1/friends/link).
 *
 * Shared by the Friends overlay, the squad editor's empty state, and the
 * Getting Started checklist. Resolves true when a share was actually
 * presented (used by the "invite 3 friends" quest counter); false on
 * cancel / failure.
 */
export async function shareInvite(me: User): Promise<boolean> {
  const url = `https://whatudoing.app/invite?from=${encodeURIComponent(me.handle)}`;
  const text = `Hey! What U Doing? "${me.name}" wants you on WUD — come hang out.`;
  const isCancel = (e: unknown): boolean => {
    const msg = (e as { message?: string })?.message?.toLowerCase() ?? '';
    return (e as { name?: string })?.name === 'AbortError'
      || msg.includes('cancel') || msg.includes('abort') || msg.includes('dismiss');
  };

  // Native: open the OS share sheet directly. We deliberately do NOT gate on
  // Share.canShare() — it returns false on some devices/simulators and was
  // silently dropping users to the clipboard fallback instead of the sheet.
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: 'Join me on WUD', text, url, dialogTitle: 'Invite friends' });
      return true;
    }
  } catch (e) {
    if (isCancel(e)) return false;
    // Native share genuinely failed — fall through to the web paths below.
  }

  // Web: the Web Share API opens the real OS share sheet on mobile browsers.
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: 'Join me on WUD', text, url });
      return true;
    }
  } catch (e) {
    if (isCancel(e)) return false;
  }

  // Last resort (desktop browsers with no share sheet) — copy the link.
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    useApp.getState().pushToast('Invite link copied — paste it to a friend', 'success');
    return true;
  } catch {
    useApp.getState().pushToast('Could not share the invite', 'warn');
    return false;
  }
}
