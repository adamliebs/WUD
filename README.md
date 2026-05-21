# WUD — What U Doing?

A friends-only "presence feed" — post what you're doing, see what friends are doing,
tap **+ Join** to roll with them. Per-event chat, host-transfer, squads, live presence,
discovery and friend-of-friend visibility — now backed by a **real server**.

The app is two parts:

- **Frontend** — React + TypeScript client (this directory).
- **Backend** — REST API + WebSocket realtime + scheduler in [`server/`](server/).

The client talks to the backend over HTTP + WebSocket; data is persisted in the
server's SQLite database and updates stream in over the realtime gateway.

## Run it (both halves)

**1 — start the backend** (terminal 1):

```bash
cd server
npm install
npm run seed     # creates server/wud.db with demo data
npm start        # API on http://localhost:4000
```

**2 — start the frontend** (terminal 2):

```bash
npm install
npm run dev      # app on http://localhost:5173
```

Open **http://localhost:5173**. The phone-frame is shown on desktop; on mobile
width it fills the viewport.

### Logging in

- **🎬 Admin · view demo data** on the Welcome screen — logs in as the seeded
  admin account (`admin@wud.app` / `admin1234`) with friends, plans and a squad.
- **Sign up** — creates a fresh empty account through the real auth flow.
- Any seeded user also works as a login: `<handle>@wud.app` / `demo1234`
  (e.g. `mike@wud.app`).

> The API base URL defaults to `http://localhost:4000`. Override with a
> `VITE_API_URL` env var if the backend runs elsewhere.

## What's in it

- **Feed** — animated, staggered cards with category gradient, host avatar, joiner stack, "Soon" pulse for events starting in the next 15 min, and friend-of-friend badges.
- **Post (`+`)** — bottom-sheet with category chips, time chips, place / notes / max party size. Hero preview reacts to your category pick.
- **Activity Detail** — Details ↔ Chat tab swap, animated. Confetti on join. Sticky action bar with **+ Join** or **Leave** (host's leave passes the crown to the next joiner).
- **Chat** — auto-created per event. iMessage-style bubbles, system messages for host changes, only joiners can send.
- **Ping** — one-tap "I'm bored" broadcast + preset cards + custom message.
- **Notifications** — host-transfer offer with **Take over** / **Pass**, plus joins and pings.
- **Profile** — your hero, stats, hosted/joined plans, friends grid.

## Demo highlights to try

1. **Host transfer** — open **Alerts**: Mike left "Central Park picnic" and offered you host. Tap **Take over hosting**. Watch the toast + chat system message.
2. **Join + confetti** — open any plan in the feed → **+ Join**. Confetti fires.
3. **Per-event chat** — open Mike's gym plan → **Chat** tab → send a message.
4. **Pass-the-crown** — join a plan, leave it. If you're the host with no joiners, the plan dissolves with a warning toast; with joiners, the next person gets a system handoff message.
5. **Ping the squad** — Ping tab → big "I'm bored" button.

## Tech

- Vite + React + TypeScript
- TailwindCSS v3
- Zustand (with `useShallow`) for state
- Framer Motion for transitions / gestures / shared-layout tab pills
- canvas-confetti for celebrations
- lucide-react icons
