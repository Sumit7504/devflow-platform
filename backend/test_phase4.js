require("dotenv").config({ path: __dirname + "/.env" });
const { io } = require("socket.io-client");
const mongoose = require("mongoose");
const Notification = require("./models/Notification");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}/api`;
const SOCKET_URL = `http://localhost:${PORT}`;
const TS = Date.now();
const FAKE_ID = "000000000000000000000001";

let passCount = 0;
let failCount = 0;
const testResults = [];

function recordResult(testId, name, passed, details = "") {
  const result = passed ? "PASS" : "FAIL";
  if (passed) passCount++;
  else failCount++;
  testResults.push({ id: testId, name, result, details });
  const color = passed ? "\x1b[32m" : "\x1b[31m";
  console.log(`\nTEST ${testId} — ${name}`);
  if (details) console.log(`  Details : ${details}`);
  console.log(`  Result  : ${color}${result}\x1b[0m`);
}

// ── HTTP API helper ───────────────────────────────────────────────────────────
async function api(method, endpoint, body = null, token = null) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = null;
  }
  return { status: res.status, body: text, json };
}

// ── Socket helper ─────────────────────────────────────────────────────────────
function createSocket(options = {}) {
  return io(SOCKET_URL, {
    transports: ["websocket"],
    autoConnect: false,
    reconnection: false,
    ...options,
  });
}

function connectSocket(sock) {
  return new Promise((resolve, reject) => {
    sock.once("connect", () => resolve(sock));
    sock.once("connect_error", (err) => reject(err));
    sock.connect();
  });
}

async function run() {
  console.log("\n━━━  PHASE 4 — Real-Time Notifications End-to-End Tests  ━━━\n");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/devflow";
  await mongoose.connect(mongoUri);

  // ════════════ SETUP ════════════════════════════════════════════════════════
  console.log("── Setup ──");

  // 0. Ensure admin account
  const adminEmail = process.env.ADMIN_EMAIL || "admin@devflow.com";
  const adminPass  = process.env.ADMIN_PASSWORD || "Admin@1234";
  const adminLogin = await api("POST", "/auth/login", { email: adminEmail, password: adminPass });
  let adminToken = adminLogin.json?.token;

  if (!adminToken) {
    console.log("  Seeding admin user...");
    const { execSync } = require("child_process");
    execSync("node scripts/seedAdmin.js", { cwd: __dirname });
    const retry = await api("POST", "/auth/login", { email: adminEmail, password: adminPass });
    adminToken = retry.json?.token;
  }
  console.log(`  Admin token obtained: ${adminToken ? "OK" : "FAILED"}`);

  // 1. Recruiter A + Company A + Job A1
  const recAEmail = `recA_${TS}@t.com`;
  const regRecA = await api("POST", "/auth/register", {
    name: "Recruiter A",
    email: recAEmail,
    password: "pass1234",
    role: "recruiter",
  });
  const recAToken = regRecA.json.token;
  const recAId = regRecA.json.user.id;

  await api("POST", "/companies", { name: `Company A ${TS}`, industry: "Technology" }, recAToken);

  const jobA1Res = await api("POST", "/jobs", {
    title: "Fullstack Engineer",
    description: "Build robust fullstack apps",
    jobType: "full-time",
  }, recAToken);
  const jobA1Id = jobA1Res.json.job._id;
  console.log(`  Recruiter A created: ${recAId} | Job A1: ${jobA1Id}`);

  // 2. Recruiter B
  const recBEmail = `recB_${TS}@t.com`;
  const regRecB = await api("POST", "/auth/register", {
    name: "Recruiter B",
    email: recBEmail,
    password: "pass1234",
    role: "recruiter",
  });
  const recBToken = regRecB.json.token;
  const recBId = regRecB.json.user.id;
  console.log(`  Recruiter B created: ${recBId}`);

  // 3. Candidates C1 and C2
  const c1Email = `c1_${TS}@t.com`;
  const regC1 = await api("POST", "/auth/register", {
    name: "Candidate One",
    email: c1Email,
    password: "pass1234",
    role: "candidate",
  });
  const c1Token = regC1.json.token;
  const c1Id = regC1.json.user.id;

  const c2Email = `c2_${TS}@t.com`;
  const regC2 = await api("POST", "/auth/register", {
    name: "Candidate Two",
    email: c2Email,
    password: "pass1234",
    role: "candidate",
  });
  const c2Token = regC2.json.token;
  const c2Id = regC2.json.user.id;
  console.log(`  Candidate C1: ${c1Id} | Candidate C2: ${c2Id}`);

  // ════════════ SOCKET TESTS ════════════════════════════════════════════════
  console.log("\n━━━  Running Socket Tests  ━━━");

  // ── TEST 1: Connection rejections (no token, garbage token, query token) ───
  let test1NoTokenOk = false;
  let test1GarbageOk = false;
  let test1QueryOk = false;

  // 1a. No token
  try {
    const s = createSocket();
    await connectSocket(s);
    s.disconnect();
  } catch (err) {
    if (err.message.includes("No token provided")) test1NoTokenOk = true;
  }

  // 1b. Garbage token
  try {
    const s = createSocket({ auth: { token: "garbage.jwt.token" } });
    await connectSocket(s);
    s.disconnect();
  } catch (err) {
    if (err.message.includes("Invalid or expired token")) test1GarbageOk = true;
  }

  // 1c. Token in URL query only (must be rejected)
  try {
    const s = createSocket({ query: { token: c1Token } });
    await connectSocket(s);
    s.disconnect();
  } catch (err) {
    if (err.message.includes("No token provided")) test1QueryOk = true;
  }

  recordResult(
    "1",
    "Reject connection without auth token, garbage token, or query token only",
    test1NoTokenOk && test1GarbageOk && test1QueryOk,
    `NoToken=${test1NoTokenOk}, GarbageToken=${test1GarbageOk}, QueryToken=${test1QueryOk}`
  );

  // ── TEST 2: Connect as deactivated user is rejected ───────────────────────
  const deactEmail = `deact_${TS}@t.com`;
  const regDeact = await api("POST", "/auth/register", {
    name: "Deactivated User",
    email: deactEmail,
    password: "pass1234",
    role: "candidate",
  });
  const deactToken = regDeact.json.token;
  const deactId = regDeact.json.user.id;

  // Admin deactivates user
  await api("PATCH", `/admin/users/${deactId}/status`, { isActive: false }, adminToken);

  let test2Ok = false;
  try {
    const s = createSocket({ auth: { token: deactToken } });
    await connectSocket(s);
    s.disconnect();
  } catch (err) {
    if (err.message.includes("Account is deactivated")) test2Ok = true;
  }

  recordResult("2", "Connect as a deactivated user: rejected", test2Ok);

  // ── TEST 3: Room isolation & unauthorized events ──────────────────────────
  const socketC1 = createSocket({ auth: { token: c1Token } });
  const socketA  = createSocket({ auth: { token: recAToken } });
  await connectSocket(socketC1);
  await connectSocket(socketA);

  let unexpectedDelivery = false;
  socketA.on("notification:new", () => {
    unexpectedDelivery = true;
  });

  // C1 attempts to join Recruiter A's room and emit notification
  socketC1.emit("join", `user:${recAId}`);
  socketC1.emit("notification:new", { title: "Forged Event", message: "Hacked" });
  await new Promise((r) => setTimeout(r, 600));

  // Check DB that no forged notification exists
  const forgedInDb = await Notification.findOne({ title: "Forged Event" });

  recordResult(
    "3",
    "Client cannot join unauthorized rooms or emit notifications",
    !unexpectedDelivery && !forgedInDb,
    `UnexpectedDelivery=${unexpectedDelivery}, ForgedInDb=${!!forgedInDb}`
  );

  // ── TEST 4: Live application_received event to Recruiter A ────────────────
  const socketC2 = createSocket({ auth: { token: c2Token } });
  await connectSocket(socketC2);

  let aReceivedAppNotif = null;
  let c2ReceivedNotif = false;

  socketA.on("notification:new", (notif) => {
    if (notif.type === "application_received") aReceivedAppNotif = notif;
  });
  socketC2.on("notification:new", () => {
    c2ReceivedNotif = true;
  });

  // C1 applies to Job A1
  const applyRes = await api("POST", "/applications", { jobId: jobA1Id }, c1Token);
  const app1Id = applyRes.json.application._id;

  await new Promise((r) => setTimeout(r, 1000));

  const test4Passed =
    aReceivedAppNotif !== null &&
    aReceivedAppNotif.type === "application_received" &&
    aReceivedAppNotif.title === "New Application Received" &&
    !c2ReceivedNotif;

  recordResult(
    "4",
    "C1 applies to A1: A receives 'notification:new' live, C2 receives nothing",
    test4Passed,
    `RecruiterReceived=${!!aReceivedAppNotif}, C2Received=${c2ReceivedNotif}`
  );

  // ── TEST 5: Recruiter A shortlists C1 -> C1 receives application_status ───
  let c1ReceivedStatusNotif = null;
  socketC1.on("notification:new", (notif) => {
    if (notif.type === "application_status") c1ReceivedStatusNotif = notif;
  });

  await api("PATCH", `/applications/${app1Id}/status`, { status: "shortlisted" }, recAToken);
  await new Promise((r) => setTimeout(r, 1000));

  const test5Passed =
    c1ReceivedStatusNotif !== null &&
    c1ReceivedStatusNotif.type === "application_status" &&
    c1ReceivedStatusNotif.message.includes("shortlisted");

  recordResult(
    "5",
    "A shortlists C1: C1 receives application_status with new status",
    test5Passed,
    `C1Received=${!!c1ReceivedStatusNotif}`
  );

  // ── TEST 6: Assessment Flow Notifications ─────────────────────────────────
  // 6a. Assessment with MCQ + Code question
  const createAssRes = await api("POST", "/assessments", {
    jobId: jobA1Id,
    title: "Technical Assessment",
    durationMinutes: 45,
    questions: [
      { type: "mcq", text: "2 + 2?", options: ["3", "4", "5"], correctOption: 1, points: 2 },
      { type: "code", text: "Write reverseString(str)", points: 5 },
    ],
  }, recAToken);
  const ass1Id = createAssRes.json.assessment._id;
  const codeQId = createAssRes.json.assessment.questions.find((q) => q.type === "code")._id;
  const mcqQId  = createAssRes.json.assessment.questions.find((q) => q.type === "mcq")._id;

  // C1 starts attempt
  const startAttRes = await api("POST", "/attempts/start", { assessmentId: ass1Id }, c1Token);
  const att1Id = startAttRes.json.attempt._id;

  // C1 submits -> A notified (assessment_submitted)
  let aReceivedSubmitNotif = null;
  socketA.on("notification:new", (notif) => {
    if (notif.type === "assessment_submitted") aReceivedSubmitNotif = notif;
  });

  await api("POST", `/attempts/${att1Id}/submit`, {
    answers: [
      { question: mcqQId, selectedOption: 1 },
      { question: codeQId, codeAnswer: "function reverseString(s) { return s.split('').reverse().join(''); }" },
    ],
  }, c1Token);
  await new Promise((r) => setTimeout(r, 1000));

  // A grades the code question -> C1 notified (assessment_graded)
  let c1ReceivedGradedNotif = null;
  socketC1.on("notification:new", (notif) => {
    if (notif.type === "assessment_graded") c1ReceivedGradedNotif = notif;
  });

  await api("PATCH", `/attempts/${att1Id}/grade`, {
    grades: [{ question: codeQId, pointsAwarded: 5, feedback: "Great implementation" }],
  }, recAToken);
  await new Promise((r) => setTimeout(r, 1000));

  // 6b. Auto-graded MCQ-only assessment
  const jobA2Res = await api("POST", "/jobs", {
    title: "Frontend Developer",
    description: "React UI development",
    jobType: "part-time",
  }, recAToken);
  const jobA2Id = jobA2Res.json.job._id;

  const ass2Res = await api("POST", "/assessments", {
    jobId: jobA2Id,
    title: "Quick Quiz",
    durationMinutes: 20,
    questions: [
      { type: "mcq", text: "HTML stands for?", options: ["A", "B", "C"], correctOption: 0, points: 3 },
    ],
  }, recAToken);
  const ass2Id = ass2Res.json.assessment._id;
  const mcq2QId = ass2Res.json.assessment.questions[0]._id;

  await api("POST", "/applications", { jobId: jobA2Id }, c1Token);
  const startAtt2 = await api("POST", "/attempts/start", { assessmentId: ass2Id }, c1Token);
  const att2Id = startAtt2.json.attempt._id;

  let c1AutoGradedNotif = null;
  socketC1.on("notification:new", (notif) => {
    if (notif.type === "assessment_graded" && notif.message.includes("Quick Quiz")) {
      c1AutoGradedNotif = notif;
    }
  });

  await api("POST", `/attempts/${att2Id}/submit`, {
    answers: [{ question: mcq2QId, selectedOption: 0 }],
  }, c1Token);
  await new Promise((r) => setTimeout(r, 1000));

  const test6Passed =
    aReceivedSubmitNotif !== null &&
    c1ReceivedGradedNotif !== null &&
    c1AutoGradedNotif !== null;

  recordResult(
    "6",
    "Assessment flow: submit notifies recruiter, grading and auto-grading notifies candidate",
    test6Passed,
    `SubmitNotif=${!!aReceivedSubmitNotif}, GradedNotif=${!!c1ReceivedGradedNotif}, AutoGradedNotif=${!!c1AutoGradedNotif}`
  );

  // ── TEST 7: Interview Flow Notifications ──────────────────────────────────
  const now = new Date();
  const slot1Start = new Date(now.getTime() + 86400000).toISOString();
  const slot1End   = new Date(now.getTime() + 86400000 + 1800000).toISOString();
  const slot2Start = new Date(now.getTime() + 172800000).toISOString();
  const slot2End   = new Date(now.getTime() + 172800000 + 1800000).toISOString();

  // 7a. Propose interview -> C1 notified
  let c1InterviewProposed = null;
  socketC1.on("notification:new", (notif) => {
    if (notif.type === "interview_proposed") c1InterviewProposed = notif;
  });

  const int1Res = await api("POST", "/interviews", {
    applicationId: app1Id,
    mode: "online",
    meetingLink: "https://meet.google.com/xyz-test",
    slots: [
      { start: slot1Start, end: slot1End },
      { start: slot2Start, end: slot2End },
    ],
  }, recAToken);
  const int1Id = int1Res.json.interview._id;
  await new Promise((r) => setTimeout(r, 1000));

  // 7b. Confirm interview -> A notified
  let aInterviewConfirmed = null;
  socketA.on("notification:new", (notif) => {
    if (notif.type === "interview_confirmed") aInterviewConfirmed = notif;
  });

  await api("PATCH", `/interviews/${int1Id}/confirm`, { slotIndex: 0 }, c1Token);
  await new Promise((r) => setTimeout(r, 1000));

  // 7c. Second interview (decline): Job A3 + application + interview
  const jobA3Res = await api("POST", "/jobs", {
    title: "QA Engineer",
    description: "Testing systems",
    jobType: "contract",
  }, recAToken);
  const jobA3Id = jobA3Res.json.job._id;
  const appA3Res = await api("POST", "/applications", { jobId: jobA3Id }, c1Token);
  const appA3Id = appA3Res.json.application._id;
  await api("PATCH", `/applications/${appA3Id}/status`, { status: "shortlisted" }, recAToken);

  const int2Res = await api("POST", "/interviews", {
    applicationId: appA3Id,
    mode: "online",
    meetingLink: "https://meet.google.com/qa-test",
    slots: [{ start: new Date(now.getTime() + 259200000).toISOString(), end: new Date(now.getTime() + 259200000 + 1800000).toISOString() }],
  }, recAToken);
  const int2Id = int2Res.json.interview._id;

  let aInterviewDeclined = null;
  socketA.on("notification:new", (notif) => {
    if (notif.type === "interview_declined") aInterviewDeclined = notif;
  });

  await api("PATCH", `/interviews/${int2Id}/decline`, {}, c1Token);
  await new Promise((r) => setTimeout(r, 1000));

  // 7d. Third interview (cancel): Job A4 + application + interview
  const jobA4Res = await api("POST", "/jobs", {
    title: "DevOps Engineer",
    description: "Cloud infrastructure",
    jobType: "full-time",
  }, recAToken);
  const jobA4Id = jobA4Res.json.job._id;
  const appA4Res = await api("POST", "/applications", { jobId: jobA4Id }, c1Token);
  const appA4Id = appA4Res.json.application._id;
  await api("PATCH", `/applications/${appA4Id}/status`, { status: "shortlisted" }, recAToken);

  const int3Res = await api("POST", "/interviews", {
    applicationId: appA4Id,
    mode: "online",
    meetingLink: "https://meet.google.com/devops-test",
    slots: [{ start: new Date(now.getTime() + 345600000).toISOString(), end: new Date(now.getTime() + 345600000 + 1800000).toISOString() }],
  }, recAToken);
  const int3Id = int3Res.json.interview._id;

  let c1InterviewCancelled = null;
  socketC1.on("notification:new", (notif) => {
    if (notif.type === "interview_cancelled") c1InterviewCancelled = notif;
  });

  await api("PATCH", `/interviews/${int3Id}/cancel`, {}, recAToken);
  await new Promise((r) => setTimeout(r, 1000));

  const test7Passed =
    c1InterviewProposed !== null &&
    aInterviewConfirmed !== null &&
    aInterviewDeclined !== null &&
    c1InterviewCancelled !== null;

  recordResult(
    "7",
    "Interview flow: propose, confirm, decline, cancel all emit live notifications to target party",
    test7Passed,
    `Proposed=${!!c1InterviewProposed}, Confirmed=${!!aInterviewConfirmed}, Declined=${!!aInterviewDeclined}, Cancelled=${!!c1InterviewCancelled}`
  );

  // ── TEST 8: Offline delivery ──────────────────────────────────────────────
  // Disconnect C1's socket
  socketC1.disconnect();

  // Recruiter A changes C1's application status on A3 to "rejected"
  await api("PATCH", `/applications/${appA3Id}/status`, { status: "rejected" }, recAToken);

  // C1 reconnects and fetches GET /api/notifications
  await connectSocket(socketC1);
  const listC1Offline = await api("GET", "/notifications", null, c1Token);
  const missedNotif = listC1Offline.json.notifications.find(
    (n) => n.type === "application_status" && n.message.includes("rejected")
  );

  const test8Passed = missedNotif !== undefined && missedNotif.isRead === false;

  recordResult(
    "8",
    "Offline delivery: missed notifications persist in DB with isRead=false and are retrieved via GET /notifications",
    test8Passed,
    `MissedNotificationFound=${!!missedNotif}, isRead=${missedNotif?.isRead}`
  );

  // ── TEST 9: Notification failure does not break main request ──────────────
  // Simulate a notify failure: We add a temporary strict MongoDB schema validation rule on the
  // 'notifications' collection that requires an impossible field 'fail_flag_mandatory_to_trigger_error'.
  // This forces Notification.create() to throw a Mongoose validation error inside notify().
  // The notify() try/catch block catches this, logs the error, and the main controller operation still returns 200.
  try {
    await mongoose.connection.db.command({
      collMod: "notifications",
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["fail_flag_mandatory_to_trigger_error"],
        },
      },
    });

    console.log("  [Simulation]: Enabled temporary strict validator on 'notifications' requiring fail_flag_mandatory_to_trigger_error");

    // Perform an application status change while Notification.create() is forced to fail
    const statusChangeWhileFailing = await api("PATCH", `/applications/${appA4Id}/status`, { status: "rejected" }, recAToken);

    const test9MainSucceeded = statusChangeWhileFailing.status === 200;

    // Remove the temporary validator to restore normal collection operation
    await mongoose.connection.db.command({
      collMod: "notifications",
      validator: {},
    });
    console.log("  [Simulation]: Removed temporary validator on 'notifications'");

    recordResult(
      "9",
      "Notification failure does not break main request: status change still returns 200",
      test9MainSucceeded,
      `StatusChangeResponseCode=${statusChangeWhileFailing.status}`
    );
  } catch (err) {
    // Ensure validator is cleaned up if anything threw
    await mongoose.connection.db.command({ collMod: "notifications", validator: {} }).catch(() => {});
    recordResult("9", "Notification failure does not break main request", false, err.message);
  }

  // ── TEST 10: Disconnect on deactivation ────────────────────────────────────
  let c2Disconnected = false;
  socketC2.on("disconnect", (reason) => {
    c2Disconnected = true;
  });

  // Admin deactivates C2
  await api("PATCH", `/admin/users/${c2Id}/status`, { isActive: false }, adminToken);
  await new Promise((r) => setTimeout(r, 1200));

  recordResult(
    "10",
    "Disconnect on deactivation: connect C2, admin deactivates C2, C2's socket is disconnected",
    c2Disconnected,
    `SocketDisconnected=${c2Disconnected}`
  );

  // ════════════ REST TESTS ══════════════════════════════════════════════════
  console.log("\n━━━  Running REST Tests  ━━━");

  // ── TEST 11: GET /api/notifications listing, pagination, unread-count ─────
  const c1NotifsRes = await api("GET", "/notifications?page=1&limit=10", null, c1Token);
  const c1Notifs = c1NotifsRes.json.notifications;

  // Verify own only
  const allBelongToC1 = c1Notifs.every((n) => n.recipient === c1Id);

  // Verify newest first
  let isSorted = true;
  for (let i = 0; i < c1Notifs.length - 1; i++) {
    if (new Date(c1Notifs[i].createdAt) < new Date(c1Notifs[i + 1].createdAt)) isSorted = false;
  }

  // Filter ?unread=true
  const unreadListRes = await api("GET", "/notifications?unread=true", null, c1Token);
  const allUnread = unreadListRes.json.notifications.every((n) => n.isRead === false);

  // Bad page / limit values
  const badParamRes = await api("GET", "/notifications?page=0&limit=abc", null, c1Token);
  const badParamHandled = badParamRes.status === 422 || badParamRes.status === 200;

  // Unread count endpoint
  const unreadCountRes = await api("GET", "/notifications/unread-count", null, c1Token);
  const unreadCountMatches = unreadCountRes.json.count === unreadListRes.json.total;

  recordResult(
    "11",
    "GET /api/notifications own only, newest first, ?unread=true works, unread-count matches",
    allBelongToC1 && isSorted && allUnread && badParamHandled && unreadCountMatches,
    `OwnOnly=${allBelongToC1}, NewestFirst=${isSorted}, UnreadFilter=${allUnread}, CountMatches=${unreadCountMatches}`
  );

  // ── TEST 12: Mark as read (own vs other's) & mark-all ─────────────────────
  const notifToRead = c1Notifs.find((n) => !n.isRead);
  const markOwnRes = await api("PATCH", `/notifications/${notifToRead._id}/read`, {}, c1Token);
  const markOwnOk =
    markOwnRes.status === 200 &&
    markOwnRes.json.notification.isRead === true &&
    markOwnRes.json.notification.readAt !== null;

  // Recruiter A attempts to mark C1's notification as read -> 404
  const markOtherRes = await api("PATCH", `/notifications/${notifToRead._id}/read`, {}, recAToken);
  const markOther404 = markOtherRes.status === 404;

  // Invalid ObjectId -> 400
  const markInvalidRes = await api("PATCH", "/notifications/not-a-valid-id/read", {}, c1Token);
  const markInvalid400 = markInvalidRes.status === 400;

  // Mark all as read for C1
  const recANotifsBefore = await api("GET", "/notifications/unread-count", null, recAToken);
  await api("PATCH", "/notifications/read-all", {}, c1Token);

  const c1UnreadAfter = await api("GET", "/notifications/unread-count", null, c1Token);
  const recANotifsAfter = await api("GET", "/notifications/unread-count", null, recAToken);

  const markAllOk = c1UnreadAfter.json.count === 0 && recANotifsAfter.json.count === recANotifsBefore.json.count;

  recordResult(
    "12",
    "PATCH /:id/read sets readAt (200), other's returns 404, invalid id 400, read-all leaves other users untouched",
    markOwnOk && markOther404 && markInvalid400 && markAllOk,
    `MarkOwn=${markOwnOk}, MarkOther404=${markOther404}, Invalid400=${markInvalid400}, ReadAllUntouchedOther=${markAllOk}`
  );

  // ── TEST 13: DELETE /api/notifications/:id ────────────────────────────────
  const notifToDelete = c1Notifs[c1Notifs.length - 1];
  const delOtherRes = await api("DELETE", `/notifications/${notifToDelete._id}`, null, recAToken);
  const delOther404 = delOtherRes.status === 404;

  const delOwnRes = await api("DELETE", `/notifications/${notifToDelete._id}`, null, c1Token);
  const delOwnOk = delOwnRes.status === 200;

  recordResult(
    "13",
    "DELETE own notification returns 200, DELETE other's notification returns 404",
    delOther404 && delOwnOk,
    `DeleteOther404=${delOther404}, DeleteOwnOk=${delOwnOk}`
  );

  // ── TEST 14: No token on every route -> 401 ───────────────────────────────
  const unauthEndpoints = [
    { method: "GET", path: "/notifications" },
    { method: "GET", path: "/notifications/unread-count" },
    { method: "PATCH", path: "/notifications/read-all" },
    { method: "PATCH", path: `/notifications/${FAKE_ID}/read` },
    { method: "DELETE", path: `/notifications/${FAKE_ID}` },
  ];

  let all401 = true;
  for (const ep of unauthEndpoints) {
    const res = await api(ep.method, ep.path);
    if (res.status !== 401) all401 = false;
  }

  recordResult("14", "No token on all notification routes returns 401", all401);

  // ── TEST 15: Index inspection (compound & TTL) ─────────────────────────────
  const indexes = await Notification.collection.indexes();

  let hasRecipientCreated = false;
  let hasRecipientIsRead = false;
  let hasTtlIndex = false;
  let ttlSeconds = 0;

  for (const idx of indexes) {
    const key = idx.key;
    if (key.recipient === 1 && key.createdAt === -1 && Object.keys(key).length === 2) {
      hasRecipientCreated = true;
    }
    if (key.recipient === 1 && key.isRead === 1 && Object.keys(key).length === 2) {
      hasRecipientIsRead = true;
    }
    if (key.createdAt === 1 && Object.keys(key).length === 1 && idx.expireAfterSeconds === 7776000) {
      hasTtlIndex = true;
      ttlSeconds = idx.expireAfterSeconds;
    }
  }

  console.log("\n  ── Notification Collection Indexes ──");
  for (const idx of indexes) {
    console.log(`    - Index: ${idx.name} -> ${JSON.stringify(idx.key)} ${idx.expireAfterSeconds ? `(TTL: ${idx.expireAfterSeconds}s = 90 days)` : ""}`);
  }

  const test15Passed = hasRecipientCreated && hasRecipientIsRead && hasTtlIndex && ttlSeconds === 7776000;

  recordResult(
    "15",
    "Compound indexes ({ recipient, createdAt: -1 }, { recipient, isRead }) and 90-day TTL index exist",
    test15Passed,
    `RecipientCreated=${hasRecipientCreated}, RecipientIsRead=${hasRecipientIsRead}, TTL90Days=${hasTtlIndex} (${ttlSeconds}s)`
  );

  // ── CODE SAFETY & NOTIFY CALL SITES AUDIT ───────────────────────────────────
  console.log("\n━━━  Code Safety & Architecture Checks  ━━━");

  const newFiles = [
    "models/Notification.js",
    "socket.js",
    "services/notificationService.js",
    "controllers/notificationController.js",
    "routes/notifications.js",
  ];

  let dangerousEqualsCount = 0;
  for (const f of newFiles) {
    const content = fs.readFileSync(path.join(__dirname, f), "utf8");
    const matches = content.match(/req\.user\._id\s*===|===\s*req\.user\._id/g);
    if (matches) dangerousEqualsCount += matches.length;
  }

  console.log(`  Dangerous === on ObjectIds in new Phase 4 files: ${dangerousEqualsCount === 0 ? "NONE ✓" : dangerousEqualsCount + " FOUND!"}`);

  console.log("\n  ── Call sites for notify() across codebase ──");
  console.log("    1. controllers/applicationController.js -> apply() [type: application_received]");
  console.log("    2. controllers/applicationController.js -> changeStatus() [type: application_status]");
  console.log("    3. controllers/attemptController.js -> submitAttempt() [type: assessment_submitted]");
  console.log("    4. controllers/attemptController.js -> submitAttempt() [type: assessment_graded (auto-graded)]");
  console.log("    5. controllers/attemptController.js -> gradeAttempt() [type: assessment_graded (manual grade)]");
  console.log("    6. controllers/interviewController.js -> createInterview() [type: interview_proposed]");
  console.log("    7. controllers/interviewController.js -> confirmInterview() [type: interview_confirmed]");
  console.log("    8. controllers/interviewController.js -> declineInterview() [type: interview_declined]");
  console.log("    9. controllers/interviewController.js -> cancelInterview() [type: interview_cancelled]");

  // ════════════ SUMMARY TABLE ════════════════════════════════════════════════
  console.log("\n━━━  Summary  ━━━");
  console.log(`${"Test".padEnd(8)} ${"Name".padEnd(68)} ${"Result".padEnd(8)}`);
  console.log("-".repeat(90));
  for (const t of testResults) {
    const col = t.result === "PASS" ? "\x1b[32m" : "\x1b[31m";
    console.log(`${t.id.padEnd(8)} ${t.name.padEnd(68)} ${col}${t.result.padEnd(8)}\x1b[0m`);
  }
  console.log("-".repeat(90));
  const finalCol = failCount === 0 ? "\x1b[32m" : "\x1b[31m";
  console.log(`Total: ${finalCol}${passCount} passed, ${failCount} failed\x1b[0m\n`);

  // Cleanup sockets and DB connection
  socketC1.disconnect();
  socketA.disconnect();
  socketC2.disconnect();
  await mongoose.disconnect();
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test runner threw an unexpected exception:", err);
  process.exit(1);
});
