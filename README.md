# Task Manager

A Vue 3 / TypeScript / Quasar frontend and Express / TypeScript / Prisma / PostgreSQL backend. The two existing projects live in `taskmanager-frontend/` and `taskmanager-backend/`.

## Run locally

Use Node 26 and PostgreSQL. These commands work in Command Prompt or PowerShell.

1. Start the backend:

   ```text
   cd taskmanager-backend
   npm install
   npm run dev
   ```

   On Windows with PostgreSQL installed, the first development start creates `.env` with random JWT secrets and a password-protected project-local database on `127.0.0.1:15432`. Data lives in `taskmanager-backend/.local/postgres`. Each development start brings up that database, applies pending migrations, and generates the Prisma client. Both `.env` and `.local/` are ignored by Git. The database continues running when the API is stopped; run `npm run db:stop` to stop it. Its data is retained for the next start.

   To run this setup without starting the API, use `npm run setup:dev`. If PostgreSQL is installed in a custom location, set `PG_BIN` to its `bin` folder. Automatic binary detection supports Windows installations under `Program Files/PostgreSQL`.

   If you already have a database connection, create `.env` from `.env.example`, set `DATABASE_URL`, and replace both JWT secrets with different random values. Existing `.env` files are preserved. Generate each secret with:

   ```text
   node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
   ```

   Apply the schema to your task-manager database with `npm run db:deploy`, then run `npm run dev`. For Docker, `docker compose up -d` creates a PostgreSQL server on port 5432 matching the example connection; if that port is in use, adjust the Compose port and connection URL.

2. In another terminal, start the frontend:

   ```text
   cd taskmanager-frontend
   npm install
   npm run dev
   ```

3. Open **http://localhost:5173** and create an account. The API listens on port 3000. The frontend development proxy forwards `/api` to it. Use `localhost` consistently; `127.0.0.1` has a different origin.

In PowerShell, use `npm.cmd` if execution policy blocks the `npm.ps1` wrapper.

## Google sign-in

Select the Google Cloud project for Task Manager and check **Google Auth Platform > Branding** before creating or selecting its Web application client. The Google consent-screen name comes from that project's branding, not the frontend page title or OAuth client display name. Credentials from a project branded ServiceHub will continue to show ServiceHub during Google sign-in. Use a separate Task Manager project if the other project still serves another app.

Create a Google OAuth **Web application** client. Add `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI, and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in the backend `.env`. Restart the API; the frontend displays Google sign-in when configured. OAuth uses state, nonce, PKCE, and verification of Google's ID-token signature, issuer, audience, expiry and verified email. It never places an access token in the redirect URL. A matching password account is not automatically linked to a Google identity; use its existing password to sign in.

## API

All routes use `/api`. Protected requests require `Authorization: Bearer <accessToken>`. Login, registration, refresh and logout require the exact trusted `Origin` header. Dates use `YYYY-MM-DD`; timestamps use ISO 8601.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | API health |
| GET | `/auth/config` | Whether Google sign-in is configured |
| POST | `/auth/register` | `{name,email,password}`; returns public user and access token |
| POST | `/auth/login` | `{email,password}`; returns public user and access token |
| POST | `/auth/refresh` | Rotates the refresh cookie and returns a new access token |
| POST | `/auth/logout` | Revokes the session family and clears the cookie |
| GET | `/auth/me` | Current user's public profile |
| GET | `/auth/google` | Starts Google authorization |
| GET | `/auth/google/callback` | Completes authorization and redirects to the frontend |
| GET | `/tasks` | Current user's tasks; search, status, due-date filters, sorting, pagination |
| GET | `/tasks/stats` | Total, pending, completed, overdue, and pending tasks due today |
| POST | `/tasks` | `{title,description?,dueDate?,status?}` |
| GET | `/tasks/:id` | A task belonging to the current user |
| PATCH | `/tasks/:id` | Update any task fields; omitted fields are preserved |
| DELETE | `/tasks/:id` | Delete a task belonging to the current user |

List filters: `search`, `status=PENDING|COMPLETED`, `due=today|upcoming|overdue|none`, `sort=created|due|title`, `page`, and `limit` (1–100). `today=YYYY-MM-DD` aligns calendar filters with the client's local date. Error responses have `{error:{code,message,details?}}`.

## Authentication and caching

- Access tokens live in frontend memory and expire after 15 minutes by default. Reloading restores the session through the refresh cookie.
- Refresh JWTs use a separate signing secret. Only their SHA-256 hashes and session records are stored in PostgreSQL. Every refresh atomically consumes the old session and issues a new one. Reuse revokes the whole session family, including access to protected routes. Logout also revokes that family.
- The refresh cookie is HttpOnly, scoped to `/api/auth`, SameSite=Lax by default, and Secure in production. Development uses HTTP on localhost.
- Axios attaches access tokens, retries an expired-token request once, and shares one refresh promise among simultaneous requests. Browser Web Locks also serialize refresh requests across tabs. Browsers without Web Locks still serialize within each tab; a cross-tab race fails closed by revoking the session. Logout and account changes notify other tabs.
- Backend authentication mutations check the exact frontend Origin in addition to CORS and SameSite protection. Passwords are salted with scrypt. Sign-in and registration are rate limited.
- Every task query and mutation includes the authenticated user ID. Another user's task returns 404.
- Only validated task snapshots are cached in localStorage, keyed by user and list query. Caches hold at most six pages, expire after 24 hours, and clear on logout or account changes. Tokens and passwords are never saved there. The API refreshes cached pages on load, reconnection, tab focus, manual sync and successful mutations. Offline views are read-only snapshots; changes must succeed on the backend.

## Validation

See the [9 November 2026 application audit](docs/application-audit-2026-11-09.md) for verified coverage, resolved findings and release limitations.

```powershell
# backend
npm.cmd run build
npm.cmd run lint
npm.cmd test

# frontend
npm.cmd run typecheck
npm.cmd run build
npm.cmd run lint:check
```

Database integration tests require a **dedicated** PostgreSQL database whose name ends in `_test`. Apply the migrations there, then run:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://user:password@localhost:5432/taskmanager_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm.cmd run db:deploy
npm.cmd run test:integration
```

The integration suite creates its own test users and removes them afterward. It verifies CRUD ownership, filtering, partial updates, refresh rotation, replay, concurrent refresh, expiration and logout. Without `TEST_DATABASE_URL`, the suite skips database tests.

## Production

Follow the [Render + Vercel deployment guide](docs/deployment-render-vercel.md). The backend uses a native Render Node service with an explicit build-dependency install, lint/type checks, migrations before startup and database readiness checks. The Vercel frontend keeps secure cookies on its own host through the server-only API proxy. Existing Render services must update their dashboard build/start commands as described in the guide.

## Browser tests

Start both development servers against a dedicated test database. In the frontend, install Chromium with `npx.cmd playwright install chromium`, then run `npm.cmd run test:e2e`. On Windows, you can use the installed Microsoft Edge instead of downloading Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm.cmd run test:e2e
```

The tests create test accounts and exercise task CRUD, search, sorting, pagination recovery, cached reload, offline task reads, statistics failures, cache corruption, session races and logout across tabs. Both desktop and mobile touch viewports run by default. They require an empty browser session and create disposable users; use a dedicated development or test database. Offline viewing requires an existing authenticated session; reopening the app fully offline is not supported.

References: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Prisma client generation](https://docs.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/generating-prisma-client), [Quasar](https://quasar.dev/).

## Android Google sign-in and mobile layout

See the [Android setup and verification guide](docs/android-oauth-mobile.md) for the native Google flow, existing-session transport, phone layout fixes, Google Cloud package/signing registration, Java 21 APK builds and final device checks.
