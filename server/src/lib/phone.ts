import { createHmac } from 'node:crypto';

/**
 * Phone-number normalization and hashing for the contact-match flow.
 *
 * Why this is its own module: phone matching is privacy-sensitive (more so
 * than emails — phone numbers carry the implicit assumption that "you know
 * this person well enough to have their number"), so the hashing is
 * deliberately HMAC-keyed with a deployment-specific pepper. That way a DB
 * leak does not expose enumerable phone numbers via a rainbow table — an
 * attacker would also need the pepper from server config to make any sense
 * of `users.phone_hash`.
 *
 * Pepper sourcing: WUD_PHONE_PEPPER env var. Production must set this.
 * Development falls back to a hard-coded dev string and logs a warning so
 * the absence is obvious in logs.
 */

const DEV_PEPPER = 'dev-only-pepper-replace-in-production';
const peppered = (() => {
  const env = process.env.WUD_PHONE_PEPPER?.trim();
  if (env && env.length >= 16) return env;
  if (process.env.NODE_ENV === 'production') {
    // Fail closed in prod — hashing without a real pepper would be a leak.
    throw new Error(
      '[phone] WUD_PHONE_PEPPER must be set (>=16 chars) in production. ' +
      'Phone-hash matching is insecure without it.',
    );
  }
  // eslint-disable-next-line no-console
  console.warn('[phone] WUD_PHONE_PEPPER unset — falling back to dev pepper');
  return DEV_PEPPER;
})();

/**
 * Best-effort E.164 normalization. SA-defaulting: a local number with no
 * country code is interpreted as +27 (the app's primary market). Numbers
 * already in international form (leading `+`) are accepted as-is.
 *
 * Returns null for anything that doesn't look like a real number — empty,
 * way too short, way too long, or non-numeric after stripping formatting.
 * Callers should treat null as "user didn't enter a phone" rather than
 * blowing up.
 *
 * Note: this is intentionally simple and SA-biased. A full libphonenumber
 * port would be more accurate for international users but ~150KB heavier.
 * Edge cases (e.g. a UK number typed as "07700 900123" without +44) will
 * normalize incorrectly — the user can fix in Edit profile.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const stripped = input.replace(/[^\d+]/g, '');
  if (!stripped) return null;
  let candidate: string;
  if (stripped.startsWith('+')) {
    candidate = stripped;
  } else {
    // Treat as a local SA number: drop leading 0, prepend +27.
    const local = stripped.replace(/^0+/, '');
    if (!local) return null;
    candidate = `+27${local}`;
  }
  // E.164 allows 8-15 digits after the +. Reject anything outside.
  if (!/^\+\d{8,15}$/.test(candidate)) return null;
  return candidate;
}

/** Hash a normalized E.164 phone with the deployment pepper. */
export function hashPhone(phoneE164: string): string {
  return createHmac('sha256', peppered).update(phoneE164).digest('hex');
}

/**
 * Normalize + hash in one step. Returns null if normalization fails, so the
 * caller can `.filter(Boolean)` over an input list and ignore garbage.
 */
export function hashPhoneRaw(input: string | null | undefined): string | null {
  const e164 = normalizePhone(input);
  return e164 ? hashPhone(e164) : null;
}
