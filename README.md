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
| Backend    | Node.js, Express 5, Mongoose 9 (MongoDB)                          |
| Auth       | JWT + Passport Google OAuth 2.0, bcrypt password hashing          |
| Email      | Brevo transactional email, node-cron for scheduled reminders      |
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
└── server/          # Express + MongoDB REST API
    └── src/
        ├── config/       # db, passport, mailer, env
        ├── controllers/  # request handlers (business logic)
        ├── models/       # Mongoose schemas (User, Task)
        ├── routes/       # thin route wiring
        ├── middlewares/  # auth, roles, error handler, uploads
        ├── jobs/         # daily reminder cron job
        └── utils/        # AppError, catchAsync, logger, tokens
```

The `client/` and `server/` folders were originally developed as two separate
repositories and are now combined here for the lab-phase submission.

---

## Core Features

**Authentication & accounts**
- Email/password signup with email verification
- Login, logout, and session restore from a stored JWT
- Google OAuth sign-in
- Forgot-password / reset-password flow
- Profile updates, password change, and avatar upload

**Tasks**
- Create, edit, delete tasks (owner-scoped — you only see your own)
- Update task status (e.g. pending → completed)
- Search and filter the task list by status
- Optimistic status/delete updates in the UI, rolled back on failure

**Automation**
- A daily `node-cron` job (8:00am server time) emails reminders for
  incomplete tasks due the next day

---

## Getting Started

The two apps run side by side. Start the **backend first**, then the frontend.

### 1. Backend (`server/`)

```bash
cd server
npm install
npm run dev
```

Create `server/.env` (see `server/README.md` for the full list):

```env
PORT=<backend-port>
MONGO_URL=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
BREVO_API_KEY=your_brevo_api_key
EMAIL_FROM_NAME=AfriTask
EMAIL_FROM_ADDRESS=verified-sender@example.com
FRONTEND_URL=http://localhost:<frontend-port>
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:<backend-port>/api/auth/google/callback
```

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
