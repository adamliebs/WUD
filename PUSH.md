# Push notifications setup

This is the one-time setup to get real OS push notifications working on iOS
(banners that show when the app is closed). The code is already wired — once
you've done these steps and dropped two files into the right places, push
notifications "just work."

Push uses **Firebase Cloud Messaging (FCM)** as the cross-platform layer:
- On **iOS**, Firebase translates your server's FCM messages into APNs payloads.
- On **Android** (if/when shipped), the same code paths deliver via FCM directly.

You'll create a Firebase project (free), generate an APNs key from Apple, and
hand the credentials off to the server via env vars.

---

## Part 1 — Apple Developer Portal (~10 min)

You need an **APNs Auth Key** that Firebase will use to talk to APNs on your
behalf. A single key works for all your iOS apps and never expires unless you
revoke it.

1. Sign in to https://developer.apple.com/account.
2. **Certificates, Identifiers & Profiles → Keys → +**.
3. Name: `WUD APNs key`. Tick **Apple Push Notifications service (APNs)**. **Continue → Register**.
4. **Download** the `.p8` file (Apple lets you download it **once** — back it up).
5. Note these three values (you'll paste them into Firebase in Part 2):
   - **Key ID** — shown on the key's detail page (10 characters).
   - **Team ID** — top-right of the Apple Developer site, under your name.
   - The `.p8` file itself.
6. Still in Apple Developer Portal → **Identifiers**. If `com.wud.app` isn't
   listed yet, click **+** → **App IDs → App → Continue**. Bundle ID = `com.wud.app`,
   tick **Push Notifications** under Capabilities. **Continue → Register**.
   (If `com.wud.app` is already registered, just edit it to enable Push.)

---

## Part 2 — Firebase Console (~10 min)

1. Go to https://console.firebase.google.com → **Add project**.
2. Project name: `wud` (or whatever). Disable Google Analytics — not needed.
3. In the new project, click the **iOS+** icon to add an iOS app:
   - Apple bundle ID: `com.wud.app` (must match `capacitor.config.ts`).
   - App nickname: `WUD iOS`.
   - App Store ID: leave blank.
   - **Register app**.
4. **Download `GoogleService-Info.plist`** when prompted.
5. Skip the rest of the SDK-install wizard (the Capacitor plugin handles it).
6. **Project Settings (gear icon) → Cloud Messaging tab → Apple app configuration**:
   - Under **APNs Authentication Key**, click **Upload**.
   - Upload the `.p8` file from Part 1, paste the **Key ID** and **Team ID**.
   - **Upload**.
7. Still in Project Settings → **Service accounts tab → Generate new private
   key → Generate key**. Saves a JSON file — this is what the server uses to
   send pushes. Keep it secret (never commit it).

---

## Part 3 — Drop the files into the repo

### Client (iOS app)

Put `GoogleService-Info.plist` here:

```
ios/App/App/GoogleService-Info.plist
```

Then in Xcode: **File → Add Files to "App"…**, pick the plist, tick
**Copy items if needed** + **App** target. (Xcode needs to know about the file
even though it's in the folder — otherwise Firebase can't find it at runtime.)

### Server (sending pushes)

Save the service-account JSON anywhere outside the repo, then point the server
at it via env var. Easiest:

```bash
# In server/.env (gitignored)
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/wud-firebase-adminsdk-xxxxx.json
```

Or paste the JSON contents inline (useful for hosted environments like Render):

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

The server reads either — `_PATH` takes precedence if both are set. With neither
set, `dispatchPush()` falls back to its console-log stub so the rest of the app
still runs without Firebase configured.

---

## Part 4 — Test the round-trip

1. `cd server && npm install && npm run dev` — server picks up the new env vars
   and logs `[push] firebase admin initialised` on boot.
2. `npm run cap:ios` — opens Xcode.
3. **In Xcode → App target → Signing & Capabilities**:
   - Make sure your **Team** is selected.
   - Click **+ Capability**, add **Push Notifications**.
   - Click **+ Capability** again, add **Background Modes** → tick
     **Remote notifications**.
   - (These create / update `App.entitlements` — already committed in this
     repo, but Xcode needs the capabilities toggled on for the build to sign
     with the right entitlement.)
4. Run on a **real iPhone** (the Simulator does not support real push — local
   notifications still work). The app will prompt for notification permission
   on first launch; accept it.
5. Background the app on the phone. From a *different* account on a web browser
   (or curl), do something that creates a notification for your phone account —
   e.g., RSVP to one of your plans as another user. Within a few seconds your
   phone should banner.
6. Check the server log: `[push] sent to <token-suffix> via FCM`.

If nothing arrives:
- Check the Capacitor Xcode log for `Permission denied` or `No APNs token`.
- Check the server log for `[push] firebase admin init failed` (bad credentials)
  or `[push] FCM send failed: <reason>` (bad token / wrong bundle id / APNs key
  not uploaded).
- Verify the bundle ID in Firebase (Project Settings → General → Your apps)
  matches `appId` in `capacitor.config.ts` exactly.

---

## What's in the code already

You don't need to touch any of this — it's wired and waiting for the files
above to exist:

| Layer | File | Role |
|---|---|---|
| Client | `src/native.ts` | Requests push permission, fetches the FCM token, posts it to the backend |
| Client | `src/api/endpoints.ts` | `meApi.registerDevice(platform, token)` → `POST /v1/me/devices` |
| iOS | `ios/App/App/AppDelegate.swift` | Calls `FirebaseApp.configure()` at launch |
| iOS | `ios/App/App/Info.plist` | `FirebaseAppDelegateProxyEnabled = NO` (we let the plugin manage the APNs↔FCM handoff) |
| iOS | `ios/App/App/App.entitlements` | `aps-environment` (dev / prod auto-set by Xcode signing) |
| Server | `server/src/services/notifications.ts` | `dispatchPush()` uses `firebase-admin` to send FCM, falls back to console-log if not configured |
| Server | `server/src/lib/push.ts` | Firebase Admin SDK init + invalid-token cleanup helper |
| DB | `devices` table | Already exists with `push_token` column |

## Renewing / rotating credentials

- **APNs key**: only needs to be replaced if it leaks. To rotate, generate a
  new key in Apple Dev Portal, upload it to Firebase, then delete the old one
  in Apple Dev Portal.
- **Firebase service account**: rotate via Firebase Console → Service Accounts
  → "Manage service account permissions" → revoke old key, generate new one.
  Update `FIREBASE_SERVICE_ACCOUNT_*` and restart the server.
