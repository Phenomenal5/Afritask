# Afritask Task Manager Backend

Afritask is an Express + MongoDB API for authentication, user settings, task management, and scheduled reminder emails.

## Tech Stack

- Node.js + TypeScript
- Express
- MongoDB + Mongoose
- Passport Google OAuth
- Brevo for transactional email
- Redis + BullMQ for scheduled task reminders

## Features

- Local signup, login, email verification, and password reset
- Google OAuth login
- Profile updates, password changes, and avatar uploads
- Task CRUD, status updates, and ownership-scoped reads
- Daily reminder emails for tasks due tomorrow

## Setup

```bash
cp .env.example .env      # then fill in the (required) values
docker compose up -d redis   # or point REDIS_URL at a hosted Redis
npm install
npm run dev               # tsx watch — runs src/*.ts directly, restarts on change
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with reload (`tsx watch`) |
| `npm run typecheck` | `tsc --noEmit` — run before committing |
| `npm run build` | Compile `src/` to `dist/` |
| `npm start` | Run the compiled `dist/server.js` (production) |

Keep the backend `PORT`, the frontend `NEXT_PUBLIC_API_URL`, and `CLIENT_URL` aligned.

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

### Task routes

- `GET /api/task`
- `POST /api/task`
- `GET /api/task/:id`
- `PUT /api/task/:id`
- `PATCH /api/task/:id/status`
- `DELETE /api/task/:id`

Legacy aliases are also available for some task endpoints:

- `POST /api/task/addTask`
- `GET /api/task/getTask/:id`
- `PUT /api/task/editTask/:id`
- `DELETE /api/task/deleteTask/:id`

## Reminder Job

The reminder job is a BullMQ job scheduler (stored in Redis), registered when the server starts. It runs every day at `8:00am` server time.

It finds incomplete tasks due tomorrow and sends reminder emails to the owning user.

## Notes

- Protected routes require a JWT in the `Authorization` header.
- The server serves uploaded files from `public/`.
- Full endpoint request and response examples live in `API_DOCUMENTATION.md`.
