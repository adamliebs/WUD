# WUD Backend

The server tier for WUD — REST API, WebSocket realtime gateway, and a background
scheduler. See [`../README.md`](../README.md) for the product overview.

## Stack

- **Node.js 22 + TypeScript** — dev runs with `tsx`; production runs compiled JS
- **Express** — HTTP API
- **better-sqlite3** — synchronous, production-grade SQLite, WAL mode
- **Litestream** — continuous streaming backup/replication to S3-compatible storage
- **ws** — WebSocket realtime gateway
- **pino** — structured logging · **Sentry** — optional error tracking
- Auth: JWT (HS256) access tokens + rotating refresh tokens; scrypt password hashing

## Run (local dev)

```bash
npm install
npm run seed      # create wud.db + load demo data
npm run dev       # http://localhost:4000, watch-reload
npm run typecheck
```

No `.env` is required for local dev — sensible defaults apply. To customise,
copy [`.env.example`](.env.example) to `.env`.

### Demo logins (after `npm run seed`)

| Account | Email | Password |
|---|---|---|
| Admin | `admin@wud.app` | `admin1234` |
| Any seed user | `<handle>@wud.app` (e.g. `mike@wud.app`) | `demo1234` |

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Watch-mode dev server (tsx) |
| `npm run build` | Compile TypeScript to `dist/` + copy migrations |
| `npm start` | Run the compiled app (`dist/index.js`) |
| `npm run typecheck` | Type-check without emitting |
| `npm run migrate` | Apply pending migrations |
| `npm run seed` | Load demo data |

## Configuration

Configuration is environment-driven and validated at boot — see
[`.env.example`](.env.example) for every variable. In `production` the server
**refuses to boot** unless `JWT_SECRET` (≥32 chars) and `CORS_ORIGIN` are set.

Generate a secret: `openssl rand -hex 32`

## Layout

```
src/
  config.ts          runtime config — env-driven, validated at boot
  instrument.ts      Sentry init (imported first)
  index.ts           entry — HTTP + WS + scheduler + graceful shutdown
  scheduler.ts       reminders, live-status expiry, recurrence rollover
  db/
    migrate.ts       versioned migration runner
    migrations/      NNNN_*.sql schema migrations
    index.ts         connection (WAL, FK), tx() helper, prepared-stmt cache
    seed.ts          demo data
  lib/               ids, errors, jwt, password, http helpers, logger
  middleware/        rate limiters
  auth/middleware.ts bearer-token auth middleware
  services/          domain logic — users, auth, social, activities, chat,
                     presence, notifications, discovery
  routes/            REST endpoints grouped by area
  realtime/
    bus.ts           in-process event bus (swap for Redis pub/sub to scale out)
    gateway.ts       WebSocket fan-out
```

## API

Base path `/v1`. All routes except `/v1/auth/*` and `/v1/health*` require
`Authorization: Bearer <accessToken>`. The handlers are organised by domain
under `src/routes/` (`activities`, `auth`, `bootstrap`, `chat`, `floats`,
`misc`, `safety`, `social`, `uploads`, `users`).

- `GET /v1/health` — liveness · `GET /v1/health/ready` — readiness (DB ping)
- `POST /v1/auth/email/{register,login}` · `/oauth/:provider` · `/token/refresh` · `/logout`
- `GET/PATCH /v1/me` · `/me/settings` · `/me/devices` · `DELETE /v1/account`
- `GET /v1/friends` · `/friends/discover` · friend-requests · squads CRUD
- `GET /v1/feed` · `POST /v1/activities` · RSVP · leave · host accept/decline · reaction · history
- `GET/POST /v1/activities/:id/messages` · `/polls` · `PUT /v1/polls/:id/vote` · squad chat
- `GET /v1/notifications` · `POST /v1/pings` · live status · `/search` · `/trending` · `/suggestions`
- WebSocket: `ws://host/v1/realtime?token=<accessToken>`

Hardening: `helmet` security headers, per-IP rate limiting (stricter on auth
endpoints), CORS locked to configured origins, structured request logging with
credential redaction.

## Production build & Docker

```bash
docker compose up --build                       # run the production image locally
docker compose exec api node dist/db/seed.js    # (optional) seed demo data
```

The multi-stage [`Dockerfile`](Dockerfile) compiles the app, prunes dev
dependencies, and produces a slim image containing Node, the app, and the
Litestream binary. The database lives on the `/data` volume and **must persist
across deploys**.

## Backups & restore (Litestream)

Litestream streams the SQLite WAL to object storage continuously. It is enabled
whenever `LITESTREAM_REPLICA_URL` is set; the container entrypoint then restores
the DB from the replica if the local file is missing, and runs the app under
`litestream replicate`. Config: [`litestream.yml`](litestream.yml).

Manual restore: `litestream restore -o /data/wud.db "$LITESTREAM_REPLICA_URL"`

## Deployment (CI/CD)

Pushing to the `production` branch triggers
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml): verify →
build → publish the image to GHCR (`ghcr.io/<owner>/<repo>-server`) → release.
Set a `DEPLOY_HOOK_URL` repository secret to auto-redeploy the host, or point
the host at the `:latest` tag. Pull requests run
[`ci.yml`](../.github/workflows/ci.yml).

## Notes on production gaps

These remain deliberate, documented stubs (they need external paid
credentials):

- **OAuth provider verification** — `POST /v1/auth/oauth/:provider` accepts an
  already-trusted `subject`. Production must verify the provider's ID token /
  auth code first (SRS FR-AUTH-12).
- **Push delivery** — `dispatchPush()` logs instead of calling APNs/FCM. The
  `devices` table and `push_enabled` checks are in place for the real client.
