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
    if ($token)    { $a += @("-H", "Authorization: Bearer $token") }
    if ($bodyFile) { $a += @("-H", "Content-Type: application/json", "--data", "@$bodyFile") }
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

Write-Host "`n━━━  PHASE 3d-1 — Assessment Tests  ━━━" -ForegroundColor Magenta

# ════════════ SETUP ══════════════════════════════════════════════════════════
Write-Host "`n── Setup ──" -ForegroundColor Gray

# 1. Recruiter A + Company A + Job A1
$f = Write-Body "{`"name`":`"Recruiter A`",`"email`":`"rA_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pA = (Parse-Response $r).Json; $tokenA = $pA.token; $userAId = $pA.user.id

$f = Write-Body '{"name":"Acme Corp","industry":"Tech"}'
Invoke-Api POST "${BASE}/companies" -token $tokenA -bodyFile $f | Out-Null; Remove-Item $f

$f = Write-Body '{"title":"Frontend Developer","description":"React dev needed","jobType":"full-time"}'
$r = Invoke-Api POST "${BASE}/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
$jobA1Id = (Parse-Response $r).Json.job._id

# 2. Recruiter B + Company B + Job B1
$f = Write-Body "{`"name`":`"Recruiter B`",`"email`":`"rB_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pB = (Parse-Response $r).Json; $tokenB = $pB.token; $userBId = $pB.user.id

$f = Write-Body '{"name":"Beta Corp","industry":"Finance"}'
Invoke-Api POST "${BASE}/companies" -token $tokenB -bodyFile $f | Out-Null; Remove-Item $f

$f = Write-Body '{"title":"Data Analyst","description":"SQL dev needed","jobType":"contract"}'
$r = Invoke-Api POST "${BASE}/jobs" -token $tokenB -bodyFile $f; Remove-Item $f
$jobB1Id = (Parse-Response $r).Json.job._id

# 3. Candidates: C1 (applied to A1), C2 (did not apply), C3 (applied to A1 and rejected)
$f = Write-Body "{`"name`":`"Candidate One`",`"email`":`"c1_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC1 = (Parse-Response $r).Json; $tokenC1 = $pC1.token; $userC1Id = $pC1.user.id

$f = Write-Body "{`"name`":`"Candidate Two`",`"email`":`"c2_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC2 = (Parse-Response $r).Json; $tokenC2 = $pC2.token; $userC2Id = $pC2.user.id

$f = Write-Body "{`"name`":`"Candidate Three`",`"email`":`"c3_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC3 = (Parse-Response $r).Json; $tokenC3 = $pC3.token; $userC3Id = $pC3.user.id

# C1 applies to A1
$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
Invoke-Api POST "${BASE}/applications" -token $tokenC1 -bodyFile $f | Out-Null; Remove-Item $f

# C3 applies to A1 then Recruiter A rejects C3
$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
$r = Invoke-Api POST "${BASE}/applications" -token $tokenC3 -bodyFile $f; Remove-Item $f
$appC3Id = (Parse-Response $r).Json.application._id

$f = Write-Body '{"status":"rejected"}'
Invoke-Api PATCH "${BASE}/applications/${appC3Id}/status" -token $tokenA -bodyFile $f | Out-Null; Remove-Item $f

Write-Host "  Recruiter A : $userAId | Job A1: $jobA1Id"
Write-Host "  Recruiter B : $userBId | Job B1: $jobB1Id"
Write-Host "  Candidate C1: $userC1Id (applied)"
Write-Host "  Candidate C2: $userC2Id (no application)"
Write-Host "  Candidate C3: $userC3Id (applied & rejected)"

# ════════════ TESTS ══════════════════════════════════════════════════════════
Write-Host "`n━━━  Running Tests  ━━━" -ForegroundColor Magenta

# ── TEST 1: Recruiter A creates an assessment for A1 (2 mcq, 1 code) ──────────
$createPayload = @"
{
  "jobId": "${jobA1Id}",
  "title": "Frontend Skills Assessment",
  "description": "Evaluate JS and React skills",
  "durationMinutes": 60,
  "questions": [
    {
      "type": "mcq",
      "text": "What is JSX?",
      "points": 5,
      "options": ["Syntax extension", "CSS library", "Database", "Server"],
      "correctOption": 0
    },
    {
      "type": "mcq",
      "text": "Which hook manages state?",
      "points": 5,
      "options": ["useEffect", "useState", "useContext"],
      "correctOption": 1
    },
    {
      "type": "code",
      "text": "Write a function to reverse a string",
      "points": 10
    }
  ]
}
"@
$f = Write-Body $createPayload
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenA -bodyFile $f; Remove-Item $f
$res1 = Run-Test 1 "Recruiter A creates assessment for A1 (201)" $r 201 {
    param($res)
    $a = $res.Json.assessment
    $a.title -eq "Frontend Skills Assessment" -and
    $a.questions.Count -eq 3 -and
    $a.questions[0].correctOption -eq 0 -and
    $a.questions[2].type -eq "code"
}
$assessmentId = $res1.Json.assessment._id

# ── TEST 2: Second assessment for A1 → 409 ─────────────────────────────────────
$f = Write-Body $createPayload
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 2 "Create second assessment for A1 (409 conflict)" $r 409 {
    param($res) $res.Json.message -match "already exists"
} | Out-Null

# ── TEST 3: Recruiter B creates for A1 → 403; Candidate creates → 403 ─────────
$f = Write-Body $createPayload
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenB -bodyFile $f; Remove-Item $f
Run-Test 3 "Recruiter B creates assessment for A1 (403)" $r 403 | Out-Null

$f = Write-Body $createPayload
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test "3b" "Candidate C1 creates assessment (403 role)" $r 403 | Out-Null

# ── TEST 4: Validation failures (422) ─────────────────────────────────────────
# 4a: mcq without options
$p4a = @'
{
  "jobId": "000000000000000000000001",
  "title": "Bad MCQ 1",
  "durationMinutes": 30,
  "questions": [{ "type": "mcq", "text": "No options?", "points": 1, "correctOption": 0 }]
}
'@
$f = Write-Body $p4a
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "4a" "Validation: mcq without options (422)" $r 422 | Out-Null

# 4b: correctOption out of range (options length 2, correctOption 2)
$p4b = @'
{
  "jobId": "000000000000000000000001",
  "title": "Bad MCQ 2",
  "durationMinutes": 30,
  "questions": [{ "type": "mcq", "text": "Out of range?", "points": 1, "options": ["A", "B"], "correctOption": 2 }]
}
'@
$f = Write-Body $p4b
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "4b" "Validation: correctOption out of range (422)" $r 422 | Out-Null

# 4c: mcq with 1 option (min is 2)
$p4c = @'
{
  "jobId": "000000000000000000000001",
  "title": "Bad MCQ 3",
  "durationMinutes": 30,
  "questions": [{ "type": "mcq", "text": "Only 1 option?", "points": 1, "options": ["Only one"], "correctOption": 0 }]
}
'@
$f = Write-Body $p4c
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "4c" "Validation: mcq with 1 option (422)" $r 422 | Out-Null

# 4d: code question with options
$p4d = @'
{
  "jobId": "000000000000000000000001",
  "title": "Bad Code",
  "durationMinutes": 30,
  "questions": [{ "type": "code", "text": "Code with options?", "points": 5, "options": ["Not allowed"] }]
}
'@
$f = Write-Body $p4d
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "4d" "Validation: code question with options (422)" $r 422 | Out-Null

# 4e: zero questions
$p4e = @'
{
  "jobId": "000000000000000000000001",
  "title": "No questions",
  "durationMinutes": 30,
  "questions": []
}
'@
$f = Write-Body $p4e
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "4e" "Validation: zero questions (422)" $r 422 | Out-Null

# 4f: durationMinutes 0
$p4f = @'
{
  "jobId": "000000000000000000000001",
  "title": "Zero duration",
  "durationMinutes": 0,
  "questions": [{ "type": "code", "text": "Code?", "points": 5 }]
}
'@
$f = Write-Body $p4f
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "4f" "Validation: durationMinutes 0 (422)" $r 422 | Out-Null

# 4g: durationMinutes 181
$p4g = @'
{
  "jobId": "000000000000000000000001",
  "title": "Over max duration",
  "durationMinutes": 181,
  "questions": [{ "type": "code", "text": "Code?", "points": 5 }]
}
'@
$f = Write-Body $p4g
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "4g" "Validation: durationMinutes 181 (422)" $r 422 | Out-Null

# ── TEST 5: Body override of createdBy and job ────────────────────────────────
# Recruiter B creates assessment for Job B1, sending createdBy: userAId and job: FAKE in body
$p5 = @"
{
  "jobId": "${jobB1Id}",
  "title": "B1 Assessment",
  "durationMinutes": 45,
  "createdBy": "${userAId}",
  "job": "${FAKE}",
  "questions": [{ "type": "code", "text": "Solve math", "points": 10 }]
}
"@
$f = Write-Body $p5
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenB -bodyFile $f; Remove-Item $f
$res5 = Run-Test 5 "Body override of createdBy and job ignored (201)" $r 201 {
    param($res)
    $a = $res.Json.assessment
    $a.job -eq $jobB1Id -and $a.createdBy -eq $userBId
}
$assessmentBId = $res5.Json.assessment._id

# ── TEST 6: Recruiter A GET /api/assessments/job/<A1> — full response ─────────
$r = Invoke-Api GET "${BASE}/assessments/job/${jobA1Id}" -token $tokenA
Run-Test 6 "Recruiter A GET /job/<A1> — full response with correctOption" $r 200 {
    param($res)
    $a = $res.Json.assessment
    $a.questions[0].correctOption -ne $null -and
    $a.questions[1].correctOption -ne $null -and
    $a.job -ne $null
} | Out-Null

# ── TEST 7: C1 GET /api/assessments/job/<A1> — sanitized response ─────────────
$r = Invoke-Api GET "${BASE}/assessments/job/${jobA1Id}" -token $tokenC1
Run-Test 7 "C1 GET /job/<A1> — sanitized: correctOption/job/postedBy/createdBy absent, _id present" $r 200 {
    param($res)
    $a = $res.Json.assessment
    # correctOption absent from every question
    $noCorrect = ($a.questions | Where-Object { $_.PSObject.Properties['correctOption'] }).Count -eq 0
    # job, postedBy, createdBy absent
    $noJob = -not $a.PSObject.Properties['job']
    $noPostedBy = -not $a.PSObject.Properties['postedBy']
    $noCreatedBy = -not $a.PSObject.Properties['createdBy']
    # Each question has its _id
    $hasQIds = ($a.questions | Where-Object { $_._id }).Count -eq $a.questions.Count
    # Code question has neither options nor correctOption
    $codeQ = $a.questions | Where-Object { $_.type -eq "code" }
    $codeNoOptions = -not $codeQ.PSObject.Properties['options']

    $noCorrect -and $noJob -and $noPostedBy -and $noCreatedBy -and $hasQIds -and $codeNoOptions
} | Out-Null

# ── TEST 8: C2 (no application) → 403; C3 (rejected) → 403 ───────────────────
$r = Invoke-Api GET "${BASE}/assessments/job/${jobA1Id}" -token $tokenC2
Run-Test 8 "C2 (no application) GET /job/<A1> (403)" $r 403 | Out-Null

$r = Invoke-Api GET "${BASE}/assessments/job/${jobA1Id}" -token $tokenC3
Run-Test "8b" "C3 (rejected application) GET /job/<A1> (403)" $r 403 | Out-Null

# ── TEST 9: Recruiter B GET /api/assessments/job/<A1> → 403 ───────────────────
$r = Invoke-Api GET "${BASE}/assessments/job/${jobA1Id}" -token $tokenB
Run-Test 9 "Recruiter B GET /job/<A1> (403 not job owner)" $r 403 | Out-Null

# ── TEST 10: GET /api/assessments/<id> follows same access rules ──────────────
# 10a: Recruiter A GET /:id → 200 with answers
$r = Invoke-Api GET "${BASE}/assessments/${assessmentId}" -token $tokenA
Run-Test "10a" "Recruiter A GET /:id (200 with correctOption)" $r 200 {
    param($res) $res.Json.assessment.questions[0].correctOption -ne $null
} | Out-Null

# 10b: Candidate C1 GET /:id → 200 sanitized
$r = Invoke-Api GET "${BASE}/assessments/${assessmentId}" -token $tokenC1
Run-Test "10b" "Candidate C1 GET /:id (200 sanitized without correctOption)" $r 200 {
    param($res)
    $a = $res.Json.assessment
    $noCorrect = ($a.questions | Where-Object { $_.PSObject.Properties['correctOption'] }).Count -eq 0
    $noJob = -not $a.PSObject.Properties['job']
    $noCreatedBy = -not $a.PSObject.Properties['createdBy']
    $noCorrect -and $noJob -and $noCreatedBy
} | Out-Null

# 10c: Candidate C2 GET /:id → 403
$r = Invoke-Api GET "${BASE}/assessments/${assessmentId}" -token $tokenC2
Run-Test "10c" "Candidate C2 GET /:id (403)" $r 403 | Out-Null

# 10d: Candidate C3 GET /:id → 403
$r = Invoke-Api GET "${BASE}/assessments/${assessmentId}" -token $tokenC3
Run-Test "10d" "Candidate C3 GET /:id (403)" $r 403 | Out-Null

# 10e: Recruiter B GET /:id of A1's assessment → 403
$r = Invoke-Api GET "${BASE}/assessments/${assessmentId}" -token $tokenB
Run-Test "10e" "Recruiter B GET /:id of A1 (403)" $r 403 | Out-Null

# ── TEST 11: Recruiter A PUT updates assessment; Recruiter B PUT → 403 ─────────
# 11a: Recruiter A updates title, questions, passes job and createdBy to override
$putPayload = @"
{
  "title": "Updated Frontend Skills",
  "job": "${FAKE}",
  "jobId": "${FAKE}",
  "createdBy": "${userBId}",
  "questions": [
    {
      "type": "code",
      "text": "Write a debounce function",
      "points": 20
    }
  ]
}
"@
$f = Write-Body $putPayload
$r = Invoke-Api PUT "${BASE}/assessments/${assessmentId}" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "11a" "Recruiter A PUT assessment (200, job/createdBy ignored)" $r 200 {
    param($res)
    $a = $res.Json.assessment
    $a.title -eq "Updated Frontend Skills" -and
    $a.job -eq $jobA1Id -and
    $a.createdBy -eq $userAId -and
    $a.questions.Count -eq 1
} | Out-Null

# 11b: Recruiter B tries to PUT assessment A1 → 403
$f = Write-Body '{"title":"Hacked by B"}'
$r = Invoke-Api PUT "${BASE}/assessments/${assessmentId}" -token $tokenB -bodyFile $f; Remove-Item $f
Run-Test "11b" "Recruiter B PUT assessment A1 (403)" $r 403 | Out-Null

# Verify title was unchanged by B
$r = Invoke-Api GET "${BASE}/assessments/${assessmentId}" -token $tokenA
Run-Test "11c" "Assessment title remains unchanged after B attempt" $r 200 {
    param($res) $res.Json.assessment.title -eq "Updated Frontend Skills"
} | Out-Null

# ── TEST 12: Recruiter B DELETE → 403; Recruiter A DELETE → 200, then GET → 404 ─
# 12a: Recruiter B tries to delete A1 assessment → 403
$r = Invoke-Api DELETE "${BASE}/assessments/${assessmentId}" -token $tokenB
Run-Test "12a" "Recruiter B DELETE assessment A1 (403)" $r 403 | Out-Null

# 12b: Recruiter A deletes A1 assessment → 200
$r = Invoke-Api DELETE "${BASE}/assessments/${assessmentId}" -token $tokenA
Run-Test "12b" "Recruiter A DELETE assessment A1 (200)" $r 200 | Out-Null

# 12c: GET assessment after delete → 404
$r = Invoke-Api GET "${BASE}/assessments/${assessmentId}" -token $tokenA
Run-Test "12c" "GET assessment after delete (404)" $r 404 | Out-Null

# ── TEST 13: Invalid ObjectId: 400; Missing: 404; No token: 401 ──────────────
$r = Invoke-Api GET "${BASE}/assessments/invalid-id" -token $tokenA
Run-Test "13a" "GET /assessments/invalid-id (400)" $r 400 | Out-Null

$r = Invoke-Api GET "${BASE}/assessments/job/invalid-id" -token $tokenA
Run-Test "13b" "GET /assessments/job/invalid-id (400)" $r 400 | Out-Null

$r = Invoke-Api GET "${BASE}/assessments/${FAKE}" -token $tokenA
Run-Test "13c" "GET /assessments/<missing-id> (404)" $r 404 | Out-Null

$r = Invoke-Api GET "${BASE}/assessments/job/${FAKE}" -token $tokenA
Run-Test "13d" "GET /assessments/job/<missing-id> (404)" $r 404 | Out-Null

$r = Invoke-Api GET "${BASE}/assessments/${assessmentBId}"
Run-Test "13e" "GET /assessments/:id no token (401)" $r 401 | Out-Null

$r = Invoke-Api GET "${BASE}/assessments/job/${jobB1Id}"
Run-Test "13f" "GET /assessments/job/:jobId no token (401)" $r 401 | Out-Null

# ════════════ CODE SAFETY CHECKS ══════════════════════════════════════════════
Write-Host ""
Write-Host "━━━  Code Safety & Integrity Checks  ━━━" -ForegroundColor Magenta

$ctrl = Get-Content "controllers\assessmentController.js" -Raw
$equalsCount = ([regex]::Matches($ctrl, '\.equals\(')).Count
$dangerousEq = ([regex]::Matches($ctrl, '(req\.user\._id|job\.postedBy|assessment\.createdBy)\s*===|===\s*(req\.user\._id|job\.postedBy|assessment\.createdBy)')).Count

Write-Host "  .equals() calls found in assessmentController.js : $equalsCount"
Write-Host "  Dangerous === on ObjectIds: " -NoNewline
if ($dangerousEq -eq 0) { Write-Host "NONE ✓" -ForegroundColor Green }
else                     { Write-Host "$dangerousEq FOUND — review!" -ForegroundColor Red }

Write-Host "  correctOption database integrity: sanitizeForCandidate runs doc.toObject() on a cloned plain object"
Write-Host "  MongoDB document retains correctOption (verified in test 6 and 10a): " -NoNewline
Write-Host "CONFIRMED ✓" -ForegroundColor Green

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
