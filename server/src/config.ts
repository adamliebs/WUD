/**
 * Central runtime configuration — validated once, at boot.
 *
 * Local development: reads a `.env` file if present, otherwise uses dev
 * defaults. Production: env vars are injected by the host; the validation
 * below makes the process fail fast (refuse to boot) if anything required is
 * missing or left at an insecure default.
 */
import { existsSync } from 'node:fs';

// Load a local .env if present. In production the platform injects env vars
// directly, so no file is needed.
if (existsSync('.env') && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile('.env');
}

type NodeEnv = 'development' | 'production' | 'test';
const nodeEnv: NodeEnv = (process.env.NODE_ENV as NodeEnv) || 'development';
const isProd = nodeEnv === 'production';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`[config] env var ${name} must be a number (got "${raw}")`);
  return n;
}

function list(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me';
const jwtSecret = process.env.JWT_SECRET ?? (isProd ? '' : DEV_JWT_SECRET);

// Fail fast — production must set a strong, non-default secret.
if (isProd) {
  if (!jwtSecret || jwtSecret === DEV_JWT_SECRET) {
    throw new Error('[config] JWT_SECRET must be set to a strong value in production');
  }
  if (jwtSecret.length < 32) {
    throw new Error('[config] JWT_SECRET must be at least 32 characters in production');
  }
  if (!process.env.CORS_ORIGIN) {
    throw new Error('[config] CORS_ORIGIN must list the allowed client origins in production');
  }
}

export const config = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',

  port: num('PORT', 4000),

  /** SQLite database file. Use ':memory:' for an ephemeral test DB. */
  dbFile: process.env.WUD_DB ?? 'wud.db',

  /** HMAC secret for signing JWTs. MUST be overridden in production. */
  jwtSecret,
  /** Access token lifetime (seconds) — short-lived per SRS SEC-02. */
  accessTtlSec: num('ACCESS_TTL', 15 * 60),
  /** Refresh token lifetime (seconds) — long-lived, rotating. */
  refreshTtlSec: num('REFRESH_TTL', 30 * 24 * 60 * 60),

  /** Allowed CORS origins (comma-separated `CORS_ORIGIN`). Includes the web
   *  dev server and the Capacitor native webview origins (iOS + Android). */
  corsOrigins: list('CORS_ORIGIN', [
    'http://localhost:5173',
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
  ]),

  /** Scheduler tick interval (ms) for reminders / live-status expiry. */
  schedulerIntervalMs: num('SCHEDULER_MS', 30_000),

  /** Max JSON request body size. */
  bodyLimit: process.env.BODY_LIMIT ?? '2mb',

  /** Directory for uploaded photos — must live on a persistent volume. */
  uploadsDir: process.env.UPLOADS_DIR ?? 'uploads',
  /** Max uploaded photo size, in bytes. */
  maxUploadBytes: num('MAX_UPLOAD_BYTES', 8 * 1024 * 1024),

  /** Reverse proxies in front of the app (so client IPs / rate limits are correct). */
  trustProxy: num('TRUST_PROXY', isProd ? 1 : 0),

  /** Global rate limit: requests per window per IP. */
  rateLimitWindowMs: num('RATE_LIMIT_WINDOW_MS', 60_000),
  rateLimitMax: num('RATE_LIMIT_MAX', 240),
  /** Stricter limit for auth endpoints (login / register / refresh). */
  authRateLimitMax: num('AUTH_RATE_LIMIT_MAX', 20),

  /** Pino log level. */
  logLevel: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),

  /** Sentry DSN — error tracking is enabled only when this is set. */
  sentryDsn: process.env.SENTRY_DSN ?? '',
  /** Release identifier surfaced to Sentry and logs. */
  release: process.env.RELEASE ?? process.env.GIT_SHA ?? 'dev',

  /**
   * Firebase service-account credentials for FCM push delivery. Either:
   *   • FIREBASE_SERVICE_ACCOUNT_PATH = absolute path to the JSON file, OR
   *   • FIREBASE_SERVICE_ACCOUNT_JSON = the JSON contents pasted inline.
   * With neither set, dispatchPush() falls back to a console-log stub so the
   * rest of the app continues to function without Firebase configured.
   */
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? '',
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '',
};
