# Project Structure & Conventions

Task Management REST API. Use this as the blueprint for adding or modifying code so everything stays consistent.

## Stack

- **Runtime:** Node.js + Express 5, TypeScript (strict, `module: NodeNext`), ESM (`"type": "module"`)
- **Database:** MongoDB via Mongoose
- **Auth:** JWT + Passport Google OAuth
- **Email:** Brevo / Resend / Nodemailer
- **Logging:** Winston (+ Morgan piped into it)
- **Jobs:** BullMQ (Redis)

## Directory layout

```
server/
├── package.json              # ESM; scripts: dev (tsx watch), build (tsc → dist/), typecheck, start (node dist/server.js)
├── API_DOCUMENTATION.md
├── README.md
├── public/uploads/profile/   # static-served user upload assets
└── src/
    ├── server.ts             # app entry: middleware + route mounting + listen
    ├── config/
    │   ├── env.ts            # validated, typed env config — boot fails on missing required vars
    │   ├── db.ts             # connectDB() — mongoose.connect, process.exit(1) on fail
    │   ├── passport.ts       # Google OAuth strategy
    │   └── redis.ts          # BullMQ connection options
    ├── models/               # Mongoose schemas (PascalCase files)
    │   ├── User.ts
    │   └── Task.ts
    ├── controllers/          # *.controller.ts — request handlers
    │   ├── auth.controller.ts
    │   ├── task.controller.ts
    │   └── user.controller.ts
    ├── routes/               # *Route.ts — express.Router definitions
    │   ├── authRoute.ts
    │   ├── taskRoute.ts
    │   └── userRoute.ts
    ├── middlewares/
    │   ├── auth.middleware.ts   # protect (JWT verify, attaches req.user) + requireUser(req) typed getter
    │   ├── role.middleware.ts   # authorize(...roles)
    │   ├── error.Middleware.ts  # globalErrorHandler
    │   └── upload.ts            # multer config
    ├── jobs/
    │   └── taskReminder.ts      # BullMQ queue + worker for daily reminders
    ├── types/
    │   └── express.d.ts         # widens Express.User to our UserDocument
    └── utils/
        ├── AppError.ts          # operational error class
        ├── catchAsync.ts        # async wrapper -> next(err)
        ├── jwt.ts               # generateToken(user)
        ├── logger.ts            # Winston logger
        ├── email.ts             # email senders
        └── emailTemplates.ts    # HTML templates
```

## Layering & request flow

```
server.ts → routes/*Route.ts → middlewares (protect, authorize) → controllers/*.controller.ts → models/* → utils/*
                                                                          ↓ on error
                                                                  catchAsync → globalErrorHandler
```

Each domain (auth, task, user) is a triple: **model + controller + route**.
**To add a new domain:** create all three files and mount the route in `server.ts` under `/api/<domain>`.

## Conventions

### Module system
- ESM only. Use `import`/`export`, and **always include the `.js` extension** in relative imports (`"../models/Task.js"`) — even though the file is `Task.ts`. NodeNext resolution maps it to the `.ts` source and the emitted `dist/*.js` keeps working; a `.ts` extension would break the build.
- Models: `export default mongoose.model(...)`.
- Controllers: named exports per handler.
- Routes: `export default router`.
- Utils: default export for a single thing; named exports when multiple.

### Controllers (reference: `src/controllers/task.controller.ts`)
- Wrap every handler in `catchAsync(async (req, res, next) => { ... })`.
- Validate inputs early; on failure return `next(new AppError(message, statusCode))`.
- Get the user with `requireUser(req)` (from `auth.middleware.ts`) — `req.user` is typed optional, and the helper turns a missing user into a 401 instead of a crash: `const userId = requireUser(req).id;`.
- Read config from `env` (`config/env.ts`), not `process.env`, for anything required.
- **Always scope DB queries to the owner**: `Task.findOne({ _id: id, user: userId })` — never look up a user-owned resource by `_id` alone.
- Logging: `logger.info` on success, `logger.warn` on expected failures (not found, bad input), `logger.error` for unexpected.
- Success response shape:
  ```js
  res.status(200).json({ status: "success", data: { task } });
  // lists:   { status: "success", results: tasks.length, data: { tasks } }
  // create:  201
  // delete:  204, data: null
  ```

### Routes (reference: `src/routes/taskRoute.ts`)
- `const router = express.Router()`.
- Apply `protect` (and `authorize(...)` where needed) before the controller.
- Mounted under `/api/<domain>` in `server.ts`.

### Models (reference: `src/models/Task.ts`, `src/models/User.ts`)
- `new mongoose.Schema({...}, { timestamps: true })`.
- Validation messages as tuples: `required: [true, "Title is required"]`. Use `enum`, `default`, and the `validator` lib for things like email.
- Sensitive fields use `select: false` (password, tokens).
- Password hashing via `pre("save")` hook; instance methods (e.g. `comparePassword`) on `schema.methods`.

### Errors
- `AppError(message, statusCode)` (`src/utils/AppError.ts`) — sets `status` (`fail` for 4xx, else `error`) and `isOperational`.
- `catchAsync` forwards rejections to `next`.
- `globalErrorHandler` (`src/middlewares/error.Middleware.ts`) translates Mongoose/JWT errors (`11000` duplicate, `ValidationError`, `CastError`, `JsonWebTokenError`, `TokenExpiredError`) and hides non-operational messages. **Mounted last** in `server.ts`.

### Auth
- JWT via `generateToken(user)` (`src/utils/jwt.ts`) signing `{ id }`.
- `protect` (`src/middlewares/auth.middleware.ts`) reads the `Bearer` header, verifies the token, loads the user, sets `req.user`.
- `authorize(...roles)` (`src/middlewares/role.middleware.ts`) for RBAC, applied after `protect`.

### Cross-cutting
- Security middleware in `server.ts`: `helmet`, `cors` (env-driven origin), `express.json()`, `express.static('public')`, `morgan` piped into Winston.
- Logging: import `logger` from `utils/logger.ts`; caught errors are `unknown`, so log `describeError(error)` (stack) or `errorMessage(error)` (one line).
- Background work: BullMQ queues + workers in `jobs/` (Redis via `config/redis.ts`), registered inside the `app.listen` callback.
- DB: `connectDB()` called once at the top of `server.ts`.


