# AfriTask — Full-Stack Task Management Web App

> **GoMyCode · Software Engineering — Lab Phase (Draft Repository)**
> Working solo · Author: **Abdullahi** ([@Phenomenal5](https://github.com/Phenomenal5))

AfriTask is a full-stack task manager that lets a user sign up, verify their
email, log in (with email/password or Google), and manage their personal
tasks — creating, editing, filtering, and completing them — with automatic
daily email reminders for tasks due the next day.

This repository is the **consolidated draft** for the lab phase: it brings the
frontend and backend together in one place so the whole project can be reviewed
from a single link.

---

## Project Topic

**A personal task-management application** with authentication, per-user task
ownership, and scheduled reminder emails — built as a decoupled frontend +
REST API.

## Why this project

- Covers the full software-engineering surface: auth, CRUD, access control,
  file uploads, background jobs, and transactional email.
- Realistic client/server separation (Next.js talking to an Express REST API).
- Room to grow (labels, due-date views, sharing) for later phases.

---

## Tech Stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | Next.js 16 (App Router), React 19, Tailwind CSS 4, axios, react-hot-toast |
| Backend    | Node.js, Express 5, TypeScript, Prisma 7 (PostgreSQL)             |
| Auth       | httpOnly cookie sessions, Passport Google OAuth 2.0, bcrypt       |
| Email      | Brevo transactional email, Redis + BullMQ for scheduled reminders    |
| Uploads    | Multer (avatar images)                                            |
| Security   | helmet, cors, hpp, express-rate-limit                             |

---

## Repository Structure

```text
labphase/
├── client/          # Next.js frontend (App Router)
│   └── src/
│       ├── app/        # routes: login, signup, dashboard, profile, verify-email …
│       ├── components/ # Navbar, TaskCard, TaskFormModal, ProtectedRoute …
│       ├── context/    # AuthContext, TaskContext, UserContext
│       └── lib/        # axios instance + feature services
│
└── server/          # Express + PostgreSQL (Prisma) REST API
    └── src/
        ├── config/       # db, passport, mailer, env
        ├── controllers/  # request handlers (business logic)
        ├── generated/    # Prisma client (generated from server/prisma/schema.prisma)
        ├── routes/       # thin route wiring
        ├── middlewares/  # auth, roles, error handler, uploads
        ├── jobs/         # reminder sweep (BullMQ, every minute)
        └── utils/        # AppError, catchAsync, logger, tokens
```

The `client/` and `server/` folders were originally developed as two separate
repositories and are now combined here for the lab-phase submission.

---

## Core Features

**Authentication & accounts**
- Email/password signup with email verification
- Login, logout, and session restore via a revocable httpOnly session cookie
- Google OAuth sign-in
- Forgot-password / reset-password flow
- Profile updates, password change, and avatar upload

**Tasks**
- Create, edit, delete tasks (owner-scoped — you only see your own)
- Update task status (e.g. pending → completed)
- Search and filter the task list by status
- Optimistic status/delete updates in the UI, rolled back on failure

**Automation**
- Per-task reminders and overdue alerts (email + in-app), sent by a
  BullMQ sweep that runs every minute

---

## Getting Started

The two apps run side by side. Start the **backend first**, then the frontend.

### 1. Backend (`server/`)

```bash
cd server
npm install
npm run dev
```

Copy `server/.env.example` to `server/.env` and fill in the values marked **(required)** — the server refuses to boot without them. The backend is TypeScript: `npm run dev` runs the sources directly, while production runs `npm run build` and then `npm start`.

### 2. Frontend (`client/`)

```bash
cd client
npm install
npm run dev
```

Create `client/.env`:

```env
NEXT_PUBLIC_API_URL=http://localhost:<backend-port>
```

> `NEXT_PUBLIC_API_URL` points to the backend origin **without** `/api`.
> Keep the backend `PORT`, the frontend `NEXT_PUBLIC_API_URL`, and
> `FRONTEND_URL` aligned or auth redirects will break.

Open the app at `http://localhost:3000`.

---

## API Overview

Base path: `/api`

| Group | Endpoints |
| ----- | --------- |
| Auth  | `POST /auth/signup`, `POST /auth/login`, `GET /auth/verify-email/:token`, `POST /auth/forgot-password`, `PATCH /auth/reset-password/:token`, `GET /auth/me`, `GET /auth/google` |
| Users | `PUT /users/profile` (multipart avatar via `photo`), `PUT /users/password` |
| Tasks | `GET /task`, `POST /task`, `GET /task/:id`, `PUT /task/:id`, `PATCH /task/:id/status`, `DELETE /task/:id` |

Full request/response examples live in [`server/API_DOCUMENTATION.md`](server/API_DOCUMENTATION.md).

---

## Roadmap (next phases)

- [ ] **Admin panel** — manage users and tasks, view app-wide activity
- [ ] **AI integration** — smarter task creation and management (natural-language
      task capture, suggested breakdowns, prioritization)
- [ ] **Web push notifications** — real-time reminders in the browser alongside
      the existing daily email reminders

---

## Status

**Complete and deployed** for this phase — signup, email verification,
Google OAuth, task CRUD with owner scoping, avatar uploads, and daily email
reminders all work end to end in production. The features above are the planned
next phases.
