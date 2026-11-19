# LEARNING.md — DevFlow Platform

A running log of every phase: what was built, what each file does, and why it exists.

---

## Phase 1 — Backend Skeleton

### Goal
Stand up a bare Express server with a MongoDB connection, a health-check route, and proper error handling. No features yet — just a solid foundation every later phase can build on.

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
