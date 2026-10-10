# Task Manager API Documentation

> **The interactive, always-current reference is Swagger UI at `/api/docs`** (spec in `src/docs/openapi.ts`). This file keeps longer explanations and examples.

Base URL:

```txt
http://localhost:<PORT>
```

Default route prefixes:

```txt
/api/auth
/api/users
/api/workspaces
/api/tasks
```

Protected routes authenticate with the httpOnly `afritask_session` cookie that
login sets (there is no bearer token). Browsers reach the API same-origin through
the client's `/api` rewrite, so the cookie is sent automatically.

Every `POST`/`PUT`/`PATCH`/`DELETE` must also send this header (CSRF guard),
otherwise the API answers `403`:

```http
X-Requested-With: XMLHttpRequest
```

Sensitive auth routes are rate limited per IP (login/verify/reset/Google exchange:
10 per 15 min each; signup/forgot-password: 5 per 15 min each) and answer `429`
when exceeded.

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
DATABASE_URL=postgresql://user:password@host/db
SESSION_TTL_DAYS=7
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

Logs in a verified local user, starts a session and sets the
`afritask_session` cookie (`HttpOnly; SameSite=Lax`, `Secure` in production).

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
  "user": {
    "id": "user_uuid",
    "name": "Abdul",
    "email": "abdul@example.com",
    "age": 25,
    "timezone": "Africa/Lagos",
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
top-level browser redirect (not an XHR) on the API's own domain, this route does
**not** return JSON or set a cookie — it mints a single-use code (valid 2 minutes)
and redirects to the frontend, which exchanges it via `POST /api/auth/google/exchange`.

```http
GET /api/auth/google/callback
```

Success — redirects to the frontend callback with the one-time code:

```txt
302 Found
Location: <CLIENT_URL>/auth/callback?code=<one_time_code>
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

### Google Sign-in Exchange

Second half of Google sign-in: trades the one-time code for a session cookie.
Each code works once.

```http
POST /api/auth/google/exchange
```

Request body:

```json
{
  "code": "<one_time_code>"
}
```

Success: `200` with `{ "status": "success", "user": { ... } }` and the
`afritask_session` cookie. Used or expired code: `401` "Google sign-in expired. Please try again."

### Logout

Ends the current session (other devices stay signed in) and clears the cookie.

```http
POST /api/auth/logout
```

Auth required: yes.

```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

### Forgot Password

Sends a reset email if the account exists. The response is identical whether or
not the email is registered, so it can't be used to discover accounts. Requesting
again replaces any earlier link.

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
  "message": "If an account exists for that email, a password reset link has been sent."
}
```

### Reset Password

Updates the user's password using a valid reset token. The link is single-use,
and a successful reset signs the user out on every device.

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

Returns the authenticated user for the current session cookie.

```http
GET /api/auth/me
```

Auth required: yes.

Success response:

```json
{
  "status": "success",
  "user": {
    "id": "user_uuid",
    "name": "Abdul",
    "email": "abdul@example.com",
    "timezone": "Africa/Lagos",
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
    "id": "user_uuid",
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

## Workspaces

Every task belongs to a workspace. A user can be in several workspaces with a
different role in each (`owner`, `admin`, `member`). All workspace routes need a
signed-in session; a workspace you're not an active member of answers `404`
(the same as one that doesn't exist).

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/workspaces` | any user | My workspaces: `{ id, name, role, memberCount }[]` |
| `POST` | `/api/workspaces` | any user | Create `{ name }` (1–100 chars); the caller becomes Owner |
| `GET` | `/api/workspaces/:workspaceId` | member | Details + active members |
| `PATCH` | `/api/workspaces/:workspaceId` | owner | Rename `{ name }` |
| `GET` | `/api/workspaces/:workspaceId/tasks` | member | The workspace's tasks (`?status`, `?priority`, `?sort`) |
| `POST` | `/api/workspaces/:workspaceId/tasks` | member | Create a task |

Single-task routes use the task id: `GET/PUT/DELETE /api/tasks/:id`,
`PATCH /api/tasks/:id/status`. Owners and Admins can edit or delete any task in
the workspace; Members only the tasks they created (`403` otherwise).

## Task fields (V1)

| Field | Values / notes |
| --- | --- |
| `title` | required, 1–200 chars (trimmed) |
| `description` | optional, up to 20,000 chars |
| `status` | `todo` (default), `in_progress`, `in_review`, `completed`. Legacy `pending` / `in progress` are accepted. |
| `priority` | `low`, `medium` (default), `high`, `urgent` |
| `assigneeMembershipId` | zero or one assignee — an **active membership id** of the same workspace, or `null` |
| `projectId` | optional, same workspace, not archived |
| `dueDate` | `"YYYY-MM-DD"` → due 23:59 that day in `dueTimezone` (default: your profile timezone) |
| `dueAt` | ISO datetime → that exact instant. Send `dueDate` **or** `dueAt`; `null` clears. Legacy `deadline` still accepted. |
| `dueKind`, `dueTimezone` | returned: how the deadline was set (`date`/`datetime`) and in which zone |
| `completedAt` | set when a task enters `completed`, cleared when it's reopened |
| `version` | **required on every PUT / status PATCH** — the version you last read. A stale one answers `409` (someone else changed it) |
| `clientRequestId` | optional on create: repeating a create with the same key returns the first task (`200`) instead of a duplicate |

Permissions: Owners/Admins edit and assign any task; Members edit and (re)assign tasks
they created or are currently assigned to, and delete only tasks they created.
When a member leaves or is removed, their **open** tasks become unassigned.
Task lists also filter by `?assignee=me|none|<membershipId>`.

## Dashboard

`GET /api/workspaces/:workspaceId/dashboard` (any active member) returns:

- `personal` — `dueToday`, `overdue`, `inProgress`, `completedThisWeek`: work assigned to
  you, subtasks included. Each equals the list at `?assignee=me&due=today|overdue`,
  `?assignee=me&status=in_progress` and `?assignee=me&due=week`.
- `workspace` — `open`, `completed`, `overdue` (top-level tasks; match `?due=open|completed|overdue`)
  and `activeProjects`.
- `projects` — each non-archived project's top-level `total`, `completed`, `open` and
  `percentComplete` (`null` for a project with no tasks).

Archived projects are excluded everywhere; "this week" starts Monday 00:00 in your
profile timezone.

## Search, filters and paging

`GET /api/workspaces/:workspaceId/tasks` also takes:

- `q` — searches task titles, descriptions and project names (case-insensitive, up to 200
  characters). Matching subtasks are included, each with `parent`.
- `status`, `priority`, `assignee` (`me`, `none`, membership ids), `projectId` (`none`,
  project ids) and `labelId` accept several values, comma-separated or repeated:
  **OR within one filter, AND across filters**. Malformed values answer `400`.
- `limit` (1–100) and `page` (from 1) — offset paging over a stable order (the `sort`, then
  id), returning `data.pagination: { page, limit, total, totalPages }`. Without `limit`
  every match is returned.

Results never leave the workspace in the URL, whatever the filters.
`GET /api/workspaces/:workspaceId/projects?q=` searches project names.

## My Tasks views

`GET /api/workspaces/:workspaceId/tasks?assignee=me&due=<view>` is My Tasks: everything
assigned to you, including separately assigned subtasks (each with `parent`). `due` works
with any other filter and is judged in your profile timezone at request time:

| `due` | Meaning |
|---|---|
| `open` | not completed |
| `today` | open, due on your local date — an item due earlier today is also `overdue` |
| `upcoming` | open, due after today |
| `overdue` | open, past its due instant |
| `none` | open, no due date |
| `completed` | completed |
| `week` | completed since Monday 00:00 (your timezone) |

Add `counts=true` to also get `data.counts` — the size of every view under the same
other filters, so a count and the list it opens always match.

## Subtasks and labels

**Subtasks** (one level only): `POST /api/tasks/:id/subtasks` with the usual task fields.
A subtask inherits its parent's workspace and project, has its own assignee/status/due date
and its own permissions, and is deleted with its parent. Workspace task lists show
top-level tasks only (`?includeSubtasks=true` to include them); filtering by `assignee`
includes that person's subtasks, each with `parent: { id, title }`. `GET /api/tasks/:id`
returns a `subtasks` list; every task carries `subtaskCounts { total, completed }`.
Moving a parent to another project moves its subtasks; a subtask can't move on its own.
Completing a parent never completes its subtasks.

**Labels**: `GET/POST /api/workspaces/:workspaceId/labels` (create = Owner/Admin; name
1–40 chars, unique per workspace ignoring case; `color` one of gray, moss, clay, gold,
sky, plum), `PATCH/DELETE /api/labels/:labelId` (Owner/Admin). Apply with
`labelIds: [...]` on task create/edit (replaces the set; anyone who can edit the task).
Filter lists with `?labelId=`. Deleting a label removes it from tasks; tasks stay.

## Comments and mentions

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/tasks/:id/comments` | any active member | the thread, oldest first |
| POST | `/api/tasks/:id/comments` | any active member | `{ body, mentionMembershipIds? }` |
| PATCH | `/api/comments/:commentId` | the author | edit; omit `mentionMembershipIds` to keep the current mentions |
| DELETE | `/api/comments/:commentId` | the author, or an Owner/Admin | soft delete: text and mentions removed, `deletedBy` kept |

`body` is trimmed, 1–5,000 characters, stored and returned as plain text. Mentions are
**membership ids** of active members of the task's workspace (duplicates collapse; anyone
else answers `400`). Each comment carries `editedAt` (set only when the text actually
changed), `canEdit` and `canDelete`. Tasks in archived projects answer `409` to new
comments, edits and deletes; reading still works. Comments aren't part of the activity log.

## Reminders

Send `reminderOffset` on task create/edit: `at_due`, `one_hour`, `one_day`, `three_days`,
`one_week`, or `none`. A task created (or first given a deadline) without a choice gets
`one_day`. Date-only deadlines anchor at 09:00 local time on the due date (so `one_day` is
09:00 the day before). Tasks return `reminderOffset`, `remindAt` and `overdueCheckAt` —
the pending reminder and overdue alert, `null` when nothing is pending. Only future times
are scheduled; completing a task or archiving its project clears them, and reopening or
restoring re-plans future ones. When they fire, the assignee (or the creator, while still a
member) gets a `task_reminder` / `task_overdue` notification and email, once per schedule.

## Notifications

In-app notifications belong to the signed-in account, across all its workspaces.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/notifications?unread=true&limit=&before=` | newest first, with `unreadCount` and `nextCursor` |
| GET | `/api/notifications/unread-count` | `{ unreadCount }` for the bell badge |
| POST | `/api/notifications/:id/read` | mark one read (keeps the first read time) |
| POST | `/api/notifications/read-all` | mark all read |

Types: `task_reminder` / `task_overdue` (see Reminders), `task_assigned` (someone else made you the assignee of a task or subtask),
`comment_mention` (you were newly mentioned — unchanged mentions on edit don't re-notify),
`invitation_received` (a workspace invited your email and you already have an account; a
resend doesn't add another). You're never notified of your own actions. Each notification
is written in the same transaction as the change that caused it and has a unique
`deliveryKey`, so a repeated event can't duplicate it. Every read re-checks access: if the
task was deleted, you left the workspace, or the invitation closed, `available` is `false`,
`unavailableReason` says why, and the stored `summary` and links are withheld.

## Activity history

Read-only, newest first, for every active member (outsiders get `404`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/tasks/:id/activity` | one task's history (subtask additions/deletions included) |
| GET | `/api/workspaces/:workspaceId/activity` | the workspace's history; `?projectId=` narrows to one project and its tasks |

Each entry: `{ id, action, entityType, entityId, projectId, actor { id, name, photo }, summary, changes, createdAt }`.
`changes` lists only the fields that changed, as `{ field: { from, to } }`. Assignee, project
and labels are stored as **names at the time**, so later renames don't rewrite history; long
descriptions are clipped to 500 characters. Pages: `?limit=` (default 30, max 100) and
`?before=<nextCursor>`. Entries are written in the same transaction as the change and the
database refuses to edit them. A save that changes nothing, or loses a version conflict,
records nothing.

Actions: `task.created|updated|deleted`, `subtask.created`, `project.created|updated|archived|restored`,
`member.joined|role_changed|removed|left`, `ownership.transferred`, `workspace.created|renamed`.

## Projects

Projects group related tasks inside a workspace. Every active member can view
them; Owners and Admins create and manage them. A task's project is optional
(`projectId: null`) and must belong to the task's own workspace.

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/workspaces/:workspaceId/projects` | member | Projects with `taskCounts { total, open, completed }`. Archived ones only with `?includeArchived=true` |
| `POST` | `/api/workspaces/:workspaceId/projects` | owner, admin | `{ name, description? }` (name 1–100 chars) |
| `GET` | `/api/projects/:projectId` | member | One project + `canManage` |
| `PATCH` | `/api/projects/:projectId` | owner, admin | `{ name?, description?, state? }` — `state` is `active`, `on_hold` or `completed` |
| `POST` | `/api/projects/:projectId/archive` | owner, admin | Archive (records the previous state) |
| `POST` | `/api/projects/:projectId/restore` | owner, admin | Back to the state it had before archiving |

- Completing a project never completes its tasks; clients should warn using `taskCounts.open`.
- Archived projects are read-only: editing the project or creating, editing,
  completing or deleting its tasks answers `409`. Their tasks are left out of
  workspace task lists (ask with `?projectId=<id>` to see them) and their reminders pause.
- Task lists accept `?projectId=<uuid>` or `?projectId=none`; task responses include
  `project: { id, name, state } | null`.

## Members

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| `PATCH` | `/api/workspaces/:workspaceId/members/:membershipId` | owner | `{ role: "admin" \| "member" }` |
| `DELETE` | `/api/workspaces/:workspaceId/members/:membershipId` | owner, admin | Remove (Admin: Members only; nobody removes the Owner) |
| `POST` | `/api/workspaces/:workspaceId/leave` | admin, member | Leave (the Owner gets `409` — transfer first) |
| `POST` | `/api/workspaces/:workspaceId/transfer-ownership` | owner | `{ membershipId }` → target becomes Owner, caller becomes Admin |

Removal and leaving keep the membership row (status `removed`) so history keeps
its attribution; access ends immediately. Ownership transfer is one transaction
and the database allows only one active Owner, so concurrent transfers can't
produce two Owners or none.

## Invitations

Invite people by email, whether or not they have an account (PRD J2/J3). An
invitation grants nothing until a signed-in account **with the invited email**
accepts it. Links expire after 7 days; resending replaces the link (older emails
stop working).

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/workspaces/:workspaceId/invitations` | owner, admin | `{ email, role }` — Owner may offer `admin`/`member`, Admin only `member`. `409` if already a member or already invited. |
| `GET` | `/api/workspaces/:workspaceId/invitations` | owner, admin | Pending invitations with `status` (`pending`/`expired`) and `deliveryStatus` (`sent`/`failed`) |
| `POST` | `/api/invitations/:invitationId/resend` | owner, admin* | New link + email |
| `POST` | `/api/invitations/:invitationId/revoke` | owner, admin* | Withdraw it |
| `GET` | `/api/invitations/preview/:token` | public | Workspace name, inviter, role, invited email, status |
| `GET` | `/api/invitations/mine` | signed in | Pending invitations addressed to my email |
| `POST` | `/api/invitations/accept` | invited account | `{ token }` or `{ invitationId }` → `{ workspaceId, role }` |
| `POST` | `/api/invitations/decline` | invited account | Same body |

\* Admins manage Member invitations only. Accepting twice (or two tabs at once)
creates exactly one membership; the second request gets `409`. Wrong account →
`403`, expired → `410`, already accepted/declined/revoked → `409`.

## Tasks

Task ownership rule:

Every task query is scoped to the authenticated user. A logged-in user cannot read, edit, update, or delete another user's task, even if they know the task ID.

Task fields:

```txt
title: required string
description: optional string
status: "pending" | "in_progress" | "completed"
priority: "low" | "medium" | "high"
deadline: optional date
```

Stored and returned as `in_progress`. For older clients the API also accepts `in progress` and `in-progress`.

### Create Task

```http
POST /api/workspaces/:workspaceId/tasks
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
      "id": "task_uuid",
      "userId": "user_uuid",
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

### Get All Tasks

Returns only tasks owned by the authenticated user.

```http
GET /api/workspaces/:workspaceId/tasks
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
GET /api/workspaces/:workspaceId/tasks?status=pending
GET /api/workspaces/:workspaceId/tasks?priority=high
GET /api/workspaces/:workspaceId/tasks?sort=deadline
GET /api/workspaces/:workspaceId/tasks?sort=-createdAt
```

Success response:

```json
{
  "status": "success",
  "results": 1,
  "data": {
    "tasks": [
      {
        "id": "task_uuid",
        "userId": "user_uuid",
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
GET /api/tasks/:id
```

Auth required: yes.

Example:

```http
GET /api/tasks/665f1c2d3a4b5c6d7e8f9012
```

Success response:

```json
{
  "status": "success",
  "data": {
    "task": {
      "id": "task_uuid",
      "userId": "user_uuid",
      "title": "Finish API docs",
      "status": "pending",
      "priority": "medium"
    }
  }
}
```

### Edit Task

Updates task fields only if the task belongs to the authenticated user.

```http
PUT /api/tasks/:id
```

Auth required: yes.

Request body:

```json
{
  "title": "Finish full API docs",
  "description": "Update all endpoint docs",
  "status": "in_progress",
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
      "id": "task_uuid",
      "userId": "user_uuid",
      "title": "Finish full API docs",
      "status": "in_progress",
      "priority": "high"
    }
  }
}
```

### Update Task Status

Updates only the task status.

```http
PATCH /api/tasks/:id/status
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
in_progress
in progress  (legacy, accepted)
in-progress  (legacy, accepted)
completed
```

Success response:

```json
{
  "status": "success",
  "data": {
    "task": {
      "id": "task_uuid",
      "status": "completed"
    }
  }
}
```

### Delete Task

Deletes a task only if it belongs to the authenticated user.

```http
DELETE /api/tasks/:id
```

Auth required: yes.

Success response:

```http
204 No Content
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
  "userId": "UUID, required",
  "title": "String, required",
  "description": "String, optional",
  "status": "pending | in_progress | completed",
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

4. Keep the `afritask_session` cookie the login response set (e.g. `curl -c jar.txt` then `-b jar.txt`).

5. Create task:

```http
POST /api/workspaces/:workspaceId/tasks
Cookie: afritask_session=<from login>
X-Requested-With: XMLHttpRequest
```

6. Get all tasks:

```http
GET /api/workspaces/:workspaceId/tasks
Cookie: afritask_session=<from login>
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
    "id": "user_uuid",
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
status: "pending" | "in_progress" | "completed"
priority: "low" | "medium" | "high"
deadline: optional date
```

Stored and returned as `in_progress`. For older clients the API also accepts `in progress` and `in-progress`.

### Create Task

```http
POST /api/workspaces/:workspaceId/tasks
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
      "id": "task_uuid",
      "userId": "user_uuid",
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

### Get All Tasks

Returns only tasks owned by the authenticated user.

```http
GET /api/workspaces/:workspaceId/tasks
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
GET /api/workspaces/:workspaceId/tasks?status=pending
GET /api/workspaces/:workspaceId/tasks?priority=high
GET /api/workspaces/:workspaceId/tasks?sort=deadline
GET /api/workspaces/:workspaceId/tasks?sort=-createdAt
```

Success response:

```json
{
  "status": "success",
  "results": 1,
  "data": {
    "tasks": [
      {
        "id": "task_uuid",
        "userId": "user_uuid",
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
GET /api/tasks/:id
```

Auth required: yes.

Example:

```http
GET /api/tasks/665f1c2d3a4b5c6d7e8f9012
```

Success response:

```json
{
  "status": "success",
  "data": {
    "task": {
      "id": "task_uuid",
      "userId": "user_uuid",
      "title": "Finish API docs",
      "status": "pending",
      "priority": "medium"
    }
  }
}
```

### Edit Task

Updates task fields only if the task belongs to the authenticated user.

```http
PUT /api/tasks/:id
```

Auth required: yes.

Request body:

```json
{
  "title": "Finish full API docs",
  "description": "Update all endpoint docs",
  "status": "in_progress",
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
      "id": "task_uuid",
      "userId": "user_uuid",
      "title": "Finish full API docs",
      "status": "in_progress",
      "priority": "high"
    }
  }
}
```

### Update Task Status

Updates only the task status.

```http
PATCH /api/tasks/:id/status
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
in_progress
in progress  (legacy, accepted)
in-progress  (legacy, accepted)
completed
```

Success response:

```json
{
  "status": "success",
  "data": {
    "task": {
      "id": "task_uuid",
      "status": "completed"
    }
  }
}
```

### Delete Task

Deletes a task only if it belongs to the authenticated user.

```http
DELETE /api/tasks/:id
```

Auth required: yes.

Success response:

```http
204 No Content
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
  "userId": "UUID, required",
  "title": "String, required",
  "description": "String, optional",
  "status": "pending | in_progress | completed",
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

4. Keep the `afritask_session` cookie the login response set (e.g. `curl -c jar.txt` then `-b jar.txt`).

5. Create task:

```http
POST /api/workspaces/:workspaceId/tasks
Cookie: afritask_session=<from login>
X-Requested-With: XMLHttpRequest
```

6. Get all tasks:

```http
GET /api/workspaces/:workspaceId/tasks
Cookie: afritask_session=<from login>
```
