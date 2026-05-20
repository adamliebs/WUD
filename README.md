# WUD — What U Doing?

A polished mockup of a friends-only "presence feed" — post what you're doing, see what friends are doing, tap **+ Join** to roll with them. Per-event chat, host-transfer, and friend-of-friend visibility all wired up.

> 100% in-memory mock — no backend. Refreshing the browser resets the demo to the seeded state.

## Run it

```bash
npm install
npm run dev
```

Then open the printed URL (default: http://localhost:5173). The phone-frame is shown on desktop; on mobile width it fills the viewport.

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
