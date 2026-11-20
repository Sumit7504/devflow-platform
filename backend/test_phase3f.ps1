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

Write-Host "`n━━━  PHASE 3f — Admin Features Tests  ━━━" -ForegroundColor Magenta

# ════════════ SETUP ══════════════════════════════════════════════════════════
Write-Host "`n── Setup ──" -ForegroundColor Gray

# 0. Ensure admin is seeded
node scripts/seedAdmin.js | Out-Null

# Read ADMIN_EMAIL and ADMIN_PASSWORD from .env
$adminEmail = ""
$adminPassword = ""
Get-Content ".env" | ForEach-Object {
    if ($_ -match '^\s*ADMIN_EMAIL\s*=\s*(.*)$') { $adminEmail = $matches[1].Trim() }
    if ($_ -match '^\s*ADMIN_PASSWORD\s*=\s*(.*)$') { $adminPassword = $matches[1].Trim() }
}

# 1. Login as Admin 1 (seeded admin)
$f = Write-Body "{`"email`":`"${adminEmail}`",`"password`":`"${adminPassword}`"}"
$r = Invoke-Api POST "${BASE}/auth/login" -bodyFile $f; Remove-Item $f
$pAdmin1 = (Parse-Response $r).Json
$admin1Token = $pAdmin1.token
$admin1Id    = $pAdmin1.user.id
Write-Host "  Admin 1 logged in : $admin1Id ($adminEmail)"

# 2. Create Admin 2 (register as recruiter, then promote via admin API)
$admin2Email = "admin2_${TS}@t.com"
$f = Write-Body "{`"name`":`"Admin Two`",`"email`":`"${admin2Email}`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$admin2Id = (Parse-Response $r).Json.user.id

$f = Write-Body '{"role":"admin"}'
Invoke-Api PATCH "${BASE}/admin/users/${admin2Id}/role" -token $admin1Token -bodyFile $f | Out-Null; Remove-Item $f

$f = Write-Body "{`"email`":`"${admin2Email}`",`"password`":`"pass1234`"}"
$r = Invoke-Api POST "${BASE}/auth/login" -bodyFile $f; Remove-Item $f
$admin2Token = (Parse-Response $r).Json.token
Write-Host "  Admin 2 created and promoted : $admin2Id ($admin2Email)"

# 3. Create Recruiter R + Company R + Job J1
$f = Write-Body "{`"name`":`"Recruiter R`",`"email`":`"recR_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pRecR = (Parse-Response $r).Json
$tokenRecR = $pRecR.token
$recRId    = $pRecR.user.id

$f = Write-Body '{"name":"R Corp","industry":"Software"}'
Invoke-Api POST "${BASE}/companies" -token $tokenRecR -bodyFile $f | Out-Null; Remove-Item $f

$f = Write-Body '{"title":"Job J1","description":"Engineering position","jobType":"full-time"}'
$r = Invoke-Api POST "${BASE}/jobs" -token $tokenRecR -bodyFile $f; Remove-Item $f
$j1Id = (Parse-Response $r).Json.job._id
Write-Host "  Recruiter R : $recRId | Job J1: $j1Id"

# Candidate C1 applies to J1
$c1Email = "cand1_${TS}@t.com"
$f = Write-Body "{`"name`":`"Candidate One`",`"email`":`"${c1Email}`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC1 = (Parse-Response $r).Json
$tokenC1 = $pC1.token
$c1Id    = $pC1.user.id

$f = Write-Body "{`"jobId`":`"${j1Id}`"}"
$r = Invoke-Api POST "${BASE}/applications" -token $tokenC1 -bodyFile $f; Remove-Item $f
$app1Id = (Parse-Response $r).Json.application._id
Write-Host "  Candidate C1 : $c1Id applied to Job J1 ($app1Id)"

# 4. Create Recruiter R2 + Company R2 + Job J2 + Assessment on J2 (no applications)
$f = Write-Body "{`"name`":`"Recruiter R2`",`"email`":`"recR2_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pRecR2 = (Parse-Response $r).Json
$tokenRecR2 = $pRecR2.token
$recR2Id    = $pRecR2.user.id

$f = Write-Body '{"name":"R2 Corp","industry":"Fintech"}'
Invoke-Api POST "${BASE}/companies" -token $tokenRecR2 -bodyFile $f | Out-Null; Remove-Item $f

$f = Write-Body '{"title":"Job J2","description":"Frontend position","jobType":"part-time"}'
$r = Invoke-Api POST "${BASE}/jobs" -token $tokenRecR2 -bodyFile $f; Remove-Item $f
$j2Id = (Parse-Response $r).Json.job._id

$assessmentPayload = @"
{
  "jobId": "${j2Id}",
  "title": "J2 Assessment",
  "durationMinutes": 30,
  "questions": [
    {
      "type": "mcq",
      "text": "What is 2+2?",
      "points": 2,
      "options": ["3", "4", "5"],
      "correctOption": 1
    }
  ]
}
"@
$f = Write-Body $assessmentPayload
$r = Invoke-Api POST "${BASE}/assessments" -token $tokenRecR2 -bodyFile $f; Remove-Item $f
$assessment2Id = (Parse-Response $r).Json.assessment._id
Write-Host "  Recruiter R2 : $recR2Id | Job J2: $j2Id | Assessment: $assessment2Id"

# ════════════ TESTS ══════════════════════════════════════════════════════════
Write-Host "`n━━━  Running Tests  ━━━" -ForegroundColor Magenta

# ── TEST 1: RBAC on every /api/admin route ────────────────────────────────────
Write-Host "`n── TEST 1: RBAC protection on all /api/admin routes ──" -ForegroundColor Yellow

$routes = @(
    @{ Method="GET";    Path="users";            Body="" },
    @{ Method="GET";    Path="users/${c1Id}";    Body="" },
    @{ Method="PATCH";  Path="users/${c1Id}/status"; Body='{"isActive":false}' },
    @{ Method="PATCH";  Path="users/${c1Id}/role";   Body='{"role":"recruiter"}' },
    @{ Method="GET";    Path="jobs";             Body="" },
    @{ Method="PATCH";  Path="jobs/${j1Id}/close";   Body="" },
    @{ Method="DELETE"; Path="jobs/${j1Id}";         Body="" },
    @{ Method="GET";    Path="stats";            Body="" }
)

$t1Idx = 1
foreach ($rt in $routes) {
    $url = "${BASE}/admin/$($rt.Path)"
    $m = $rt.Method
    $bf = if ($rt.Body) { Write-Body $rt.Body } else { "" }

    # Candidate token -> 403
    $r = Invoke-Api $m $url -token $tokenC1 -bodyFile $bf
    Run-Test "1.${t1Idx}a" "$m /admin/$($rt.Path) with candidate token (403)" $r 403 | Out-Null

    # Recruiter token -> 403
    $r = Invoke-Api $m $url -token $tokenRecR -bodyFile $bf
    Run-Test "1.${t1Idx}b" "$m /admin/$($rt.Path) with recruiter token (403)" $r 403 | Out-Null

    # No token -> 401
    $r = Invoke-Api $m $url -bodyFile $bf
    Run-Test "1.${t1Idx}c" "$m /admin/$($rt.Path) without token (401)" $r 401 | Out-Null

    if ($bf) { Remove-Item $bf }
    $t1Idx++
}

# ── TEST 2: GET /api/admin/users as admin ─────────────────────────────────────
Write-Host "`n── TEST 2: GET /api/admin/users pagination, security, filters ──" -ForegroundColor Yellow

# 2a. List users: pagination, no password anywhere, newest first
$r = Invoke-Api GET "${BASE}/admin/users?page=1&limit=10" -token $admin1Token
Run-Test "2a" "GET /admin/users paginated list, newest first, no passwords" $r 200 {
    param($res)
    $hasPass = ($res.Body -match '"password"')
    $users = $res.Json.users
    $isSorted = $true
    if ($users.Count -gt 1) {
        $d0 = [DateTime]::Parse($users[0].createdAt)
        $d1 = [DateTime]::Parse($users[1].createdAt)
        $isSorted = ($d0 -ge $d1)
    }
    (-not $hasPass) -and ($users.Count -gt 0) -and $isSorted -and ($res.Json.total -gt 0)
} | Out-Null

# 2b. Filter ?role=recruiter
$r = Invoke-Api GET "${BASE}/admin/users?role=recruiter" -token $admin1Token
Run-Test "2b" "GET /admin/users?role=recruiter filter" $r 200 {
    param($res)
    $allRec = $true
    foreach ($u in $res.Json.users) {
        if ($u.role -ne "recruiter") { $allRec = $false }
    }
    $allRec -and ($res.Json.users.Count -gt 0)
} | Out-Null

# 2c. Filter ?isActive=true
$r = Invoke-Api GET "${BASE}/admin/users?isActive=true" -token $admin1Token
Run-Test "2c" "GET /admin/users?isActive=true filter" $r 200 {
    param($res)
    $allActive = $true
    foreach ($u in $res.Json.users) {
        if ($u.isActive -eq $false) { $allActive = $false }
    }
    $allActive -and ($res.Json.users.Count -gt 0)
} | Out-Null

# 2d. Filter ?search=<part of email>
$searchSub = "cand1_${TS}"
$r = Invoke-Api GET "${BASE}/admin/users?search=${searchSub}" -token $admin1Token
Run-Test "2d" "GET /admin/users?search=${searchSub} email substring search" $r 200 {
    param($res)
    ($res.Json.users.Count -ge 1) -and ($res.Json.users[0].email -match $searchSub)
} | Out-Null

# 2e. Regex chars in search (.*( does not crash)
$safeRegexParam = [System.Uri]::EscapeDataString(".*(")
$r = Invoke-Api GET "${BASE}/admin/users?search=${safeRegexParam}" -token $admin1Token
Run-Test "2e" "GET /admin/users with special regex characters in search does not crash" $r 200 {
    param($res) $res.Json.success -eq $true
} | Out-Null

# 2f. Bad role filter -> 422
$r = Invoke-Api GET "${BASE}/admin/users?role=hacker" -token $admin1Token
Run-Test "2f" "GET /admin/users?role=hacker invalid role query (422)" $r 422 | Out-Null

# 2g. Bad limit / page values
$r = Invoke-Api GET "${BASE}/admin/users?page=0" -token $admin1Token
Run-Test "2g" "GET /admin/users?page=0 invalid page query (422)" $r 422 | Out-Null

# ── TEST 3: GET /api/admin/users/<id> ─────────────────────────────────────────
Write-Host "`n── TEST 3: GET /api/admin/users/<id> ──" -ForegroundColor Yellow

$r = Invoke-Api GET "${BASE}/admin/users/${c1Id}" -token $admin1Token
Run-Test "3a" "GET /admin/users/<id> success, no password" $r 200 {
    param($res)
    (-not ($res.Body -match '"password"')) -and ($res.Json.user.email -eq $c1Email)
} | Out-Null

$r = Invoke-Api GET "${BASE}/admin/users/invalid-id-format" -token $admin1Token
Run-Test "3b" "GET /admin/users/<id> invalid ObjectId (400)" $r 400 | Out-Null

$r = Invoke-Api GET "${BASE}/admin/users/${FAKE}" -token $admin1Token
Run-Test "3c" "GET /admin/users/<id> missing user ID (404)" $r 404 | Out-Null

# ── TEST 4: Deactivate & Reactivate Candidate C1 ──────────────────────────────
Write-Host "`n── TEST 4: Account deactivation and login enforcement ──" -ForegroundColor Yellow

# 4a. Admin deactivates C1 -> 200
$f = Write-Body '{"isActive":false}'
$r = Invoke-Api PATCH "${BASE}/admin/users/${c1Id}/status" -token $admin1Token -bodyFile $f; Remove-Item $f
Run-Test "4a" "Admin deactivates C1 (200)" $r 200 {
    param($res) $res.Json.user.isActive -eq $false
} | Out-Null

# 4b. Deactivated C1 attempts login -> 403 "Account is deactivated"
$f = Write-Body "{`"email`":`"${c1Email}`",`"password`":`"pass1234`"}"
$r = Invoke-Api POST "${BASE}/auth/login" -bodyFile $f; Remove-Item $f
Run-Test "4b" "Deactivated C1 login rejected (403 Account is deactivated)" $r 403 {
    param($res) $res.Json.message -match "deactivated"
} | Out-Null

# 4c. C1 existing token on GET /api/auth/me -> 403
$r = Invoke-Api GET "${BASE}/auth/me" -token $tokenC1
Run-Test "4c" "C1 existing token on GET /api/auth/me rejected (403)" $r 403 {
    param($res) $res.Json.message -match "deactivated"
} | Out-Null

# 4d. Admin reactivates C1 -> 200
$f = Write-Body '{"isActive":true}'
$r = Invoke-Api PATCH "${BASE}/admin/users/${c1Id}/status" -token $admin1Token -bodyFile $f; Remove-Item $f
Run-Test "4d" "Admin reactivates C1 (200)" $r 200 {
    param($res) $res.Json.user.isActive -eq $true
} | Out-Null

# 4e. C1 login works again -> 200
$f = Write-Body "{`"email`":`"${c1Email}`",`"password`":`"pass1234`"}"
$r = Invoke-Api POST "${BASE}/auth/login" -bodyFile $f; Remove-Item $f
Run-Test "4e" "Reactivated C1 login works again (200)" $r 200 {
    param($res) $res.Json.success -eq $true
} | Out-Null

# ── TEST 5: Admin Self-Protection Guards ──────────────────────────────────────
Write-Host "`n── TEST 5: Self-action protection guards ──" -ForegroundColor Yellow

# 5a. Admin deactivates self -> 400
$f = Write-Body '{"isActive":false}'
$r = Invoke-Api PATCH "${BASE}/admin/users/${admin1Id}/status" -token $admin1Token -bodyFile $f; Remove-Item $f
Run-Test "5a" "Admin cannot deactivate their own account (400)" $r 400 {
    param($res) $res.Json.message -match "Cannot deactivate your own account"
} | Out-Null

# 5b. Admin changes own role -> 400
$f = Write-Body '{"role":"recruiter"}'
$r = Invoke-Api PATCH "${BASE}/admin/users/${admin1Id}/role" -token $admin1Token -bodyFile $f; Remove-Item $f
Run-Test "5b" "Admin cannot change their own role (400)" $r 400 {
    param($res) $res.Json.message -match "Cannot change your own role"
} | Out-Null

# ── TEST 6: Last Active Admin Protection ──────────────────────────────────────
Write-Host "`n── TEST 6: Last active admin guards ──" -ForegroundColor Yellow

# 6a. Admin 1 deactivates Admin 2 -> 200 (since Admin 1 remains active)
$f = Write-Body '{"isActive":false}'
$r = Invoke-Api PATCH "${BASE}/admin/users/${admin2Id}/status" -token $admin1Token -bodyFile $f; Remove-Item $f
Run-Test "6a" "Admin 1 deactivates Admin 2 (200)" $r 200 | Out-Null

# 6b. With only 1 active admin left (Admin 1), attempt to deactivate Admin 1 -> 400
$f = Write-Body '{"isActive":false}'
$r = Invoke-Api PATCH "${BASE}/admin/users/${admin1Id}/status" -token $admin1Token -bodyFile $f; Remove-Item $f
Run-Test "6b" "Attempt to deactivate last active admin (400)" $r 400 | Out-Null

# 6c. Attempt to demote the last active admin -> 400
$f = Write-Body '{"role":"recruiter"}'
$r = Invoke-Api PATCH "${BASE}/admin/users/${admin1Id}/role" -token $admin1Token -bodyFile $f; Remove-Item $f
Run-Test "6c" "Attempt to demote last active admin (400)" $r 400 | Out-Null

# 6d. Reactivate Admin 2 afterwards -> 200
$f = Write-Body '{"isActive":true}'
$r = Invoke-Api PATCH "${BASE}/admin/users/${admin2Id}/status" -token $admin1Token -bodyFile $f; Remove-Item $f
Run-Test "6d" "Reactivate Admin 2 (200)" $r 200 {
    param($res) $res.Json.user.isActive -eq $true
} | Out-Null

# ── TEST 7: Role Change (Promote / Demote) ────────────────────────────────────
Write-Host "`n── TEST 7: User role promotion and demotion ──" -ForegroundColor Yellow

# 7a. Promote Candidate C1 to recruiter -> 200
$f = Write-Body '{"role":"recruiter"}'
$r = Invoke-Api PATCH "${BASE}/admin/users/${c1Id}/role" -token $admin1Token -bodyFile $f; Remove-Item $f
Run-Test "7a" "Promote C1 to recruiter (200)" $r 200 {
    param($res) $res.Json.user.role -eq "recruiter"
} | Out-Null

# 7b. Demote C1 back to candidate -> 200
$f = Write-Body '{"role":"candidate"}'
$r = Invoke-Api PATCH "${BASE}/admin/users/${c1Id}/role" -token $admin1Token -bodyFile $f; Remove-Item $f
Run-Test "7b" "Demote C1 back to candidate (200)" $r 200 {
    param($res) $res.Json.user.role -eq "candidate"
} | Out-Null

# 7c. Invalid role value -> 422
$f = Write-Body '{"role":"superadmin"}'
$r = Invoke-Api PATCH "${BASE}/admin/users/${c1Id}/role" -token $admin1Token -bodyFile $f; Remove-Item $f
Run-Test "7c" "Invalid role value superadmin (422)" $r 422 | Out-Null

# ── TEST 8: Old Users without isActive ────────────────────────────────────────
Write-Host "`n── TEST 8: Legacy users without isActive field ──" -ForegroundColor Yellow

# Create a user and unset `isActive` directly in MongoDB to simulate a pre-Phase 3f user
$legacyEmail = "legacy_${TS}@t.com"
$f = Write-Body "{`"name`":`"Legacy User`",`"email`":`"${legacyEmail}`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$legacyId = (Parse-Response $r).Json.user.id

# Unset isActive in MongoDB directly
$unsetCmd = "require('dotenv').config(); const mongoose = require('mongoose'); const User = require('./models/User'); (async () => { await mongoose.connect(process.env.MONGO_URI); await User.updateOne({ email: '${legacyEmail}' }, { `$unset: { isActive: '' } }); await mongoose.disconnect(); })();"
node -e $unsetCmd

Write-Host "  [Simulated legacy user]: Unset 'isActive' on user $legacyEmail directly in MongoDB using Mongoose User.updateOne({ email }, { `$unset: { isActive: '' } })" -ForegroundColor Gray

# 8a. Legacy user can still log in -> 200
$f = Write-Body "{`"email`":`"${legacyEmail}`",`"password`":`"pass1234`"}"
$r = Invoke-Api POST "${BASE}/auth/login" -bodyFile $f; Remove-Item $f
Run-Test "8a" "Legacy user without isActive can log in successfully (200)" $r 200 {
    param($res) $res.Json.success -eq $true
} | Out-Null

# 8b. Legacy user appears in ?isActive=true filter list
$r = Invoke-Api GET "${BASE}/admin/users?isActive=true&search=${legacyEmail}" -token $admin1Token
Run-Test "8b" "Legacy user appears in ?isActive=true list" $r 200 {
    param($res) ($res.Json.users.Count -ge 1) -and ($res.Json.users[0].email -eq $legacyEmail)
} | Out-Null

# ── TEST 9: GET /api/admin/jobs ───────────────────────────────────────────────
Write-Host "`n── TEST 9: GET /api/admin/jobs list and filters ──" -ForegroundColor Yellow

# 9a. Lists jobs in any status with populated company name
$r = Invoke-Api GET "${BASE}/admin/jobs" -token $admin1Token
Run-Test "9a" "GET /admin/jobs lists jobs with company name" $r 200 {
    param($res)
    $hasCompany = $false
    foreach ($j in $res.Json.jobs) {
        if ($j.company -and $j.company.name) { $hasCompany = $true }
    }
    ($res.Json.jobs.Count -gt 0) -and $hasCompany
} | Out-Null

# 9b. Filter ?status=open
$r = Invoke-Api GET "${BASE}/admin/jobs?status=open" -token $admin1Token
Run-Test "9b" "GET /admin/jobs?status=open filter" $r 200 {
    param($res)
    $allOpen = $true
    foreach ($j in $res.Json.jobs) {
        if ($j.status -ne "open") { $allOpen = $false }
    }
    $allOpen -and ($res.Json.jobs.Count -gt 0)
} | Out-Null

# 9c. Filter ?search=Job J1
$r = Invoke-Api GET "${BASE}/admin/jobs?search=Job%20J1" -token $admin1Token
Run-Test "9c" "GET /admin/jobs?search=Job J1 filter" $r 200 {
    param($res)
    ($res.Json.jobs.Count -ge 1) -and ($res.Json.jobs[0].title -match "Job J1")
} | Out-Null

# ── TEST 10: Admin Closes Job J1 ──────────────────────────────────────────────
Write-Host "`n── TEST 10: Admin close job ──" -ForegroundColor Yellow

# 10a. Admin closes J1 -> 200
$r = Invoke-Api PATCH "${BASE}/admin/jobs/${j1Id}/close" -token $admin1Token
Run-Test "10a" "Admin closes Job J1 (200)" $r 200 {
    param($res) $res.Json.job.status -eq "closed"
} | Out-Null

# 10b. Admin tries to close J1 again -> 400
$r = Invoke-Api PATCH "${BASE}/admin/jobs/${j1Id}/close" -token $admin1Token
Run-Test "10b" "Admin closes already closed Job J1 (400)" $r 400 {
    param($res) $res.Json.message -match "already closed"
} | Out-Null

# ── TEST 11: Admin Deletes Job ────────────────────────────────────────────────
Write-Host "`n── TEST 11: Admin delete job with cascading rules ──" -ForegroundColor Yellow

# 11a. Admin deletes J1 (has application) -> 409
$r = Invoke-Api DELETE "${BASE}/admin/jobs/${j1Id}" -token $admin1Token
Run-Test "11a" "Admin deletes Job J1 with existing applications (409)" $r 409 {
    param($res) $res.Json.message -match "applications"
} | Out-Null

# 11b. Admin deletes J2 (no applications, has assessment) -> 200
$r = Invoke-Api DELETE "${BASE}/admin/jobs/${j2Id}" -token $admin1Token
Run-Test "11b" "Admin deletes Job J2 (no applications, has assessment) (200)" $r 200 | Out-Null

# 11c. Confirm J2's assessment is gone too -> 404
$r = Invoke-Api GET "${BASE}/assessments/${assessment2Id}" -token $admin1Token
Run-Test "11c" "Assessment for Job J2 is cascade deleted (404)" $r 404 | Out-Null

# 11d. Delete a missing job -> 404
$r = Invoke-Api DELETE "${BASE}/admin/jobs/${FAKE}" -token $admin1Token
Run-Test "11d" "Admin deletes missing job (404)" $r 404 | Out-Null

# 11e. Delete with invalid ObjectId -> 400
$r = Invoke-Api DELETE "${BASE}/admin/jobs/invalid-job-id" -token $admin1Token
Run-Test "11e" "Admin deletes job with invalid ID (400)" $r 400 | Out-Null

# ── TEST 12: GET /api/admin/stats ─────────────────────────────────────────────
Write-Host "`n── TEST 12: GET /api/admin/stats platform overview ──" -ForegroundColor Yellow

$r = Invoke-Api GET "${BASE}/admin/stats" -token $admin1Token
Run-Test "12" "GET /admin/stats overview sections, zero counts, and status names" $r 200 {
    param($res)
    $s = $res.Json.stats

    # Check sections exist
    $hasSections = $s.users -and $s.jobs -and $s.applications -and $s.interviews -and $s.attempts -and $s.companies

    # Check application statuses are applied, shortlisted, rejected, hired
    $appStatuses = $s.applications.byStatus
    $hasAppStatuses = ($appStatuses.applied -ne $null) -and `
                      ($appStatuses.shortlisted -ne $null) -and `
                      ($appStatuses.rejected -ne $null) -and `
                      ($appStatuses.hired -ne $null)

    # Check zero counts exist (e.g. inactive status and all statuses are represented)
    $hasZeroCounts = ($s.users.byStatus.inactive -ne $null) -and `
                     ($s.interviews.byStatus.declined -ne $null) -and `
                     ($s.interviews.byStatus.cancelled -ne $null) -and `
                     ($s.attempts.byStatus.graded -ne $null)

    # Compare with list endpoints (numbers match what list endpoints return)
    $usersList = (Parse-Response (Invoke-Api GET "${BASE}/admin/users?limit=1" -token $admin1Token)).Json.total
    $jobsList  = (Parse-Response (Invoke-Api GET "${BASE}/admin/jobs?limit=1" -token $admin1Token)).Json.total
    $listsMatch = ($s.users.total -eq $usersList) -and ($s.jobs.total -eq $jobsList)

    $uOk = ($s.users.total -gt 0) -and ($s.users.byRole.admin -ge 2)

    $hasSections -and $hasAppStatuses -and $hasZeroCounts -and $listsMatch -and $uOk
} | Out-Null

# ════════════ CODE SAFETY & ARCHITECTURE CHECKS ════════════════════════════════
Write-Host ""
Write-Host "━━━  Code Safety & Architecture Checks  ━━━" -ForegroundColor Magenta

$ctrl = Get-Content "controllers\adminController.js" -Raw
$equalsCount = ([regex]::Matches($ctrl, '\.equals\(')).Count
$dangerousEq = ([regex]::Matches($ctrl, 'req\.user\._id\s*===|===\s*req\.user\._id')).Count

Write-Host "  .equals() calls found in adminController.js : $equalsCount"
Write-Host "  Dangerous === on ObjectIds: " -NoNewline
if ($dangerousEq -eq 0) { Write-Host "NONE ✓" -ForegroundColor Green }
else                     { Write-Host "$dangerousEq FOUND — review!" -ForegroundColor Red }

$routesFile = Get-Content "routes\admin.js" -Raw
$hasRouterAuth = $routesFile -match 'router\.use\(auth,\s*authorizeRoles\("admin"\)\)'
Write-Host "  All admin routes protected by router-level auth + authorizeRoles('admin'): " -NoNewline
if ($hasRouterAuth) { Write-Host "YES ✓" -ForegroundColor Green }
else                { Write-Host "NO — review routes/admin.js!" -ForegroundColor Red }

# ════════════ SUMMARY TABLE ══════════════════════════════════════════════════
Write-Host ""
Write-Host "━━━  Summary  ━━━" -ForegroundColor Magenta
Write-Host ("{0,-8} {1,-58} {2,-10} {3,-10} {4}" -f "Test","Name","Expected","Got","Result")
Write-Host ("-" * 105)
foreach ($t in $tests) {
    $color = if ($t.Result -eq "PASS") { "Green" } else { "Red" }
    Write-Host ("{0,-8} {1,-58} {2,-10} {3,-10}" -f $t.Num, $t.Name, $t.Expected, $t.Got) -NoNewline
    Write-Host $t.Result -ForegroundColor $color
}
Write-Host ("-" * 105)
$fc = if ($fail -eq 0) { "Green" } else { "Red" }
Write-Host "Total: $pass passed, $fail failed" -ForegroundColor $fc
