import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';

const error = (message: string) => ({
  error: { code: 'RATE_LIMITED', message, field: null },
});

/** Global limiter — applied to every request, keyed by client IP. */
export const globalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: error('Too many requests — slow down and try again shortly.'),
});

/**
 * Stricter limiter for auth endpoints (login / register / token refresh) to
 * blunt credential-stuffing and brute-force attempts.
 */
export const authLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: error('Too many attempts — please wait a moment before retrying.'),
});
