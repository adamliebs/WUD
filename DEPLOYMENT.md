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
