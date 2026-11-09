# Android Google sign-in and phone layout

## Problems found and changes

The APK inherited the browser's relative `/api` base. Inside Capacitor that addresses the local WebView host, rather than the deployed API proxy. The failed configuration request hid the Google button. The old button also navigated Google's authorization page inside the WebView.

Android now uses Capacitor platform detection, the public HTTPS Vercel `/api` endpoint, and Capacitor's native HTTP transport. Ordinary web browsers retain their existing same-origin Axios transport and server-redirect Google flow. Android uses `@capgo/capacitor-social-login` 8.x and Google's native Credential Manager, with authentication-only online mode; no Google OAuth page runs inside the WebView. Other providers are disabled in the Capacitor configuration.

The backend exposes its public Web OAuth client ID through `/api/auth/config`. Android obtains a five-minute nonce challenge, passes the nonce to Google and sends the returned identity token to `/api/auth/google/native`. The backend verifies Google's signature, issuer, audience, expiry, verified email and nonce, then atomically consumes the challenge. A replay or simultaneous second consumption fails. Existing Google accounts and the existing user/session tables are reused, and matching password accounts are not silently linked. A small `NativeGoogleChallenge` table stores only short-lived nonce hashes and expiry dates.

Native HTTP uses Android's persistent cookie manager for the existing Secure/HttpOnly refresh cookie. Access tokens stay in application memory; cookies and refresh tokens are not written to localStorage or Preferences. Cookie response headers are omitted from Axios responses. The native transport limits requests to the configured HTTPS frontend API and supplies that origin to the existing CSRF check. The Vercel proxy secret remains server-only. Cancellation leaves the user on the sign-in page; failures show a retryable message. Logout revokes the existing session and clears the native Google provider state.

Mobile-specific CSS improves 320–414 px layouts and short touch-screen landscape windows, readable task text, 44–48 px primary controls, filter layouts, scrollable dialogs and safe-area padding. The drawer closes on navigation, Escape and orientation changes, locks background interaction and restores focus. Quasar retains dialog back handling; the Android back button closes the drawer or minimizes the root workspace. Capacitor's SystemBars native inset handling and `adjustResize` support modern Android system bars and the keyboard. Desktop grid and sidebar styles are retained.

Relevant frontend files: `src/lib/native-transport.ts`, `src/lib/api.ts`, `src/pages/AuthPage.vue`, `src/pages/TaskPage.vue`, `src/css/mobile.scss`, `quasar.config.ts`, Capacitor config/dependencies, and Android activity/manifest/plugin wiring. Backend changes cover the Google controller/service/routes, nonce repository/migration, startup migrations and expiry maintenance. Tests cover native token verification, replay, transport and the phone layouts.

## Install and deploy

From the frontend repository:

```text
npm ci --include=dev
```

The root postinstall also installs the locked `src-capacitor` dependencies before Quasar prepares its aliases. This is needed for clean Vercel/CI builds because Quasar aliases installed Capacitor packages in every mode. The lockfiles include `@capacitor/core` 8.x, `@capacitor/app` 8.x, and `@capgo/capacitor-social-login` 8.x. To add them manually to another checkout:

```text
npm install @capacitor/core@^8 @capacitor/app@^8 @capgo/capacitor-social-login@^8
cd src-capacitor
npm install @capgo/capacitor-social-login@^8
cd ..
```

Deploy the backend changes before using the new APK. `npm start` now applies checked-in migrations before starting the compiled server, supporting Render's existing start command. `npm run start:render` also applies migrations. The existing database and users are retained. Vercel must use the same `API_PROXY_SECRET` as Render. Check the frontend `/api/auth/config` returns `googleEnabled: true` and a non-empty `googleClientId` after deployment.

The Android API defaults to `https://platform-tech-taskmanager.vercel.app/api`. To use a different frontend or staging installation, set public build variable `QCLI_NATIVE_API_BASE_URL` to its HTTPS origin followed by `/api`. Never point it directly to Render or include credentials. Browser `QCLI_API_BASE_URL` remains `/api`.

## Required Google Cloud setup

In the existing Task Manager Google Cloud project (`task-manager-514207`), create an **Android** OAuth client for:

```text
Package: com.taskmanager.app
Debug signing SHA-1: 27:EA:9A:49:81:1A:8B:D9:96:B2:99:C1:E1:58:D7:92:19:D7:89:4F
Debug signing SHA-256: 47:4A:6C:C5:CA:3E:91:87:2C:E0:F1:CD:CE:4C:F2:02:28:C4:B5:35:B0:02:69:E1:FE:E4:0A:43:6A:A3:F2:F7
```

These public fingerprints were read from this computer's debug signing certificate. Other computers may generate a different debug certificate. Register the SHA-1 for each actual signing certificate, including release and Play App Signing when distributing through Google Play. Recheck after changing a signing key:

```text
cd src-capacitor/android
gradlew.bat signingReport
```

Keep the backend `GOOGLE_CLIENT_ID` set to the existing **Web application** client in the same Google project. The native plugin needs that Web client ID as its token audience; the Android client ID does not replace it. Keep the Web client secret only on the backend. Do not package a client secret, service-account key or proxy secret in the APK.

The native Credential Manager flow does not require a new custom-scheme redirect. Preserve the existing web callback `https://platform-tech-taskmanager.vercel.app/api/auth/google/callback` in Google Cloud and Render's `GOOGLE_REDIRECT_URI`. Add allowed test accounts while Google's audience remains in Testing mode. Developer-console errors commonly indicate an unregistered package/SHA-1 or use of the wrong client type.

## Build the APK on Windows

Use **Java 21** with this Gradle wrapper. This machine also has Android Studio's Java 25, which fails with `Unsupported class file major version 69`.

PowerShell, from the frontend repository:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npx quasar build -m capacitor -T android --skip-pkg
cd src-capacitor/android
.\gradlew.bat assembleDebug
```

The standard combined Quasar packaging command is also available:

```text
npx quasar build -m capacitor -T android
```

Debug APK output:

```text
src-capacitor/android/app/build/outputs/apk/debug/app-debug.apk
```

Build SPA and Capacitor targets sequentially, because they share generated Quasar configuration. The debug APK and local SDK paths remain ignored by Git; install the rebuilt APK to pick up native plugin changes.

## Verification and final device checklist

Local verification completed: 25 backend unit/security tests, 11 PostgreSQL integration tests, 10 proxy/native-transport tests, and 38 desktop/mobile browser scenarios passed. The final layout fixtures and contrast changes were also checked separately. Both frontend/backend type/build/lint checks passed, a clean Vercel-style install/build passed, and Java 21 produced the debug APK. The production dependency advisory check reported zero known vulnerabilities. These results do not include a successful live Google login inside an installed APK.

Automated checks include backend signed-token and nonce verification, PostgreSQL migration and atomic challenge consumption, native transport error handling, browser session/task regressions, phone widths 320/360/375/390/414, portrait/landscape navigation, and short-window form/dialog scrolling. Browser tests do not substitute for a real Android keyboard or Google's live account chooser.

On an Android device with Google Play services, after registering the certificate:

- Install the APK and confirm the Google button appears; cancellation returns cleanly to the login page.
- Complete Google sign-in, confirm Task Manager branding and the existing account's tasks.
- Force-stop/reopen the app and confirm refresh-session restoration; sign out, reopen, and confirm it stays signed out.
- Test email/password registration and login, expired access-token refresh, and task create/edit/complete/delete/search/filter/pagination.
- Open the drawer, change views, rotate, press Android Back, and verify background content is not covered after closing it.
- Open the editor and keyboard at the smallest screen size; scroll to all inputs and Save/Cancel; inspect status/navigation bar and cutout spacing in portrait and landscape.
- Verify the web Google redirect flow and desktop task layout remain functional.

Live Android Google sign-in and native cookie restoration still require device verification. At implementation time the Android OAuth client was not registered. No physical device was connected, and the existing emulator failed to start because its data partition needed roughly 12 GB while only about 4 GB was free. No emulator data was deleted to resolve that limitation.

Sources: [Capgo Google setup](https://github.com/Cap-go/capacitor-social-login/blob/main/docs/setup_google.md), [Capacitor 8 compatibility](https://capgo.app/docs/plugins/social-login/), [Capacitor HTTP](https://capacitorjs.com/docs/apis/http), [SystemBars safe areas](https://capacitorjs.com/docs/apis/system-bars).
