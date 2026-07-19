# Afritask Task Manager Backend

Afritask is an Express + MongoDB API for authentication, user settings, task management, and scheduled reminder emails.

## Tech Stack

- Node.js
- Express
- MongoDB + Mongoose
- Passport Google OAuth
- Brevo for transactional email
- node-cron for task reminders

## Features

- Local signup, login, email verification, and password reset
- Google OAuth login
- Profile updates, password changes, and avatar uploads
- Task CRUD, status updates, and ownership-scoped reads
- Daily reminder emails for tasks due tomorrow

## Setup

```bash
npm install
npm run dev
```

The server reads its port from `PORT` in `.env`.
Keep the backend `PORT`, the frontend `NEXT_PUBLIC_API_URL`, and `FRONTEND_URL` aligned.

## Environment Variables

Create a `.env` file with values like:

```env
PORT=<backend-port>
MONGO_URL=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
VERIFY_EMAIL_TOKEN_EXPIRES_MS=3600000

BREVO_API_KEY=your_brevo_api_key
EMAIL_FROM_NAME=AfriTask
EMAIL_FROM_ADDRESS=verified-sender@example.com
FRONTEND_URL=http://localhost:<frontend-port>

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:<backend-port>/api/auth/google/callback
```

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

The reminder cron job is registered when the server starts and runs every day at `8:00am` server time.

It finds incomplete tasks due tomorrow and sends reminder emails to the owning user.

## Notes

- Protected routes require a JWT in the `Authorization` header.
- The server serves uploaded files from `public/`.
- Full endpoint request and response examples live in `API_DOCUMENTATION.md`.
