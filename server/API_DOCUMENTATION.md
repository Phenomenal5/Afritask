# Task Manager API Documentation

Base URL:

```txt
http://localhost:<PORT>
```

Default route prefixes:

```txt
/api/auth
/api/users
/api/task
```

All protected routes require a JWT in the `Authorization` header:

```http
Authorization: Bearer <token>
```

Common error response:

```json
{
  "status": "fail",
  "message": "Error message"
}
```

## Environment Variables

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

## Authentication

### Signup

Creates a local user and sends an email verification token.

```http
POST /api/auth/signup
```

Request body:

```json
{
  "name": "Abdul",
  "email": "abdul@example.com",
  "password": "password123",
  "age": 25
}
```

Required fields:

```txt
name, email, password
```

Success response:

```json
{
  "status": "success",
  "message": "Signup successful. Please check your email to verify your account."
}
```

Possible errors:

```json
{
  "status": "fail",
  "message": "Please provide all required fields"
}
```

```json
{
  "status": "fail",
  "message": "Email already in use"
}
```

### Verify Email

Verifies a local user account using the token sent by email. A welcome email is sent after successful verification.

```http
GET /api/auth/verify-email/:token
```

Example:

```http
GET /api/auth/verify-email/abc123token
```

Success response:

```json
{
  "status": "success",
  "message": "Email verified successfully"
}
```

Possible errors:

```json
{
  "status": "fail",
  "message": "Invalid or expired verification token"
}
```

If the verification token has expired, the API will generate and email a new verification token automatically, then return an error telling the user to check their inbox.

### Login

Logs in a verified local user and returns a JWT.

```http
POST /api/auth/login
```

Request body:

```json
{
  "email": "abdul@example.com",
  "password": "password123"
}
```

Success response:

```json
{
  "status": "success",
  "token": "jwt_token_here",
  "user": {
    "_id": "user_id",
    "name": "Abdul",
    "email": "abdul@example.com",
    "age": 25,
    "provider": "local",
    "isVerified": true,
    "createdAt": "2026-06-20T00:00:00.000Z",
    "updatedAt": "2026-06-20T00:00:00.000Z"
  }
}
```

Possible errors:

```json
{
  "status": "fail",
  "message": "Please provide email and password"
}
```

```json
{
  "status": "fail",
  "message": "Invalid email or password"
}
```

```json
{
  "status": "fail",
  "message": "Please verify your email before logging in. A verification email has been sent."
}
```

### Google Login

Starts the Google OAuth login/signup flow.

```http
GET /api/auth/google
```

The browser will be redirected to Google for authentication.

Required Google redirect URI:

```txt
http://localhost:<PORT>/api/auth/google/callback
```

### Google Callback

Google redirects to this route after login. Because the whole flow is a
top-level browser redirect (not an XHR), this route does **not** return JSON —
it mints the JWT and redirects the browser back to the frontend, which stores
the token and hydrates the session (same end state as a credential login).

```http
GET /api/auth/google/callback
```

Success — redirects to the frontend callback with the token in the query string:

```txt
302 Found
Location: <CLIENT_URL>/auth/callback?token=<jwt_token_here>
```

Failure (denied consent, no email, missing user) — redirects to the frontend
login with an error flag:

```txt
302 Found
Location: <CLIENT_URL>/login?error=google
```

If Google credentials are missing:

```json
{
  "status": "error",
  "message": "Google OAuth credentials are not configured"
}
```

### Forgot Password

Creates a password reset token and sends a reset email.

```http
POST /api/auth/forgot-password
```

Request body:

```json
{
  "email": "abdul@example.com"
}
```

Success response:

```json
{
  "status": "success",
  "message": "Password reset link has been sent to your email"
}
```

### Verify Password Reset Token

Checks whether a password reset token is valid and not expired.

```http
POST /api/auth/forgot-password/verify-token/:token
```

Success response:

```json
{
  "status": "success",
  "message": "Password reset token is valid"
}
```

Possible error:

```json
{
  "status": "fail",
  "message": "Invalid or expired password reset token"
}
```

### Reset Password

Updates the user's password using a valid reset token.

```http
PATCH /api/auth/reset-password/:token
```

Request body:

```json
{
  "password": "newpassword123"
}
```

Success response:

```json
{
  "status": "success",
  "message": "Password reset successfully"
}
```

Possible errors:

```json
{
  "status": "fail",
  "message": "Please provide a password reset token"
}
```

```json
{
  "status": "fail",
  "message": "Please provide a new password"
}
```

```json
{
  "status": "fail",
  "message": "Invalid or expired password reset token"
}
```

### Get Current User

Returns the authenticated user and a fresh JWT.

```http
GET /api/auth/me
```

Auth required: yes.

Success response:

```json
{
  "status": "success",
  "token": "jwt_token_here",
  "user": {
    "_id": "user_id",
    "name": "Abdul",
    "email": "abdul@example.com",
    "isVerified": true
  }
}
```

Possible error:

```json
{
  "status": "fail",
  "message": "Unauthorized"
}
```

## Users

### Update Profile

Updates the authenticated user's profile and optional photo.

```http
PUT /api/users/profile
```

Auth required: yes.

Request body (multipart/form-data):

- `photo`: file
- `name`: string
- `age`: number

All fields are optional.

Success response:

```json
{
  "status": "success",
  "user": {
    "_id": "user_id",
    "name": "Abdul Updated",
    "email": "abdul@example.com",
    "age": 26
  }
}
```

### Update Password

Updates the authenticated user's password and sends a confirmation email.

```http
PUT /api/users/password
```

Auth required: yes.

Request body:

```json
{
  "currentPassword": "password123",
  "newPassword": "newpassword123"
}
```

Success response:

```json
{
  "status": "success",
  "message": "Password updated successfully"
}
```

Possible errors:

```json
{
  "status": "fail",
  "message": "Please provide current password and new password"
}
```

```json
{
  "status": "fail",
  "message": "Current password is incorrect"
}
```

## Tasks

Task ownership rule:

Every task query is scoped to the authenticated user. A logged-in user cannot read, edit, update, or delete another user's task, even if they know the task ID.

Task fields:

```txt
title: required string
description: optional string
status: "pending" | "in progress" | "completed"
priority: "low" | "medium" | "high"
deadline: optional date
```

The API also accepts `in-progress` and stores it as `in progress`.

### Create Task

```http
POST /api/task
```

Auth required: yes.

Request body:

```json
{
  "title": "Finish API docs",
  "description": "Write documentation for all endpoints",
  "status": "pending",
  "priority": "medium",
  "deadline": "2026-06-30"
}
```

Required fields:

```txt
title
```

Success response:

```json
{
  "status": "success",
  "data": {
    "task": {
      "_id": "task_id",
      "user": "user_id",
      "title": "Finish API docs",
      "description": "Write documentation for all endpoints",
      "status": "pending",
      "priority": "medium",
      "deadline": "2026-06-30T00:00:00.000Z",
      "createdAt": "2026-06-20T00:00:00.000Z",
      "updatedAt": "2026-06-20T00:00:00.000Z"
    }
  }
}
```

Backward-compatible route:

```http
POST /api/task/addTask
```

### Get All Tasks

Returns only tasks owned by the authenticated user.

```http
GET /api/task
```

Auth required: yes.

Optional query parameters:

```txt
status=pending
priority=high
sort=deadline
```

Examples:

```http
GET /api/task?status=pending
GET /api/task?priority=high
GET /api/task?sort=deadline
GET /api/task?sort=-createdAt
```

Success response:

```json
{
  "status": "success",
  "results": 1,
  "data": {
    "tasks": [
      {
        "_id": "task_id",
        "user": "user_id",
        "title": "Finish API docs",
        "description": "Write documentation for all endpoints",
        "status": "pending",
        "priority": "medium",
        "deadline": "2026-06-30T00:00:00.000Z"
      }
    ]
  }
}
```

### Get One Task

Returns one task only if it belongs to the authenticated user.

```http
GET /api/task/:id
```

Auth required: yes.

Example:

```http
GET /api/task/665f1c2d3a4b5c6d7e8f9012
```

Success response:

```json
{
  "status": "success",
  "data": {
    "task": {
      "_id": "task_id",
      "user": "user_id",
      "title": "Finish API docs",
      "status": "pending",
      "priority": "medium"
    }
  }
}
```

Backward-compatible route:

```http
GET /api/task/getTask/:id
```

### Edit Task

Updates task fields only if the task belongs to the authenticated user.

```http
PUT /api/task/:id
```

Auth required: yes.

Request body:

```json
{
  "title": "Finish full API docs",
  "description": "Update all endpoint docs",
  "status": "in progress",
  "priority": "high",
  "deadline": "2026-07-01"
}
```

All fields are optional.

Success response:

```json
{
  "status": "success",
  "data": {
    "task": {
      "_id": "task_id",
      "user": "user_id",
      "title": "Finish full API docs",
      "status": "in progress",
      "priority": "high"
    }
  }
}
```

Backward-compatible route:

```http
PUT /api/task/editTask/:id
```

### Update Task Status

Updates only the task status.

```http
PATCH /api/task/:id/status
```

Auth required: yes.

Request body:

```json
{
  "status": "completed"
}
```

Allowed statuses:

```txt
pending
in progress
in-progress
completed
```

Success response:

```json
{
  "status": "success",
  "data": {
    "task": {
      "_id": "task_id",
      "status": "completed"
    }
  }
}
```

### Delete Task

Deletes a task only if it belongs to the authenticated user.

```http
DELETE /api/task/:id
```

Auth required: yes.

Success response:

```http
204 No Content
```

Backward-compatible route:

```http
DELETE /api/task/deleteTask/:id
```

## Mail Services

These helpers exist in `src/utils/email.js`:

```txt
sendEmailVerificationCode(to, token)
sendPasswordResetEmail(to, token)
sendWelcomeEmail(to, name)
sendPasswordChangedEmail(to)
sendTaskReminderEmail(to, task)
```

Currently wired:

```txt
sendEmailVerificationCode: signup
sendWelcomeEmail: verify email
sendPasswordResetEmail: forgot password
sendPasswordChangedEmail: update password
```

Not currently wired:

```txt
sendTaskReminderEmail
```

## Data Models

### User

```json
{
  "name": "String, required",
  "email": "String, required, unique",
  "age": "Number, optional",
  "photo": "String, optional",
  "password": "String, required for local users, minimum 6 characters",
  "role": "user | admin",
  "provider": "local | google",
  "providerId": "String, unique, sparse",
  "isVerified": "Boolean",
  "verifyEmailToken": "String",
  "verifyEmailExpires": "Date",
  "resetPasswordToken": "String",
  "resetPasswordExpires": "Date"
}
```

### Task

```json
{
  "user": "ObjectId, required",
  "title": "String, required",
  "description": "String, optional",
  "status": "pending | in progress | completed",
  "priority": "low | medium | high",
  "deadline": "Date, optional"
}
```

## Quick Testing Flow

1. Signup:

```http
POST /api/auth/signup
```

2. Verify email using the token sent to email:

```http
GET /api/auth/verify-email/:token
```

3. Login:

```http
POST /api/auth/login
```

4. Copy the returned token.

5. Create task:

```http
POST /api/task
Authorization: Bearer <token>
```

6. Get all tasks:

```http
GET /api/task
Authorization: Bearer <token>
```


Updates the authenticated user's profile.

```http
PUT /api/users/profile
```

Auth required: yes.

Request body:

```json
{
  "name": "Abdul Updated",
  "age": 26
}
```

All fields are optional.

Success response:

```json
{
  "status": "success",
  "user": {
    "_id": "user_id",
    "name": "Abdul Updated",
    "email": "abdul@example.com",
    "age": 26
  }
}
```

### Update Password

Updates the authenticated user's password and sends a password-changed email.

```http
PUT /api/users/password
```

Auth required: yes.

Request body:

```json
{
  "currentPassword": "password123",
  "newPassword": "newpassword123"
}
```

Success response:

```json
{
  "status": "success",
  "message": "Password updated successfully"
}
```

Possible errors:

```json
{
  "status": "fail",
  "message": "Please provide current password and new password"
}
```

```json
{
  "status": "fail",
  "message": "Current password is incorrect"
}
```

## Tasks

Task ownership rule:

Every task query is scoped to the authenticated user. A logged-in user cannot read, edit, update, or delete another user's task, even if they know the task id.

Task fields:

```txt
title: required string
description: optional string
status: "pending" | "in progress" | "completed"
priority: "low" | "medium" | "high"
deadline: optional date
```

The API also accepts `in-progress` and stores it as `in progress`.

### Create Task

```http
POST /api/task
```

Auth required: yes.

Request body:

```json
{
  "title": "Finish API docs",
  "description": "Write documentation for all endpoints",
  "status": "pending",
  "priority": "medium",
  "deadline": "2026-06-30"
}
```

Required fields:

```txt
title
```

Success response:

```json
{
  "status": "success",
  "data": {
    "task": {
      "_id": "task_id",
      "user": "user_id",
      "title": "Finish API docs",
      "description": "Write documentation for all endpoints",
      "status": "pending",
      "priority": "medium",
      "deadline": "2026-06-30T00:00:00.000Z",
      "createdAt": "2026-06-20T00:00:00.000Z",
      "updatedAt": "2026-06-20T00:00:00.000Z"
    }
  }
}
```

Backward-compatible route:

```http
POST /api/task/addTask
```

### Get All Tasks

Returns only tasks owned by the authenticated user.

```http
GET /api/task
```

Auth required: yes.

Optional query parameters:

```txt
status=pending
priority=high
sort=deadline
```

Examples:

```http
GET /api/task?status=pending
GET /api/task?priority=high
GET /api/task?sort=deadline
GET /api/task?sort=-createdAt
```

Success response:

```json
{
  "status": "success",
  "results": 1,
  "data": {
    "tasks": [
      {
        "_id": "task_id",
        "user": "user_id",
        "title": "Finish API docs",
        "description": "Write documentation for all endpoints",
        "status": "pending",
        "priority": "medium",
        "deadline": "2026-06-30T00:00:00.000Z"
      }
    ]
  }
}
```

### Get One Task

Returns one task only if it belongs to the authenticated user.

```http
GET /api/task/:id
```

Auth required: yes.

Example:

```http
GET /api/task/665f1c2d3a4b5c6d7e8f9012
```

Success response:

```json
{
  "status": "success",
  "data": {
    "task": {
      "_id": "task_id",
      "user": "user_id",
      "title": "Finish API docs",
      "status": "pending",
      "priority": "medium"
    }
  }
}
```

Backward-compatible route:

```http
GET /api/task/getTask/:id
```

### Edit Task

Updates task fields only if the task belongs to the authenticated user.

```http
PUT /api/task/:id
```

Auth required: yes.

Request body:

```json
{
  "title": "Finish full API docs",
  "description": "Update all endpoint docs",
  "status": "in progress",
  "priority": "high",
  "deadline": "2026-07-01"
}
```

All fields are optional.

Success response:

```json
{
  "status": "success",
  "data": {
    "task": {
      "_id": "task_id",
      "user": "user_id",
      "title": "Finish full API docs",
      "status": "in progress",
      "priority": "high"
    }
  }
}
```

Backward-compatible route:

```http
PUT /api/task/editTask/:id
```

### Update Task Status

Updates only the task status.

```http
PATCH /api/task/:id/status
```

Auth required: yes.

Request body:

```json
{
  "status": "completed"
}
```

Allowed statuses:

```txt
pending
in progress
in-progress
completed
```

Success response:

```json
{
  "status": "success",
  "data": {
    "task": {
      "_id": "task_id",
      "status": "completed"
    }
  }
}
```

### Delete Task

Deletes a task only if it belongs to the authenticated user.

```http
DELETE /api/task/:id
```

Auth required: yes.

Success response:

```http
204 No Content
```

Backward-compatible route:

```http
DELETE /api/task/deleteTask/:id
```

## Mail Services

These helpers exist in `src/utils/email.js`:

```txt
sendEmailVerificationCode(to, token)
sendPasswordResetEmail(to, token)
sendWelcomeEmail(to, name)
sendPasswordChangedEmail(to)
sendTaskReminderEmail(to, task)
```

Currently wired:

```txt
sendEmailVerificationCode: signup
sendWelcomeEmail: verify email
sendPasswordResetEmail: forgot password
sendPasswordChangedEmail: update password
```

Not currently wired:

```txt
sendTaskReminderEmail
```

## Data Models

### User

```json
{
  "name": "String, required",
  "email": "String, required, unique",
  "age": "Number, optional",
  "avatar": "Buffer, optional",
  "password": "String, required for local users, minimum 6 characters",
  "provider": "local | google",
  "providerId": "String, unique, sparse",
  "isVerified": "Boolean",
  "verifyEmailToken": "String",
  "resetPasswordToken": "String",
  "resetPasswordExpires": "Date"
}
```

### Task

```json
{
  "user": "ObjectId, required",
  "title": "String, required",
  "description": "String, optional",
  "status": "pending | in progress | completed",
  "priority": "low | medium | high",
  "deadline": "Date, optional"
}
```

## Quick Testing Flow

1. Signup:

```http
POST /api/auth/signup
```

2. Verify email using the token sent to email:

```http
GET /api/auth/verify-email/:token
```

3. Login:

```http
POST /api/auth/login
```

4. Copy the returned token.

5. Create task:

```http
POST /api/task
Authorization: Bearer <token>
```

6. Get all tasks:

```http
GET /api/task
Authorization: Bearer <token>
```
