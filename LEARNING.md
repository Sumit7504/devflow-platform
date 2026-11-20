# LEARNING.md — DevFlow Platform

A running log of every phase: what was built, what each file does, and why it exists.

---

## Phase 4 — Real-Time Notifications with Socket.IO

### Goal
Provide real-time notification delivery to users across the platform without requiring polling. Automatically alerts recruiters and candidates when applications are submitted or updated, assessments are taken or graded, and interviews are proposed, confirmed, declined, or cancelled. Enforces strict connection-level JWT authentication and isolation into dedicated private rooms.

---

### Concept & Architecture

#### 1. What are WebSockets and Socket.IO?
Traditional HTTP is a request-response protocol: the client asks, the server replies, and the connection closes. When an event happens on the server (e.g. a candidate applies for a job), the recruiter's browser wouldn't know unless it repeatedly polls the server every few seconds.
WebSockets establish a persistent, bidirectional, full-duplex TCP connection between the browser and server. Socket.IO builds on top of WebSockets, providing automatic reconnection, connection fallback, and room abstractions.

#### 2. Authentication & Private Rooms (`user:<userId>`)
- **Handshake Authentication**: When a client connects, it provides its JWT token in `socket.handshake.auth.token`. Socket.IO's connection middleware (`io.use`) decodes the token, verifies the user in MongoDB, and checks `user.isActive !== false`. Invalid tokens or deactivated accounts are rejected before any connection is established.
- **Private Rooms**: Upon connecting, the server forces the socket to join a dedicated room named `user:<userId>`. Clients cannot choose which room to join or emit arbitrary notification creation events.
- **Broadcasting Targeted Events**: To notify a specific user, the server simply targets their room: `io.to("user:<recipientId>").emit("notification:new", notification)`. Any active browser tab or mobile device connected for that user immediately receives the event.

#### 3. Non-Blocking Notification Flow
A core principle of real-time eventing is that secondary delivery must never break primary business logic. If a database glitch or a disconnected socket occurs during notification dispatch, the candidate's application or assessment submission must still succeed.
The `notify()` service wraps both persistence and socket emission in a `try/catch` block. Controllers trigger `notify()` asynchronously *after* their main database operations have succeeded.

---

### Files Created

#### `backend/models/Notification.js`
Mongoose schema modeling notifications:
- **`recipient`**: Reference to the target `User`.
- **`type`**: Enum restricting allowed event types (`application_received`, `application_status`, `assessment_submitted`, `assessment_graded`, `interview_proposed`, `interview_confirmed`, `interview_declined`, `interview_cancelled`).
- **`title` & `message`**: User-facing notification subject and content.
- **`data`**: Optional ObjectId links to related entities (`application`, `job`, `interview`, `attempt`).
- **`isRead` & `readAt`**: Track read status and timestamps.
- **TTL Index**: Configured with `{ expireAfterSeconds: 7776000 }` (90 days) on `createdAt` so old notifications are pruned automatically by MongoDB without manual cleanup scripts.
- **Compound Indexes**: Indexed on `{ recipient: 1, createdAt: -1 }` and `{ recipient: 1, isRead: 1 }` for high-throughput inbox querying.

#### `backend/socket.js`
Centralized Socket.IO lifecycle manager:
- Attaches to the Express HTTP server with CORS configured from `CLIENT_URL`.
- Intercepts connection attempts via `io.use()` to validate JWTs in `socket.handshake.auth.token`.
- Automatically places authenticated sockets into `user:<userId>`.
- Exports `init(httpServer)` and `getIO()`.

#### `backend/services/notificationService.js`
Reusable notification dispatch function `notify(recipientId, { type, title, message, data })`:
- Persists the notification record to MongoDB.
- Emits `"notification:new"` to the recipient's private room `user:<recipientId>`.
- Catches and logs any persistence or emission errors safely to prevent interrupting controller execution.

#### `backend/controllers/notificationController.js`
REST controller for inbox management:
- **`listMyNotifications`**: Returns paginated notifications belonging to the logged-in user, sorted newest first, with optional `?unread=true` filtering.
- **`getUnreadCount`**: Lightweight count of unread notifications for navbar badges.
- **`markAllAsRead`**: Batch updates all unread notifications for the caller to `isRead: true`.
- **`markAsRead`**: Marks an individual notification as read. Returns 404 if the notification does not exist or belongs to another user (preventing ID enumeration).
- **`deleteNotification`**: Deletes a single notification belonging to the caller.

#### `backend/routes/notifications.js`
Declares notification routes protected with `auth`. Declares `/unread-count` and `/read-all` before `/:id` to avoid route parameter collision.

---

### Files Modified

#### `backend/package.json`
Added `socket.io` to dependencies and `socket.io-client` to devDependencies.

#### `backend/.env.example` & `backend/.env`
Added `CLIENT_URL=http://localhost:5173` for Socket.IO CORS configuration.

#### `backend/server.js`
Switched from `app.listen()` to Node's `http.createServer(app)` to bind both Express and Socket.IO to the same TCP port. Mounted `/api/notifications`.

#### `backend/middleware/validators.js`
Added `notificationListRules` validating pagination and `?unread` query parameters.

#### `backend/controllers/applicationController.js`
Added `notify` hooks on job application submission (`application_received`) and status updates (`application_status`).

#### `backend/controllers/attemptController.js`
Added `notify` hooks on assessment submission (`assessment_submitted`), auto-grading on submit (`assessment_graded`), and manual recruiter grading (`assessment_graded`).

#### `backend/controllers/interviewController.js`
Added `notify` hooks on interview proposal (`interview_proposed`), candidate confirmation (`interview_confirmed`), candidate decline (`interview_declined`), and recruiter cancellation (`interview_cancelled`).

---

## Phase 3f — Admin Features

### Goal
Provide platform administrators with full oversight and administrative controls over users and jobs, plus aggregate platform health metrics. Enforces account deactivation checks across all requests and logins, prevents self-lockout and last-admin demotion, performs safe cascading deletions, and delivers comprehensive real-time analytics.

---

### Files Created

#### `backend/controllers/adminController.js`
Admin controller handling user management, job lifecycle controls, and platform metrics:
- **`listUsers`**: Paginated search and filtering of all registered users by role, active status (`isActive`), and name/email search with escaped regex. Passwords are never selected.
- **`getUserById`**: Retrieves single user details excluding password hash.
- **`updateUserStatus`**: Toggles `isActive`. Guards against self-deactivation and checks that the last remaining active admin cannot be deactivated.
- **`updateUserRole`**: Changes user roles between `candidate`, `recruiter`, and `admin`. Guards against changing one's own role and prevents demoting the last remaining active admin.
- **`listAllJobs`**: Paginated oversight of all jobs regardless of status, populated with company details and optional status/keyword filters.
- **`closeJobAdmin`**: Closes any open job immediately with a 400 check if already closed.
- **`deleteJobAdmin`**: Deletes a job only if no applications exist for it (409) and no attempts exist for its linked assessment (409). Safely deletes the linked assessment before deleting the job.
- **`getAdminStats`**: Aggregates comprehensive counts for users (by role and active status), jobs (by status), applications (by status: `applied`, `shortlisted`, `rejected`, `hired`), interviews (by status), attempts (by status), and total companies. Pre-populates all enum keys with zero counts so empty statuses are always displayed.

#### `backend/routes/admin.js`
Declares admin endpoints mounted under `/api/admin`. Protected globally with `auth` and `authorizeRoles("admin")`:
- `GET /api/admin/stats`
- `GET /api/admin/users`
- `GET /api/admin/users/:id`
- `PATCH /api/admin/users/:id/status`
- `PATCH /api/admin/users/:id/role`
- `GET /api/admin/jobs`
- `PATCH /api/admin/jobs/:id/close`
- `DELETE /api/admin/jobs/:id`

#### `backend/scripts/migrateUsersIsActive.js`
A one-time idempotent migration script that connects to MongoDB and initializes `isActive: true` on any existing user documents that lack the field.

---

### Files Modified

#### `backend/models/User.js`
Added `isActive: { type: Boolean, default: true }` to the user schema.

#### `backend/middleware/auth.js`
Added an active status check (`user.isActive === false`) rejecting deactivated users with HTTP 403 `"Account is deactivated"` on every authenticated request.

#### `backend/controllers/authController.js`
- In `login`: Rejects deactivated accounts (`user.isActive === false`) with HTTP 403 `"Account is deactivated"` immediately after credential verification.
- In `getMe`: Surfaces `isActive` in the authenticated user profile response.

#### `backend/middleware/validators.js`
Added express-validator rule sets for admin query and mutation operations:
- `adminUserListRules`: Validates pagination parameters and ensures `role` and `isActive` query values match allowed enums.
- `updateUserStatusRules`: Enforces that `isActive` is a required boolean.
- `updateUserRoleRules`: Enforces that `role` is one of `candidate`, `recruiter`, or `admin`.
- `adminJobListRules`: Validates pagination parameters and restricts `status` query values to `open` or `closed`.

#### `backend/server.js`
Mounted the admin router at `/api/admin`.

#### `backend/package.json`
Added `"migrate:users": "node scripts/migrateUsersIsActive.js"` to run the migration script via npm.

---

## Phase 3e — Interview Scheduling

### Goal
Enable recruiters to propose interview schedules with up to 5 time slots for shortlisted candidates, and allow candidates to confirm or decline proposed slots. Enforces conflict-free confirmed calendars across recruiters and candidates, guards against double-booking and stale status transitions using atomic queries, and prepares status hooks for real-time notifications.

---

### Files Created

#### `backend/models/Interview.js`
Mongoose schema modeling interview scheduling:
- **`application`, `job`, `candidate`, `recruiter`**: References linking the interview to the application pipeline and involved parties.
- **`mode`**: Enum (`"online"`, `"onsite"`, `"phone"`).
- **`meetingLink` & `location`**: Mode-specific connection details (validated: online requires `meetingLink`, onsite requires `location`).
- **`proposedSlots`**: Array of 1 to 5 time windows (`{ start: Date, end: Date }`).
- **`selectedSlot`**: The specific `{ start, end }` chosen by the candidate upon confirmation.
- **`status`**: State machine (`"proposed"` → `"confirmed"` / `"declined"` / `"cancelled"`).
- **`statusHistory`**: Audit trail recording `{ status, changedAt, changedBy }` initialized on creation and updated on every state transition.
- **Partial Unique Index**: `{ application: 1 }` with `partialFilterExpression: { status: { $in: ["proposed", "confirmed"] } }` strictly enforces at the database level that an application can have at most one active interview at any time.

#### `backend/controllers/interviewController.js`
Complete interview lifecycle management with conflict detection and atomic transitions:
- **`createInterview`**:
  - Verifies recruiter ownership of the application's job.
  - Enforces that the application is currently `"shortlisted"` (400 if not).
  - Validates proposed slots: ISO 8601 dates, future start times, end after start, duration between 15 and 240 minutes.
  - Ensures proposed slots do not overlap each other.
  - Validates that none of the proposed slots conflict with any existing confirmed `selectedSlot` of either the recruiter or the candidate (409 if conflict).
  - Automatically binds `candidate`, `job`, and `recruiter` from server state.
  - Appends the initial `"proposed"` status history entry.
- **`confirmInterview`**:
  - Re-verifies that the candidate's application is still `"shortlisted"` (preventing confirmation if application was rejected/hired in the interim).
  - Validates `slotIndex` within proposed slots.
  - Confirms the chosen slot is still in the future.
  - Re-checks for calendar conflicts against newly confirmed interviews for both candidate and recruiter (409 if a conflict arose).
  - Atomically transitions status to `"confirmed"`, sets `selectedSlot`, and appends to `statusHistory` in a single `findOneAndUpdate({ _id, candidate, status: "proposed" })` call, eliminating race conditions.
- **`declineInterview`**:
  - Atomically transitions status from `"proposed"` to `"declined"` and appends to `statusHistory`.
- **`cancelInterview`**:
  - Atomically transitions status from `["proposed", "confirmed"]` to `"cancelled"` and appends to `statusHistory`.
- **`getRecruiterInterviews`**:
  - Lists recruiter's interviews, newest first, paginated, with candidate `name` and `email` and job `title`. Supports `?status=` filtering.
- **`getCandidateInterviews`**:
  - Lists candidate's interviews, newest first, populating job `title`, company `name`, and recruiter `name` and `email`.
- **`getInterviewById`**:
  - View a single interview with access restricted to the owning candidate or recruiter. Populates candidate and recruiter `name` and `email`.

#### `backend/routes/interviews.js`
Mounted under `/api/interviews`:
- `POST /` (Recruiter only)
- `GET /recruiter` (Recruiter only; declared before `/:id`)
- `GET /my` (Candidate only; declared before `/:id`)
- `PATCH /:id/confirm` (Candidate only)
- `PATCH /:id/decline` (Candidate only)
- `PATCH /:id/cancel` (Recruiter only)
- `GET /:id` (Candidate owner or recruiter owner)

---

### Files Modified

#### `backend/middleware/validators.js`
- Added `createInterviewRules` (mode validation, conditional meetingLink/location requirements, slot array bounds and ISO 8601 date validation).
- Added `confirmInterviewRules` (slotIndex validation).

#### `backend/server.js`
- Mounted `interviewRouter` at `/api/interviews`.

---

## Phase 3d-2 — Attempts, Submission & Grading

### Goal
Enable candidates to start, complete, and submit assessment attempts with strict timing and validation rules, auto-score multiple-choice questions on the server, allow recruiters to review and grade code questions, and preserve evaluation integrity by locking assessment questions and duration once attempts exist.

---

### Files Created

#### `backend/models/Attempt.js`
Mongoose schema tracking candidate assessment attempts:
- **`assessment` & `candidate`**: References to `Assessment` and `User`. Unique compound index `{ assessment: 1, candidate: 1 }` prevents multiple attempts for the same assessment.
- **`status`**: State machine (`"in_progress"` → `"submitted"` → `"graded"`).
- **`startedAt` & `submittedAt`**: Precise timestamps recorded by the server.
- **`answers`**: Array of answer subdocuments (`_id: true`) containing `question` reference, `selectedOption` (for MCQ), `codeAnswer` (up to 10,000 characters), `pointsAwarded`, and optional recruiter `feedback`.
- **`mcqScore`, `codeScore`, `totalScore`, `maxScore`**: Server-calculated scores ensuring client inputs can never manipulate scoring.
- **`gradedBy` & `gradedAt`**: Audit metadata identifying the recruiter who graded manual code submissions.
- **Abandoned Attempts**: Documented design for attempts started but never submitted before the deadline passes; they remain in `"in_progress"`, cannot be submitted once expired, and can be swept by maintenance jobs.

#### `backend/controllers/attemptController.js`
Complete attempt lifecycle management with dedicated atomic operations and security guards:
- **`startAttempt`**: Confirms candidate holds an active, non-rejected application for the assessment's job, creates the attempt, and calculates the exact `deadline` (`startedAt + durationMinutes`). Returns 409 if an attempt already exists.
- **`submitAttempt`**:
  - Enforces atomic state transitions using `findOneAndUpdate({ _id, candidate, status: "in_progress" })`, guaranteeing that concurrent or double submits fail with 400.
  - Enforces timing: rejects submissions after `startedAt + durationMinutes + 60s grace period`.
  - Strictly validates answers: checks that question IDs belong to the assessment with no string-level duplicates, restricts `selectedOption` to MCQ questions within valid bounds, and restricts `codeAnswer` to code questions.
  - Automatically evaluates MCQ answers against `correctOption`.
  - Automatically marks pure MCQ assessments as `"graded"`; marks assessments containing code questions as `"submitted"`.
  - Returns candidate-sanitized output without `correctOption`.
- **`myAttempts`**: Returns candidate's attempt history with assessment and job titles, sorted newest first.
- **`getAttemptById`**: Dual-role authorization. Candidates see their submitted answers, scores, feedback, and deadline, but **never** `correctOption`. Recruiters see all details, candidate contact information, and assessment question solutions.
- **`assessmentAttempts`**: Recruiter-only paginated listing of all candidate attempts for a given assessment with optional status filtering.
- **`gradeAttempt`**: Allows recruiters to grade code questions only. Strictly checks that question IDs are unique code questions and `0 <= pointsAwarded <= question.points`. Recomputes `codeScore` and `totalScore`, sets status to `"graded"`, and logs recruiter ID and timestamp.

#### `backend/routes/attempts.js`
Mounted under `/api/attempts`:
- `POST /start` (Candidate only)
- `GET /my` (Candidate only; declared before `/:id`)
- `GET /assessment/:assessmentId` (Recruiter only; declared before `/:id`)
- `POST /:id/submit` (Candidate only)
- `PATCH /:id/grade` (Recruiter only)
- `GET /:id` (Candidate owner or job-owning recruiter)

---

### Files Modified

#### `backend/controllers/assessmentController.js`
- Added data protection: If any `Attempt` exists for an assessment (`Attempt.exists({ assessment: id })`), deleting the assessment or modifying its `questions` or `durationMinutes` is blocked with `409 Conflict`, ensuring existing grades and timelines remain accurate.

#### `backend/middleware/validators.js`
- Added `startAttemptRules`, `submitAttemptRules`, and `gradeAttemptRules` with structured `422` validation handling.

#### `backend/server.js`
- Mounted `attemptRouter` at `/api/attempts`.

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
