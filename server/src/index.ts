// Sentry must initialise before express / http are imported — keep this first.
import { sentryEnabled } from './instrument.js';

import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { closeDb, dbHealthy, migrate } from './db/index.js';
import { requireAuth } from './auth/middleware.js';
import { errorMiddleware } from './lib/http.js';
import { logger } from './lib/logger.js';
import { renderShareLanding } from './lib/share-landing.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { attachRealtime, closeRealtime, realtimeClientCount } from './realtime/gateway.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { authRouter } from './routes/auth.js';
import { bootstrapRouter } from './routes/bootstrap.js';
import { usersRouter } from './routes/users.js';
import { socialRouter } from './routes/social.js';
import { activitiesRouter } from './routes/activities.js';
import { chatRouter } from './routes/chat.js';
import { floatsRouter } from './routes/floats.js';
import { miscRouter } from './routes/misc.js';
import { safetyRouter } from './routes/safety.js';
import { uploadsRouter } from './routes/uploads.js';

/* --- database ------------------------------------------------------------- */

migrate(); // apply pending migrations
mkdirSync(config.uploadsDir, { recursive: true }); // ensure the uploads volume exists

/* --- app ------------------------------------------------------------------ */

const app = express();

// Behind a reverse proxy / load balancer in production — required for correct
// client IPs (rate limiting) and protocol detection.
app.set('trust proxy', config.trustProxy);

// Structured request logging. Slim serializers keep logs readable and ensure
// request/response headers (which can carry tokens) are never written out.
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: req => (req.url ?? '').startsWith('/v1/health') },
  serializers: {
    req: req => ({ id: req.id, method: req.method, url: req.url }),
    res: res => ({ statusCode: res.statusCode }),
  },
}));

// Security headers.
app.use(helmet());

/* --- health --------------------------------------------------------------- */
// Declared before CORS / rate limiting so load-balancer probes are never
// throttled and never blocked by origin checks.

// Liveness — the process is up.
app.get('/v1/health', (_req, res) => {
  res.json({ ok: true, realtimeClients: realtimeClientCount(), uptime: process.uptime() });
});

// Readiness — the process can serve traffic (database reachable).
app.get('/v1/health/ready', (_req, res) => {
  const ready = dbHealthy();
  res.status(ready ? 200 : 503).json({ ready, release: config.release });
});

/* --- uploaded media ------------------------------------------------------- */
// Public + cacheable, with a cross-origin resource policy so the native app's
// webview can load images served from this (different) origin.
app.use('/uploads', express.static(config.uploadsDir, {
  immutable: true,
  maxAge: '30d',
  setHeaders: res => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
}));

/* --- middleware ----------------------------------------------------------- */

// CORS — only the configured client origins. Requests with no Origin header
// (native apps, curl, server-to-server) are allowed through.
app.use(cors({
  origin(origin, cb) {
    if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
    cb(null, false); // disallowed — no CORS headers; the browser blocks it
  },
  credentials: true,
}));

app.use(express.json({ limit: config.bodyLimit }));
app.use(globalLimiter);

/* --- public routes -------------------------------------------------------- */

// Marketing + legal pages served from src/public/ (privacy + terms are
// required by the Google OAuth consent screen and by Play Console; the
// landing at / gives Google + reviewers something non-blank to look at when
// they click the home URL we hand them).
//
// Resolved relative to the compiled JS file so it works the same in dev
// (`tsx src/index.ts`) and prod (`node dist/index.js`) — the build step
// copies src/public/ to dist/public/ alongside the source tree.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { index: 'index.html', extensions: ['html'] }));
// Clean URLs for the two surfaces that get pasted into external forms — keep
// these even though express.static's `extensions` covers them, so a
// `/privacy/` trailing slash also resolves the same way.
app.get('/privacy', (_req, res) => res.sendFile(path.join(publicDir, 'privacy.html')));
app.get('/terms', (_req, res) => res.sendFile(path.join(publicDir, 'terms.html')));

// Share landing — when a friend taps a https://whatudoing.app/plan/<id> link
// (or /invite?from=<handle>) we serve a tiny page that tries the wud:// deep
// link and falls back to the App Store / Play Store. The page also carries
// OG tags so iMessage / WhatsApp previews look like a proper card.
app.get('/plan/:id', (req, res) => {
  const id = req.params.id;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  res.type('text/html').send(renderShareLanding({
    title: 'Join the plan on WUD',
    description: 'Open this plan in WUD to RSVP, chat with the crew, and see when it goes live.',
    deepLink: `wud://plan/${id}`,
  }));
});

app.get('/invite', (req, res) => {
  const raw = String(req.query.from ?? '');
  const handle = raw.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
  res.type('text/html').send(renderShareLanding({
    title: handle ? `@${handle} invited you to WUD` : 'You\'re invited to WUD',
    description: 'WUD is a friends-only spontaneous-plans app. Tap below to open or download.',
    deepLink: handle ? `wud://invite?from=${encodeURIComponent(handle)}` : 'wud://invite',
  }));
});

app.use('/v1/auth', authRouter);

/* --- authenticated routes ------------------------------------------------- */

const api = express.Router();
api.use(requireAuth);
api.use(bootstrapRouter);
api.use(usersRouter);
api.use(socialRouter);
api.use(activitiesRouter);
api.use(chatRouter);
api.use(floatsRouter);
api.use(miscRouter);
api.use(safetyRouter);
api.use(uploadsRouter);
app.use('/v1', api);

/* --- 404 + error handling ------------------------------------------------- */

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint', field: null } });
});

// Sentry's error handler runs first — it captures the error, then passes it on.
if (sentryEnabled) Sentry.setupExpressErrorHandler(app);
app.use(errorMiddleware);

/* --- start HTTP + WebSocket + scheduler ----------------------------------- */

const httpServer = createServer(app);
attachRealtime(httpServer);

httpServer.listen(config.port, () => {
  logger.info(
    `🟢 WUD API on :${config.port} — env=${config.nodeEnv} release=${config.release}`,
  );
  startScheduler();
});

/* --- graceful shutdown ---------------------------------------------------- */

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down gracefully`);

  // Hard cap — force-exit if any step hangs.
  const forceTimer = setTimeout(() => {
    logger.error('graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  try {
    stopScheduler();
    await closeRealtime();
    await new Promise<void>((resolve, reject) => {
      httpServer.close(err => (err ? reject(err) : resolve()));
    });
    closeDb();
    clearTimeout(forceTimer);
    logger.info('shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}

// Last-resort safety nets — log, report, and (for hard faults) shut down.
process.on('uncaughtException', err => {
  logger.fatal({ err }, 'uncaught exception');
  if (sentryEnabled) Sentry.captureException(err);
  void shutdown('uncaughtException');
});
process.on('unhandledRejection', reason => {
  logger.error({ err: reason }, 'unhandled promise rejection');
  if (sentryEnabled) Sentry.captureException(reason);
});
