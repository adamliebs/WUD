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

```bash
# 1. Point the build at the deployed API (a device cannot reach localhost).
echo 'VITE_API_URL=https://api.your-domain.com' > .env

# 2. Build the web app and copy it into the native projects.
npm run cap:sync

# 3. Open the native IDE and run on a simulator/device.
npm run cap:ios       # opens Xcode
npm run cap:android   # opens Android Studio
```

`cap:sync` runs `npm run build` then `cap sync` (copies `dist/` + updates plugins).
Run it after every web change before building natively.

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
