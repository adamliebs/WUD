import { pino } from 'pino';
import { config } from '../config.js';

/**
 * Structured application logger.
 *
 * Production emits newline-delimited JSON (ready for any log aggregator).
 * Development pretty-prints via pino-pretty for readability.
 */
export const logger = pino({
  level: config.logLevel,
  base: { release: config.release },
  // Never let credentials reach the logs.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[redacted]',
  },
  ...(config.isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,release' },
        },
      }),
});
