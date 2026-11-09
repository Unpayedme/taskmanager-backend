# Railway + Vercel deployment readiness

Hosting update: the backend now targets Render. Follow the [Render + Vercel guide](deployment-render-vercel.md). The reported Render build omitted development type packages; the new production build explicitly includes them and runs the backend lint check. The normal build/lint commands also restore missing development packages through lifecycle hooks, so manually configured Render services using `npm install && npm run build` are supported. A clean production-mode install/build, backend lint and 20 unit tests, six proxy tests, and frontend build/type/lint checks passed for this change. The Railway verification below records the earlier preparation.

Prepared on 9 November 2026. Follow the [deployment guide](deployment-railway-vercel.md) for the hosting settings.

## Prepared

- Railway Railpack configuration with a Node 26 build, migration pre-deploy step, compiled start command, database readiness check, graceful drain and one API replica.
- Vercel build/output configuration, server-only `/api` proxy, same-host secure-cookie authentication, uncached API responses and static asset caching.
- Shared proxy authentication and platform-supplied visitor addresses so requests cannot forge rate-limit identities through the public Railway service.
- Production validation for PostgreSQL URLs, HTTPS frontend/callback origins, complete Google configuration and three distinct non-placeholder secrets.
- Bounded database connection pooling, connection timeouts and periodic cleanup of expired sessions while retaining unexpired replay-detection records.
- Example production variables, a full-stack HTTPS smoke-test script, and GitHub Actions checks for both repositories.

## Verification

| Check                                                              | Result                                          |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| Backend unit/security/configuration tests                          | 20 passed                                       |
| PostgreSQL integration tests, including session cleanup            | 10 passed                                       |
| Vercel proxy tests                                                 | 6 passed                                        |
| Desktop/mobile browser tests against the production API over HTTPS | 16 passed                                       |
| Backend build and frontend type checking                           | Passed                                          |
| Frontend production and Vercel build commands                      | Passed                                          |
| Frontend formatting and lint                                       | Passed                                          |
| Production dependency advisory checks                              | Zero known vulnerabilities in both repositories |
| Railway and Vercel configuration constraints                       | Validated against provider schemas              |
| Direct Railway application requests without proxy authentication   | Rejected                                        |
| Readiness during an actual test-database outage                    | 503; liveness remained 200                      |

The **52 automated tests** passed locally. The production smoke test used a separate PostgreSQL database and test ports, the compiled production API, a temporary loopback HTTPS certificate, Secure cookies and the actual Vercel proxy handler. Production provider credentials, DNS and remote deployment routing were not used in this test. GitHub Actions workflow runs are separate checks performed after pushing.

## Required before a live launch

1. Create/import the Railway backend and Vercel frontend projects and configure the exact production hostnames.
2. Set the production database URL, token secrets, shared proxy secret and frontend origin in the appropriate dashboards. Keep secrets out of Git and client-side `QCLI_` variables.
3. Register the final Vercel callback in the Task Manager Google Cloud client and configure its production audience/branding. It remains in Testing mode until its owner completes that release setup.
4. Configure and verify database backups, then run the hosted smoke checks in the guide.

No hosting accounts, paid resources, DNS or public deployments were changed during this preparation. Readiness covers the committed implementation and local production verification; the actual Railway/Vercel launch requires the environment-specific settings above.
