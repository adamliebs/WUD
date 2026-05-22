# WUD — native iOS / Android builds

The WUD web app is wrapped as native apps with [Capacitor](https://capacitorjs.com).
The same React/Vite codebase runs in the browser and inside the native shell.

## Prerequisites

- **Node 22+**
- **iOS:** macOS + Xcode (Capacitor 8 uses Swift Package Manager — no CocoaPods)
- **Android:** Android Studio + a configured Android SDK

## Project layout

| Path | What it is |
|---|---|
| `capacitor.config.ts` | App id, name, plugin config |
| `ios/` | Native Xcode project (committed) |
| `android/` | Native Android Studio project (committed) |
| `assets/source/*.svg` | Editable brand artwork |
| `assets/*.png` | Rasterised icon/splash inputs for the generator |
| `src/native.ts` | Native-shell wiring (status bar, splash, back button, deep links) |

## Everyday workflow

The native build's API URL comes from **`.env.production`** (Vite reads it in
"production" mode, which the native build uses). It's preset to your Mac's LAN
IP so the iOS Simulator, a physical iPhone/Android, and the Android emulator
can all reach a local dev backend — they must share your Mac's Wi-Fi. Update
it if your network changes; point it at your deployed HTTPS API for a release.

```bash
# Build the web app, copy it into the native projects, and open the IDE:
npm run cap:ios       # opens Xcode
npm run cap:android   # opens Android Studio
```

`cap:ios` / `cap:android` run `npm run build` → `cap sync` → open the IDE.
Re-run after every web or config change — the IDE's Run button alone won't
pick up web changes.

## Running on iOS

1. Start the backend so the device can reach it: `cd server && npm run dev`.
2. `npm run cap:ios` — opens the project in Xcode.
3. In Xcode → **Signing & Capabilities**, select your **Team** (your Apple
   Developer account). The Simulator needs no signing; a physical device does.
   If the bundle id `com.wud.app` is unavailable, change `appId` in
   `capacitor.config.ts` to a unique reverse-domain and re-run `cap:ios`.
4. Pick a Simulator or your connected iPhone in the toolbar, press ▶.

`Info.plist` already permits cleartext HTTP to local-network addresses
(`NSAllowsLocalNetworking`) so the app can reach the dev backend; production
HTTPS traffic is unaffected.

### Live reload against a dev machine (optional)

For fast iteration you can point the native shell at the Vite dev server.
Add to `capacitor.config.ts` temporarily:

```ts
server: { url: 'http://<your-LAN-ip>:5173', cleartext: true }
```

Then `npm run dev` and `npm run cap:sync`. Remove it before shipping.

## App icon & splash screen

Artwork lives in `assets/source/` as editable SVGs. To regenerate every
platform size after changing them:

```bash
npm run gen:icons
```

This rasterises the SVGs (`scripts/gen-icons.mjs`) and runs `capacitor-assets`
to populate `ios/` and `android/`.

## Deep links

`src/native.ts` handles `wud://plan/<id>` (and `…/activity/<id>`) links.

- **Custom scheme `wud://`** is registered in `ios/App/App/Info.plist`
  (`CFBundleURLTypes`) and `android/.../AndroidManifest.xml` (intent filter).
- **Universal / App Links** (`https://your-domain.com/plan/<id>`) additionally
  need an Apple `apple-app-site-association` file and an Android
  `assetlinks.json` hosted on your domain, plus the Associated Domains
  capability — configure these once you have a domain (DEPLOYMENT.md phase D).

## Before shipping to the stores

- Change `appId` in `capacitor.config.ts` from `com.wud.app` to a
  reverse-domain identifier you own; keep it in sync with Xcode's bundle id
  and Android's `applicationId`.
- Set the marketing version + build number in Xcode / `android/app/build.gradle`.
- Configure signing (Apple certificates & provisioning profiles; an Android
  keystore). See `DEPLOYMENT.md` phase D.
- Orientation is locked to portrait on both platforms by design.

## Mobile readiness checklist

### Done — works on both iOS & Android

- [x] Capacitor wrapping; `ios/` + `android/` projects committed
- [x] App icon ("W" mark) + splash screen — all sizes, both platforms
- [x] Build scripts — `cap:ios`, `cap:android`, `gen:icons`
- [x] Safe-area insets — notch, status bar, home indicator
- [x] Status-bar styling (dark theme, light icons)
- [x] Portrait orientation lock
- [x] Glass panels — iOS real blur · Android opaque fallback
- [x] Splash hides on first paint
- [x] Deep links — `wud://plan/<id>` (scheme registered both platforms)
- [x] Keyboard handling
- [x] Android hardware back button (iOS uses the edge-swipe)
- [x] Camera + photo library (file picker; iOS usage strings)
- [x] Local notifications — OS banners for alerts/reminders while the app runs
- [x] Env-driven API URL · Android cleartext · iOS ATS exception · CORS
- [x] REST + WebSocket realtime both work natively
- [x] Full app functional on device (auth, feed, plans, chat, squads,
      friends, pings, live status, profile, settings, delete account, uploads)

### To run on a physical device

- [ ] iOS: set your signing **Team** in Xcode (Simulator needs nothing)
- (Android debug builds run with no signing)

### Before App Store / Play Store launch

**Remote push notifications** — notifications when the app is fully closed
- [ ] APNs (iOS) + FCM (Android) — needs a Firebase project + an APNs key
- [ ] `@capacitor/push-notifications` plugin + real `dispatchPush` backend send

**Signing & release builds**
- [ ] iOS distribution certificate + provisioning profile
- [ ] Android release keystore + signed `.aab`
- [ ] Register the bundle id with Apple / Google

**Store accounts & listings**
- [x] Apple Developer account
- [ ] Google Play Developer account
- [ ] Screenshots, descriptions, keywords per platform
- [ ] Privacy nutrition labels (Apple) / Data Safety form (Google)
- [ ] Hosted Privacy Policy + Terms of Service

**Trust & safety (Apple requires these for a social/UGC app)**
- [ ] Report / block users
- [ ] Content moderation for chat / photos / profiles
- [ ] Age-rating questionnaire

**Production hardening**
- [ ] Deploy the backend over HTTPS; point `.env.production` at it
- [ ] Store auth tokens in Keychain / Keystore (currently WebView `localStorage`)
- [ ] Universal / App Links (needs your domain)
- [ ] Error boundaries + crash reporting
