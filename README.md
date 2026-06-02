# WUD — What U Doing?

A friends-only "spontaneous-plans" app. Post what you're doing in the next few
hours, see what your friends and friends-of-friends are doing, tap **+ Join**
to roll with them, chat per-plan, and float soft ideas to your squad before
they're real plans.

The app is two halves:

- **Frontend** — React + TypeScript, wrapped with Capacitor for iOS / Android
  (the same bundle runs in a browser at `localhost:5173` and inside the
  native shell).
- **Backend** — REST API, WebSocket realtime gateway, and a background
  scheduler in [`server/`](server/). SQLite via `better-sqlite3`, Firebase
  Admin SDK for auth + push.

Realtime updates (RSVPs, chat, reactions, host transfers, floats) stream over
the WebSocket gateway; everything else is plain REST.

---

## Run it

**1 — start the backend** (terminal 1):

```bash
cd server
npm install
npm run seed     # creates server/wud.db with demo data
npm run dev      # API + WS on http://localhost:4000
```

**2 — start the frontend** (terminal 2):

```bash
npm install
npm run dev      # app on http://localhost:5173
```

Open **http://localhost:5173**. The phone-frame is shown on desktop; on
mobile width it fills the viewport.

### Logging in

- **🎬 Admin · view demo data** on the Welcome screen — logs in as the seeded
  admin (`admin@wud.app` / `admin1234`) with friends, plans, floats and a squad.
- **Sign up** with email, Apple, or Google. Email signups send a verification
  link before the app unlocks.
- Any seeded user works as an email login: `<handle>@wud.app` / `demo1234`
  (e.g. `mike@wud.app`).

> `VITE_API_URL` overrides the API base (defaults to `http://localhost:4000`).
> `.env.production` is auto-populated with your Mac's LAN IP by
> `scripts/sync-lan-ip.mjs` so a physical phone running the native build can
> reach your dev server over Wi-Fi.

---

## Native iOS / Android

```bash
npm run cap:ios      # build, sync, open in Xcode
npm run cap:android  # build, sync, open in Android Studio
```

See **[MOBILE.md](MOBILE.md)** for the full Capacitor workflow, Xcode Cloud
CI setup, and app-icon / splash-screen generation.

---

## What's in the app

The app has four tabs and a global `+` post button. Everything below is
implemented and live.

### Feed tab

- **Animated activity cards** — category gradient, host avatar, joiner stack,
  countdown chip, "Soon" pulse when an event starts in the next 15 min,
  friend-of-friend badge when visibility opens up that way.
- **Scope toggle** — Friends-only ↔ Friends-of-Friends. Each scope filters the
  feed independently, with its own empty state.
- **Category strip** — Surf · Gym · Padel · Run · Gaming · Food · Drinks ·
  Coffee · Study · Movie · Outdoors · Party · Custom · Other. Tapping a chip
  filters the feed; only categories that actually have visible plans appear.
- **Filter sheet** — time window (any / today / this week), sort
  (soonest / newest), include-live toggle.
- **Squads rail** — horizontal pill rail of your squads at the top of the
  feed. Tapping a chip drops straight into that squad's detail page (plans,
  chat, members, history). Empty state nudges you to make one.
- **Friends rail** — current live-now friends, then top friends, with quick
  open-profile tap.
- **Live-now strip** — friends who marked themselves "live right now"
  (`Go Live` sheet); the strip pulses while anyone is live.
- **Pings rail** — bored-now broadcasts your friends sent in the last hour,
  with a single-tap reply.
- **Smart suggestions** — top 3 plans ranked by friend-overlap × time-proximity
  × category affinity. Shown above the feed when there's a strong match.
- **Pull-to-refresh** is replaced by a dedicated refresh button (less
  accidental fire, better performance pass).

### Floats tab

A "float" is a soft proposal — "anyone want to grab coffee this afternoon?" —
shown to a chosen audience (friends, squad, or hand-picked recipients) without
committing anyone to a plan yet.

- **Float feed** — incoming floats, outgoing floats, and locked-in floats
  that became real plans.
- **Maybe / Can't / Keen** — three-state RSVP visible to the floater (you can
  finally see who said *maybe* and who said *can't*, not just *keen*).
- **Lock in** — once enough people are keen, the host turns the float into a
  real activity in one tap (carries title, category, time, audience).
- **Poll bubbles** — embedded poll messages inside floats + activity chats
  (multi-choice, single-choice, vote-once-then-edit).

### Alerts tab

- **Date headings** — Today · Yesterday · weekday name · `Mon 1 Jun` so the
  inbox reads chronologically at a glance.
- **Grouped chat + pings** — multiple chat messages from the same plan collapse
  into one expandable row; all your pings collapse into one row when there's
  more than one.
- **Rich types** — join, host-offer (with **Take over hosting** / **Pass**
  CTAs), host-taken, ping, friend-invite, friend-accepted, reminder
  ("starting soon"), float-received, float-keen, float-locked, activity-created,
  activity-updated, activity-cancelled, chat-message.
- **Sender-aware push titles** — `"Adam pinged you"` instead of generic
  `"Ping"` (and similar for chat / friend events) on the lockscreen.
- **Unread badge** + auto-mark-read after viewing the tab.
- **Clear all** + server-side auto-purge after 3 days.

### Profile tab

- **Hero** + bio + handle + stats (hosted / joined / streak).
- **Hosted / Joined / History** sections with plan cards.
- **Friends grid** — open profiles, view shared plans.
- **Edit profile** — name, handle, bio, photo, phone, age.
- **Settings overlay** — push toggles per category (joins / chat / floats /
  reminders / pings), feed defaults, scope default, blocked users, sign-out
  and account-delete.
- **History** — every past plan you joined or hosted, scrollable.

### Global

- **Post sheet (`+`)** — bottom sheet with category chip, title, optional
  place / notes / max party size, animated hero preview that reacts to your
  category pick. Includes a Custom chip for one-off labels.
- **Activity detail sheet** — Details ↔ Chat tab swap, confetti on join,
  sticky action bar with **+ Join** / **Leave** / **Take over hosting** /
  **Cancel plan**. Chat supports text + polls + images, host can pin a poll.
  Reactions strip (👍 🔥 ❤️ 😂 🎉 🙌 🍻 🤝 ✨ 💯) under each card and in detail.
- **Search** — overlay for finding friends + plans by name / handle / title.
- **Go Live sheet** — set yourself live for the next 15/30/60 min so friends
  see you in the Live-now strip.
- **Pass-the-crown** — when a host leaves a plan with joiners, the next
  joiner gets a **Take over** offer; if accepted, system message in chat. If
  the host leaves with no joiners, the plan dissolves with a warning toast.
- **Image viewer** — full-screen tap, save to Photos on iOS via the native
  share sheet (`files: [uri]` so iOS surfaces the "Save Image" row).
- **Deep links** — `wud://plan/<id>` opens straight to the plan, from a push
  banner or any external link.
- **Contact search** — find friends already on WUD from your phone contacts
  (one-tap permission, only matched contacts are surfaced, nothing else is
  uploaded).

---

## Notifications + Push

- **Per-category settings** — pushes can be quieted per category (joins,
  chat, floats, reminders, pings). The in-app Alerts entry is created
  regardless so history isn't lost.
- **Cross-platform via FCM** — Firebase Cloud Messaging delivers to APNs on
  iOS and FCM directly on Android. Sender-aware titles, deep-linked banners,
  invalid-token pruning.

First-time push setup (APNs key upload to Firebase Console, etc.) is in
**[PUSH.md](PUSH.md)**.

---

## Authentication

Three signin paths, all backed by Firebase Authentication server-side:

- **Sign in with Apple** (native sheet, iOS only — Apple requires this if you
  ship third-party auth).
- **Sign in with Google** (native sheet on iOS / Android, web flow on web).
- **Email + password** with email verification and password reset.

First-time provider enablement in Firebase Console is in **[AUTH.md](AUTH.md)**.

---

## Tech stack

**Frontend**

- Vite 8 + React 19 + TypeScript
- TailwindCSS v3
- Zustand (with `useShallow`) for state
- Framer Motion for transitions, shared-layout tab pills, sheets
- canvas-confetti, lucide-react
- Capacitor 8 + Firebase + Filesystem + Share + Contacts + LocalNotifications +
  StatusBar + SplashScreen + Keyboard plugins

**Backend** (see [`server/README.md`](server/README.md))

- Node 22 + TypeScript (`tsx` in dev, compiled `tsc` in prod)
- Express + WebSocket (`ws`) realtime gateway
- `better-sqlite3` (WAL mode) + Litestream replication
- `firebase-admin` for token verification + FCM push
- JWT auth (HS256) + rotating refresh tokens, scrypt password hashing
- Pino structured logging, optional Sentry

---

## Repository layout

```
src/                 React + Capacitor client
  screens/           One file per top-level screen / sheet
  components/        Shared UI primitives + rails
  data/              Static lookup tables (categories, time presets)
  api/               REST client + endpoint definitions
  store.ts           Zustand store + selectors + realtime wiring
  native.ts          Capacitor wiring (status bar, deep links, push, back btn)
server/              Node API + realtime + scheduler
ios/                 Native Xcode project (committed)
android/             Native Android Studio project (committed)
assets/              Brand artwork + icon / splash sources
scripts/             Build helpers (LAN-IP sync, icon gen, SPM fix)
```

---

## Day-to-day commands

```bash
# Client
npm run dev          # vite dev server
npm run build        # tsc -b + vite build (writes dist/)
npm run lint         # eslint .
npm run cap:sync     # build + cap sync (writes dist/ → ios/ + android/ public)
npm run cap:ios      # cap:sync + open Xcode
npm run cap:android  # cap:sync + open Android Studio
npm run gen:icons    # rebuild icon + splash assets from assets/source/*.svg

# Server (from server/)
npm run dev          # tsx watch
npm run seed         # rebuild wud.db with demo data
npm run typecheck    # tsc --noEmit
npm run build        # rm -rf dist && tsc -p tsconfig.build.json
```
