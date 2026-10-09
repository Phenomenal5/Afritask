# Server tests

Jest (ts-jest, ESM) + Supertest, against a **real PostgreSQL test database**.

## Setup (once)

1. Create an empty database whose name contains `test` (e.g. `afritask_test` on the same Neon project, or `docker compose up -d postgres` and `CREATE DATABASE afritask_test`).
2. Set `TEST_DATABASE_URL` in `server/.env` (use a *direct* — non-pooler — URL on Neon).

The suite **refuses to run** if `TEST_DATABASE_URL` is missing, isn't a `*test*` database, or is the same database as `DATABASE_URL` — every test truncates all tables. Each run applies the committed migrations first (`prisma migrate deploy`), so it also proves the migration history builds a working schema.

No real external services are used: emails are captured in memory (`testMailbox` in `src/utils/email.ts`), Redis isn't touched, Google OAuth is unconfigured.

## Layers

| Folder | Kind | What it covers |
| --- | --- | --- |
| `unit/` | Unit | Pure logic — due-date/timezone maths, validation, the PRD §8 permission matrix, token hashing, and a contract check that the Swagger spec lists exactly the real routes. |
| `integration/` | Integration | Services + database together — sessions, single-use account tokens (incl. concurrent consumption), database-enforced invariants (one owner, idempotency keys, cascades), the reminder job's recipient rules. |
| `api/` | API | Every route through Supertest: status codes, validation messages, permissions per role, versioning, idempotency, filters. |
| `e2e/` | End-to-end | PRD journeys J1–J6 over **real HTTP** against a listening server, following the actual links in sent emails. |
| `security/` | Security | Auth on every protected route, CSRF on every write, tenant isolation (IDOR), filter/SQL injection, mass assignment, payload limits, upload hardening, secret leakage, security headers, CORS, cookie flags, HTML escaping in emails, rate limits. `npm run test:security` also runs `npm audit` on production dependencies. |
| `load/` | Load | `npm run test:load` — autocannon, 50 concurrent signed-in users against a seeded workspace; fails if p97.5 latency ≥ 500 ms (PRD target is p95 < 500 ms) or any request fails. Not part of `npm test`. |

## Commands

```bash
npm test                    # unit + integration + api + e2e + security
npm run test:unit           # one layer (also: test:integration, test:api, test:e2e)
npm run test:security       # security tests + npm audit
npm run test:coverage
npm run test:load           # LOAD_TASKS=10000 LOAD_CONNECTIONS=50 LOAD_DURATION=30 LOAD_P95_MS=500
npm run typecheck:tests
```

Set `LOG_IN_TESTS=on` to see server logs while debugging.

## Writing tests

- Use the factories in `helpers/factories.ts` for setup (`createTeam()` gives an Owner, Admin, Member and Outsider, each signed in). They write straight to the database — the test DB is remote, so fewer round trips matter.
- Use `signIn()` (real login endpoint) only when login itself is under test.
- Read emails with `helpers/mailbox.ts` (`tokenFromEmail(address, VERIFY_LINK)` etc.); `testMailbox.failNextSend = true` simulates a provider outage.
- Rate limits are skipped unless a test sets `process.env.RATE_LIMITS_IN_TESTS = "on"`.
