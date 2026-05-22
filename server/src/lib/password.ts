import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing using Node's built-in scrypt (no native deps).
 * Format: scrypt$<saltHex>$<hashHex>. scrypt is a memory-hard KDF — a solid
 * choice when Argon2 isn't available without a native module (SRS SEC-03 notes
 * Argon2id as the production target).
 */
const KEYLEN = 64;
const COST = 16384; // N — CPU/memory cost

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN, { N: COST });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(plain, salt, expected.length, { N: COST });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
