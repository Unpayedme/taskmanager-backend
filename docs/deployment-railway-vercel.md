# Deploy Task Manager on Railway and Vercel

The active hosting target has changed to Render. Follow the [Render + Vercel guide](deployment-render-vercel.md); this Railway guide is retained for reference.

The backend repository runs on Railway with PostgreSQL. The frontend repository builds a Quasar SPA on Vercel. Both use Node **26.x**, pinned in `package.json`.

The browser calls the Vercel site's `/api` path. A server-only Vercel function forwards requests to Railway, preserves `Origin`, cookies and authorization, and returns Google redirects to the browser. Cookies therefore remain on the frontend host with `Secure`, `HttpOnly`, and `SameSite=Lax`. Keep the browser API base `/api`.

The function authenticates itself to Railway with `API_PROXY_SECRET` and forwards Vercel's platform-supplied visitor IP for rate limiting. This secret must never use a `QCLI_` prefix. The backend refuses application requests that bypass the proxy. Public `/api/health` and `/api/ready` remain available for platform probes.

## 1. Generate the secrets

Run this three times, keeping each result private:

```text
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Use different results for `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, and `API_PROXY_SECRET`. Store these in the hosting dashboards. Only the proxy secret is shared between Railway and Vercel; the token and Google secrets belong only on Railway. Example environment files contain no usable secrets.

## 2. Set up the Railway backend

1. Import `Unpayedme/taskmanager-backend` into a Railway service, with the repository root as its root directory.
2. Add PostgreSQL or use an existing production PostgreSQL provider. Set the backend `DATABASE_URL` using that provider's connection URL. For a Railway PostgreSQL service, use a Railway variable reference to its `DATABASE_URL`. Keep the provider's TLS settings; do not disable certificate verification.
3. Generate the API service's public HTTPS domain. This becomes Vercel's `RAILWAY_API_URL`.
4. Set the variables below. Use the permanent Vercel production origin, not a per-deployment preview URL. If you are creating both projects, get the API domain first, deploy the Vercel project with its two server-only variables, then copy Vercel's assigned production origin back to Railway and redeploy.

| Railway variable              | Value                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `NODE_ENV`                    | `production`                                                                                    |
| `DATABASE_URL`                | Production PostgreSQL connection URL                                                            |
| `FRONTEND_ORIGIN`             | `https://YOUR-PROJECT.vercel.app` or your custom frontend origin; no path or trailing slash     |
| `ACCESS_TOKEN_SECRET`         | First random secret                                                                             |
| `REFRESH_TOKEN_SECRET`        | Second random secret                                                                            |
| `API_PROXY_SECRET`            | Third random secret, also set on Vercel                                                         |
| `COOKIE_SAME_SITE`            | `lax`                                                                                           |
| `TRUST_PROXY`                 | `1` for Railway's public ingress; visitor rate limiting uses the authenticated Vercel IP header |
| `DATABASE_POOL_MAX`           | `5` initially                                                                                   |
| `DATABASE_CONNECT_TIMEOUT_MS` | `5000`                                                                                          |
| `SESSION_CLEANUP_MINUTES`     | `60`                                                                                            |

Railway supplies `PORT`. The server listens on `0.0.0.0` and that port. Do not set a fixed port in the Railway dashboard.

The committed `railway.json` selects Railpack, installs from the lockfile with build dependencies, compiles the app, applies checked-in migrations using `prisma migrate deploy`, starts the compiled server, and checks `/api/ready`. Prisma CLI is a production dependency so the pre-deploy migration command remains available after dependency pruning. The service uses one replica because the rate-limit store is process-local. Add a shared store before enabling multiple replicas.

An initial deployment can fail until the required variables are set. Redeploy after completing them. A failed migration or readiness check must be resolved before accepting traffic; do not replace migration deployment with `prisma migrate dev` or `db push`.

## 3. Set up Vercel

Import `Unpayedme/taskmanager-frontend`. Use its repository root and the committed `vercel.json`:

| Setting             | Value                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Framework preset    | Other (`framework: null` in config)                                                             |
| Install             | `npm ci --include=dev`                                                                          |
| Build               | `npm run build:vercel`                                                                          |
| Output directory    | `dist/spa`                                                                                      |
| Node                | `26.x`                                                                                          |
| `RAILWAY_API_URL`   | Railway's HTTPS origin, e.g. `https://YOUR-API.up.railway.app`; no `/api`, query or credentials |
| `API_PROXY_SECRET`  | Same proxy secret as Railway                                                                    |
| `QCLI_API_BASE_URL` | Omit it, or set `/api`                                                                          |

Set the server-only variables for the **Production** environment. The build validates them without printing their contents. It rejects a public absolute browser API URL because that would bypass same-host authentication.

API paths rewrite to the Node function in `api/proxy.mjs`. The proxy uses manual redirect handling, preserves separate `Set-Cookie` headers, enforces the API's 32 KiB write limit, and disables API caching. Static assets use immutable caching; the HTML entry point can update on each deployment.

For preview deployments, configure a separate staging backend, secrets and exact staging frontend origin. Production authentication deliberately rejects arbitrary preview origins. A preview without its required server variables fails the deployment check rather than silently using production secrets.

## 4. Configure Google for the production origin

Use the existing **Task Manager** Google Cloud project (`task-manager-514207`), or a dedicated production project with the same app branding. Set on Railway:

```text
GOOGLE_CLIENT_ID=YOUR_TASK_MANAGER_WEB_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_TASK_MANAGER_WEB_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://YOUR-FRONTEND/api/auth/google/callback
```

Add that exact redirect URI to the Google Web application client. Use the frontend origin for the authorized JavaScript origin. The callback goes through Vercel so the OAuth state cookie, callback and refresh cookie share the frontend host. A Railway-domain callback is rejected by production validation.

Keep the localhost callback for local development if you use the same Web client. Add the production callback rather than replacing a callback still used locally. Restart/redeploy Railway after changing OAuth variables.

The current Google project is in **Testing** mode. Add permitted test accounts for a restricted launch. Before public sign-in, complete the Google branding, homepage/privacy links, audience/publishing settings and any verification Google requires. Those account/domain settings cannot be finalized before you choose the real production URL. If Google is not yet ready, leave both client values empty; email/password authentication still works.

## 5. Verify the deployment

1. Open `https://YOUR-API/api/ready`: expect `{"status":"ready"}`.
2. Open `https://YOUR-FRONTEND/api/ready`: expect the same JSON, proving the Vercel-to-Railway path works.
3. Open `https://YOUR-API/api/auth/config`: expect `403 UNTRUSTED_PROXY`. The equivalent frontend URL must work.
4. Register a disposable account, create/edit/complete/delete a task, reload the page, and sign out. Confirm the refresh cookie is Secure/HttpOnly with path `/api/auth`.
5. Sign in with Google and confirm Task Manager branding, successful return to the dashboard and session restoration after reload.
6. Check Railway deployment/migration logs and Vercel function logs for failures. A backend outage returns an API error, not cached personal task responses.

Local release checks:

```text
# Backend
npm ci --include=dev
npm run build
npm test
# With a dedicated *_test database, apply migrations and run test:integration.

# Frontend
npm ci --include=dev
npm run typecheck
npm run lint:check
npm run test:proxy
npm run build
```

`node scripts/verify-production.mjs` in the backend runs an isolated full-stack verification when the frontend repo is next to it. It requires PostgreSQL binaries, OpenSSL and a Playwright browser; it creates a temporary local database and HTTPS certificate, runs migrations and integration tests, starts the production API, runs desktop/mobile browser tests through the real proxy handler, and verifies readiness failure during a database outage. It uses separate ports and never uses the configured production database. On Windows it detects PostgreSQL under Program Files, OpenSSL bundled with Git, and Edge by default. Set `PG_BIN`, `OPENSSL_BIN`, `FRONTEND_PATH`, or `PLAYWRIGHT_CHANNEL` when needed. The self-signed certificate exception is restricted to this loopback test; deployed HTTPS validation stays enabled.

## Operations and rollback

- Configure database backups in the database provider and test a restore before relying on the service. Application rollback does not roll back database migrations; use backward-compatible migrations and retain a backup for destructive schema changes.
- Railway receives SIGTERM, stops accepting requests, closes idle connections and disconnects PostgreSQL, with a ten-second shutdown limit. Its readiness probe checks the database, while liveness remains available during database outages.
- Expired session rows are pruned hourly by default. Revoked but unexpired rows remain for replay detection.
- Keep Railway and Vercel in nearby regions, monitor API errors and database connection use, and adjust pool capacity within your database plan's limits.
- For rollback, redeploy the previous successful Railway deployment and previous Vercel deployment. Keep the same secrets unless revocation is intended, and check migration compatibility first.

References: [Railway configuration](https://docs.railway.com/config-as-code/reference), [Railpack Node builds](https://railpack.com/languages/node/), [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [Vercel visitor IP headers](https://vercel.com/docs/headers/request-headers), [Google OAuth setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
