# Afritask Task Manager Frontend

Afritask is a Next.js App Router frontend for a task manager API. It uses feature-based contexts for auth, tasks, and profile state, axios for requests, and react-hot-toast for notifications.

## Tech Stack

- Next.js 16
- React 19
- axios
- react-hot-toast
- Tailwind CSS 4

## Features

- Sign up, login, and logout
- Email verification flow
- Forgot password and reset password flow
- Protected dashboard and profile pages
- Task list with search and status filters
- Create, edit, delete, and update task status
- Profile updates, password changes, and avatar upload
- Google OAuth sign-in link

## Project Structure

```text
src/
  app/
    layout.js
    globals.css
    page.js
    login/page.js
    signup/page.js
    forgot-password/page.js
    reset-password/page.js
    verify-email/[token]/page.js
    dashboard/page.js
    profile/page.js
  components/
    AuthLayout.js
    Avatar.js
    Button.js
    EmptyState.js
    FormField.js
    LoadingScreen.js
    Navbar.js
    ProtectedRoute.js
    TaskCard.js
    TaskFormModal.js
  context/
    AppProviders.js
    AuthContext.js
    TaskContext.js
    UserContext.js
  lib/
    api.js
    services/
      authService.js
      taskService.js
      userService.js
  utils/
    imageURL.js
```

## Routes

- `/` redirects to `/dashboard` or `/login`
- `/login` sign in page
- `/signup` account creation page
- `/forgot-password` request a reset link
- `/reset-password?token=...` set a new password
- `/verify-email/[token]` verify an email token
- `/dashboard` protected task dashboard
- `/profile` protected account settings page

## Setup

```bash
npm install
npm run dev
```

Open the app at `http://localhost:3000`.

## Environment Variables

Create a `.env` file with:

```env
NEXT_PUBLIC_API_URL=http://localhost:<backend-port>
```

`NEXT_PUBLIC_API_URL` should point to your backend origin without `/api`. Make sure it matches the port your server is actually listening on.

## Scripts

- `npm run dev` starts the development server
- `npm run build` creates a production build
- `npm start` runs the production server

## How It Works

### API layer

- `src/lib/api.js` creates the shared axios instance.
- `src/lib/services/*.js` keeps backend route calls organized by feature.
- JWTs are stored in `localStorage` under `afritask_token` and attached automatically to requests.

### Global state

- `src/context/AuthContext.js` stores the current user, auth loading flag, and auth actions.
- `src/context/TaskContext.js` stores the task list and task actions.
- `src/context/UserContext.js` stores the profile action helpers.
- On first load, auth checks for a stored token and calls `GET /auth/me` to restore the session.
- Task status and delete actions are handled optimistically and rolled back if the request fails.

### UI behavior

- `src/components/ProtectedRoute.js` blocks unauthenticated access to protected pages.
- `src/components/Navbar.js` shows navigation and the user menu.
- `src/components/TaskFormModal.js` handles both create and edit flows.
- `src/components/Avatar.js` shows a profile photo when available, otherwise initials.
- `src/utils/imageURL.js` normalizes image paths before passing them to `next/image`.

## Backend Endpoints Used

The frontend calls these route groups through `src/lib/services/*.js`:

- `/auth/*`
- `/users/profile`
- `/users/password`
- `/task/*`

Avatar uploads are handled through `PUT /users/profile` with multipart form data using the `photo` field.

## Notes

- The app uses the `@/` import alias for files inside `src/`.
- The design tokens and global styles live in `src/app/globals.css`.
- Fonts are loaded in `src/app/layout.js` with `next/font/google`.
