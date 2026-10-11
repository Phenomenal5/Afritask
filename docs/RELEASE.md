# Releasing Afritask

How to run Afritask in staging and production, ship a change safely, recover from a bad
deploy or lost data, and move the live app from MongoDB to PostgreSQL.

Written for whoever deploys (today: Abdullahi). Assumes the monorepo layout:
`server/` (Express API + reminder worker) and `client/` (Next.js app).

---

## 1. Environments

Three environments, each with **its own database, Redis and secrets**. Never share a
database between them, and never point anything but tests at a database whose name
contains `test`.

| | Development | Staging | Production |
|---|---|---|---|
| Purpose | your machine | rehearse every release | real users |
| Database | a Neon development branch | its own Neon project/branch | its own Neon project |
| Redis | local (`docker compose up -d redis`) | its own instance | its own instance |
| Email (Brevo) | real key, but only send to yourself | separate sender/key if possible | production key |
| `NODE_ENV` | `development` | `production` | `production` |
| `API_DOCS` | on (default) | `on` | off (default) |

Staging runs the exact production build with production settings, so a release is
rehearsed — migrations included — before it reaches real data.

### Server environment

All variables are listed in `server/.env.example`. The server refuses to boot without the
required ones (`DATABASE_URL`, `REDIS_URL`, `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`,
`ACCESS_TOKEN_SECRET`).
For each deployed environment also set:

- `DIRECT_DATABASE_URL` — the non-pooled Neon URL; migrations need it.
- `CLIENT_URL` — that environment's client origin (emails and OAuth link back to it).
- `TRUST_PROXY_HOPS` — number of proxies in front of the API (the client's `/api`
  rewrite counts as one).
- `RELEASE_VERSION` — the git SHA being deployed; `GET /api/health` reports it.
- `ACCESS_TOKEN_SECRET` — at least 32 random characters, different per environment. It
  signs the 15-minute access tokens (and newsletter unsubscribe links). Changing it signs
  nobody out — clients refresh — but retires unsubscribe links in emails already sent.
- Web push (optional): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — one pair
  per environment (`npx web-push generate-vapid-keys`). Changing a pair invalidates every
  browser's subscription; people re-allow from the banner or Settings.
- First admin console account (optional): `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`,
  `SUPERADMIN_NAME`. On boot the server creates that account with operator access if the
  email has never had it (audited), then never touches it again. Set them for the first
  deploy, sign in once to set up MFA, then remove them from the host.
- Google sign-in: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` — one
  OAuth client per environment, with that environment's callback URL registered
  (`…/api/v1/auth/google/callback`; the old unversioned path still redirects there).

The API is versioned: clients call `/api/v1/...`. `/api/health` and `/api/docs` stay
unversioned.

### Client environment

- `API_URL` — that environment's API origin. The client proxies `/api` and `/uploads` to
  it, so the session cookie stays first-party.
- `NEXT_PUBLIC_CONTACT_EMAIL` (optional) — published on the privacy page.

---

## 2. Shipping a release

1. **CI is green** on the commit. Each project has its own pipeline, run when that folder is
   pushed as its own repository:
   - `server/.github/workflows/ci-cd.yml`: type-check, then unit, integration, API,
     end-to-end and security tests against a throwaway Postgres, then a production build.
   - `client/.github/workflows/ci-cd.yml`: type-check, then a production build.

   On a push to the default branch, after CI passes, each pipeline deploys to production.
   The server first applies migrations, then calls the host's deploy hook, then waits for
   `/api/health/ready`. The client calls its host's build hook, then checks the site
   answers. Each step is skipped with a notice until its secret is set; the secrets are
   listed at the top of each workflow file. Staging is still deployed by hand, as below.
2. **Deploy to staging:**
   1. Back up staging, or rely on Neon's point-in-time restore (§4).
   2. Apply migrations: `npm run db:deploy` from `server/` with staging's
      `DIRECT_DATABASE_URL`. Migrations are always applied **before** the code that
      needs them, and are written to be compatible with the code still running.
   3. Deploy the server with `RELEASE_VERSION=<sha>`, then the client.
   4. Check `GET /api/health/ready` → `200`, `"version": "<sha>"`.
   5. Smoke-test: sign in, create a task with a due date, comment with a mention,
      check notifications, switch workspace, open the board.
3. **Repeat step 2 for production.**
4. **Watch for 15 minutes:** error-level log lines, readiness, and the reminder sweep's
   `Reminder sweep:` log lines.

### Health checks

| Endpoint | Meaning | Use it for |
|---|---|---|
| `GET /api/health` | the process is up (no dependency calls) | container/host liveness (the Dockerfile's `HEALTHCHECK`) |
| `GET /api/health/ready` | PostgreSQL and Redis both answer; `503` otherwise | load-balancer readiness, post-deploy checks |

Neither needs auth, and neither reveals hostnames or error details.

### Logs and request ids

- Production logs go to stdout as JSON, one object per line. Most hosts collect stdout and
  discard files written inside the container.
- Every request gets an id: the `X-Request-Id` response header, the `requestId=` field in
  its log lines, and `requestId` in any 500 response body. When someone reports an error,
  ask for that reference and search the logs for it.
- URLs are redacted before logging. Invitation, verification and reset tokens and OAuth
  codes never reach the logs. Keep it that way when adding routes that carry secrets in
  the URL; see `redactUrl` in `server/src/middlewares/requestId.middleware.ts`.

### Shutdown

On `SIGTERM` the server:

1. stops accepting connections;
2. lets in-flight requests and a running reminder sweep finish;
3. closes Postgres and Redis;
4. exits.

It gives up after 20 seconds, so set the host's stop timeout above that.

---

## 3. Rolling back

- **Code:** redeploy the previous release. Migrations are additive and backward-compatible,
  so the previous code runs against the newer schema.
- **A migration that went wrong:** don't edit an applied migration. Write a new one that
  corrects it, rehearse it on staging, then ship it. If data was damaged, restore (§4) into
  a new database and copy the affected rows back, rather than rolling the whole database
  back over newer writes.

---

## 4. Backups and restore

- **Neon:** keep point-in-time restore enabled on production. Set the history window to at
  least the agreed recovery-point objective; the SRS proposes up to 24 hours of data loss.
- **Independent dumps:** on a schedule, and before every production migration, run
  `pg_dump --format=custom` of the production `DIRECT_DATABASE_URL` and store the file
  encrypted and access-controlled. It contains every account's data.
- **Restore rehearsal (release gate):** at least once before launch, and after any major
  schema change:

  ```bash
  cd server
  SOURCE_DATABASE_URL=<direct url of the db to back up> \
  RESTORE_DATABASE_URL=<empty scratch db whose name contains "restore"> \
  ./scripts/backup-restore-rehearsal.sh
  ```

  The script dumps, restores into the scratch database, compares every table's row count,
  and prints how long the restore took. The proposed recovery-time objective is 4 hours.
  Delete the scratch database and the dump afterwards. `backups/` is git-ignored.
- After a real restore, run `npm run db:deploy` against the restored database. It should
  report nothing to apply; anything pending means the backup predates a migration.

---

## 5. Cutover: MongoDB → PostgreSQL (one time)

The live app still runs on MongoDB until this is done. The import
(`server/src/scripts/importFromMongo.ts`) copies users and tasks.

- Each imported user gets a personal workspace.
- Imported tasks keep their deadlines with a 1-day-before reminder; only future times are
  scheduled.
- It's safe to re-run **before** cutover: rows are upserted on their Mongo id.

**Before the day**

1. Restore a recent Mongo backup into a staging copy, run the import against staging, and
   rehearse the whole sequence below, timing each step.
2. Run `npm run db:import-mongo -- --dry-run` against production Mongo. Resolve every
   record it lists as skipped (bad emails, orphaned tasks) in Mongo.
3. Set up the production Postgres, Redis and environment (§1). Apply migrations with
   `npm run db:deploy`.
4. Tell users when the short maintenance window will be.

**Cutover**

1. **Freeze writes.** Stop the Mongo-backed server *and* its reminder worker. Writes made
   during the import would be lost, and the old daily reminder must not run alongside the
   new one.
2. Take a final Mongo backup with `mongodump`.
3. Run `npm run db:import-mongo` against production Postgres. It must report
   `0 skipped`, and imported counts equal to source counts.
4. Spot-check a few accounts: they can sign in with their existing password, and their
   tasks and deadlines look right.
5. Deploy the Postgres-backed server and client (§2), and check readiness.
6. Smoke-test with a real account, then reopen.

**Rolling back the cutover** (within the window, before users write to Postgres): point the
client back at the Mongo-backed server and restart it and its worker. Once users have made
changes in Postgres, rolling back loses them, so decide during the window.

**After cutover:** do **not** run the import again — its upserts would overwrite changes
users made in Postgres. Keep the final Mongo backup until the retention policy (SRS D04)
says it can go.

---

## 6. Release checklist (SRS release gates)

- [ ] CI green; client production build passes.
- [ ] Staging rehearsal of this release, migrations included.
- [ ] Backup restore rehearsed (§4) and timed against the recovery objectives.
- [ ] Workspace isolation, invitations, task state (versions/conflicts), reminders,
      notifications and PWA checked on staging.
- [ ] `GET /api/health/ready` healthy in production after deploy, reporting the expected version.
- [ ] No unresolved critical defects.
- [ ] Mongo cutover done (§5), or explicitly scheduled.
- [ ] Platform Superadmin console: on hold for this release.

### Open decisions that affect release (owner: Abdullahi)

- **Deploy source.** `server/` still contains the old `labphase-backend` git repository,
  which production may currently deploy from. Decide whether production deploys from this
  monorepo or from that repo, and retire the other.
- **Google OAuth secret.** The client secret was exposed earlier. Rotate it in Google Cloud
  and update every environment's `GOOGLE_CLIENT_SECRET`.
- **Retention.** The deletion, retention and account-erasure policies (SRS D04) are not
  decided yet.
- **Capacity.** The load test (`npm run test:load`) hasn't been run against a
  representative environment. Run it on staging and record results against the SRS
  targets (p95 under 500 ms at 50 concurrent users / 10,000 tasks).
