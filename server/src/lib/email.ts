/**
 * SendGrid transactional email wrapper.
 *
 * Why we send through SendGrid instead of letting Firebase Auth send for us:
 *   1. Firebase's default sender is noreply@<project>.firebaseapp.com — a
 *      domain Gmail / Outlook treat as low-trust because every Firebase
 *      project in the world shares it. Result: deliverability tanks, users
 *      can't find their verification email.
 *   2. Firebase Console's email template editor is locked for some projects
 *      (ours included), so customising subject / body / branding isn't
 *      possible there even on the paid tier.
 *
 * SendGrid solves both: emails come from noreply@whatudoing.app (DKIM signed
 * via DNS records we control), and the HTML lives in this file so we can
 * iterate on copy + branding freely.
 *
 * If SENDGRID_API_KEY isn't configured the wrapper falls back to logging the
 * link — keeps `npm run dev` working without secrets, lets us see the link in
 * the console and click through manually.
 */
import sgMail from '@sendgrid/mail';
import { config } from '../config.js';
import { logger } from './logger.js';

let initialised = false;

function ensureInit(): boolean {
  if (initialised) return true;
  if (!config.sendgridApiKey) return false;
  sgMail.setApiKey(config.sendgridApiKey);
  initialised = true;
  return true;
}

/** Strip HTML tags for the plain-text alternative. Gmail / Outlook always
 *  receive both versions; some clients (e.g. plain-text-preferring users in
 *  Apple Mail) render the text/plain part. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Shared brand-aligned shell for both verification + reset emails. The
 *  inline styles are mandatory — Gmail strips <style> tags. */
function shell({ heading, intro, button, link, sub }: {
  heading: string;
  intro: string;
  button: string;
  link: string;
  sub: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#0a070f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e4e4e7;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a070f;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#15121b;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);">

          <!-- Brand strip -->
          <tr>
            <td style="background:linear-gradient(135deg,#f43f5e 0%,#f97316 100%);padding:22px 28px;">
              <div style="color:#fff;font-weight:800;font-size:22px;letter-spacing:0.5px;">WUD</div>
              <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:2px;">What U Doing?</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 12px 28px;">
              <h1 style="margin:0 0 12px 0;color:#fff;font-size:22px;font-weight:800;line-height:1.25;">${esc(heading)}</h1>
              <p style="margin:0 0 22px 0;color:#d4d4d8;font-size:15px;line-height:1.55;">${esc(intro)}</p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 22px auto;">
                <tr>
                  <td align="center" style="border-radius:14px;background:linear-gradient(135deg,#f43f5e 0%,#f97316 100%);">
                    <a href="${esc(link)}"
                       style="display:inline-block;padding:14px 28px;font-weight:700;font-size:14px;color:#fff;text-decoration:none;border-radius:14px;">${esc(button)}</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px 0;color:#a1a1aa;font-size:12px;line-height:1.5;">
                Button not working? Paste this link into your browser:
              </p>
              <p style="margin:0 0 22px 0;color:#71717a;font-size:11px;line-height:1.5;word-break:break-all;">
                ${esc(link)}
              </p>

              <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.55;">${esc(sub)}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 28px 24px 28px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:#71717a;font-size:11px;line-height:1.5;">
                WUD — <a href="https://whatudoing.app" style="color:#a1a1aa;text-decoration:none;">whatudoing.app</a>
                &nbsp;·&nbsp;
                <a href="https://whatudoing.app/privacy" style="color:#a1a1aa;text-decoration:none;">Privacy</a>
                &nbsp;·&nbsp;
                <a href="https://whatudoing.app/terms" style="color:#a1a1aa;text-decoration:none;">Terms</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Send the email-verification message. Returns true on success (or on
 *  no-key dev fallback), false if SendGrid rejected the send. */
export async function sendVerificationEmail(
  to: string,
  link: string,
  name?: string,
): Promise<boolean> {
  const subject = 'Confirm your WUD email';
  const intro = name
    ? `Hey ${name}, tap the button below to confirm your email and finish setting up your WUD account.`
    : 'Tap the button below to confirm your email and finish setting up your WUD account.';
  const html = shell({
    heading: 'Confirm your email',
    intro,
    button: 'Confirm email',
    link,
    sub: "If you didn't sign up for WUD, you can ignore this email — your address won't be used.",
  });
  return await dispatch(to, subject, html);
}

/** Send the password-reset message. */
export async function sendPasswordResetEmail(
  to: string,
  link: string,
  name?: string,
): Promise<boolean> {
  const subject = 'Reset your WUD password';
  const intro = name
    ? `Hey ${name}, tap the button below to set a new password for your WUD account. This link expires in an hour.`
    : 'Tap the button below to set a new password for your WUD account. This link expires in an hour.';
  const html = shell({
    heading: 'Reset your password',
    intro,
    button: 'Set a new password',
    link,
    sub: "If you didn't request a password reset, you can ignore this email — your password won't change.",
  });
  return await dispatch(to, subject, html);
}

async function dispatch(to: string, subject: string, html: string): Promise<boolean> {
  if (!ensureInit()) {
    logger.warn({ to, subject }, '[email] SENDGRID_API_KEY not set — link logged below instead');
    // In dev / without SendGrid configured, log the raw HTML so the link
    // inside is visible (developer can copy it from the log).
    logger.info({ html }, '[email] (dev fallback) message contents');
    return true;
  }
  try {
    await sgMail.send({
      to,
      from: { email: config.emailFrom, name: config.emailFromName },
      subject,
      html,
      text: htmlToText(html),
      // Disable SendGrid's open-tracking pixel + click-rewriting for these
      // transactional emails. Click-tracking rewrites the verification link
      // through SendGrid's domain, which (a) looks suspicious to users and
      // (b) can mangle the firebase action URL on rare email clients.
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
        openTracking: { enable: false },
      },
    });
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, '[email] SendGrid send failed');
    return false;
  }
}
