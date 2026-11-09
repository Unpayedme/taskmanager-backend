# Deploy Task Manager on Render and Vercel

The backend now targets a native Node web service on **Render**. The frontend stays on **Vercel**, with its existing same-host `/api` proxy and secure-cookie authentication. No Docker setup is required.

## Fix an existing failed Render deployment

The reported `TS7016` errors for Express, CORS, cookie-parser and jsonwebtoken indicate that their development-only type packages were missing during compilation. Those packages are already declared in `package.json`. Do not remove strict type checking or add untyped module declarations.

In the existing Render backend service, select the backend repository, branch `main`, and the **Node** runtime. Its root directory should be empty because this repository itself is the backend root. Set:

| Render setting    | Value                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Build Command     | `npm run build:render`                                                                       |
| Start Command     | `npm run start:render`                                                                       |
| Health Check Path | `/api/ready`                                                                                 |
| Node version      | `26.7.0` from `.node-version`; remove an older `NODE_VERSION` override or set it to `26.7.0` |

`build:render` runs `npm ci --include=dev && npm run lint && npm run build`. The explicit install includes TypeScript, lint and declaration packages even when `NODE_ENV=production` or npm's omit setting excludes development dependencies. `npm run build` generates Prisma Client and compiles TypeScript. Backend `npm run lint` checks the handwritten source, scripts and tests without changing files.

Save the settings and redeploy the latest commit. Adding `render.yaml` to Git does **not** update a manually created service's commands automatically. The file is for Render Blueprint imports/syncs. If a stale install remains, use **Clear build cache & deploy**.

`start:render` applies checked-in migrations and then starts the compiled API. A migration failure stops startup. This supports Free services, which do not offer a separate pre-deploy command. For a paid service, you can instead set Pre-Deploy Command to `npm run db:deploy` and Start Command to `node --enable-source-maps dist/server.js`. Keep one API instance while rate limits use an in-memory store.

## Backend environment

Set these in the Render service's Environment page; local ignored `.env` files are not uploaded:

| Variable                      | Value                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`                    | `production`                                                                                 |
| `DATABASE_URL`                | The production PostgreSQL URL; use the internal URL for a Render database in the same region |
| `FRONTEND_ORIGIN`             | Exact Vercel production origin, e.g. `https://your-app.vercel.app`, with no trailing slash   |
| `ACCESS_TOKEN_SECRET`         | A random secret of at least 32 characters                                                    |
| `REFRESH_TOKEN_SECRET`        | A different random secret of at least 32 characters                                          |
| `API_PROXY_SECRET`            | A third random secret, shared only with Vercel's server-side proxy                           |
| `COOKIE_SAME_SITE`            | `lax`                                                                                        |
| `TRUST_PROXY`                 | `1`                                                                                          |
| `DATABASE_POOL_MAX`           | `5` initially                                                                                |
| `DATABASE_CONNECT_TIMEOUT_MS` | `5000` initially                                                                             |
| `SESSION_CLEANUP_MINUTES`     | `60` initially                                                                               |

Render supplies `PORT`; the app listens on `0.0.0.0` and that port. Preserve your existing production database and secrets when repairing a deployment. For a new install, generate each secret separately:

```text
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

The optional `render.yaml` Blueprint uses the Free web plan and prompts for the database, frontend origin and shared proxy secret; it generates distinct token secrets for new services. It does not provision or replace a database. Add new secret variables manually when updating an existing Blueprint service.

## Vercel environment

Keep the frontend repository's committed Vercel build/function settings. Set these server-only variables for Production:

| Variable            | Value                                                                                |
| ------------------- | ------------------------------------------------------------------------------------ |
| `BACKEND_API_URL`   | The actual Render HTTPS origin, e.g. `https://your-api.onrender.com`, without `/api` |
| `API_PROXY_SECRET`  | The same value configured on Render                                                  |
| `QCLI_API_BASE_URL` | Omit, or use `/api`                                                                  |

Redeploy Vercel after changing variables. `RAILWAY_API_URL` remains a backward-compatible fallback, but `BACKEND_API_URL` takes precedence; remove the old variable when switching. Never prefix backend/proxy secrets with `QCLI_`, because those variables are exposed in the client build.

The browser calls only the Vercel `/api` path. The proxy preserves Origin, authorization, cookies and Google redirects, and authenticates to Render with the shared secret. Direct application API requests to Render return `403 UNTRUSTED_PROXY`; public readiness/liveness endpoints remain accessible. Keep production and preview/staging secrets and origins separate.

## Google sign-in

Use the existing **Task Manager** Google Cloud project. On Render, configure both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, plus:

```text
GOOGLE_REDIRECT_URI=https://YOUR-VERCEL-FRONTEND/api/auth/google/callback
```

Add that exact callback in the Google Web client and use the frontend origin as its authorized JavaScript origin. The callback stays on **Vercel**, so OAuth state and refresh cookies share the frontend host. Keep any localhost callback still used for development. Leave both Google client values empty if password authentication should run before Google is configured.

Google's audience/publishing and branding settings must cover the production origin and intended accounts. A project in Testing mode only permits configured test users.

## Verify after redeploying

1. Confirm the Render log completes the explicit dependency install, lint, Prisma generation, TypeScript build, migrations and API startup.
2. Open `https://YOUR-RENDER-API/api/ready` and `https://YOUR-VERCEL-FRONTEND/api/ready`; both should return `{"status":"ready"}`.
3. Confirm Render `/api/auth/config` rejects direct requests, while the Vercel equivalent works.
4. Register/sign in, create/edit/complete/delete a task, reload to restore the session and sign out. Test both desktop and mobile.
5. Test Google consent and the callback on the production frontend origin.

For local checks, run backend `npm run build` and `npm run lint`, plus frontend `npm run typecheck`, `npm run lint:check`, `npm run test:proxy` and `npm run build`. The backend's `scripts/verify-production.mjs` also runs isolated PostgreSQL integration and desktop/mobile HTTPS browser checks using the real proxy.

Configure database backups and test a restore. When rolling back, check migration compatibility; restoring an older application deployment does not reverse database migrations. Review Render deployment logs and Vercel function logs for runtime failures. A successful local build does not verify production credentials, database connectivity or provider routing.

References: [Render Node deployment](https://render.com/docs/deploy-node-express-app), [Node version selection](https://render.com/docs/node-version), [Blueprint specification](https://render.com/docs/blueprint-spec), [deployment and migration commands](https://render.com/docs/deploys), [deployment troubleshooting](https://render.com/docs/troubleshooting-deploys).
