# Task Manager application audit

Date: 9 November 2026 (Asia/Shanghai)

For subsequent production configuration and 52 release checks, see the [Railway + Vercel readiness report](deployment-readiness-2026-11-09.md).

## Result

The local production builds and all 41 automated checks passed after the fixes below. Live Google sign-in was also verified after correcting the OAuth project and app branding. The npm advisory checks reported zero known vulnerabilities in both dependency trees after compatible updates. This is a source and functional audit of the current app, not a guarantee that every browser, deployment or attack scenario has been tested.

Repositories: [backend](https://github.com/Unpayedme/taskmanager-backend) and [frontend](https://github.com/Unpayedme/taskmanager-frontend).

## Fixes

| Finding                                                                                                                     | Correction                                                                                                                                    | Verification                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Backend dependency audit reported 6 affected packages; frontend reported 4.                                                 | Installed compatible fixes and updated lockfiles.                                                                                             | Both npm audits reported zero vulnerabilities.                                                                                           |
| Combining `status=COMPLETED` and `due=overdue` silently replaced the requested status with pending.                         | Apply the pending-only overdue condition alongside the requested status, so contradictory filters return an empty result.                     | PostgreSQL regression test failed before the fix and passed afterward.                                                                   |
| Completing the last task on page 2 of the Pending list left the UI on an empty page.                                        | Clamp the selected page after successful task loading when the number of pages shrinks. This also covers deletion and status changes.         | Desktop and mobile tests create 21 tasks, complete the only task on page 2, and verify recovery to page 1.                               |
| A failed statistics request could discard a successful task response and the footer could imply that everything was synced. | Handle list and statistics results independently, mark unavailable statistics, retain the successful list, and show a sync warning.           | Desktop and mobile tests simulate a statistics outage while loading an uncached search.                                                  |
| Cache validation accepted impossible dates, allowing a corrupted snapshot to cause a rendering exception.                   | Require real calendar dates and ISO timestamps; reject future-dated snapshots. Preserve the current valid in-memory view on refresh failures. | Desktop and mobile tests inject an invalid cached date and check that the app remains usable without uncaught exceptions.                |
| A late rejection of an old refresh request could invalidate a newer sign-in.                                                | Bind refresh failure handling and request retries to the session generation that started them.                                                | Desktop and mobile tests hold an expired-session refresh, change sessions, then release the old rejection while a new sign-in is queued. |
| Google callback validation accepted truthy values for `email_verified` and did not explicitly require a nonempty subject.   | Require `email_verified === true` and a nonempty subject before user lookup.                                                                  | Signed-token callback tests cover malformed identity claims and all verification conditions listed below.                                |
| Frontend README formatting failed the required formatting check.                                                            | Formatted the README and changed frontend files.                                                                                              | Full frontend formatting and code lint check passed.                                                                                     |

## Checks completed

- Backend production build: passed.
- Backend unit/security tests: **16 passed**, zero failures or skips.
- PostgreSQL integration tests: **9 passed**, zero failures or skips.
- Frontend TypeScript check: passed.
- Frontend production build: passed.
- Frontend formatting and code lint: passed.
- Browser tests against the production SPA and local API: **16 passed**, running 8 scenarios at desktop 1280 x 800 and mobile 390 x 844 with touch emulation in Microsoft Edge.
- Desktop and mobile dashboard screenshots were captured for visual inspection.
- Temporary API, frontend server and isolated PostgreSQL cluster were stopped after the browser run.
- Live Google sign-in: passed. Google's account chooser displays Task Manager, the backend recorded a new login session for the Google account, and the owner confirmed reaching the Task Manager dashboard without errors.

## Functional and security coverage

- Registration, valid and invalid password login, safe public user responses, password hashing, logout and current-user authentication.
- Task creation, reading, editing, description persistence, date creation/change/clearing, completion and deletion.
- Case-insensitive title/description search, status filters, today/upcoming/overdue/no-date filters, newest/title/due-date ordering, pagination and dashboard totals.
- Cross-user task isolation for reads and mutations; rejection of ownership injection and invalid input.
- Refresh rotation, replay detection, concurrent refresh behavior, token expiration, session revocation, one refresh for concurrent expired requests and logout propagation across tabs.
- JWT signatures, issuer, audience, expiry and separation of access and refresh tokens.
- Trusted-Origin checks, CORS, HttpOnly/Secure production cookies and SameSite behavior.
- Real browser connection loss, cached task viewing, failed offline edits preserving saved data, and recovery after reconnecting.
- Escaped task text, malformed local cache handling and uncaught browser exception detection.
- Google authorization state, nonce and PKCE. Callback tests use a local RSA signing key and mocked token/certificate retrieval while exercising the actual Google token verifier. They cover a successful callback, invalid signatures, wrong issuer/audience, expiration, nonce mismatch, missing token, missing subject, unverified email and refusal to link an existing password account automatically.

## Limits and release items

1. **Google sign-in is verified locally; production OAuth setup remains.** The old client identified itself as `servicehub cordova`. A dedicated project, `task-manager-514207`, now has Task Manager branding and a Web application client with JavaScript origin `http://localhost:5173` and redirect `http://localhost:3000/api/auth/google/callback`. The backend's ignored `.env` was updated and the API restarted. The live account chooser shows **Task Manager**, the callback created a new Google login session, and the owner confirmed reaching the dashboard without errors. The project remains in Testing mode with the owner's account listed as a test user. Deployment requires the production HTTPS origins, callback and audience configuration. Credentials are local configuration and are excluded from Git.
2. **Offline support is a read-only cached view in an existing authenticated session.** There is no service worker or offline session restoration. Reopening the app fully offline and queuing offline writes are outside the implemented feature. Cache snapshots are limited to six query pages and 24 hours and clear on logout/account changes.
3. **Production hosting was not deployed or verified.** Follow the README for HTTPS, exact frontend Origin, private PostgreSQL access, migrations, cookie settings and trusted proxy hops. A separate API origin also needs to be allowed by the frontend CSP. Multiple API processes require a shared rate-limit store; expired session rows need operational pruning.
4. **Browser coverage is bounded.** Mobile checks emulate a touch viewport in Edge. Physical devices, Safari and Firefox still require release testing.
5. **Automated test data stayed local.** API integration and automated browser checks used a newly created local PostgreSQL test database. The owner's manual Google sign-in used the configured application database and created normal authentication session records.

## Reproduce

Backend:

```text
npm ci
npm run build
npm test
npm audit
```

Create a dedicated PostgreSQL database ending in `_test`, set both `DATABASE_URL` and `TEST_DATABASE_URL` to that connection, apply migrations with `npm run db:deploy`, and run `npm run test:integration`.

Frontend:

```text
npm ci
npm run typecheck
npm run build
npm run lint:check
npm audit
```

Start the API and frontend against the dedicated test database. Run `npm run test:e2e`; use `PLAYWRIGHT_CHANNEL=msedge` on Windows with Edge installed, or install Playwright Chromium. The Playwright configuration runs both desktop and mobile projects.
