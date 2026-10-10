# Afritask Task Manager Backend

Afritask is an Express + PostgreSQL (Prisma) API for authentication, user settings, task management, and scheduled reminder emails.

## Tech Stack

- Node.js + TypeScript
- Express
- PostgreSQL + Prisma 7
- Passport Google OAuth
- Brevo for transactional email
- Redis + BullMQ for scheduled task reminders

## Features

- Local signup, login, email verification, and password reset
- Google OAuth login
- Profile updates, password changes, and avatar uploads
- Task CRUD, status updates, and ownership-scoped reads
- Per-task reminders (at due time, 1 hour, 1 day, 3 days or 1 week before) and overdue alerts, by email and in-app

## Setup

```bash
cp .env.example .env              # then fill in the (required) values
docker compose up -d postgres redis  # or use Neon / a hosted Redis instead
npm install
npm run db:deploy                 # create the tables (applies prisma/migrations)
npm run dev                       # tsx watch — runs src/*.ts directly, restarts on change
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with reload (`tsx watch`); regenerates the Prisma client first |
| `npm run typecheck` | `tsc --noEmit` — run before committing |
| `npm run build` | `prisma generate` + compile `src/` to `dist/` |
| `npm start` | Run the compiled `dist/server.js` (production) |
| `npm run db:migrate -- --name <change>` | After editing `prisma/schema.prisma`: create + apply a migration (dev) |
| `npm run db:deploy` | Apply committed migrations (production, before `npm start`) |
| `npm run db:studio` | Browse the database |
| `npm run db:import-mongo [-- --dry-run]` | One-off copy of the old MongoDB data into Postgres (re-runnable) |

Keep the backend `PORT`, the frontend `NEXT_PUBLIC_API_URL`, and `CLIENT_URL` aligned.

## API docs (Swagger)

With the server running, open **http://localhost:5000/api/docs** for interactive docs of every endpoint (raw spec: `/api/docs.json`). Sign in with `POST /auth/login` on that page — the session cookie is then sent with every "Try it out", and the page adds the `X-Requested-With` header writes need. The spec lives in `src/docs/openapi.ts`; update it with every route change. Disabled in production unless `API_DOCS=on`.

## Environment Variables

Every variable is listed and explained in [`.env.example`](.env.example). The server refuses to boot if a required one is missing — see `src/config/env.ts`.

## API Base

```txt
/api
```

### Auth routes

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/verify-email/:token`
- `POST /api/auth/forgot-password`
- `PATCH /api/auth/reset-password/:token`
- `GET /api/auth/me`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`

### User routes

- `PUT /api/users/profile`
- `PUT /api/users/password`

`PUT /api/users/profile` accepts multipart form data and stores uploaded avatars from the `photo` field.

### Workspace & task routes

- `GET /api/workspaces`, `POST /api/workspaces`
- `GET /api/workspaces/:workspaceId`, `PATCH /api/workspaces/:workspaceId` (owner)
- `GET /api/workspaces/:workspaceId/tasks`, `POST /api/workspaces/:workspaceId/tasks`
- `GET /api/tasks/:id`, `PUT /api/tasks/:id`, `PATCH /api/tasks/:id/status`, `DELETE /api/tasks/:id`

Every workspace-owned route checks the caller's active membership; non-members get `404`.

## Reminder Job

A BullMQ job scheduler (stored in Redis), registered when the server starts, runs a reminder sweep every minute (`src/jobs/taskReminder.ts`).

- Each task stores its next reminder time (`remindAt`) and pending overdue alert (`overdueCheckAt`), recomputed whenever the deadline, reminder choice, completion or project archive state changes — only ever to a future time.
- The sweep claims each due schedule atomically, re-checks the task (still open, not archived, recipient still a member), then writes the in-app notification and sends the email to the assignee (or the creator if unassigned).
- The `EmailDelivery` ledger prevents duplicate sends; failed emails are retried up to 3 times, then stay visible as `failed`. Schedules missed by more than 2 hours (worker down) are dropped rather than sent late.

## Notes

- Protected routes use the httpOnly `afritask_session` cookie (server-side sessions); writes also need `X-Requested-With: XMLHttpRequest`.
- The server serves uploaded files from `public/`.
- Full endpoint request and response examples live in `API_DOCUMENTATION.md`.
