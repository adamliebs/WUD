# WUD — App Store Deployment Roadmap

Everything between the current build and a live iOS / Android release.

**Progress:** Phases **A** (native app shell) and **B** (production backend) are
complete on the `production` branch — see the checklists below. WUD is now a
Capacitor-wrapped native iOS/Android build running against a hardened,
containerised backend with CI/CD.

**Still mockups / stubs to replace before launch:**

- OAuth is a mockup (`src/api/endpoints.ts` → `authApi.oauth`, `server` oauth routes)
- Push delivery is a documented stub (`server/src/services/notifications.ts` → `dispatchPush`)
- The map is a "stylized abstract map" with notional 0..1 coordinates (`src/store.ts`)
- Realtime uses an in-process event bus — fine for the single-instance SQLite
  topology; horizontal scaling would later need Postgres + Redis (a deliberate
  future step, not needed for launch)

Phasing: **A–C** = make it actually work · **D–E** = approval gates · **F–G** = polish & launch.

---

## A. Native app shell — ✅ complete

- [x] Wrapped with **Capacitor** 8; `ios/` + `android/` native projects generated (`capacitor.config.ts`)
- [x] Real device viewport + **safe-area insets** — `--status-inset` variable, `pt-status` / `pb-safe` utilities; fake status bar gated to the desktop mockup only
- [x] Native splash screen + app icons — brand SVGs in `assets/source/`, all platform sizes generated
- [x] Status-bar styling — dark theme, light icons, overlaying the webview (`src/native.ts`)
- [x] Android hardware **back button** — closes the topmost sheet/overlay, else minimises
- [x] Deep links — `wud://plan/<id>` scheme registered (Info.plist + AndroidManifest) and routed in `src/native.ts`. Universal/App Links still need a hosted domain (phase D)
- [ ] Test on real iOS + Android devices *(open `ios/` in Xcode, `android/` in Android Studio — see `MOBILE.md`)*

## B. Production backend — ✅ complete

- [x] Migrated off experimental `node:sqlite` → **better-sqlite3** (stable, synchronous, WAL)
- [x] Versioned **migrations** system (`server/src/db/migrations/`, runner + `npm run migrate`)
- [x] Automated **backups** — Litestream streaming replication (`litestream.yml`, entrypoint restore-on-boot)
- [ ] Redis pub/sub for realtime — *deliberately deferred*: the single-instance SQLite topology doesn't need it; revisit only when horizontal scaling is required
- [x] Containerised — multi-stage `Dockerfile` + `docker-compose.yml`; CI publishes the image. Point a host with **HTTPS/TLS** at it
- [x] Secrets management + environment config — validated `config.ts`, `.env.example`, fail-fast in production
- [x] CORS locked to configured origins
- [x] Rate limiting — global + stricter on auth endpoints
- [x] Structured logging — pino, with credential redaction
- [x] Error tracking — Sentry (enabled when `SENTRY_DSN` is set)
- [ ] Uptime monitoring + alerting *(wire an external monitor to `/v1/health/ready`)*
- [x] Health checks (`/v1/health`, `/v1/health/ready`) + graceful shutdown
- [x] Separate **staging** / **production** environments — env-driven config + `NODE_ENV`
- [ ] Load test the WebSocket gateway

## C. Real authentication & push — currently stubbed

- [ ] Replace **mockup OAuth** with real Google / Apple / Facebook integration
- [ ] **Sign in with Apple** — mandatory if any other social login is offered (App Store rule)
- [ ] Email verification flow
- [ ] Forgot-password / password-reset flow
- [x] **In-app account deletion** — wired to `DELETE /v1/account` with a confirm step
- [ ] Store tokens in native secure storage (Keychain / Keystore), not `localStorage`
- [x] **Local OS notifications** — Capacitor Local Notifications: real banners for
      alerts/reminders while the app is running (`src/native.ts` → `notify()`)
- [ ] **Remote push** when the app is fully closed — replace the `dispatchPush`
      stub with APNs + FCM (needs a Firebase project + Apple Developer account)
- [ ] Background / closed-app notification handling
- [ ] Deep links from notifications

## D. Store compliance & legal — rejection blockers

- [ ] Apple Developer Program account ($99/yr)
- [ ] Google Play Developer account ($25 one-time)
- [ ] **Privacy Policy** — hosted URL, linked in-app and in store listings
- [ ] **Terms of Service / EULA** — accepted at signup
- [ ] Privacy "nutrition labels" (Apple) / Data Safety form (Google)
- [ ] Age / content rating questionnaires
- [ ] App Tracking Transparency (ATT) prompt — if any tracking is used
- [ ] Export-compliance / encryption declaration
- [ ] Store listing assets: screenshots per device size, description, keywords, preview video
- [ ] Signing: bundle IDs, certificates, provisioning profiles
- [ ] **Reviewer demo account** with sample data
- [ ] TestFlight (iOS) + Play internal-testing track before public release

## E. Trust & safety — rejection blockers for a social app

- [ ] **Report + block users** — required for any app with user-generated content
- [ ] **Content moderation** for chat messages, plans, profiles, and uploaded photos
- [ ] Abuse-reporting flow + backend moderation / admin tooling
- [ ] EULA with a zero-tolerance clause for objectionable content (Apple requirement for UGC)
- [ ] Age gate (COPPA — 13+ / 17+ as appropriate)
- [ ] GDPR / CCPA compliance — data export + data deletion + consent

## F. Media, maps & quality hardening

- [x] Real photo uploads — multipart `POST /v1/uploads`, stored on the server's
      persistent volume, served at `/uploads/*` (profile, banner, chat photos)
- [ ] (Optional) move uploads to object storage (S3 / R2 / Cloudinary) + CDN +
      image resizing — the volume-backed store is fine for launch scale
- [ ] Content moderation on uploaded images
- [x] The **map** / "near me" was removed — WUD has no real-location feature
- [ ] Add **React error boundaries** (none currently exist)
- [ ] Offline / network-error states + retry UX
- [ ] Loading skeletons / empty-state audit across all screens
- [ ] Crash reporting (Crashlytics)
- [ ] Opt-in product analytics
- [ ] Automated tests — unit, integration, E2E
- [x] CI/CD pipeline — GitHub Actions (`.github/workflows/ci.yml`, `deploy.yml`)
- [ ] Fix pre-existing `react-hooks` lint findings (7, surfaced non-blocking in CI)
- [ ] Accessibility audit — screen readers, dynamic type, contrast, touch-target sizes
- [ ] Performance — bundle size, code splitting / lazy loading, image optimization
- [ ] Localization / i18n (if targeting multiple regions)

## G. Ops & launch

- [ ] Domain name + DNS
- [ ] Database hosting with monitoring + backups verified
- [ ] Scaling plan for WebSocket connections
- [ ] Cost estimate for infrastructure
- [ ] Pre-launch QA pass on real devices
- [ ] App Store + Play Store submission
- [ ] Post-launch monitoring dashboards

---

# Deploying the backend to Render (~30 min, $7/month)

The infrastructure is ready — `server/Dockerfile`, `docker-entrypoint.sh`, and
`render.yaml` describe everything Render needs. This walkthrough is just the
human clicks.

## Prereqs

- A **Render** account (sign up at https://render.com, GitHub-linked)
- The repo pushed to GitHub (you're on the `production` branch — Render will
  watch it and auto-deploy on push)
- Your **Firebase service-account JSON** ready to paste (the one you saved
  outside the repo when setting up `PUSH.md`)

## Step 1 — Create the service from the blueprint

1. Render dashboard → **New +** → **Blueprint**
2. Connect your GitHub repo (`adamliebs/WUD`) if not already
3. Select the repo → Render reads `render.yaml` and proposes one Web Service
   (`wud-api`) + one disk (`wud-data`)
4. Click **Apply** — Render starts the first build but it'll fail at the
   health check until you add the env-var secrets (next step)

## Step 2 — Generate + paste the required secrets

In the new service → **Environment** tab. The blueprint already declared
which env vars exist; you're filling in the `sync: false` ones.

### `JWT_SECRET` — generate a strong random value

In your terminal:

```bash
openssl rand -base64 48
```

Paste the output. (Server boots fail if it's less than 32 chars in production.)

### `CORS_ORIGIN` — what's allowed to call the API

The Capacitor WebView origins + your dev origin:

```
capacitor://localhost,http://localhost,https://localhost,http://localhost:5173
```

If you have a website later, add it comma-separated.

### `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the entire JSON

Open your service-account JSON file in any editor → select all → paste into
the value field. Render encrypts it at rest. (Path-based config doesn't work
on Render — the JSON content env var is the production-friendly mode.)

### `SENTRY_DSN` — optional

If you have a Sentry project, paste its DSN. Otherwise leave blank (the
server detects no DSN and skips error tracking).

### Litestream env vars — optional, recommended later

`LITESTREAM_REPLICA_URL` + AWS-style credentials enable streaming SQLite
backups to S3-compatible storage (so you can recover from total disk loss).
Set up after launch — see `litestream.yml` for the URL format.

## Step 3 — Trigger a redeploy

After saving env vars, the service auto-redeploys. Watch **Logs** — you
should see:

```
[migrate] applied 0001_init
[migrate] applied 0002_remove_unused_columns
[migrate] applied 0003_trust_and_safety
[migrate] applied 0004_email_verified
[migrate] applied N migration(s)
[firebase] admin initialised (project=…)
🟢 WUD API on :4000 — env=production
[scheduler] running every 30s
```

A green "Live" badge appears at the top once the health check passes
(`/v1/health/ready` returns 200).

## Step 4 — Note your service URL

Top of the page: `https://wud-api-XXXX.onrender.com` (Render assigns the
suffix). Test from your Mac:

```bash
curl https://wud-api-XXXX.onrender.com/v1/health
# → {"status":"ok"}
```

## Step 5 — Point the app at it

Edit `.env.production`:

```bash
VITE_API_URL=https://wud-api-XXXX.onrender.com
```

(The auto-IP-sync script `scripts/sync-lan-ip.mjs` won't touch a URL that
isn't LAN-shaped, so it stays put across `npm run cap:sync` runs.)

Rebuild + redeploy to your phone:

```bash
npm run cap:ios       # or cap:android
```

Now the app works from anywhere, not just on your Wi-Fi.

## Step 6 — Verify push notifications still work

The push code paths haven't changed, but Firebase Admin SDK is now reading
from `FIREBASE_SERVICE_ACCOUNT_JSON` (paste) instead of
`FIREBASE_SERVICE_ACCOUNT_PATH` (file). Test:

1. Sign in on your phone
2. Background the app
3. From a different account on the web build, RSVP to one of your plans
4. Phone should buzz with the banner — and Render's logs should show
   `[push] sent ...`

## Costs going forward

| Tier | What you get | Cost |
|---|---|---|
| Starter (recommended start) | 0.5 CPU, 512 MB RAM, always-on, custom domain | $7/mo |
| Standard | 1 CPU, 2 GB RAM | $25/mo |
| Pro | 2 CPU, 4 GB RAM, zero-downtime deploys | $85/mo |
| Disk (separate) | 1 GB SSD | $0.25/mo per GB |

For early users, Starter handles thousands of accounts comfortably. Bump up
when you see CPU > 70% sustained.

## Custom domain (later)

When you're ready:

1. Buy a domain (Namecheap, Cloudflare Registrar, etc.)
2. Render service → **Settings** → **Custom Domains** → add `api.wud.app`
3. Render gives you a CNAME target — add it at your DNS provider
4. HTTPS cert auto-provisioned (Let's Encrypt)
5. Update `.env.production` to the new URL → `npm run cap:sync`

## Switching to Postgres (when you outgrow SQLite)

SQLite on a single instance handles real traffic, but if you want
horizontal scaling later:

1. Render dashboard → **New +** → **Postgres** → pick a region matching the
   web service ($7/mo for 256 MB, $20/mo for 4 GB)
2. Migration: install `postgres` package, port `server/src/db/migrations/`
   from SQLite dialect to Postgres (mostly trivial — drop `INTEGER PRIMARY KEY`
   for `TEXT PRIMARY KEY` since IDs are already TEXT)
3. Add a one-off SQLite → Postgres dump/restore step
4. Update `server/src/db/index.ts` to use `pg` instead of `better-sqlite3`
5. Drop the disk + Litestream

Don't do this prematurely — SQLite + Litestream is a perfectly good
production database for under 10k concurrent users.
