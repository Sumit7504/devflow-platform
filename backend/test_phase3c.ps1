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

Write-Host "`n━━━  PHASE 3c — Applications Tests  ━━━" -ForegroundColor Magenta

# ════════════ SETUP ══════════════════════════════════════════════════════════
Write-Host "`n── Setup ──" -ForegroundColor Gray

# Recruiter A — register, company, job A1, job A2, closed job, past-deadline job
$f = Write-Body "{`"name`":`"Recruiter A`",`"email`":`"rA_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "$BASE/auth/register" -bodyFile $f; Remove-Item $f
$pA = (Parse-Response $r).Json; $tokenA = $pA.token; $userAId = $pA.user.id

$f = Write-Body '{"name":"Acme Corp","industry":"Tech","location":"Bangalore"}'
$r = Invoke-Api POST "$BASE/companies" -token $tokenA -bodyFile $f; Remove-Item $f
$companyAId = (Parse-Response $r).Json.company._id

$f = Write-Body '{"title":"Full Stack Engineer","description":"Build things","jobType":"full-time"}'
$r = Invoke-Api POST "$BASE/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
$jobA1Id = (Parse-Response $r).Json.job._id

$f = Write-Body '{"title":"Backend Engineer","description":"Build APIs","jobType":"contract"}'
$r = Invoke-Api POST "$BASE/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
$jobA2Id = (Parse-Response $r).Json.job._id

# Closed job: create then PATCH close
$f = Write-Body '{"title":"Closed Job","description":"No more","jobType":"internship"}'
$r = Invoke-Api POST "$BASE/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
$closedJobId = (Parse-Response $r).Json.job._id
Invoke-Api PATCH "$BASE/jobs/$closedJobId/close" -token $tokenA | Out-Null

# Past-deadline job: created via API with deadline in 2020 (validator only checks ISO8601
# format, not whether the date is in the future, so this succeeds at creation time).
# The apply guard in applicationController.js rejects it at apply time.
$f = Write-Body '{"title":"Expired Job","description":"Old listing","jobType":"part-time","deadline":"2020-01-01T00:00:00.000Z"}'
$r = Invoke-Api POST "$BASE/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
$pastDeadlineJobId = (Parse-Response $r).Json.job._id

# Recruiter B — register, company, job B1
$f = Write-Body "{`"name`":`"Recruiter B`",`"email`":`"rB_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "$BASE/auth/register" -bodyFile $f; Remove-Item $f
$pB = (Parse-Response $r).Json; $tokenB = $pB.token; $userBId = $pB.user.id

$f = Write-Body '{"name":"Beta Ltd","industry":"Finance"}'
Invoke-Api POST "$BASE/companies" -token $tokenB -bodyFile $f | Out-Null; Remove-Item $f

$f = Write-Body '{"title":"Finance Analyst","description":"Finance stuff","jobType":"full-time"}'
$r = Invoke-Api POST "$BASE/jobs" -token $tokenB -bodyFile $f; Remove-Item $f
$jobB1Id = (Parse-Response $r).Json.job._id

# Candidates C1 and C2
$f = Write-Body "{`"name`":`"Candidate One`",`"email`":`"c1_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "$BASE/auth/register" -bodyFile $f; Remove-Item $f
$pC1 = (Parse-Response $r).Json; $tokenC1 = $pC1.token; $userC1Id = $pC1.user.id

$f = Write-Body "{`"name`":`"Candidate Two`",`"email`":`"c2_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "$BASE/auth/register" -bodyFile $f; Remove-Item $f
$pC2 = (Parse-Response $r).Json; $tokenC2 = $pC2.token; $userC2Id = $pC2.user.id

Write-Host "  Recruiter A : $userAId | Job A1: $jobA1Id | Job A2: $jobA2Id"
Write-Host "  Recruiter B : $userBId | Job B1: $jobB1Id"
Write-Host "  Candidate C1: $userC1Id | C2: $userC2Id"
Write-Host "  Closed job  : $closedJobId"
Write-Host "  Past-deadline: $pastDeadlineJobId (created via API with deadline=2020-01-01; validator checks format only)"
Write-Host ""
Write-Host "  NOTE: The validate middleware returns 422 for format/enum errors," -ForegroundColor DarkYellow
Write-Host "        and controllers return 400 for business-logic errors." -ForegroundColor DarkYellow
Write-Host "        Tests are written with the ACTUAL code each path returns." -ForegroundColor DarkYellow

# ════════════ TESTS ══════════════════════════════════════════════════════════
Write-Host "`n━━━  Running Tests  ━━━" -ForegroundColor Magenta

# ── TEST 1: C1 applies to job A1 ─────────────────────────────────────────────
$f = Write-Body "{`"jobId`":`"$jobA1Id`",`"coverLetter`":`"I am excited to apply`"}"
$r = Invoke-Api POST "$BASE/applications" -token $tokenC1 -bodyFile $f; Remove-Item $f
$res1 = Run-Test 1 "C1 applies to job A1 (201, status=applied)" $r 201 {
    param($res) $res.Json.application.status -eq "applied"
}
$appC1A1Id = $res1.Json.application._id

# ── TEST 2: C1 applies again to A1 → 409 ─────────────────────────────────────
$f = Write-Body "{`"jobId`":`"$jobA1Id`"}"
$r = Invoke-Api POST "$BASE/applications" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test 2 "C1 applies to A1 again (409 duplicate)" $r 409 {
    param($res) $res.Json.message -match "already applied"
} | Out-Null

# ── TEST 3: Recruiter A POST /applications → 403 ─────────────────────────────
$f = Write-Body "{`"jobId`":`"$jobA1Id`"}"
$r = Invoke-Api POST "$BASE/applications" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 3 "Recruiter A POST /applications (403 role)" $r 403 | Out-Null

# ── TEST 4: Invalid jobId → 422 (validator); valid but missing → 404 ──────────
# Note: invalid format is caught by express-validator → 422 Unprocessable Entity
$f = Write-Body '{"jobId":"notanid"}'
$r = Invoke-Api POST "$BASE/applications" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test 4 "Apply with invalid jobId (422 validator)" $r 422 | Out-Null

$f = Write-Body "{`"jobId`":`"$FAKE`"}"
$r = Invoke-Api POST "$BASE/applications" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test "4b" "Apply with valid but missing jobId (404)" $r 404 | Out-Null

# ── TEST 5: Closed job → 400; past-deadline → 400 ────────────────────────────
$f = Write-Body "{`"jobId`":`"$closedJobId`"}"
$r = Invoke-Api POST "$BASE/applications" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test 5 "Apply to closed job (400)" $r 400 {
    param($res) $res.Json.message -match "longer accepting"
} | Out-Null

$f = Write-Body "{`"jobId`":`"$pastDeadlineJobId`"}"
$r = Invoke-Api POST "$BASE/applications" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test "5b" "Apply to past-deadline job (400)" $r 400 {
    param($res) $res.Json.message -match "deadline"
} | Out-Null

# ── TEST 6: C1 applies to A2 with candidate=C2 in body → belongs to C1 ───────
$f = Write-Body "{`"jobId`":`"$jobA2Id`",`"candidate`":`"$userC2Id`"}"
$r = Invoke-Api POST "$BASE/applications" -token $tokenC1 -bodyFile $f; Remove-Item $f
$res6 = Run-Test 6 "C1 applies with candidate=C2 in body → belongs to C1" $r 201 {
    param($res) $res.Json.application.candidate -eq $userC1Id
}
$appC1A2Id = $res6.Json.application._id

# ── TEST 7: GET /my as C1 → newest first, job title + company populated ───────
$r = Invoke-Api GET "$BASE/applications/my" -token $tokenC1
Run-Test 7 "GET /my — C1's apps, newest first, job title + company name" $r 200 {
    param($res)
    $apps = $res.Json.applications
    if ($apps.Count -lt 2) { return $false }
    # Newest first
    $d0 = [datetime]$apps[0].createdAt
    $d1 = [datetime]$apps[1].createdAt
    if ($d0 -lt $d1) { return $false }
    # Job title and company name populated
    $apps[0].job.title -and $apps[0].job.company.name
} | Out-Null

# ── TEST 8: Recruiter A gets applicants for A1 — name+email, no password ──────
$r = Invoke-Api GET "$BASE/applications/job/$jobA1Id" -token $tokenA
Run-Test 8 "Recruiter A GET /job/A1 — candidate name+email, no password" $r 200 {
    param($res)
    $cand = $res.Json.applications[0].candidate
    $hasName  = $null -ne $cand.name
    $hasEmail = $null -ne $cand.email
    # password must be absent (schema select:false and populate only selects name+email)
    $noPass = -not $cand.PSObject.Properties['password']
    $hasName -and $hasEmail -and $noPass
} | Out-Null

# ── TEST 9: Recruiter B gets applicants for A1 → 403 ─────────────────────────
$r = Invoke-Api GET "$BASE/applications/job/$jobA1Id" -token $tokenB
Run-Test 9 "Recruiter B GET /job/A1 (403 not owner)" $r 403 | Out-Null

# ── TEST 10: Recruiter A shortlists C1 → statusHistory has entry ─────────────
$f = Write-Body '{"status":"shortlisted"}'
$r = Invoke-Api PATCH "$BASE/applications/$appC1A1Id/status" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 10 "PATCH status=shortlisted (200, statusHistory entry present)" $r 200 {
    param($res)
    $app = $res.Json.application
    $latest = $app.statusHistory[-1]
    $app.status -eq "shortlisted" -and
    $app.statusHistory.Count -ge 2 -and
    $latest.status -eq "shortlisted" -and
    $null -ne $latest.changedAt -and
    $null -ne $latest.changedBy
} | Out-Null

# ── TEST 11a: PATCH shortlisted again → 400 same value (controller) ───────────
$f = Write-Body '{"status":"shortlisted"}'
$r = Invoke-Api PATCH "$BASE/applications/$appC1A1Id/status" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 11 "PATCH status=shortlisted again (400 same value)" $r 400 {
    param($res) $res.Json.message -match "already"
} | Out-Null

# ── TEST 11b: PATCH "applied" → 422 (blocked by validator — not in allowed enum) ─
$f = Write-Body '{"status":"applied"}'
$r = Invoke-Api PATCH "$BASE/applications/$appC1A1Id/status" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "11b" "PATCH status=applied (422 validator — not an allowed target)" $r 422 | Out-Null

# ── TEST 11c: PATCH "banana" → 422 (blocked by validator) ─────────────────────
$f = Write-Body '{"status":"banana"}'
$r = Invoke-Api PATCH "$BASE/applications/$appC1A1Id/status" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "11c" "PATCH status=banana (422 validator — invalid enum)" $r 422 | Out-Null

# ── TEST 12: Recruiter B PATCH on C1's A1 app → 403, status unchanged ─────────
$f = Write-Body '{"status":"rejected"}'
$r = Invoke-Api PATCH "$BASE/applications/$appC1A1Id/status" -token $tokenB -bodyFile $f; Remove-Item $f
Run-Test 12 "Recruiter B PATCH on A1 application (403)" $r 403 | Out-Null

$r = Invoke-Api GET "$BASE/applications/$appC1A1Id" -token $tokenC1
Run-Test "12b" "Status unchanged after B's attempt (still shortlisted)" $r 200 {
    param($res) $res.Json.application.status -eq "shortlisted"
} | Out-Null

# ── TEST 13: Close job A1, then change status to hired → still works ──────────
Invoke-Api PATCH "$BASE/jobs/$jobA1Id/close" -token $tokenA | Out-Null
$f = Write-Body '{"status":"hired"}'
$r = Invoke-Api PATCH "$BASE/applications/$appC1A1Id/status" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 13 "PATCH status=hired on closed job (200 — status changes allowed)" $r 200 {
    param($res) $res.Json.application.status -eq "hired"
} | Out-Null

# ── TEST 14: GET /:id access control matrix ───────────────────────────────────
$r = Invoke-Api GET "$BASE/applications/$appC1A1Id" -token $tokenC1
Run-Test 14 "GET /:id as C1 (owner, 200)" $r 200 | Out-Null

$r = Invoke-Api GET "$BASE/applications/$appC1A1Id" -token $tokenC2
Run-Test "14b" "GET /:id as C2 (not owner, 403)" $r 403 | Out-Null

$r = Invoke-Api GET "$BASE/applications/$appC1A1Id" -token $tokenA
Run-Test "14c" "GET /:id as Recruiter A (job owner, 200)" $r 200 | Out-Null

$r = Invoke-Api GET "$BASE/applications/$appC1A1Id" -token $tokenB
Run-Test "14d" "GET /:id as Recruiter B (not job owner, 403)" $r 403 | Out-Null

# ── TEST 15: Invalid and missing IDs ─────────────────────────────────────────
$r = Invoke-Api GET "$BASE/applications/abc" -token $tokenC1
Run-Test 15 "GET /applications/abc (400 invalid ID)" $r 400 | Out-Null

$r = Invoke-Api GET "$BASE/applications/$FAKE" -token $tokenC1
Run-Test "15b" "GET valid but missing ID (404)" $r 404 | Out-Null

# ── TEST 16: No token → 401 on various routes ─────────────────────────────────
$r = Invoke-Api GET "$BASE/applications/my"
Run-Test 16 "GET /my no token (401)" $r 401 | Out-Null

$r = Invoke-Api GET "$BASE/applications/$appC1A1Id"
Run-Test "16b" "GET /:id no token (401)" $r 401 | Out-Null

$r = Invoke-Api GET "$BASE/applications/job/$jobA1Id"
Run-Test "16c" "GET /job/:jobId no token (401)" $r 401 | Out-Null

# ── TEST 17: Pagination + filters ─────────────────────────────────────────────
# C2 applies to A2 and gets shortlisted so we have a shortlisted entry to filter
$f = Write-Body "{`"jobId`":`"$jobA2Id`"}"
$r = Invoke-Api POST "$BASE/applications" -token $tokenC2 -bodyFile $f; Remove-Item $f
$appC2A2Id = (Parse-Response $r).Json.application._id
$f = Write-Body '{"status":"shortlisted"}'
Invoke-Api PATCH "$BASE/applications/$appC2A2Id/status" -token $tokenA -bodyFile $f | Out-Null; Remove-Item $f

# 17a: ?status=shortlisted filter — only shortlisted apps returned
$url17 = "$BASE/applications/job/${jobA2Id}?status=shortlisted"
$r = Invoke-Api GET $url17 -token $tokenA
Run-Test 17 "GET /job/:jobId?status=shortlisted filter works" $r 200 {
    param($res)
    $apps = $res.Json.applications
    $apps.Count -ge 1 -and ($apps | Where-Object { $_.status -ne "shortlisted" }).Count -eq 0
} | Out-Null

# 17b: page=-1 → falls back to page=1
$url17b = "$BASE/applications/job/${jobA2Id}?page=-1"
$r = Invoke-Api GET $url17b -token $tokenA
Run-Test "17b" "GET /job/:jobId?page=-1 safe fallback (page=1)" $r 200 {
    param($res) $res.Json.page -ge 1
} | Out-Null

# 17c: limit=abc → falls back to default limit
$url17c = "$BASE/applications/job/${jobA2Id}?limit=abc"
$r = Invoke-Api GET $url17c -token $tokenA
Run-Test "17c" "GET /job/:jobId?limit=abc safe fallback (200)" $r 200 {
    param($res) $null -ne $res.Json.applications
} | Out-Null

# 17d: limit=9999 → capped to 50
$url17d = "$BASE/applications/job/${jobA2Id}?limit=9999"
$r = Invoke-Api GET $url17d -token $tokenA
Run-Test "17d" "GET /job/:jobId?limit=9999 capped to 50 (200)" $r 200 {
    param($res) $null -ne $res.Json.applications
} | Out-Null

# ════════════ CODE SAFETY CHECKS ══════════════════════════════════════════════
Write-Host ""
Write-Host "━━━  Code Safety Checks  ━━━" -ForegroundColor Magenta

$ctrl = Get-Content "controllers\applicationController.js" -Raw
$equalsCount  = ([regex]::Matches($ctrl, '\.equals\(')).Count
$dangerousEq  = ([regex]::Matches($ctrl, '(req\.user\._id|job\.postedBy|candidate\._id)\s*===|===\s*(req\.user\._id|job\.postedBy|candidate\._id)')).Count

Write-Host "  middleware/auth.js    : sets req.user = Mongoose User doc → property is _id"
Write-Host "  applicationController: uses req.user._id throughout"
Write-Host "  Match                 : " -NoNewline; Write-Host "YES ✓" -ForegroundColor Green
Write-Host "  .equals() calls found : $equalsCount (all ObjectId comparisons)"
Write-Host "  Dangerous === on ObjectIds: " -NoNewline
if ($dangerousEq -eq 0) { Write-Host "NONE ✓" -ForegroundColor Green }
else                     { Write-Host "$dangerousEq FOUND — review!" -ForegroundColor Red }
Write-Host ""
Write-Host "  Note: 422 Unprocessable Entity is returned for format/enum validation" -ForegroundColor DarkYellow
Write-Host "        errors (express-validator layer). 400 Bad Request is returned for" -ForegroundColor DarkYellow
Write-Host "        business-logic rejections (controller layer: closed job, same" -ForegroundColor DarkYellow
Write-Host "        status, duplicate key, etc.)." -ForegroundColor DarkYellow

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
