# Project Structure & Conventions

Task Management REST API. Use this as the blueprint for adding or modifying code so everything stays consistent.

## Stack

- **Runtime:** Node.js + Express 5, ESM (`"type": "module"`)
- **Database:** MongoDB via Mongoose
- **Auth:** JWT + Passport Google OAuth
- **Email:** Brevo / Resend / Nodemailer
- **Logging:** Winston (+ Morgan piped into it)
- **Jobs:** node-cron

## Directory layout

```
server/
├── package.json              # ESM; scripts: dev (nodemon), start (node --watch --env-file), lint
├── API_DOCUMENTATION.md
├── README.md
├── public/uploads/profile/   # static-served user upload assets
└── src/
    ├── server.js             # app entry: middleware + route mounting + listen
    ├── config/
    │   ├── db.js             # connectDB() — mongoose.connect, process.exit(1) on fail
    │   └── passport.js       # Google OAuth strategy
    ├── models/               # Mongoose schemas (PascalCase files)
    │   ├── User.js
    │   └── Task.js
    ├── controllers/          # *.controller.js — request handlers
    │   ├── auth.controller.js
    │   ├── task.controller.js
    │   └── user.controller.js
    ├── routes/               # *Route.js — express.Router definitions
    │   ├── authRoute.js
    │   ├── taskRoute.js
    │   └── userRoute.js
    ├── middlewares/
    │   ├── auth.middleware.js   # protect (JWT verify, attaches req.user)
    │   ├── role.middleware.js   # authorize(...roles)
    │   ├── error.Middleware.js  # globalErrorHandler
    │   └── upload.js            # multer config
    ├── jobs/
    │   └── taskReminder.js      # node-cron scheduled job
    └── utils/
        ├── AppError.js          # operational error class
        ├── catchAsync.js        # async wrapper -> next(err)
        ├── jwt.js               # generateToken(user)
        ├── logger.js            # Winston logger
        ├── email.js             # email senders
        └── emailTemplates.js    # HTML templates
```

## Layering & request flow

```
server.js → routes/*Route.js → middlewares (protect, authorize) → controllers/*.controller.js → models/* → utils/*
                                                                          ↓ on error
                                                                  catchAsync → globalErrorHandler
```

Each domain (auth, task, user) is a triple: **model + controller + route**.
**To add a new domain:** create all three files and mount the route in `server.js` under `/api/<domain>`.

## Conventions

### Module system
- ESM only. Use `import`/`export`, and **always include the `.js` extension** in relative imports (`"../models/Task.js"`).
- Models: `export default mongoose.model(...)`.
- Controllers: named exports per handler.
- Routes: `export default router`.
- Utils: default export for a single thing; named exports when multiple.

### Controllers (reference: `src/controllers/task.controller.js`)
- Wrap every handler in `catchAsync(async (req, res, next) => { ... })`.
- Validate inputs early; on failure return `next(new AppError(message, statusCode))`.
- Get the user from `req.user` (set by `protect`); use `req.user.id`.
- **Always scope DB queries to the owner**: `Task.findOne({ _id: id, user: userId })` — never look up a user-owned resource by `_id` alone.
- Logging: `logger.info` on success, `logger.warn` on expected failures (not found, bad input), `logger.error` for unexpected.
- Success response shape:
  ```js
  res.status(200).json({ status: "success", data: { task } });
  // lists:   { status: "success", results: tasks.length, data: { tasks } }
  // create:  201
  // delete:  204, data: null
  ```

### Routes (reference: `src/routes/taskRoute.js`)
- `const router = express.Router()`.
- Apply `protect` (and `authorize(...)` where needed) before the controller.
- Mounted under `/api/<domain>` in `server.js`.

### Models (reference: `src/models/Task.js`, `src/models/User.js`)
- `new mongoose.Schema({...}, { timestamps: true })`.
- Validation messages as tuples: `required: [true, "Title is required"]`. Use `enum`, `default`, and the `validator` lib for things like email.
- Sensitive fields use `select: false` (password, tokens).
- Password hashing via `pre("save")` hook; instance methods (e.g. `comparePassword`) on `schema.methods`.

### Errors
- `AppError(message, statusCode)` (`src/utils/AppError.js`) — sets `status` (`fail` for 4xx, else `error`) and `isOperational`.
- `catchAsync` forwards rejections to `next`.
- `globalErrorHandler` (`src/middlewares/error.Middleware.js`) translates Mongoose/JWT errors (`11000` duplicate, `ValidationError`, `CastError`, `JsonWebTokenError`, `TokenExpiredError`) and hides non-operational messages. **Mounted last** in `server.js`.

### Auth
- JWT via `generateToken(user)` (`src/utils/jwt.js`) signing `{ id }`.
- `protect` (`src/middlewares/auth.middleware.js`) reads the `Bearer` header, verifies the token, loads the user, sets `req.user`.
- `authorize(...roles)` (`src/middlewares/role.middleware.js`) for RBAC, applied after `protect`.

### Cross-cutting
- Security middleware in `server.js`: `helmet`, `cors` (env-driven origin), `express.json()`, `express.static('public')`, `morgan` piped into Winston.
- Logging: import `logger` from `utils/logger.js`; log `error.stack || error.message || error`.
- Background work: node-cron jobs in `jobs/`, registered inside the `app.listen` callback.
- DB: `connectDB()` called once at the top of `server.js`.


