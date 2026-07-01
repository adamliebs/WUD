/**
 * HTML for the share-landing pages served at /plan/:id and /invite.
 *
 * When a friend taps a WUD share link, they land here. The page tries the
 * `wud://` deep link immediately (universal link / app-link handoff). If the
 * app is installed, iOS / Android hand off before the timeout fires and the
 * user sees the in-app target. If not, the timeout falls through to the
 * App Store / Play Store. Desktop browsers always see the landing copy with
 * store buttons.
 *
 * The OG / Twitter card tags make iMessage / WhatsApp previews look like a
 * proper link card with title + description.
 */

const APP_STORE_URL = 'https://apps.apple.com/us/app/wud-what-u-doing/id6775162871';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.wud.app';
export const SITE_URL = 'https://whatudoing.app';

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderShareLanding(opts: {
  title: string;
  description: string;
  /** The wud:// deep link that opens the relevant in-app screen. */
  deepLink: string;
  /** When set (invite links), the page leads with the inviter's face + name
   *  so the landing reads as a personal invitation, not a generic app ad. */
  inviter?: { name: string; emoji: string; photoUrl?: string };
  /** When set (invite links), the page copies this string to the clipboard on
   *  a store-button tap. It's the deferred-deep-link bridge: a fresh install
   *  can't carry ?from= through the App/Play Store, so the freshly-installed
   *  app reads the clipboard on first launch and redeems the invite. */
  clipboardToken?: string;
  /** When set, adds a "Continue in your browser" button that opens the web app
   *  (carrying the plan/invite so it resolves after login). */
  webUrl?: string;
  /** Absolute image URL for the OG / Twitter card (host photo, plan banner…). */
  imageUrl?: string;
}): string {
  const title = escapeHtml(opts.title);
  const description = escapeHtml(opts.description);
  const deepLink = escapeHtml(opts.deepLink);
  const clipboardToken = opts.clipboardToken ?? '';
  const webUrl = opts.webUrl ? escapeHtml(opts.webUrl) : '';
  const imageMeta = opts.imageUrl
    ? `<meta property="og:image" content="${escapeHtml(opts.imageUrl)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${escapeHtml(opts.imageUrl)}" />`
    : `<meta name="twitter:card" content="summary" />`;
  const webButton = webUrl
    ? `<a class="store-btn secondary" href="${webUrl}">Continue in your browser</a>`
    : '';
  const inviterBlock = opts.inviter
    ? `<div class="inviter">${
        opts.inviter.photoUrl
          ? `<img class="inviter-avatar" src="${escapeHtml(opts.inviter.photoUrl)}" alt="" />`
          : `<span class="inviter-avatar inviter-emoji">${escapeHtml(opts.inviter.emoji)}</span>`
      }</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="WUD" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${SITE_URL}" />
${imageMeta}
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<link rel="stylesheet" href="/_layout.css" />
<style>
  .stack { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
  .store-btn {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 14px 18px; border-radius: 14px; font-weight: 700; font-size: 14px;
    text-decoration: none; color: #fff;
    background: linear-gradient(135deg, #f43f5e, #f97316);
    box-shadow: 0 14px 30px -14px rgba(244, 63, 94, 0.55);
  }
  .store-btn.secondary {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    color: #e4e4e7;
    box-shadow: none;
  }
  .hint { color: #a1a1aa; font-size: 12px; margin-top: 14px; }
  .inviter { margin-top: 18px; }
  .inviter-avatar {
    width: 72px; height: 72px; border-radius: 50%; object-fit: cover;
    display: inline-flex; align-items: center; justify-content: center;
    border: 2px solid rgba(255,255,255,0.15);
    box-shadow: 0 14px 30px -14px rgba(244, 63, 94, 0.45);
  }
  .inviter-emoji {
    font-size: 36px;
    background: linear-gradient(135deg, rgba(244,63,94,0.35), rgba(249,115,22,0.25));
  }
</style>
</head>
<body>
  <main class="wrap">
    <div class="brand"><span class="dot"></span>WUD</div>
    ${inviterBlock}
    <h1>${title}</h1>
    <p class="tagline">${description}</p>

    <div class="stack">
      <a id="open-app" class="store-btn" href="${deepLink}">Open in WUD</a>
      ${webButton}
      <a class="store-btn secondary" data-store href="${APP_STORE_URL}">Download on the App Store</a>
      <a class="store-btn secondary" data-store href="${PLAY_STORE_URL}">Get it on Google Play</a>
    </div>

    <p class="hint">
      Don't have WUD yet? Tap "Download" and the plan will open once you
      sign in.
    </p>
  </main>

  <script>
    // Deferred-deep-link bridge: stash the invite on the clipboard so a fresh
    // install (which can't carry ?from= through the store) can read it on first
    // launch and auto-friend the inviter. Best-effort; needs a secure context
    // and (in Safari) a user gesture, so we also fire it from the store-button
    // taps below where a gesture is guaranteed.
    var INVITE_TOKEN = ${JSON.stringify(clipboardToken)};
    function copyInviteToken() {
      if (!INVITE_TOKEN) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(INVITE_TOKEN).catch(function () {});
        }
      } catch (e) { /* clipboard blocked — fall back to the second-tap path */ }
    }
    // Copy on any store-button tap (a real gesture → reliable write).
    Array.prototype.forEach.call(document.querySelectorAll('[data-store]'), function (a) {
      a.addEventListener('click', copyInviteToken);
    });

    // Try the deep link straight away. If WUD is installed, the OS hands off
    // before the timeout fires; if not, we fall through to the App Store /
    // Play Store based on platform.
    (function () {
      var ua = navigator.userAgent || '';
      var isIOS = /iPhone|iPad|iPod/i.test(ua);
      var isAndroid = /Android/i.test(ua);
      copyInviteToken(); // best-effort on load (covers the auto-redirect path)
      if (!isIOS && !isAndroid) return; // Desktop — just show the buttons.

      var deepLink = ${JSON.stringify(opts.deepLink)};
      var fallback = isIOS
        ? ${JSON.stringify(APP_STORE_URL)}
        : ${JSON.stringify(PLAY_STORE_URL)};

      var hiddenAt = 0;
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) hiddenAt = Date.now();
      });

      window.location.href = deepLink;

      // If the page is still visible after ~1.6s, the app didn't take over —
      // redirect to the store. The visibility check avoids redirecting users
      // who *did* hand off (their browser tab went into background).
      setTimeout(function () {
        if (hiddenAt > 0) return;
        copyInviteToken();
        window.location.href = fallback;
      }, 1600);
    })();
  </script>
</body>
</html>`;
}
