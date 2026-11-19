# LEARNING.md — DevFlow Platform

A running log of every phase: what was built, what each file does, and why it exists.

---

## Phase 2 — Authentication & RBAC

### Goal
Let users register and log in, protect routes with JWTs, and enforce role-based access so that only the right roles can reach certain endpoints. No feature-specific routes yet — just the auth layer every future phase will rely on.

---

### Files Created

#### `backend/models/User.js`
The Mongoose schema for a user. Stores `name`, `email` (unique, lowercased, trimmed), `password` (hashed, never returned by default via `select: false`), and `role` (candidate / recruiter / admin, defaults to candidate). A `pre("save")` hook runs `bcrypt.hash` automatically whenever the password changes so we never accidentally store plain text. A `matchPassword` instance method handles login comparison cleanly inside the model rather than in controller code.

#### `backend/controllers/authController.js`
Contains the three handler functions:
- **register** — checks for duplicate email, creates the user (role limited to candidate/recruiter by the validator), returns a JWT and safe user object.
- **login** — fetches the user with the password field explicitly re-selected, compares via `matchPassword`, and returns the **same error message** whether the email or password is wrong (prevents user enumeration).
- **getMe** — returns the already-fetched `req.user` from the auth middleware; no extra DB call needed.

#### `backend/routes/auth.js`
Wires URLs to middleware chains and controller functions. The order of middleware in each chain matters: validation runs first, then the controller, then role guards on protected routes.

#### `backend/middleware/auth.js`
Reads the `Authorization: Bearer <token>` header, verifies the JWT with `jsonwebtoken`, fetches the matching user from the DB, and attaches it to `req.user`. If anything fails (missing header, bad token, deleted user) it responds with 401 immediately without calling `next()`.

#### `backend/middleware/authorizeRoles.js`
A factory function — it takes a list of allowed roles and returns a middleware. By being a factory it stays reusable across any future route: `authorizeRoles("admin", "recruiter")` reads naturally and requires no repeated logic.

#### `backend/middleware/validators.js`
Centralises all `express-validator` rule arrays and the shared `validate` helper in one file. Keeping rules here (not scattered across route files) makes them easy to find, update, and reuse. The `validate` helper extracts errors and responds with a 422 and a structured array of `{ field, message }` objects so the frontend always gets a consistent error shape.

### Files Modified

#### `backend/.env.example` / `backend/.env`
Added `JWT_SECRET` (a long random string in production) and `JWT_EXPIRES_IN=7d`.

#### `backend/server.js`
Mounted the new auth router at `/api/auth`.

---

## Phase 1 — Backend Skeleton

### Goal
Stand up a bare Express server with a MongoDB connection, a health-check route, and proper error handling. No features yet — just a solid foundation every later phase can build on.

---

## Phase 2 — Authentication & RBAC

### Goal
Let users register and log in, protect routes with JWTs, and enforce role-based access so that only the right roles can reach certain endpoints. No feature-specific routes yet — just the auth layer every future phase will rely on.

---

### Files Created

#### `backend/models/User.js`
The Mongoose schema for a user. Stores `name`, `email` (unique, lowercased, trimmed), `password` (hashed, never returned by default via `select: false`), and `role` (candidate / recruiter / admin, defaults to candidate). A `pre("save")` hook runs `bcrypt.hash` automatically whenever the password changes so we never accidentally store plain text. A `matchPassword` instance method handles login comparison cleanly inside the model rather than in controller code.

#### `backend/controllers/authController.js`
Contains the three handler functions:
- **register** — checks for duplicate email, creates the user (role limited to candidate/recruiter by the validator), returns a JWT and safe user object.
- **login** — fetches the user with the password field explicitly re-selected, compares via `matchPassword`, and returns the **same error message** whether the email or password is wrong (prevents user enumeration).
- **getMe** — returns the already-fetched `req.user` from the auth middleware; no extra DB call needed.

#### `backend/routes/auth.js`
Wires URLs to middleware chains and controller functions. The order of middleware in each chain matters: validation runs first, then the controller, then role guards on protected routes.

#### `backend/middleware/auth.js`
Reads the `Authorization: Bearer <token>` header, verifies the JWT with `jsonwebtoken`, fetches the matching user from the DB, and attaches it to `req.user`. If anything fails (missing header, bad token, deleted user) it responds with 401 immediately without calling `next()`.

#### `backend/middleware/authorizeRoles.js`
A factory function — it takes a list of allowed roles and returns a middleware. By being a factory it stays reusable across any future route: `authorizeRoles("admin", "recruiter")` reads naturally and requires no repeated logic.

#### `backend/middleware/validators.js`
Centralises all `express-validator` rule arrays and the shared `validate` helper in one file. Keeping rules here (not scattered across route files) makes them easy to find, update, and reuse. The `validate` helper extracts errors and responds with a 422 and a structured array of `{ field, message }` objects so the frontend always gets a consistent error shape.

### Files Modified

#### `backend/.env.example` / `backend/.env`
Added `JWT_SECRET` (a long random string in production) and `JWT_EXPIRES_IN=7d`.

#### `backend/server.js`
Mounted the new auth router at `/api/auth`.

---

### Files Created

#### `backend/package.json`
The project manifest for Node.js. Lists the app's name, entry point (`server.js`), npm scripts (`start` and `dev`), and all dependencies. Having this file lets anyone clone the repo and run `npm install` to get an identical environment.

#### `backend/.env.example`
A template that shows which environment variables the app needs (`PORT`, `MONGO_URI`, `NODE_ENV`) **without** exposing real values. Developers copy this to `.env` and fill in their own secrets.

#### `backend/.env`
The actual secrets file (git-ignored). It is loaded at startup by `dotenv` so sensitive values never appear in source code.

#### `backend/.gitignore`
Tells Git to ignore `.env` (keeps secrets out of version control) and `node_modules/` (keeps the repo small — dependencies are reinstalled from `package.json`).

#### `backend/server.js`
The entry point of the whole application. It:
1. Loads `.env` variables via `dotenv`.
2. Calls `connectDB()` to open the database connection.
3. Registers global middleware (CORS, JSON body parsing).
4. Mounts route files under their URL prefixes.
5. Registers the 404 and error-handler middleware **last** (order matters in Express).
6. Starts listening on the configured port.

#### `backend/config/db.js`
Encapsulates the Mongoose connection logic in one place. If the connection fails it logs the error and exits the process — there is no point running an API that cannot reach its database.

#### `backend/routes/health.js`
Defines a single `GET /api/health` route that returns a JSON success message and a timestamp. Used to verify that the server is reachable and responding correctly (useful for load-balancers, CI checks, and manual smoke tests).

#### `backend/middleware/errorHandler.js`
A global Express error handler (4-parameter signature: `err, req, res, next`). Any route can call `next(err)` to forward an error here instead of repeating try/catch everywhere. In development it also includes the stack trace to speed up debugging.

#### `backend/middleware/notFound.js`
Registered after all real routes. If a request reaches it, no route matched, so it creates a 404 error and passes it to `errorHandler`. This prevents Express from silently returning an empty response for unknown URLs.

#### `backend/models/.gitkeep` / `backend/controllers/.gitkeep`
Empty placeholder files so Git tracks these otherwise-empty folders. Mongoose models and controller functions will be added in later phases.

---

## Phase 2 — Authentication & RBAC

### Goal
Let users register and log in, protect routes with JWTs, and enforce role-based access so that only the right roles can reach certain endpoints. No feature-specific routes yet — just the auth layer every future phase will rely on.

---

### Files Created

#### `backend/models/User.js`
The Mongoose schema for a user. Stores `name`, `email` (unique, lowercased, trimmed), `password` (hashed, never returned by default via `select: false`), and `role` (candidate / recruiter / admin, defaults to candidate). A `pre("save")` hook runs `bcrypt.hash` automatically whenever the password changes so we never accidentally store plain text. A `matchPassword` instance method handles login comparison cleanly inside the model rather than in controller code.

#### `backend/controllers/authController.js`
Contains the three handler functions:
- **register** — checks for duplicate email, creates the user (role limited to candidate/recruiter by the validator), returns a JWT and safe user object.
- **login** — fetches the user with the password field explicitly re-selected, compares via `matchPassword`, and returns the **same error message** whether the email or password is wrong (prevents user enumeration).
- **getMe** — returns the already-fetched `req.user` from the auth middleware; no extra DB call needed.

#### `backend/routes/auth.js`
Wires URLs to middleware chains and controller functions. The order of middleware in each chain matters: validation runs first, then the controller, then role guards on protected routes.

#### `backend/middleware/auth.js`
Reads the `Authorization: Bearer <token>` header, verifies the JWT with `jsonwebtoken`, fetches the matching user from the DB, and attaches it to `req.user`. If anything fails (missing header, bad token, deleted user) it responds with 401 immediately without calling `next()`.

#### `backend/middleware/authorizeRoles.js`
A factory function — it takes a list of allowed roles and returns a middleware. By being a factory it stays reusable across any future route: `authorizeRoles("admin", "recruiter")` reads naturally and requires no repeated logic.

#### `backend/middleware/validators.js`
Centralises all `express-validator` rule arrays and the shared `validate` helper in one file. Keeping rules here (not scattered across route files) makes them easy to find, update, and reuse. The `validate` helper extracts errors and responds with a 422 and a structured array of `{ field, message }` objects so the frontend always gets a consistent error shape.

### Files Modified

#### `backend/.env.example` / `backend/.env`
Added `JWT_SECRET` (a long random string in production) and `JWT_EXPIRES_IN=7d`.

#### `backend/server.js`
Mounted the new auth router at `/api/auth`.

---
