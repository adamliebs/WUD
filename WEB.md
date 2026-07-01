# WUD on the web

The same app that ships to iOS/Android also runs in a browser — it's a Vite
SPA that Capacitor merely wraps. This doc covers deploying it and the handful
of console/DNS steps only you can do.

## Architecture

```
whatudoing.app          → wud-api (Docker web service on Render)
  ├── /plan/:id, /invite → OG-tagged share landings (personalized, w/ image)
  ├── /privacy, /terms   → legal pages
  ├── /uploads/*         → media
  └── /v1/*              → JSON API + WebSocket

app.whatudoing.app      → wud-web (Render Static Site — the SPA)
  └── /*                 → index.html (SPA), calls the API via VITE_API_URL
```

The share landings live on the API domain (they need server-rendered OG tags,
which a static site can't do). Each landing now has a **"Continue in your
browser"** button → the SPA, carrying `?invite=<handle>` / `?plan=<id>` so the
app resolves it after login.

## What the code already does (this branch)

- **`wud-web` static site** in `render.yaml` (build client, publish `dist/`,
  SPA rewrite).
- **Firebase JS init on web** (`src/firebase-web.ts`) so browser email/Google
  login works. No-op on native.
- **Web deep-link routing** (`native.handleWebEntryLink` +
  `consumePendingWebPlan`): `/?invite=`, `/?plan=`, `/plan/:id` route the same
  as a native deep link — invites auto-friend after signup, plans open once
  signed in.
- **Provider gating**: Google shows on web only once Firebase web is
  configured; Apple stays iOS-only.
- **Richer, privacy-safe OG**: `/plan/:id` and `/invite` render the host/inviter
  face + name and an `og:image`. Plan content (title/time/place) is never
  exposed publicly — the real visibility gate stays in-app.
- **Graceful native degradation** (already in place): contacts import and push
  are native-only guarded; photo pickers use `<input type=file>`; share falls
  back to `navigator.share`/clipboard.

## Steps you need to do

### 1. Firebase — enable web auth
1. Firebase console → Project **whatudoingapp** → Project settings → **Your apps**
   → **Add app → Web**. Register it (nickname e.g. "WUD Web").
2. Copy the **App ID** (`1:267273833603:web:…`).
3. Authentication → Settings → **Authorized domains** → add `app.whatudoing.app`
   (and `localhost` for dev).

### 2. Render — create the static site
1. Render will pick up the new `wud-web` service from `render.yaml` on the next
   blueprint sync (or add it manually as a Static Site: build `npm ci && npm run
   build`, publish `dist`, SPA rewrite `/* → /index.html`).
2. Set its env vars:
   - `VITE_API_URL` = the API's URL (e.g. `https://api.whatudoing.app` or the
     `…onrender.com` URL).
   - `VITE_FIREBASE_APP_ID` = the web App ID from step 1.
   - (optional) `VITE_FIREBASE_API_KEY` to override the default project key.
3. Add the custom domain **app.whatudoing.app** to this service and point the
   DNS CNAME as Render instructs.

### 3. Render — update the API service (`wud-api`)
- `CORS_ORIGIN` → add `https://app.whatudoing.app` to the comma-separated list.
- `WEB_APP_URL` → `https://app.whatudoing.app` (the "Continue in browser"
  target baked into the share landings). Defaults to this already, so only set
  it if you host the SPA elsewhere.

### 4. (Optional) One-domain setup
If you'd rather serve everything from `whatudoing.app` (SPA + API + landings in
one service), that's a bigger change: the API Docker image would need to build
and serve the client too. The two-service split above is the lower-risk default
and keeps deploys independent.

## Local dev
```bash
# API
cd server && npm run dev            # http://localhost:4000
# Web app
npm run dev                         # http://localhost:5173 (VITE_API_URL defaults to :4000)
```
Set `VITE_FIREBASE_APP_ID` in a root `.env.local` to test web login locally.
