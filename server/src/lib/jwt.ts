import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Minimal, dependency-free JWT (HS256). Sufficient for first-party access
 * tokens. Production may swap in a vetted library, but the contract is the same.
 */

interface Payload {
  sub: string;          // user id
  iat: number;          // issued-at (epoch seconds)
  exp: number;          // expiry   (epoch seconds)
  typ: 'access';
}

const b64url = (buf: Buffer | string): string =>
  Buffer.from(buf).toString('base64url');

function sign(data: string): string {
  return createHmac('sha256', config.jwtSecret).update(data).digest('base64url');
}

/** Issue a signed access token for a user. */
export function issueAccessToken(userId: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: Payload = {
    sub: userId,
    iat: nowSec,
    exp: nowSec + config.accessTtlSec,
    typ: 'access',
  };
  const body = b64url(JSON.stringify(payload));
  const signature = sign(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

/** Verify a token; returns the user id, or null if invalid/expired. */
export function verifyAccessToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;

  const expected = sign(`${header}.${body}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Payload;
    if (payload.typ !== 'access') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
