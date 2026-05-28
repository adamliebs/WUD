# Authentication setup

The app supports three signin paths, all backed by Firebase Authentication
on the server side:

- **Sign in with Apple** (native iOS sheet) — required by App Store 4.8.
  iOS only — Android hides the button.
- **Sign in with Google** (native sheet on iOS + Android, web flow on web)
- **Email + password** with email verification and Firebase-driven password reset

You finished `PUSH.md` already so Firebase Admin SDK + service account JSON
are in place server-side. This doc covers the **client-side provider
enablement** in Firebase Console + the platform-specific capabilities
needed for each provider on each platform.

---

## Part 1 — Firebase Console (~5 min)

1. Open the Sign-in Providers page directly:
   **https://console.firebase.google.com/project/_/authentication/providers**
   (the `_` resolves to your selected project — replace it with your
   project ID if you have multiple projects).

   Or navigate manually: https://console.firebase.google.com → open your
   WUD project → left sidebar → **Authentication** → **Sign-in method** tab.
   (The "Build" parent menu was removed in a 2025 Firebase Console
   redesign — Authentication is now a top-level sidebar item.)

   If Authentication shows a "Get started" splash the first time, click
   it once to enable Firebase Auth for the project, then continue.

2. Enable the providers you want, in this order:

### Email/Password
- Click **Email/Password** → toggle **Enable** → **Save**.
- Leave "Email link (passwordless sign-in)" disabled unless you want it.

### Apple (iOS only)
- Click **Apple** → toggle **Enable**.
- **Services ID**: leave blank for iOS-native signin.
- **Apple Team ID**, **Key ID**, **Private key**: leave blank — only needed
  for the web Sign-In-with-Apple flow which we don't use.
- **Save**.

### Google
- Click **Google** → toggle **Enable**.
- **Public-facing name**: `WUD` (shown on the OAuth consent screen).
- **Support email**: pick yours.
- **Save**.

After saving Google, Firebase auto-generates a **Web client ID** and **Web
client secret** under "Web SDK configuration." You don't need to copy these
manually — they're embedded in your `GoogleService-Info.plist` (iOS) and
`google-services.json` (Android) so the native plugin uses them automatically.

### Email templates (verification + reset)

- Direct link: **https://console.firebase.google.com/project/_/authentication/emails**
  (or sidebar → **Authentication** → **Templates** tab).
- Customise the **Email address verification** template:
  - Sender name: `WUD`
  - From: `noreply@<your-firebase-project>.firebaseapp.com` (default — fine)
  - Subject + body: edit if you want — the default works.
- Same for **Password reset** template.
- Both are sent automatically by Firebase — your server doesn't compose them.

---

## Part 2 — iOS capabilities (~5 min)

### Apple Developer Portal

1. Go to https://developer.apple.com/account → **Identifiers**.
2. Click your `app.wud.app` App ID.
3. Under **Capabilities**, tick **Sign In with Apple** → **Save**.
4. Confirm when prompted — this regenerates your provisioning profile.

### Xcode

1. Open the project: `npm run cap:ios`
2. Select the **App** target → **Signing & Capabilities** tab.
3. Click **+ Capability** → search for **Sign In with Apple** → add it.
4. The entitlement is now added to `App.entitlements`:
   ```xml
   <key>com.apple.developer.applesignin</key>
   <array>
     <string>Default</string>
   </array>
   ```

If Xcode shows a signing error after enabling it, tick **Automatically
manage signing** → it re-downloads the profile with the new entitlement.

---

## Part 3 — Android setup (~10 min)

### Add Android app to Firebase

1. **Firebase Console → Project settings (gear icon) → General**.
2. Under "Your apps", click **Add app** → **Android** icon.
3. **Package name**: `app.wud.app` (must match `appId` in `capacitor.config.ts`)
4. **App nickname**: `WUD Android`
5. **SHA-1 certificate fingerprint**: see below for how to get it. You can
   skip this initially and add it later — but **Google Sign-In on Android
   won't work without it**.
6. **Register app** → **Download `google-services.json`**.

### Get your SHA-1 fingerprint

For debug builds (running on your phone via Android Studio):

```bash
cd android
./gradlew signingReport
```

Look for the `:app:signingReport` section → `Variant: debug` → copy the
**SHA-1** and **SHA-256** lines. Add both in Firebase Console → Project
Settings → Your apps → Android app → Add fingerprint.

For release builds (Play Store), you'll need to add Play App Signing's
fingerprint too — that lives in Play Console → Setup → App signing.

### Drop google-services.json into the repo

Place it at:

```
android/app/google-services.json
```

The file is already in `.gitignore` (don't commit it — it contains your
project's API keys). The Capacitor Firebase plugin reads it at runtime.

### Build + run

```bash
npm run cap:android
```

Opens Android Studio. Pick an emulator or connect a device → Run (▶).
Tap "Continue with Google" — the Google account picker should appear.

> **No Apple button on Android by design.** Apple Sign In is technically
> available via a web flow on Android, but most Android users don't have
> an Apple ID and the browser hop is a worse UX than just using Google or
> email. We hide the button via the `platform === 'ios'` check in
> `WelcomeScreen.tsx`.

---

## Part 4 — Test the full flow

### iOS

1. Restart the server (`Ctrl-C` + `npm run dev` from `server/`) so it picks
   up any Firebase config changes.
2. `npm run cap:ios` → run on a **real iPhone** (Apple Sign In doesn't work
   in Simulator; Google does).
3. From the welcome screen:
   - **Continue with Apple** → native sheet → Face ID → onboarding screen
     with your name prefilled → pick handle + DOB → in.
   - **Continue with Google** → native sheet → pick account → onboarding → in.
   - **Continue with email** → sign-up flow:
     - Email + password (≥8 chars)
     - Firebase creates the account and fires a verification email
     - Onboarding → in, with a yellow "Verify your email" banner above the feed
     - Check inbox, tap link, banner disappears on next signin

### Android

1. `npm run cap:android` → run on emulator or device.
2. From the welcome screen:
   - **Continue with Google** → account picker → onboarding → in.
   - **Continue with email** → same flow as iOS.
3. Apple button is correctly hidden.

### Password reset

1. From the log-in screen (any platform), tap **Forgot password?**.
2. Enter the email you used to sign up via Firebase → tap **Send reset link**.
3. Firebase emails the link from `noreply@<project>.firebaseapp.com`.
4. Tap the link → land on Firebase's hosted reset page → set new password.
5. Come back to the app and log in with the new password.

> **Legacy users**: anyone who signed up via `/v1/auth/email/register`
> BEFORE this Firebase migration (e.g. the seed `admin@wud.app`) doesn't
> exist in Firebase Auth, so password reset is a silent no-op for them.
> Login still works — the client falls back to the legacy endpoint
> automatically. If a legacy user needs to reset, delete-and-resignup is
> the workaround, or sign in via Google/Apple with the same email.

---

## How the architecture works

```
┌──────────────────────────┐         ┌──────────────────────────┐
│  Client (iOS / Android)  │         │  Backend server          │
│                          │         │                          │
│  @capacitor-firebase/    │         │  /v1/auth/firebase       │
│  authentication          │         │                          │
│                          │         │  firebase-admin          │
│  Native Apple/Google     │         │  .verifyIdToken(token)   │
│  sheet → Firebase ID     │  POST   │      ↓                   │
│  token ─────────────────────────────► auth_identities lookup  │
│                          │         │      ↓                   │
│                          │         │  Issue WUD JWTs          │
│  ◄──────────────────────── access + refresh tokens            │
└──────────────────────────┘         └──────────────────────────┘
```

- **Firebase is the identity layer.** Apple / Google / email auth happens
  client-side via Firebase. The server doesn't talk to Apple or Google
  directly — it just verifies the Firebase ID token, which Firebase signs
  after a successful provider exchange.
- **WUD JWTs are our own.** Even though Firebase issues the initial token,
  our `/v1/auth/firebase` endpoint mints fresh WUD access + refresh tokens
  that get used for every API call. The Firebase token is consumed once,
  at signin. This keeps every API call under our own auth + session
  rotation rules.
- **`auth_identities` table links them.** Each user has one row per
  identity: `(provider, provider_subject)` where provider is `apple`,
  `google`, or `email`, and subject is the Firebase UID (for Firebase-Auth
  users) or the email address (for legacy `/v1/auth/email/register` users).

## Login flow (with legacy fallback)

```
                ┌─────────────────────────────┐
  user taps     │ Firebase signInWith         │
  "Log in" ──→  │  EmailAndPassword(email,pw) │
                └────────────┬────────────────┘
                             │
              ┌──────────────┴───────────────┐
              │                              │
        ✓ succeeded                    ✗ failed
              │                              │
              ↓                              ↓
   getIdToken → /v1/auth/firebase    /v1/auth/email/login (legacy)
              │                              │
              ↓                              ↓
        WUD session                    WUD session (legacy path)
```

New users → Firebase path. Legacy demo admin (`admin@wud.app`) → legacy path.
Either way the client lands in the app with a valid WUD JWT.

## Sign-out

`signOut()` does three things:
1. Calls `/v1/auth/logout` to revoke the refresh token server-side.
2. Calls `FirebaseAuthentication.signOut()` to invalidate the Firebase
   session so the next visitor gets the signin sheet, not a silent
   auto-resume of the previous account.
3. Clears local tokens + store state, routes back to the welcome screen.

## Renewing / rotating credentials

- **APNs key** (push only): rotate via Apple Dev Portal → Firebase Console.
  See `PUSH.md`.
- **Firebase service account** (server): rotate via Firebase Console →
  Service Accounts. Update `FIREBASE_SERVICE_ACCOUNT_*` env vars + restart server.
- **OAuth client IDs**: managed inside Firebase. If you regenerate them,
  re-download `GoogleService-Info.plist` (iOS) + `google-services.json`
  (Android) and re-deploy.
