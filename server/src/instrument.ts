/**
 * Sentry initialisation.
 *
 * This module is imported FIRST in index.ts — before express / http — so the
 * Sentry SDK can auto-instrument them. Error tracking is enabled only when
 * SENTRY_DSN is set, so local development and tests stay completely offline.
 */
import * as Sentry from '@sentry/node';
import { config } from './config.js';

export const sentryEnabled = !!config.sentryDsn;

if (sentryEnabled) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    release: config.release,
    // Modest tracing in production; off in dev.
    tracesSampleRate: config.isProd ? 0.1 : 0,
  });
}
