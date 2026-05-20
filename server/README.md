# WUD Backend

The server tier for WUD — REST API, WebSocket realtime gateway, and a background
scheduler. Implements the backend specified in [`../SRS.md`](../SRS.md).

## Stack

- **Node.js + TypeScript** (run with `tsx`, no build step)
- **Express** — HTTP API
- **node:sqlite** — built-in SQLite (zero native deps; dev datastore — Postgres
  is the production target per the SRS, the SQL is largely portable)
- **ws** — WebSocket realtime gateway
- Auth: JWT (HS256) access tokens + rotating refresh tokens; scrypt password hashing

## Run

```bash
npm install
npm run seed      # create wud.db + load demo data
npm start         # http://localhost:4000
npm run dev       # same, with watch-reload
npm run typecheck
```

### Demo logins (after `npm run seed`)

| Account | Email | Password |
|---|---|---|
| Admin | `admin@wud.app` | `admin1234` |
| Any seed user | `<handle>@wud.app` (e.g. `mike@wud.app`) | `demo1234` |

## Layout

```
src/
  config.ts          runtime config
  index.ts           entry — HTTP + WS + scheduler
  scheduler.ts       reminders, live-status expiry, recurrence rollover
  db/
    schema.sql       full SQLite schema (SRS §4)
    index.ts         connection, migrations, tx() helper
    seed.ts          demo data
  lib/               ids, errors, jwt, password, http helpers
  auth/middleware.ts bearer-token auth middleware
  services/          domain logic — users, auth, social, activities, chat,
                     presence, notifications, discovery
  routes/            REST endpoints grouped by area
  realtime/
    bus.ts           in-process event bus (swap for Redis pub/sub in prod)
    gateway.ts       WebSocket fan-out
```

## API

Base path `/v1`. All routes except `/v1/auth/*` and `/v1/health` require
`Authorization: Bearer <accessToken>`. See `../SRS.md` §6 for the full surface.

- `POST /v1/auth/email/{register,login}` · `/oauth/:provider` · `/token/refresh` · `/logout`
- `GET/PATCH /v1/me` · `/me/settings` · `/me/devices` · `DELETE /v1/account`
- `GET /v1/friends` · `/friends/discover` · friend-requests · squads CRUD
- `GET /v1/feed` · `POST /v1/activities` · RSVP · leave · host accept/decline · reaction · history
- `GET/POST /v1/activities/:id/messages` · `/polls` · `PUT /v1/polls/:id/vote` · squad chat
- `GET /v1/notifications` · `POST /v1/pings` · live status · `/search` · `/trending` · `/suggestions`
- WebSocket: `ws://host/v1/realtime?token=<accessToken>`

## Notes on production gaps

This implementation is complete and runnable. Two areas are deliberate,
documented stubs because they need external paid credentials:

- **OAuth provider verification** — `POST /v1/auth/oauth/:provider` accepts an
  already-trusted `subject`. Production must verify the provider's ID token /
  auth code first (SRS FR-AUTH-12).
- **Push delivery** — `dispatchPush()` logs instead of calling APNs/FCM. The
  `devices` table and `push_enabled` checks are in place for the real client.
