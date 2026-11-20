# LEARNING.md — DevFlow Platform

A running log of every phase: what was built, what each file does, and why it exists.

---

## Phase 3d-1 — Assessment Creation & Viewing

### Goal
Enable recruiters to create, view, update, and delete assessments for their jobs, while allowing candidates who hold a non-rejected application for a job to preview the assessment without seeing answers.

---

### Files Created

#### `backend/models/Assessment.js`
Mongoose schema for job assessments:
- **`job`**: Reference to `Job` with a unique index ensuring only one assessment can exist per job.
- **`createdBy`**: Reference to `User` (the recruiter).
- **`durationMinutes`**: Integer between 1 and 180 minutes.
- **`questions`**: Array of subdocuments (`questionSchema`, with subdocument `_id: true`), each containing:
  - `type`: `"mcq"` or `"code"`.
  - `text`: Prompt/question string.
  - `points`: Integer points (minimum 1).
  - `options`: Array of 2 to 6 strings (required for MCQ; undefined for code).
  - `correctOption`: Index into `options` (required for MCQ; undefined for code).

#### `backend/controllers/assessmentController.js`
Five controller handlers and two internal helper functions:
- **`sanitizeForCandidate`**: Strips `correctOption` from MCQ questions, ensures `options` and `correctOption` are absent for code questions, keeps question subdocument `_id`, and returns only `_id`, `title`, `description`, `durationMinutes`, and sanitized `questions`. Excludes recruiter metadata (`postedBy`, `createdBy`, and populated `job`).
- **`resolveAccess`**: Centralizes access rules for viewing an assessment:
  - Recruiter: Must own the job (`job.postedBy.equals(req.user._id)`).
  - Candidate: Must have an existing application for that job that is **not rejected** (`status: { $ne: "rejected" }`).
  - Others: Returns 403 Forbidden.
- **`createAssessment`**: Verifies job existence and recruiter ownership (`job.postedBy.equals(req.user._id)`). Prevents duplicates via unique index handling (409 Conflict). Automatically assigns `createdBy` from `req.user._id`.
- **`getByJobId`**: Fetches assessment by `jobId` parameter. Uses `resolveAccess` and returns the sanitized view for candidates or full view for the owning recruiter.
- **`getById`**: Fetches assessment by assessment `id`. Same access control and candidate data sanitization.
- **`updateAssessment`**: Allows only the creating recruiter (`assessment.createdBy.equals(req.user._id)`) to update assessment details. Protects `job`, `jobId`, and `createdBy` from being modified.
- **`deleteAssessment`**: Allows only the creating recruiter to delete the assessment.

#### `backend/routes/assessments.js`
Configures route endpoints:
- `POST /api/assessments` — Recruiter only, with input validation.
- `GET /api/assessments/job/:jobId` — Declared before `/:id` to prevent route collision. Accessible to the job-owning recruiter and non-rejected candidates.
- `GET /api/assessments/:id` — Accessible to the job-owning recruiter and non-rejected candidates.
- `PUT /api/assessments/:id` — Recruiter only, with update validation.
- `DELETE /api/assessments/:id` — Recruiter only.

---

### Files Modified

#### `backend/middleware/validators.js`
Added `assessmentRules` and `updateAssessmentRules` with a shared `validateQuestions` cross-field validator:
- Ensures between 1 and 50 questions per assessment.
- For `mcq`: Enforces `options` is an array of 2 to 6 strings, and `correctOption` is an integer index within `[0, options.length - 1]`.
- For `code`: Enforces that `options` is not provided (or empty) and `correctOption` is absent.

#### `backend/server.js`
Mounted `assessmentRouter` at `/api/assessments`.

---

## Phase 3c — Applications

### Goal
Let candidates apply to open jobs (once per job), and let recruiters manage the applicant pipeline — viewing applicants for their jobs, changing application statuses, and reading individual applications. Ownership is enforced at the query level using `.equals()` for all ObjectId comparisons.

---

### Files Created

#### `backend/models/Application.js`
Mongoose schema for a job application. Key design choices:
- **Compound unique index `{ job: 1, candidate: 1 }`** — MongoDB rejects a second application from the same candidate for the same job at the database level. The controller catches error code `11000` and returns a clear `409`.
- **`statusHistory` array** — every status change (including the initial `"applied"` on creation) is appended as `{ status, changedAt, changedBy }`. This gives a full audit trail without a separate collection.
- `candidate` and `job` are always set from server state — the body never influences them.

#### `backend/controllers/applicationController.js`
Five handlers plus two helpers:

- **`parsePagination`** — identical safe pagination logic to `jobController.js` (parse → validate → cap at 50), extracted as a local function to avoid importing across modules.
- **`resolveApplication`** — shared helper used by `getApplicationById`. Validates ObjectId format (400), fetches the application with full population (job + company + candidate + statusHistory.changedBy), returns `null` and sends the response on failure. All ObjectId comparisons use `.equals()`, never `===`, because Mongoose ObjectIds are objects, not primitives.
- **`apply`** — guard chain: job exists → job is open → deadline not passed → then `Application.create()`. Seeds `statusHistory` with the initial `"applied"` entry on creation.
- **`myApplications`** — queries by `candidate: req.user._id`, populates job title and company name via nested populate, sorted newest first.
- **`jobApplicants`** — validates the jobId, checks the job exists, then uses `.equals(req.user._id)` to confirm recruiter ownership. Returns paginated applicants (same `parsePagination` pattern, capped at 50), optionally filtered by `?status=`. Sorts newest first.
- **`changeStatus`** — all status-update logic lives in this single function: ObjectId check → find → `.equals()` ownership check → same-value guard (`400`) → push to `statusHistory` → save. Status changes are allowed even on closed jobs (the closure guard only applies when *applying*). `"applied"` cannot be set as a target status — blocked at the validator layer.
- **`getApplicationById`** — uses `resolveApplication`, then checks `.equals()` for both the candidate owner and the recruiter who posted the job. Either passes; anyone else gets `403`.

#### `backend/routes/applications.js`
Route declaration order is critical:
1. `POST /` — candidate apply
2. `GET /my` — literal, **before** `/:id` so `"my"` is never parsed as an ObjectId
3. `GET /job/:jobId` — literal prefix, **before** `/:id`
4. `PATCH /:id/status` — before `GET /:id`
5. `GET /:id` — catch-all param route, last

### Files Modified

#### `backend/middleware/validators.js`
Added `applyRules` (`jobId` required + valid ObjectId, `resumeUrl` optional URL) and `statusChangeRules` (`status` required, must be `shortlisted | rejected | hired` — `"applied"` deliberately excluded so recruiters cannot revert an application to its initial state). Both follow the same `{ field, message }` error shape as all other rules. Required `mongoose` at the top of this file for the ObjectId validation custom rule.

#### `backend/server.js`
Mounted the applications router at `/api/applications`.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 3a — Company Profile

### Goal
Let recruiters create and manage exactly one company profile. Candidates and admins can view companies but cannot create or edit them. Ownership is enforced at the database level (unique index) and at the query level (all writes are scoped to `owner: req.user._id`).

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

### Files Created

#### `backend/models/Company.js`
Mongoose schema for a company. The key design decision is `owner: { unique: true }` — this unique index on the `owner` field means MongoDB itself rejects a second company for the same recruiter, returning an error code `11000` that the controller catches and translates into a clear `409` response. All optional fields (`description`, `website`, etc.) default to empty strings so the document is always fully shaped. `size` is an enum of common headcount bands.

#### `backend/controllers/companyController.js`
Four handlers:
- **createCompany** — sets `owner` from `req.user._id` (never from the request body), catches the duplicate-key error for the one-company rule.
- **getMyCompany** — queries `{ owner: req.user._id }`, scoping the fetch to the requesting recruiter automatically.
- **updateMyCompany** — destructures `owner` out of `req.body` and discards it before updating, so a recruiter can never reassign ownership even if they try. Uses `findOneAndUpdate` scoped to the recruiter's own `_id`.
- **getCompanyById** — validates the `ObjectId` format first (returns `400`), then fetches and populates the owner's `name` and `email` only (safe fields). Returns `404` if not found.

#### `backend/routes/companies.js`
Mounts all four routes. `/me` routes are declared **before** `/:id` deliberately — Express matches routes top-to-bottom, and if `/:id` came first, the literal string `"me"` would be treated as an ID parameter and fail the ObjectId validation.

### Files Modified

#### `backend/middleware/validators.js`
Added `companyRules` (for POST — `name` required, all others optional) and `updateCompanyRules` (for PUT — all fields optional, same format constraints). URL fields (`website`, `logo`) are validated with `isURL({ require_protocol: true })` so bare strings like `"example.com"` are rejected. Both rule sets follow the same `{ field, message }` error shape as auth.

#### `backend/server.js`
Mounted the companies router at `/api/companies`.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 2 — Authentication & RBAC

### Goal
Let users register and log in, protect routes with JWTs, and enforce role-based access so that only the right roles can reach certain endpoints. No feature-specific routes yet — just the auth layer every future phase will rely on.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 3a — Company Profile

### Goal
Let recruiters create and manage exactly one company profile. Candidates and admins can view companies but cannot create or edit them. Ownership is enforced at the database level (unique index) and at the query level (all writes are scoped to `owner: req.user._id`).

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

### Files Created

#### `backend/models/Company.js`
Mongoose schema for a company. The key design decision is `owner: { unique: true }` — this unique index on the `owner` field means MongoDB itself rejects a second company for the same recruiter, returning an error code `11000` that the controller catches and translates into a clear `409` response. All optional fields (`description`, `website`, etc.) default to empty strings so the document is always fully shaped. `size` is an enum of common headcount bands.

#### `backend/controllers/companyController.js`
Four handlers:
- **createCompany** — sets `owner` from `req.user._id` (never from the request body), catches the duplicate-key error for the one-company rule.
- **getMyCompany** — queries `{ owner: req.user._id }`, scoping the fetch to the requesting recruiter automatically.
- **updateMyCompany** — destructures `owner` out of `req.body` and discards it before updating, so a recruiter can never reassign ownership even if they try. Uses `findOneAndUpdate` scoped to the recruiter's own `_id`.
- **getCompanyById** — validates the `ObjectId` format first (returns `400`), then fetches and populates the owner's `name` and `email` only (safe fields). Returns `404` if not found.

#### `backend/routes/companies.js`
Mounts all four routes. `/me` routes are declared **before** `/:id` deliberately — Express matches routes top-to-bottom, and if `/:id` came first, the literal string `"me"` would be treated as an ID parameter and fail the ObjectId validation.

### Files Modified

#### `backend/middleware/validators.js`
Added `companyRules` (for POST — `name` required, all others optional) and `updateCompanyRules` (for PUT — all fields optional, same format constraints). URL fields (`website`, `logo`) are validated with `isURL({ require_protocol: true })` so bare strings like `"example.com"` are rejected. Both rule sets follow the same `{ field, message }` error shape as auth.

#### `backend/server.js`
Mounted the companies router at `/api/companies`.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

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

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 3a — Company Profile

### Goal
Let recruiters create and manage exactly one company profile. Candidates and admins can view companies but cannot create or edit them. Ownership is enforced at the database level (unique index) and at the query level (all writes are scoped to `owner: req.user._id`).

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

### Files Created

#### `backend/models/Company.js`
Mongoose schema for a company. The key design decision is `owner: { unique: true }` — this unique index on the `owner` field means MongoDB itself rejects a second company for the same recruiter, returning an error code `11000` that the controller catches and translates into a clear `409` response. All optional fields (`description`, `website`, etc.) default to empty strings so the document is always fully shaped. `size` is an enum of common headcount bands.

#### `backend/controllers/companyController.js`
Four handlers:
- **createCompany** — sets `owner` from `req.user._id` (never from the request body), catches the duplicate-key error for the one-company rule.
- **getMyCompany** — queries `{ owner: req.user._id }`, scoping the fetch to the requesting recruiter automatically.
- **updateMyCompany** — destructures `owner` out of `req.body` and discards it before updating, so a recruiter can never reassign ownership even if they try. Uses `findOneAndUpdate` scoped to the recruiter's own `_id`.
- **getCompanyById** — validates the `ObjectId` format first (returns `400`), then fetches and populates the owner's `name` and `email` only (safe fields). Returns `404` if not found.

#### `backend/routes/companies.js`
Mounts all four routes. `/me` routes are declared **before** `/:id` deliberately — Express matches routes top-to-bottom, and if `/:id` came first, the literal string `"me"` would be treated as an ID parameter and fail the ObjectId validation.

### Files Modified

#### `backend/middleware/validators.js`
Added `companyRules` (for POST — `name` required, all others optional) and `updateCompanyRules` (for PUT — all fields optional, same format constraints). URL fields (`website`, `logo`) are validated with `isURL({ require_protocol: true })` so bare strings like `"example.com"` are rejected. Both rule sets follow the same `{ field, message }` error shape as auth.

#### `backend/server.js`
Mounted the companies router at `/api/companies`.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 1 — Backend Skeleton

### Goal
Stand up a bare Express server with a MongoDB connection, a health-check route, and proper error handling. No features yet — just a solid foundation every later phase can build on.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 3a — Company Profile

### Goal
Let recruiters create and manage exactly one company profile. Candidates and admins can view companies but cannot create or edit them. Ownership is enforced at the database level (unique index) and at the query level (all writes are scoped to `owner: req.user._id`).

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

### Files Created

#### `backend/models/Company.js`
Mongoose schema for a company. The key design decision is `owner: { unique: true }` — this unique index on the `owner` field means MongoDB itself rejects a second company for the same recruiter, returning an error code `11000` that the controller catches and translates into a clear `409` response. All optional fields (`description`, `website`, etc.) default to empty strings so the document is always fully shaped. `size` is an enum of common headcount bands.

#### `backend/controllers/companyController.js`
Four handlers:
- **createCompany** — sets `owner` from `req.user._id` (never from the request body), catches the duplicate-key error for the one-company rule.
- **getMyCompany** — queries `{ owner: req.user._id }`, scoping the fetch to the requesting recruiter automatically.
- **updateMyCompany** — destructures `owner` out of `req.body` and discards it before updating, so a recruiter can never reassign ownership even if they try. Uses `findOneAndUpdate` scoped to the recruiter's own `_id`.
- **getCompanyById** — validates the `ObjectId` format first (returns `400`), then fetches and populates the owner's `name` and `email` only (safe fields). Returns `404` if not found.

#### `backend/routes/companies.js`
Mounts all four routes. `/me` routes are declared **before** `/:id` deliberately — Express matches routes top-to-bottom, and if `/:id` came first, the literal string `"me"` would be treated as an ID parameter and fail the ObjectId validation.

### Files Modified

#### `backend/middleware/validators.js`
Added `companyRules` (for POST — `name` required, all others optional) and `updateCompanyRules` (for PUT — all fields optional, same format constraints). URL fields (`website`, `logo`) are validated with `isURL({ require_protocol: true })` so bare strings like `"example.com"` are rejected. Both rule sets follow the same `{ field, message }` error shape as auth.

#### `backend/server.js`
Mounted the companies router at `/api/companies`.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 2 — Authentication & RBAC

### Goal
Let users register and log in, protect routes with JWTs, and enforce role-based access so that only the right roles can reach certain endpoints. No feature-specific routes yet — just the auth layer every future phase will rely on.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 3a — Company Profile

### Goal
Let recruiters create and manage exactly one company profile. Candidates and admins can view companies but cannot create or edit them. Ownership is enforced at the database level (unique index) and at the query level (all writes are scoped to `owner: req.user._id`).

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

### Files Created

#### `backend/models/Company.js`
Mongoose schema for a company. The key design decision is `owner: { unique: true }` — this unique index on the `owner` field means MongoDB itself rejects a second company for the same recruiter, returning an error code `11000` that the controller catches and translates into a clear `409` response. All optional fields (`description`, `website`, etc.) default to empty strings so the document is always fully shaped. `size` is an enum of common headcount bands.

#### `backend/controllers/companyController.js`
Four handlers:
- **createCompany** — sets `owner` from `req.user._id` (never from the request body), catches the duplicate-key error for the one-company rule.
- **getMyCompany** — queries `{ owner: req.user._id }`, scoping the fetch to the requesting recruiter automatically.
- **updateMyCompany** — destructures `owner` out of `req.body` and discards it before updating, so a recruiter can never reassign ownership even if they try. Uses `findOneAndUpdate` scoped to the recruiter's own `_id`.
- **getCompanyById** — validates the `ObjectId` format first (returns `400`), then fetches and populates the owner's `name` and `email` only (safe fields). Returns `404` if not found.

#### `backend/routes/companies.js`
Mounts all four routes. `/me` routes are declared **before** `/:id` deliberately — Express matches routes top-to-bottom, and if `/:id` came first, the literal string `"me"` would be treated as an ID parameter and fail the ObjectId validation.

### Files Modified

#### `backend/middleware/validators.js`
Added `companyRules` (for POST — `name` required, all others optional) and `updateCompanyRules` (for PUT — all fields optional, same format constraints). URL fields (`website`, `logo`) are validated with `isURL({ require_protocol: true })` so bare strings like `"example.com"` are rejected. Both rule sets follow the same `{ field, message }` error shape as auth.

#### `backend/server.js`
Mounted the companies router at `/api/companies`.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

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

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 3a — Company Profile

### Goal
Let recruiters create and manage exactly one company profile. Candidates and admins can view companies but cannot create or edit them. Ownership is enforced at the database level (unique index) and at the query level (all writes are scoped to `owner: req.user._id`).

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

### Files Created

#### `backend/models/Company.js`
Mongoose schema for a company. The key design decision is `owner: { unique: true }` — this unique index on the `owner` field means MongoDB itself rejects a second company for the same recruiter, returning an error code `11000` that the controller catches and translates into a clear `409` response. All optional fields (`description`, `website`, etc.) default to empty strings so the document is always fully shaped. `size` is an enum of common headcount bands.

#### `backend/controllers/companyController.js`
Four handlers:
- **createCompany** — sets `owner` from `req.user._id` (never from the request body), catches the duplicate-key error for the one-company rule.
- **getMyCompany** — queries `{ owner: req.user._id }`, scoping the fetch to the requesting recruiter automatically.
- **updateMyCompany** — destructures `owner` out of `req.body` and discards it before updating, so a recruiter can never reassign ownership even if they try. Uses `findOneAndUpdate` scoped to the recruiter's own `_id`.
- **getCompanyById** — validates the `ObjectId` format first (returns `400`), then fetches and populates the owner's `name` and `email` only (safe fields). Returns `404` if not found.

#### `backend/routes/companies.js`
Mounts all four routes. `/me` routes are declared **before** `/:id` deliberately — Express matches routes top-to-bottom, and if `/:id` came first, the literal string `"me"` would be treated as an ID parameter and fail the ObjectId validation.

### Files Modified

#### `backend/middleware/validators.js`
Added `companyRules` (for POST — `name` required, all others optional) and `updateCompanyRules` (for PUT — all fields optional, same format constraints). URL fields (`website`, `logo`) are validated with `isURL({ require_protocol: true })` so bare strings like `"example.com"` are rejected. Both rule sets follow the same `{ field, message }` error shape as auth.

#### `backend/server.js`
Mounted the companies router at `/api/companies`.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

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

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 3a — Company Profile

### Goal
Let recruiters create and manage exactly one company profile. Candidates and admins can view companies but cannot create or edit them. Ownership is enforced at the database level (unique index) and at the query level (all writes are scoped to `owner: req.user._id`).

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

### Files Created

#### `backend/models/Company.js`
Mongoose schema for a company. The key design decision is `owner: { unique: true }` — this unique index on the `owner` field means MongoDB itself rejects a second company for the same recruiter, returning an error code `11000` that the controller catches and translates into a clear `409` response. All optional fields (`description`, `website`, etc.) default to empty strings so the document is always fully shaped. `size` is an enum of common headcount bands.

#### `backend/controllers/companyController.js`
Four handlers:
- **createCompany** — sets `owner` from `req.user._id` (never from the request body), catches the duplicate-key error for the one-company rule.
- **getMyCompany** — queries `{ owner: req.user._id }`, scoping the fetch to the requesting recruiter automatically.
- **updateMyCompany** — destructures `owner` out of `req.body` and discards it before updating, so a recruiter can never reassign ownership even if they try. Uses `findOneAndUpdate` scoped to the recruiter's own `_id`.
- **getCompanyById** — validates the `ObjectId` format first (returns `400`), then fetches and populates the owner's `name` and `email` only (safe fields). Returns `404` if not found.

#### `backend/routes/companies.js`
Mounts all four routes. `/me` routes are declared **before** `/:id` deliberately — Express matches routes top-to-bottom, and if `/:id` came first, the literal string `"me"` would be treated as an ID parameter and fail the ObjectId validation.

### Files Modified

#### `backend/middleware/validators.js`
Added `companyRules` (for POST — `name` required, all others optional) and `updateCompanyRules` (for PUT — all fields optional, same format constraints). URL fields (`website`, `logo`) are validated with `isURL({ require_protocol: true })` so bare strings like `"example.com"` are rejected. Both rule sets follow the same `{ field, message }` error shape as auth.

#### `backend/server.js`
Mounted the companies router at `/api/companies`.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 2 — Authentication & RBAC

### Goal
Let users register and log in, protect routes with JWTs, and enforce role-based access so that only the right roles can reach certain endpoints. No feature-specific routes yet — just the auth layer every future phase will rely on.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 3a — Company Profile

### Goal
Let recruiters create and manage exactly one company profile. Candidates and admins can view companies but cannot create or edit them. Ownership is enforced at the database level (unique index) and at the query level (all writes are scoped to `owner: req.user._id`).

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

### Files Created

#### `backend/models/Company.js`
Mongoose schema for a company. The key design decision is `owner: { unique: true }` — this unique index on the `owner` field means MongoDB itself rejects a second company for the same recruiter, returning an error code `11000` that the controller catches and translates into a clear `409` response. All optional fields (`description`, `website`, etc.) default to empty strings so the document is always fully shaped. `size` is an enum of common headcount bands.

#### `backend/controllers/companyController.js`
Four handlers:
- **createCompany** — sets `owner` from `req.user._id` (never from the request body), catches the duplicate-key error for the one-company rule.
- **getMyCompany** — queries `{ owner: req.user._id }`, scoping the fetch to the requesting recruiter automatically.
- **updateMyCompany** — destructures `owner` out of `req.body` and discards it before updating, so a recruiter can never reassign ownership even if they try. Uses `findOneAndUpdate` scoped to the recruiter's own `_id`.
- **getCompanyById** — validates the `ObjectId` format first (returns `400`), then fetches and populates the owner's `name` and `email` only (safe fields). Returns `404` if not found.

#### `backend/routes/companies.js`
Mounts all four routes. `/me` routes are declared **before** `/:id` deliberately — Express matches routes top-to-bottom, and if `/:id` came first, the literal string `"me"` would be treated as an ID parameter and fail the ObjectId validation.

### Files Modified

#### `backend/middleware/validators.js`
Added `companyRules` (for POST — `name` required, all others optional) and `updateCompanyRules` (for PUT — all fields optional, same format constraints). URL fields (`website`, `logo`) are validated with `isURL({ require_protocol: true })` so bare strings like `"example.com"` are rejected. Both rule sets follow the same `{ field, message }` error shape as auth.

#### `backend/server.js`
Mounted the companies router at `/api/companies`.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

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

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

## Phase 3a — Company Profile

### Goal
Let recruiters create and manage exactly one company profile. Candidates and admins can view companies but cannot create or edit them. Ownership is enforced at the database level (unique index) and at the query level (all writes are scoped to `owner: req.user._id`).

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---

### Files Created

#### `backend/models/Company.js`
Mongoose schema for a company. The key design decision is `owner: { unique: true }` — this unique index on the `owner` field means MongoDB itself rejects a second company for the same recruiter, returning an error code `11000` that the controller catches and translates into a clear `409` response. All optional fields (`description`, `website`, etc.) default to empty strings so the document is always fully shaped. `size` is an enum of common headcount bands.

#### `backend/controllers/companyController.js`
Four handlers:
- **createCompany** — sets `owner` from `req.user._id` (never from the request body), catches the duplicate-key error for the one-company rule.
- **getMyCompany** — queries `{ owner: req.user._id }`, scoping the fetch to the requesting recruiter automatically.
- **updateMyCompany** — destructures `owner` out of `req.body` and discards it before updating, so a recruiter can never reassign ownership even if they try. Uses `findOneAndUpdate` scoped to the recruiter's own `_id`.
- **getCompanyById** — validates the `ObjectId` format first (returns `400`), then fetches and populates the owner's `name` and `email` only (safe fields). Returns `404` if not found.

#### `backend/routes/companies.js`
Mounts all four routes. `/me` routes are declared **before** `/:id` deliberately — Express matches routes top-to-bottom, and if `/:id` came first, the literal string `"me"` would be treated as an ID parameter and fail the ObjectId validation.

### Files Modified

#### `backend/middleware/validators.js`
Added `companyRules` (for POST — `name` required, all others optional) and `updateCompanyRules` (for PUT — all fields optional, same format constraints). URL fields (`website`, `logo`) are validated with `isURL({ require_protocol: true })` so bare strings like `"example.com"` are rejected. Both rule sets follow the same `{ field, message }` error shape as auth.

#### `backend/server.js`
Mounted the companies router at `/api/companies`.

---

## Phase 3b — Job Postings

### Goal
Let recruiters post, update, and close jobs against their own company. Any logged-in user can browse open jobs with pagination and filters. Ownership is enforced at the query level so a recruiter can never touch another recruiter's jobs.

---

### Files Created

#### `backend/models/Job.js`
Mongoose schema for a job posting. References both `Company` and `User` (the poster). `status` defaults to `"open"` and can only be set to `"closed"` through the dedicated close endpoint — the update route strips it from the body. A compound index on `{ status, createdAt }` supports the most common list query (open jobs, newest first) efficiently.

#### `backend/controllers/jobController.js`
Six handlers:

- **createJob** — looks up the recruiter's company via `Company.findOne({ owner: req.user._id })` and returns `400` if none exists. Strips `company`, `postedBy`, and `status` from the body before creating, so those values always come from server state. Response includes the populated company.
- **listMyJobs** — queries `{ postedBy: req.user._id }`, sorted newest first.
- **listJobs** — open jobs only, with pagination (`page`/`limit`, falling back to defaults for bad values, capped at 50), and three optional filters:
  - `keyword` → case-insensitive regex on `title`
  - `location` → case-insensitive regex on `location`
  - `jobType` → exact enum match
  - Both regex filters escape the input with `escapeRegex()` before building the `RegExp` to prevent regex injection.
- **getJobById** — validates the ObjectId format (400), returns 404 if missing, otherwise returns the job with populated company.
- **updateJob** — uses the shared `findOwnJob` helper (400 / 404 / 403), strips `company`, `postedBy`, and `status` from updates, saves with validators.
- **closeJob** — uses `findOwnJob`, then checks if already closed (400) before setting `status = "closed"`.

**`findOwnJob` helper** — private function used by `updateJob` and `closeJob`. Centralises the ID validation, existence check, and ownership check in one place so neither handler repeats the logic.

**`escapeRegex`** — escapes all regex metacharacters from user-supplied filter strings before they are compiled into a `RegExp`. Prevents a user from injecting a pattern like `.*` to match everything or cause catastrophic backtracking.

#### `backend/routes/jobs.js`
Route order matters:
1. `PATCH /:id/close` is declared before `PUT /:id` and `GET /:id` to avoid ambiguity.
2. `GET /my` is declared **before** `GET /:id` so the literal string `"my"` is never interpreted as an ObjectId parameter.

### Files Modified

#### `backend/middleware/validators.js`
Added `jobRules` (title + description + jobType required; salary, deadline, arrays optional) and `updateJobRules` (all optional). The salary cross-field check (`salaryMax >= salaryMin`) is extracted into a named `salaryMaxCheck` constant and reused by both rule sets to avoid duplication.

#### `backend/server.js`
Mounted the jobs router at `/api/jobs`.

---
