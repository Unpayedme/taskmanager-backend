# Task Manager application audit

Date: 9 November 2026 (Asia/Shanghai)

## Result

The local production builds and all 41 automated checks passed after the fixes below. The npm advisory checks reported zero known vulnerabilities in both dependency trees after compatible updates. This is a source and functional audit of the current app, not a guarantee that every browser, deployment or attack scenario has been tested.

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

1. **Live Google sign-in remains pending account interaction.** Local configuration passes validation, the configured client ID has the expected format, and the callback path is correct. Automated token verification does not prove that the Google Console redirect configuration, consent screen or real account flow is correct.
2. **Offline support is a read-only cached view in an existing authenticated session.** There is no service worker or offline session restoration. Reopening the app fully offline and queuing offline writes are outside the implemented feature. Cache snapshots are limited to six query pages and 24 hours and clear on logout/account changes.
3. **Production hosting was not deployed or verified.** Follow the README for HTTPS, exact frontend Origin, private PostgreSQL access, migrations, cookie settings and trusted proxy hops. A separate API origin also needs to be allowed by the frontend CSP. Multiple API processes require a shared rate-limit store; expired session rows need operational pruning.
4. **Browser coverage is bounded.** Mobile checks emulate a touch viewport in Edge. Physical devices, Safari and Firefox still require release testing.
5. **Hosted data was preserved.** All write-based integration and browser checks used a newly created local PostgreSQL test database, not the configured hosted database.

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
