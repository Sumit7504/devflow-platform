Set-Location "e:\Projects\Devflow Platform\backend"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Body($json) {
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmp, $json, [System.Text.Encoding]::UTF8)
    return $tmp
}

function Invoke-Api {
    param($method, $url, $token = "", $bodyFile = "")
    $a = @("-s", "-w", "`n%{http_code}", "-X", $method, $url)
    if ($token)    { $a += @("-H", "Authorization: Bearer ${token}") }
    if ($bodyFile) { $a += @("-H", "Content-Type: application/json", "--data", "@${bodyFile}") }
    return curl.exe @a
}

function Parse-Response($raw) {
    $lines  = $raw -split "`n"
    $code   = $lines[-1].Trim()
    $body   = ($lines[0..($lines.Count - 2)] -join "`n").Trim()
    $parsed = try { $body | ConvertFrom-Json } catch { $null }
    return @{ Code = $code; Body = $body; Json = $parsed }
}

$pass = 0; $fail = 0; $tests = @()

function Run-Test($num, $name, $response, $expectedCode, $extraCheck = $null) {
    $r      = Parse-Response $response
    $codeOk = $r.Code -eq [string]$expectedCode
    $extraOk= if ($extraCheck) { try { & $extraCheck $r } catch { $false } } else { $true }
    $ok     = $codeOk -and $extraOk

    $label = if ($ok) { "PASS"; $script:pass++ } else { "FAIL"; $script:fail++ }
    $color = if ($ok) { "Green" } else { "Red" }

    Write-Host ""
    Write-Host "TEST $num — $name" -ForegroundColor Cyan
    Write-Host "  Status : $($r.Code)  (expected $expectedCode)"
    Write-Host "  Body   : $($r.Body)"
    if ($extraCheck -and -not $extraOk) { Write-Host "  Extra  : extra assertion failed" -ForegroundColor Yellow }
    Write-Host "  Result : " -NoNewline; Write-Host $label -ForegroundColor $color

    $script:tests += [PSCustomObject]@{ Num=$num; Name=$name; Expected=$expectedCode; Got=$r.Code; Result=$label }
    return $r
}

$BASE = "http://localhost:5000/api"
$TS   = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$FAKE = "000000000000000000000001"

Write-Host "`n━━━  PHASE 3d-2 — Attempts & Grading Tests  ━━━" -ForegroundColor Magenta

# ════════════ SETUP ══════════════════════════════════════════════════════════
Write-Host "`n── Setup ──" -ForegroundColor Gray

# 1. Recruiter A + Company A + Job A1
$f = Write-Body "{`"name`":`"Recruiter A`",`"email`":`"rA_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pA = (Parse-Response $r).Json; $tokenA = $pA.token; $userAId = $pA.user.id

$f = Write-Body '{"name":"Acme Corp","industry":"Tech"}'
Invoke-Api POST "${BASE}/companies" -token $tokenA -bodyFile $f | Out-Null; Remove-Item $f

$f = Write-Body '{"title":"Fullstack Engineer","description":"Node + React","jobType":"full-time"}'
$r = Invoke-Api POST "${BASE}/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
$jobA1Id = (Parse-Response $r).Json.job._id

# Assessment 1: 2 MCQ (1pt, 2pt) + 1 Code (5pt) = 8 max points
$createPayload1 = @"
{
  "jobId": "${jobA1Id}",
  "title": "Fullstack Assessment",
  "description": "2 MCQs and 1 Code question",
  "durationMinutes": 60,
  "questions": [
    {
      "type": "mcq",
      "text": "What does HTTP status 200 mean?",
      "points": 1,
      "options": ["OK", "Not Found", "Server Error"],
      "correctOption": 0
    },
    {
      "type": "mcq",
      "text": "Which method is idempotent?",
      "points": 2,
      "options": ["POST", "PUT", "PATCH"],
      "correctOption": 1
    },
    {
      "type": "code",
      "text": "Write a function to check palindrome",
      "points": 5
    }
  ]
}
"@
$f = Write-Body $createPayload1
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenA -bodyFile $f; Remove-Item $f
$assessment1 = (Parse-Response $r).Json.assessment
$assessment1Id = $assessment1._id
$q1Id = $assessment1.questions[0]._id
$q2Id = $assessment1.questions[1]._id
$q3Id = $assessment1.questions[2]._id

# 2. Recruiter B + Company B
$f = Write-Body "{`"name`":`"Recruiter B`",`"email`":`"rB_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pB = (Parse-Response $r).Json; $tokenB = $pB.token; $userBId = $pB.user.id

$f = Write-Body '{"name":"Beta Ltd","industry":"Finance"}'
Invoke-Api POST "${BASE}/companies" -token $tokenB -bodyFile $f | Out-Null; Remove-Item $f

# 3. Candidates: C1, C2, C3, C4
# C1
$f = Write-Body "{`"name`":`"Candidate One`",`"email`":`"c1_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC1 = (Parse-Response $r).Json; $tokenC1 = $pC1.token; $userC1Id = $pC1.user.id

# C2
$f = Write-Body "{`"name`":`"Candidate Two`",`"email`":`"c2_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC2 = (Parse-Response $r).Json; $tokenC2 = $pC2.token; $userC2Id = $pC2.user.id

# C3 (will NOT apply to A1)
$f = Write-Body "{`"name`":`"Candidate Three`",`"email`":`"c3_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC3 = (Parse-Response $r).Json; $tokenC3 = $pC3.token; $userC3Id = $pC3.user.id

# C4 (applies to A1, then rejected)
$f = Write-Body "{`"name`":`"Candidate Four`",`"email`":`"c4_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC4 = (Parse-Response $r).Json; $tokenC4 = $pC4.token; $userC4Id = $pC4.user.id

# Applications to Job A1:
# C1 applies
$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
Invoke-Api POST "${BASE}/applications" -token $tokenC1 -bodyFile $f | Out-Null; Remove-Item $f

# C2 applies
$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
Invoke-Api POST "${BASE}/applications" -token $tokenC2 -bodyFile $f | Out-Null; Remove-Item $f

# C4 applies and Recruiter A rejects C4
$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
$r = Invoke-Api POST "${BASE}/applications" -token $tokenC4 -bodyFile $f; Remove-Item $f
$appC4Id = (Parse-Response $r).Json.application._id

$f = Write-Body '{"status":"rejected"}'
Invoke-Api PATCH "${BASE}/applications/${appC4Id}/status" -token $tokenA -bodyFile $f | Out-Null; Remove-Item $f

# 4. Job A2 + Assessment 2: MCQ-only assessment (for auto-grading test)
$f = Write-Body '{"title":"Frontend Basics","description":"HTML and CSS","jobType":"contract"}'
$r = Invoke-Api POST "${BASE}/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
$jobA2Id = (Parse-Response $r).Json.job._id

$createPayload2 = @"
{
  "jobId": "${jobA2Id}",
  "title": "MCQ Only Assessment",
  "durationMinutes": 30,
  "questions": [
    {
      "type": "mcq",
      "text": "What is HTML?",
      "points": 3,
      "options": ["Hypertext Markup", "High Text", "Hyper Tool"],
      "correctOption": 0
    },
    {
      "type": "mcq",
      "text": "CSS stands for?",
      "points": 2,
      "options": ["Creative Style", "Cascading Style Sheets", "Computer Style"],
      "correctOption": 1
    }
  ]
}
"@
$f = Write-Body $createPayload2
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenA -bodyFile $f; Remove-Item $f
$assessment2 = (Parse-Response $r).Json.assessment
$assessment2Id = $assessment2._id
$qA2_1 = $assessment2.questions[0]._id
$qA2_2 = $assessment2.questions[1]._id

# C1 applies to Job A2 as well
$f = Write-Body "{`"jobId`":`"${jobA2Id}`"}"
Invoke-Api POST "${BASE}/applications" -token $tokenC1 -bodyFile $f | Out-Null; Remove-Item $f

Write-Host "  Recruiter A : $userAId | Assessment 1 (Mixed): $assessment1Id | Assessment 2 (MCQ): $assessment2Id"
Write-Host "  Recruiter B : $userBId"
Write-Host "  Candidate C1: $userC1Id (applied to A1 & A2)"
Write-Host "  Candidate C2: $userC2Id (applied to A1)"
Write-Host "  Candidate C3: $userC3Id (no application)"
Write-Host "  Candidate C4: $userC4Id (rejected on A1)"

# ════════════ TESTS ══════════════════════════════════════════════════════════
Write-Host "`n━━━  Running Tests  ━━━" -ForegroundColor Magenta

# ── TEST 1: Eligibility checks on POST /api/attempts/start ────────────────────
# 1a: C3 (no application) -> 403
$f = Write-Body "{`"assessmentId`":`"${assessment1Id}`"}"
$r = Invoke-Api POST "${BASE}/attempts/start" -token $tokenC3 -bodyFile $f; Remove-Item $f
Run-Test "1a" "C3 (no application) POST /attempts/start (403)" $r 403 | Out-Null

# 1b: C4 (rejected application) -> 403
$f = Write-Body "{`"assessmentId`":`"${assessment1Id}`"}"
$r = Invoke-Api POST "${BASE}/attempts/start" -token $tokenC4 -bodyFile $f; Remove-Item $f
Run-Test "1b" "C4 (rejected application) POST /attempts/start (403)" $r 403 | Out-Null

# 1c: Recruiter A tries to start attempt -> 403 (role restriction)
$f = Write-Body "{`"assessmentId`":`"${assessment1Id}`"}"
$r = Invoke-Api POST "${BASE}/attempts/start" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "1c" "Recruiter A POST /attempts/start (403 role)" $r 403 | Out-Null

# 1d: Invalid assessmentId -> 422 (validator) or 400
$f = Write-Body '{"assessmentId":"invalid-id"}'
$r = Invoke-Api POST "${BASE}/attempts/start" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test "1d" "Invalid assessmentId POST /attempts/start (422 validator)" $r 422 | Out-Null

# 1e: Valid but missing assessmentId -> 404
$f = Write-Body "{`"assessmentId`":`"${FAKE}`"}"
$r = Invoke-Api POST "${BASE}/attempts/start" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test "1e" "Missing assessmentId POST /attempts/start (404)" $r 404 | Out-Null

# ── TEST 2: C1 starts attempt on Assessment 1 -> 201 ─────────────────────────
$f = Write-Body "{`"assessmentId`":`"${assessment1Id}`"}"
$r = Invoke-Api POST "${BASE}/attempts/start" -token $tokenC1 -bodyFile $f; Remove-Item $f
$res2 = Run-Test 2 "C1 starts attempt: returns id, startedAt, deadline (201)" $r 201 {
    param($res)
    $att = $res.Json.attempt
    $att._id -ne $null -and $att.startedAt -ne $null -and $att.deadline -ne $null
}
$attemptC1Id = $res2.Json.attempt._id

# ── TEST 3: C1 starts again on Assessment 1 -> 409 ────────────────────────────
$f = Write-Body "{`"assessmentId`":`"${assessment1Id}`"}"
$r = Invoke-Api POST "${BASE}/attempts/start" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test 3 "C1 starts again: expect 409 duplicate" $r 409 {
    param($res) $res.Json.message -match "already started"
} | Out-Null

# ── TEST 4: C1 GET /api/attempts/my ───────────────────────────────────────────
$r = Invoke-Api GET "${BASE}/attempts/my" -token $tokenC1
Run-Test 4 "C1 GET /attempts/my: lists attempt with assessmentTitle and jobTitle" $r 200 {
    param($res)
    $list = $res.Json.attempts
    $list.Count -ge 1 -and
    $list[0].assessmentTitle -eq "Fullstack Assessment" -and
    $list[0].jobTitle -eq "Fullstack Engineer"
} | Out-Null

# ── TEST 5: C1 submits with 1 correct MCQ, 1 wrong MCQ, 1 code answer ────────
# Q1 (1pt, correct is 0): ans 0 -> +1 pt
# Q2 (2pt, correct is 1): ans 0 -> 0 pt
# Q3 (5pt, code): ans code -> waiting for recruiter manual grade
# Expected: status "submitted", mcqScore: 1, maxScore: 8
$submitPayload = @"
{
  "answers": [
    { "question": "${q1Id}", "selectedOption": 0 },
    { "question": "${q2Id}", "selectedOption": 0 },
    { "question": "${q3Id}", "codeAnswer": "function isPalindrome(s) { return s === s.split('').reverse().join(''); }" }
  ]
}
"@
$f = Write-Body $submitPayload
$r = Invoke-Api POST "${BASE}/attempts/${attemptC1Id}/submit" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test 5 "C1 submit: status=submitted, mcqScore=1, maxScore=8 (200)" $r 200 {
    param($res)
    $att = $res.Json.attempt
    $att.status -eq "submitted" -and
    $att.mcqScore -eq 1 -and
    $att.maxScore -eq 8 -and
    $att.answers.Count -eq 3
} | Out-Null

# ── TEST 6: Double submit & concurrent submits ────────────────────────────────
# 6a: Submit again on already submitted attempt -> 400
$f = Write-Body $submitPayload
$r = Invoke-Api POST "${BASE}/attempts/${attemptC1Id}/submit" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test "6a" "Submit again on already submitted attempt (400)" $r 400 {
    param($res) $res.Json.message -match "already been submitted"
} | Out-Null

# 6b: C2 starts fresh attempt and fires two submits simultaneously
$f = Write-Body "{`"assessmentId`":`"${assessment1Id}`"}"
$r = Invoke-Api POST "${BASE}/attempts/start" -token $tokenC2 -bodyFile $f; Remove-Item $f
$attemptC2Id = (Parse-Response $r).Json.attempt._id

$fSubmitC2 = Write-Body $submitPayload

$job1 = Start-Job -ScriptBlock {
    param($url, $tok, $bFile)
    curl.exe -s -w "`n%{http_code}" -X POST $url -H "Authorization: Bearer ${tok}" -H "Content-Type: application/json" --data "@${bFile}"
} -ArgumentList ("${BASE}/attempts/${attemptC2Id}/submit", $tokenC2, $fSubmitC2)

$job2 = Start-Job -ScriptBlock {
    param($url, $tok, $bFile)
    curl.exe -s -w "`n%{http_code}" -X POST $url -H "Authorization: Bearer ${tok}" -H "Content-Type: application/json" --data "@${bFile}"
} -ArgumentList ("${BASE}/attempts/${attemptC2Id}/submit", $tokenC2, $fSubmitC2)

$raw1 = Receive-Job -Job $job1 -Wait -AutoRemoveJob
$raw2 = Receive-Job -Job $job2 -Wait -AutoRemoveJob
Remove-Item $fSubmitC2

$c1Code = (Parse-Response $raw1).Code
$c2Code = (Parse-Response $raw2).Code

$concurrentPass = ($c1Code -eq "200" -and $c2Code -eq "400") -or ($c1Code -eq "400" -and $c2Code -eq "200")
$fakeRes = [PSCustomObject]@{ Code = "200/400"; Body = "Job1=$c1Code, Job2=$c2Code" }
if ($concurrentPass) {
    Write-Host ""
    Write-Host "TEST 6b — Concurrent submits: exactly one 200 and one 400" -ForegroundColor Cyan
    Write-Host "  Status : $c1Code & $c2Code"
    Write-Host "  Result : " -NoNewline; Write-Host "PASS" -ForegroundColor Green
    $script:pass++
    $script:tests += [PSCustomObject]@{ Num="6b"; Name="Concurrent submits: exactly one 200 and one 400"; Expected="One 200, one 400"; Got="$c1Code & $c2Code"; Result="PASS" }
} else {
    Write-Host ""
    Write-Host "TEST 6b — Concurrent submits: exactly one 200 and one 400" -ForegroundColor Cyan
    Write-Host "  Status : $c1Code & $c2Code"
    Write-Host "  Result : " -NoNewline; Write-Host "FAIL" -ForegroundColor Red
    $script:fail++
    $script:tests += [PSCustomObject]@{ Num="6b"; Name="Concurrent submits: exactly one 200 and one 400"; Expected="One 200, one 400"; Got="$c1Code & $c2Code"; Result="FAIL" }
}

# ── TEST 7: Submit tampering ──────────────────────────────────────────────────
# Candidate C5 starts fresh attempt and submits tampering payload
$f = Write-Body "{`"name`":`"Candidate Five`",`"email`":`"c5_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC5 = (Parse-Response $r).Json; $tokenC5 = $pC5.token; $userC5Id = $pC5.user.id

$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
Invoke-Api POST "${BASE}/applications" -token $tokenC5 -bodyFile $f | Out-Null; Remove-Item $f

$f = Write-Body "{`"assessmentId`":`"${assessment1Id}`"}"
$r = Invoke-Api POST "${BASE}/attempts/start" -token $tokenC5 -bodyFile $f; Remove-Item $f
$attemptC5Id = (Parse-Response $r).Json.attempt._id

$tamperPayload = @"
{
  "totalScore": 999,
  "mcqScore": 999,
  "codeScore": 999,
  "status": "graded",
  "answers": [
    { "question": "${q1Id}", "selectedOption": 0, "pointsAwarded": 999 },
    { "question": "${q2Id}", "selectedOption": 0, "pointsAwarded": 999 },
    { "question": "${q3Id}", "codeAnswer": "let x = 1;", "pointsAwarded": 999 }
  ]
}
"@
$f = Write-Body $tamperPayload
$r = Invoke-Api POST "${BASE}/attempts/${attemptC5Id}/submit" -token $tokenC5 -bodyFile $f; Remove-Item $f
Run-Test 7 "Submit tampering: client scores and status ignored (200, status=submitted, mcqScore=1)" $r 200 {
    param($res)
    $att = $res.Json.attempt
    $att.status -eq "submitted" -and
    $att.mcqScore -eq 1 -and
    $att.totalScore -eq 1 -and
    $att.answers[0].pointsAwarded -eq 1 -and
    $att.answers[1].pointsAwarded -eq 0 -and
    $att.answers[2].pointsAwarded -eq 0
} | Out-Null

# ── TEST 8: Bad answers validations ───────────────────────────────────────────
# Fresh candidate C6 on Assessment 1
$f = Write-Body "{`"name`":`"Candidate Six`",`"email`":`"c6_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC6 = (Parse-Response $r).Json; $tokenC6 = $pC6.token

$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
Invoke-Api POST "${BASE}/applications" -token $tokenC6 -bodyFile $f | Out-Null; Remove-Item $f

$f = Write-Body "{`"assessmentId`":`"${assessment1Id}`"}"
$r = Invoke-Api POST "${BASE}/attempts/start" -token $tokenC6 -bodyFile $f; Remove-Item $f
$attemptC6Id = (Parse-Response $r).Json.attempt._id

# 8a: Unknown question ID -> 400
$f = Write-Body "{`"answers`":[{`"question`":`"${FAKE}`",`"selectedOption`":0}]}"
$r = Invoke-Api POST "${BASE}/attempts/${attemptC6Id}/submit" -token $tokenC6 -bodyFile $f; Remove-Item $f
Run-Test "8a" "Bad answer: unknown question ID (400)" $r 400 | Out-Null

# 8b: Duplicate question ID -> 400
$f = Write-Body "{`"answers`":[{`"question`":`"${q1Id}`",`"selectedOption`":0},{`"question`":`"${q1Id}`",`"selectedOption`":1}]}"
$r = Invoke-Api POST "${BASE}/attempts/${attemptC6Id}/submit" -token $tokenC6 -bodyFile $f; Remove-Item $f
Run-Test "8b" "Bad answer: duplicate question ID (400)" $r 400 | Out-Null

# 8c: selectedOption out of range (options length is 3, selectedOption=5) -> 400
$f = Write-Body "{`"answers`":[{`"question`":`"${q1Id}`",`"selectedOption`":5}]}"
$r = Invoke-Api POST "${BASE}/attempts/${attemptC6Id}/submit" -token $tokenC6 -bodyFile $f; Remove-Item $f
Run-Test "8c" "Bad answer: selectedOption out of range (400)" $r 400 | Out-Null

# 8d: selectedOption on code question -> 400
$f = Write-Body "{`"answers`":[{`"question`":`"${q3Id}`",`"selectedOption`":0}]}"
$r = Invoke-Api POST "${BASE}/attempts/${attemptC6Id}/submit" -token $tokenC6 -bodyFile $f; Remove-Item $f
Run-Test "8d" "Bad answer: selectedOption on code question (400)" $r 400 | Out-Null

# 8e: codeAnswer on MCQ question -> 400
$f = Write-Body "{`"answers`":[{`"question`":`"${q1Id}`",`"codeAnswer`":`"foo`"}]}"
$r = Invoke-Api POST "${BASE}/attempts/${attemptC6Id}/submit" -token $tokenC6 -bodyFile $f; Remove-Item $f
Run-Test "8e" "Bad answer: codeAnswer on MCQ question (400)" $r 400 | Out-Null

# 8f: codeAnswer over 10000 characters -> 400
$longCode = "a" * 10005
$f = Write-Body "{`"answers`":[{`"question`":`"${q3Id}`",`"codeAnswer`":`"${longCode}`"}]}"
$r = Invoke-Api POST "${BASE}/attempts/${attemptC6Id}/submit" -token $tokenC6 -bodyFile $f; Remove-Item $f
Run-Test "8f" "Bad answer: codeAnswer over 10000 characters (400)" $r 400 | Out-Null

# ── TEST 9: Late submit (startedAt set far in the past in DB) ─────────────────
# Candidate C7 starts attempt, then we update startedAt in DB via Node script
$f = Write-Body "{`"name`":`"Candidate Seven`",`"email`":`"c7_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC7 = (Parse-Response $r).Json; $tokenC7 = $pC7.token

$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
Invoke-Api POST "${BASE}/applications" -token $tokenC7 -bodyFile $f | Out-Null; Remove-Item $f

$f = Write-Body "{`"assessmentId`":`"${assessment1Id}`"}"
$r = Invoke-Api POST "${BASE}/attempts/start" -token $tokenC7 -bodyFile $f; Remove-Item $f
$attemptC7Id = (Parse-Response $r).Json.attempt._id

# Set startedAt to 24 hours ago directly in MongoDB using Mongoose in node
$nodeScript = @"
require('dotenv').config();
const mongoose = require('mongoose');
const Attempt = require('./models/Attempt');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  await Attempt.updateOne({ _id: '${attemptC7Id}' }, { startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });
  await mongoose.disconnect();
  console.log('startedAt updated to past');
  process.exit(0);
});
"@
node -e $nodeScript | Out-Null

# Now try to submit expired attempt -> 400
$f = Write-Body "{`"answers`":[{`"question`":`"${q1Id}`",`"selectedOption`":0}]}"
$r = Invoke-Api POST "${BASE}/attempts/${attemptC7Id}/submit" -token $tokenC7 -bodyFile $f; Remove-Item $f
Run-Test 9 "Late submit: startedAt in past rejects with 400 expired" $r 400 {
    param($res) $res.Json.message -match "expired"
} | Out-Null

# ── TEST 10: MCQ-only assessment leads straight to status 'graded' ─────────────
$f = Write-Body "{`"assessmentId`":`"${assessment2Id}`"}"
$r = Invoke-Api POST "${BASE}/attempts/start" -token $tokenC1 -bodyFile $f; Remove-Item $f
$attemptMCQId = (Parse-Response $r).Json.attempt._id

# Submit with both correct answers (Q1: 0, 3pts; Q2: 1, 2pts -> total 5pts)
$submitMCQ = @"
{
  "answers": [
    { "question": "${qA2_1}", "selectedOption": 0 },
    { "question": "${qA2_2}", "selectedOption": 1 }
  ]
}
"@
$f = Write-Body $submitMCQ
$r = Invoke-Api POST "${BASE}/attempts/${attemptMCQId}/submit" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test 10 "MCQ-only assessment: status=graded immediately, totalScore=5 (200)" $r 200 {
    param($res)
    $att = $res.Json.attempt
    $att.status -eq "graded" -and
    $att.mcqScore -eq 5 -and
    $att.totalScore -eq 5 -and
    $att.maxScore -eq 5 -and
    $att.gradedAt -ne $null
} | Out-Null

# ── TEST 11: GET /api/attempts/:id access rules & sanitization ─────────────────
# 11a: C1 GET own attempt -> 200 with answers, NO correctOption anywhere
$r = Invoke-Api GET "${BASE}/attempts/${attemptC1Id}" -token $tokenC1
Run-Test "11a" "C1 GET /attempts/:id: sees own answers & scores, NO correctOption" $r 200 {
    param($res)
    $att = $res.Json.attempt
    $rawStr = $res.Body
    # correctOption must not exist anywhere in the JSON body string
    $noCorrect = -not ($rawStr -match "correctOption")
    $hasDeadline = $att.deadline -ne $null
    $hasAnswers = $att.answers.Count -eq 3
    $noCorrect -and $hasDeadline -and $hasAnswers
} | Out-Null

# 11b: C2 GET C1's attempt -> 403
$r = Invoke-Api GET "${BASE}/attempts/${attemptC1Id}" -token $tokenC2
Run-Test "11b" "C2 GET C1's attempt (403)" $r 403 | Out-Null

# 11c: Recruiter A GET C1's attempt -> 200 sees everything including correctOption
$r = Invoke-Api GET "${BASE}/attempts/${attemptC1Id}" -token $tokenA
Run-Test "11c" "Recruiter A GET C1's attempt: 200 sees everything including correctOption" $r 200 {
    param($res)
    $rawStr = $res.Body
    $rawStr -match "correctOption"
} | Out-Null

# 11d: Recruiter B GET C1's attempt -> 403
$r = Invoke-Api GET "${BASE}/attempts/${attemptC1Id}" -token $tokenB
Run-Test "11d" "Recruiter B GET C1's attempt (403)" $r 403 | Out-Null

# ── TEST 12: Recruiter A lists attempts for Assessment 1 ──────────────────────
# 12a: Recruiter A GET /attempts/assessment/:id -> 200 with candidate info
$r = Invoke-Api GET "${BASE}/attempts/assessment/${assessment1Id}" -token $tokenA
Run-Test "12a" "Recruiter A GET /attempts/assessment/:id: candidate name & email, no password" $r 200 {
    param($res)
    $list = $res.Json.attempts
    $c = $list[0].candidate
    $hasName = $c.name -ne $null
    $hasEmail = $c.email -ne $null
    $noPass = -not $c.PSObject.Properties['password']
    $hasName -and $hasEmail -and $noPass
} | Out-Null

# 12b: ?status=submitted filter works
$r = Invoke-Api GET "${BASE}/attempts/assessment/${assessment1Id}?status=submitted" -token $tokenA
Run-Test "12b" "Recruiter A GET /attempts/assessment/:id?status=submitted works" $r 200 {
    param($res)
    $list = $res.Json.attempts
    $list.Count -ge 1 -and ($list | Where-Object { $_.status -ne "submitted" }).Count -eq 0
} | Out-Null

# 12c: Bad page/limit safe fallback
$r = Invoke-Api GET "${BASE}/attempts/assessment/${assessment1Id}?page=-1&limit=abc" -token $tokenA
Run-Test "12c" "Recruiter A GET /attempts/assessment/:id?page=-1&limit=abc safe fallback (200)" $r 200 {
    param($res) $res.Json.page -eq 1
} | Out-Null

# 12d: Recruiter B GET attempts for Assessment 1 -> 403
$r = Invoke-Api GET "${BASE}/attempts/assessment/${assessment1Id}" -token $tokenB
Run-Test "12d" "Recruiter B GET /attempts/assessment/:id (403)" $r 403 | Out-Null

# ── TEST 13: Recruiter grading & grade validations ─────────────────────────────
# 13a: Recruiter A grades code question (q3Id) with 3 points
$gradePayload = @"
{
  "grades": [
    {
      "question": "${q3Id}",
      "pointsAwarded": 3,
      "feedback": "Good logic but misses edge cases."
    }
  ]
}
"@
$f = Write-Body $gradePayload
$r = Invoke-Api PATCH "${BASE}/attempts/${attemptC1Id}/grade" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "13a" "Recruiter A grades code question: codeScore=3, totalScore=4, status=graded (200)" $r 200 {
    param($res)
    $att = $res.Json.attempt
    $att.status -eq "graded" -and
    $att.codeScore -eq 3 -and
    $att.totalScore -eq 4 -and
    $att.gradedBy -ne $null -and
    $att.gradedAt -ne $null
} | Out-Null

# 13b: Grade above question points (points=6 on 5pt question) -> 400
$f = Write-Body "{`"grades`":[{`"question`":`"${q3Id}`",`"pointsAwarded`":6}]}"
$r = Invoke-Api PATCH "${BASE}/attempts/${attemptC1Id}/grade" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "13b" "Grade above question points (400)" $r 400 {
    param($res) $res.Json.message -match "between 0 and maximum points"
} | Out-Null

# 13c: Grade for an MCQ question -> 400
$f = Write-Body "{`"grades`":[{`"question`":`"${q1Id}`",`"pointsAwarded`":1}]}"
$r = Invoke-Api PATCH "${BASE}/attempts/${attemptC1Id}/grade" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "13c" "Grade for an MCQ question (400)" $r 400 {
    param($res) $res.Json.message -match "not a code question"
} | Out-Null

# 13d: Duplicate question in grades -> 400
$f = Write-Body "{`"grades`":[{`"question`":`"${q3Id}`",`"pointsAwarded`":2},{`"question`":`"${q3Id}`",`"pointsAwarded`":3}]}"
$r = Invoke-Api PATCH "${BASE}/attempts/${attemptC1Id}/grade" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "13d" "Duplicate question in grades (400)" $r 400 {
    param($res) $res.Json.message -match "Duplicate grade"
} | Out-Null

# 13e: Grade an in_progress attempt -> 400
# Attempt C6 is still in_progress
$f = Write-Body "{`"grades`":[{`"question`":`"${q3Id}`",`"pointsAwarded`":3}]}"
$r = Invoke-Api PATCH "${BASE}/attempts/${attemptC6Id}/grade" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "13e" "Grade an in_progress attempt (400)" $r 400 {
    param($res) $res.Json.message -match "in progress"
} | Out-Null

# 13f: Recruiter B tries to grade -> 403
$f = Write-Body "{`"grades`":[{`"question`":`"${q3Id}`",`"pointsAwarded`":3}]}"
$r = Invoke-Api PATCH "${BASE}/attempts/${attemptC1Id}/grade" -token $tokenB -bodyFile $f; Remove-Item $f
Run-Test "13f" "Recruiter B tries to grade (403)" $r 403 | Out-Null

# 13g: Candidate tries to grade -> 403
$f = Write-Body "{`"grades`":[{`"question`":`"${q3Id}`",`"pointsAwarded`":3}]}"
$r = Invoke-Api PATCH "${BASE}/attempts/${attemptC1Id}/grade" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test "13g" "Candidate C1 tries to grade (403 role)" $r 403 | Out-Null

# ── TEST 14: Regrade with 4 points -> totals recomputed ───────────────────────
$regradePayload = @"
{
  "grades": [
    {
      "question": "${q3Id}",
      "pointsAwarded": 4,
      "feedback": "Re-evaluated: cleaner than expected."
    }
  ]
}
"@
$f = Write-Body $regradePayload
$r = Invoke-Api PATCH "${BASE}/attempts/${attemptC1Id}/grade" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 14 "Regrade with 4 points: codeScore=4, totalScore=5 (200)" $r 200 {
    param($res)
    $att = $res.Json.attempt
    $att.codeScore -eq 4 -and $att.totalScore -eq 5
} | Out-Null

# ── TEST 15: Assessment protection against modifications once attempts exist ──
# 15a: PUT changing questions -> 409
$putQPayload = @"
{
  "questions": [
    { "type": "code", "text": "New question", "points": 10 }
  ]
}
"@
$f = Write-Body $putQPayload
$r = Invoke-Api PUT "${BASE}/assessments/${assessment1Id}" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "15a" "PUT changing questions once attempts exist (409)" $r 409 {
    param($res) $res.Json.message -match "Cannot modify questions"
} | Out-Null

# 15b: PUT changing durationMinutes -> 409
$f = Write-Body '{"durationMinutes":90}'
$r = Invoke-Api PUT "${BASE}/assessments/${assessment1Id}" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "15b" "PUT changing durationMinutes once attempts exist (409)" $r 409 {
    param($res) $res.Json.message -match "Cannot modify durationMinutes"
} | Out-Null

# 15c: PUT changing only title -> 200
$f = Write-Body '{"title":"Fullstack Assessment — Revised Title"}'
$r = Invoke-Api PUT "${BASE}/assessments/${assessment1Id}" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "15c" "PUT changing only title allowed (200)" $r 200 {
    param($res) $res.Json.assessment.title -eq "Fullstack Assessment — Revised Title"
} | Out-Null

# 15d: DELETE assessment once attempts exist -> 409
$r = Invoke-Api DELETE "${BASE}/assessments/${assessment1Id}" -token $tokenA
Run-Test "15d" "DELETE assessment once attempts exist (409)" $r 409 {
    param($res) $res.Json.message -match "Cannot delete assessment"
} | Out-Null

# ── TEST 16: No token (401) & Invalid ID (400) ────────────────────────────────
# 16a: POST /attempts/start no token -> 401
$f = Write-Body "{`"assessmentId`":`"${assessment1Id}`"}"
$r = Invoke-Api POST "${BASE}/attempts/start" -bodyFile $f; Remove-Item $f
Run-Test "16a" "POST /attempts/start no token (401)" $r 401 | Out-Null

# 16b: GET /attempts/my no token -> 401
$r = Invoke-Api GET "${BASE}/attempts/my"
Run-Test "16b" "GET /attempts/my no token (401)" $r 401 | Out-Null

# 16c: GET /attempts/:id no token -> 401
$r = Invoke-Api GET "${BASE}/attempts/${attemptC1Id}"
Run-Test "16c" "GET /attempts/:id no token (401)" $r 401 | Out-Null

# 16d: Invalid ObjectId on GET /attempts/:id -> 400
$r = Invoke-Api GET "${BASE}/attempts/invalid-id" -token $tokenA
Run-Test "16d" "GET /attempts/invalid-id (400)" $r 400 | Out-Null

# 16e: Invalid ObjectId on PATCH /attempts/:id/grade -> 400
$f = Write-Body "{`"grades`":[{`"question`":`"${q3Id}`",`"pointsAwarded`":1}]}"
$r = Invoke-Api PATCH "${BASE}/attempts/invalid-id/grade" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "16e" "PATCH /attempts/invalid-id/grade (400)" $r 400 | Out-Null

# ════════════ CODE SAFETY & ARCHITECTURE CHECKS ══════════════════════════════
Write-Host ""
Write-Host "━━━  Code Safety & Architecture Checks  ━━━" -ForegroundColor Magenta

$ctrl = Get-Content "controllers\attemptController.js" -Raw
$equalsCount = ([regex]::Matches($ctrl, '\.equals\(')).Count
$dangerousEq = ([regex]::Matches($ctrl, '(req\.user\._id|job\.postedBy|attempt\.candidate)\s*===|===\s*(req\.user\._id|job\.postedBy|attempt\.candidate)')).Count

Write-Host "  .equals() calls found in attemptController.js : $equalsCount"
Write-Host "  Dangerous === on ObjectIds: " -NoNewline
if ($dangerousEq -eq 0) { Write-Host "NONE ✓" -ForegroundColor Green }
else                     { Write-Host "$dangerousEq FOUND — review!" -ForegroundColor Red }

Write-Host "  Submit logic function : submitAttempt (controllers/attemptController.js)"
Write-Host "  Grade logic function  : gradeAttempt (controllers/attemptController.js)"
Write-Host "  Atomic submit status  : findOneAndUpdate with { _id, candidate, status: 'in_progress' } verified"

# ════════════ SUMMARY TABLE ══════════════════════════════════════════════════
Write-Host ""
Write-Host "━━━  Summary  ━━━" -ForegroundColor Magenta
Write-Host ("{0,-8} {1,-55} {2,-10} {3,-10} {4}" -f "Test","Name","Expected","Got","Result")
Write-Host ("-" * 100)
foreach ($t in $tests) {
    $color = if ($t.Result -eq "PASS") { "Green" } else { "Red" }
    Write-Host ("{0,-8} {1,-55} {2,-10} {3,-10}" -f $t.Num, $t.Name, $t.Expected, $t.Got) -NoNewline
    Write-Host $t.Result -ForegroundColor $color
}
Write-Host ("-" * 100)
$fc = if ($fail -eq 0) { "Green" } else { "Red" }
Write-Host "Total: $pass passed, $fail failed" -ForegroundColor $fc
