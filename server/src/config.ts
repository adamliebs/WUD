/** Central runtime configuration. Reads from env with sensible local defaults. */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** SQLite database file. Use ':memory:' for an ephemeral test DB. */
  dbFile: process.env.WUD_DB ?? 'wud.db',
  /** HMAC secret for signing JWTs. MUST be overridden in production. */
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
  /** Access token lifetime (seconds) — short-lived per SRS SEC-02. */
  accessTtlSec: Number(process.env.ACCESS_TTL ?? 15 * 60),
  /** Refresh token lifetime (seconds) — long-lived, rotating. */
  refreshTtlSec: Number(process.env.REFRESH_TTL ?? 30 * 24 * 60 * 60),
  /** CORS origin for the web client. */
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  /** Scheduler tick interval (ms) for reminders / live-status expiry. */
  schedulerIntervalMs: Number(process.env.SCHEDULER_MS ?? 30_000),
} as const;
