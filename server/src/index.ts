import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { migrate } from './db/index.js';
import { requireAuth } from './auth/middleware.js';
import { errorMiddleware } from './lib/http.js';
import { attachRealtime, realtimeClientCount } from './realtime/gateway.js';
import { startScheduler } from './scheduler.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { socialRouter } from './routes/social.js';
import { activitiesRouter } from './routes/activities.js';
import { chatRouter } from './routes/chat.js';
import { miscRouter } from './routes/misc.js';

/* --- bootstrap ------------------------------------------------------------ */

migrate(); // apply schema (idempotent)

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '2mb' }));

// Lightweight request log.
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

/* --- public routes -------------------------------------------------------- */

app.get('/v1/health', (_req, res) => {
  res.json({ ok: true, realtimeClients: realtimeClientCount(), uptime: process.uptime() });
});

app.use('/v1/auth', authRouter);

/* --- authenticated routes ------------------------------------------------- */

const api = express.Router();
api.use(requireAuth);
api.use(usersRouter);
api.use(socialRouter);
api.use(activitiesRouter);
api.use(chatRouter);
api.use(miscRouter);
app.use('/v1', api);

/* --- 404 + error handling ------------------------------------------------- */

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint', field: null } });
});
app.use(errorMiddleware);

/* --- start HTTP + WebSocket + scheduler ----------------------------------- */

const httpServer = createServer(app);
attachRealtime(httpServer);

httpServer.listen(config.port, () => {
  console.log(`\n🟢 WUD API on http://localhost:${config.port}`);
  console.log(`   REST     → http://localhost:${config.port}/v1`);
  console.log(`   Realtime → ws://localhost:${config.port}/v1/realtime`);
  startScheduler();
});

/* --- graceful shutdown ---------------------------------------------------- */

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received — shutting down.`);
    httpServer.close(() => process.exit(0));
  });
}
