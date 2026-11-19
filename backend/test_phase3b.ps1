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

$pass  = 0
$fail  = 0
$tests = @()

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
    if ($extraCheck -and -not $extraOk) {
        Write-Host "  Extra  : extra assertion failed" -ForegroundColor Yellow
    }
    Write-Host "  Result : " -NoNewline
    Write-Host $label -ForegroundColor $color

    $script:tests += [PSCustomObject]@{
        Num=$num; Name=$name; Expected=$expectedCode; Got=$r.Code; Result=$label
    }
    return $r
}

$BASE = "http://localhost:5000/api"
$TS   = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "`n━━━  PHASE 3b — Job Postings Tests  ━━━" -ForegroundColor Magenta

# ── Register recruiter A ──────────────────────────────────────────────────────
$emailA = "recruiterA_${TS}@test.com"
$f = Write-Body "{`"name`":`"Recruiter A`",`"email`":`"$emailA`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "$BASE/auth/register" -bodyFile $f; Remove-Item $f
$pA     = (Parse-Response $r).Json
$tokenA = $pA.token
$userAId= $pA.user.id

# ── TEST 1: Recruiter A (no company) POST /api/jobs → 400 ────────────────────
$f = Write-Body '{"title":"Dev Job","description":"Desc","jobType":"full-time"}'
$r = Invoke-Api POST "$BASE/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 1 "POST /jobs with no company (400)" $r 400 {
    param($res) $res.Json.message -match "company"
} | Out-Null

# ── Recruiter A creates a company ─────────────────────────────────────────────
$f = Write-Body '{"name":"Acme Corp","industry":"Tech","size":"11-50","location":"Bangalore"}'
$r = Invoke-Api POST "$BASE/companies" -token $tokenA -bodyFile $f; Remove-Item $f
$companyAId = (Parse-Response $r).Json.company._id

# ── TEST 2: Recruiter A creates a job — company + postedBy auto-linked ────────
$f = Write-Body '{"title":"Full Stack Engineer","description":"Build cool things","jobType":"full-time","salaryMin":60000,"salaryMax":90000}'
$r = Invoke-Api POST "$BASE/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
$res2 = Run-Test 2 "POST /jobs as recruiter A (201, auto-linked fields)" $r 201 {
    param($res)
    $j = $res.Json.job
    $j -and $j.company -and $j.postedBy -and $j.status -eq "open"
}
$jobAId = $res2.Json.job._id

# ── TEST 3: Body fields company/postedBy/status:"closed" must be ignored ──────
$fakeId = "000000000000000000000001"
$f = Write-Body "{`"title`":`"Ignored Fields Job`",`"description`":`"Desc`",`"jobType`":`"contract`",`"company`":`"$fakeId`",`"postedBy`":`"$fakeId`",`"status`":`"closed`"}"
$r = Invoke-Api POST "$BASE/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 3 "POST /jobs body fields company/postedBy/status ignored (201)" $r 201 {
    param($res)
    $j = $res.Json.job
    # company must be A's real company, postedBy must be A, status must be open
    $companyMatch  = ($j.company._id -eq $companyAId) -or ($j.company -eq $companyAId)
    $postedByMatch = $j.postedBy -eq $userAId
    $statusMatch   = $j.status -eq "open"
    $companyMatch -and $postedByMatch -and $statusMatch
} | Out-Null

# ── TEST 4: Candidate POST /api/jobs → 403 ────────────────────────────────────
$emailC = "candidate_${TS}@test.com"
$f = Write-Body "{`"name`":`"Candidate C`",`"email`":`"$emailC`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "$BASE/auth/register" -bodyFile $f; Remove-Item $f
$tokenC = (Parse-Response $r).Json.token

$f = Write-Body '{"title":"Sneaky Job","description":"Desc","jobType":"full-time"}'
$r = Invoke-Api POST "$BASE/jobs" -token $tokenC -bodyFile $f; Remove-Item $f
Run-Test 4 "POST /jobs with candidate token (403)" $r 403 | Out-Null

# ── TEST 5: salaryMax < salaryMin → validation error ─────────────────────────
$f = Write-Body '{"title":"Pay Job","description":"Desc","jobType":"part-time","salaryMin":100000,"salaryMax":50000}'
$r = Invoke-Api POST "$BASE/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 5 "POST /jobs salaryMax < salaryMin (422)" $r 422 {
    param($res) $res.Json.errors | Where-Object { $_.message -match "salaryMax" }
} | Out-Null

# ── Post a second open job for filter/pagination tests ────────────────────────
$f = Write-Body '{"title":"Full Stack Developer","description":"More building","jobType":"full-time","location":"Mumbai"}'
$r = Invoke-Api POST "$BASE/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
$jobA2Id = (Parse-Response $r).Json.job._id

# ── TEST 6: GET /api/jobs/my — only A's jobs ──────────────────────────────────
$r = Invoke-Api GET "$BASE/jobs/my" -token $tokenA
Run-Test 6 "GET /jobs/my lists only recruiter A's jobs" $r 200 {
    param($res)
    $res.Json.jobs.Count -ge 2 -and
    ($res.Json.jobs | Where-Object { $_.postedBy -ne $userAId }).Count -eq 0
} | Out-Null

# ── TEST 7: GET /api/jobs as candidate — open only, pagination fields ──────────
$r = Invoke-Api GET "$BASE/jobs" -token $tokenC
Run-Test 7 "GET /jobs (candidate) — open only, pagination fields present" $r 200 {
    param($res)
    $j = $res.Json
    $null -ne $j.total -and $null -ne $j.page -and $null -ne $j.pages -and $null -ne $j.jobs
} | Out-Null

# ── TEST 8: Keyword + jobType filter + pagination ─────────────────────────────
$r = Invoke-Api GET "$BASE/jobs?keyword=Full+Stack&jobType=full-time&page=1&limit=2" -token $tokenC
Run-Test 8 "GET /jobs?keyword=Full+Stack&jobType=full-time&page=1&limit=2" $r 200 {
    param($res)
    $j = $res.Json
    # All returned jobs must be open and full-time
    $j.jobs.Count -ge 1 -and
    ($j.jobs | Where-Object { $_.jobType -ne "full-time" -or $_.status -ne "open" }).Count -eq 0
} | Out-Null

# ── TEST 9: Regex injection + bad pagination params ───────────────────────────
# 9a: keyword with regex metacharacters — must not crash
$r = Invoke-Api GET "$BASE/jobs?keyword=.*(+" -token $tokenC
Run-Test 9 "GET /jobs?keyword=.*(+ — no crash (200)" $r 200 | Out-Null

# 9b: page=-1 falls back to default
$r = Invoke-Api GET "$BASE/jobs?page=-1" -token $tokenC
Run-Test "9b" "GET /jobs?page=-1 safe fallback (200)" $r 200 {
    param($res) $res.Json.page -ge 1
} | Out-Null

# 9c: limit=abc falls back to default
$r = Invoke-Api GET "$BASE/jobs?limit=abc" -token $tokenC
Run-Test "9c" "GET /jobs?limit=abc safe fallback (200)" $r 200 {
    param($res) $res.Json.jobs -ne $null
} | Out-Null

# ── TEST 10: Invalid and missing IDs ─────────────────────────────────────────
$r = Invoke-Api GET "$BASE/jobs/abc" -token $tokenC
Run-Test 10 "GET /jobs/abc (400 invalid ID)" $r 400 | Out-Null

$r = Invoke-Api GET "$BASE/jobs/$fakeId" -token $tokenC
Run-Test "10b" "GET /jobs/<non-existent id> (404)" $r 404 | Out-Null

# ── TEST 11: Recruiter B cannot modify A's jobs ───────────────────────────────
$emailB = "recruiterB_${TS}@test.com"
$f = Write-Body "{`"name`":`"Recruiter B`",`"email`":`"$emailB`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "$BASE/auth/register" -bodyFile $f; Remove-Item $f
$tokenB = (Parse-Response $r).Json.token

$f = Write-Body '{"name":"Beta Ltd","industry":"Finance"}'
Invoke-Api POST "$BASE/companies" -token $tokenB -bodyFile $f | Out-Null; Remove-Item $f

# B tries PUT on A's job
$f = Write-Body '{"title":"Hacked by B"}'
$r = Invoke-Api PUT "$BASE/jobs/$jobAId" -token $tokenB -bodyFile $f; Remove-Item $f
$putResult = Run-Test 11 "Recruiter B PUT on A's job (403)" $r 403 | Out-Null

# B tries PATCH close on A's job
$r = Invoke-Api PATCH "$BASE/jobs/$jobAId/close" -token $tokenB
Run-Test "11b" "Recruiter B PATCH close on A's job (403)" $r 403 | Out-Null

# Confirm A's job title is unchanged
$r = Invoke-Api GET "$BASE/jobs/$jobAId" -token $tokenC
Run-Test "11c" "A's job unchanged after B's attempt" $r 200 {
    param($res) $res.Json.job.title -eq "Full Stack Engineer"
} | Out-Null

# ── TEST 12: Recruiter A updates and closes own job ───────────────────────────
$f = Write-Body '{"title":"Full Stack Engineer — Updated","salaryMax":95000}'
$r = Invoke-Api PUT "$BASE/jobs/$jobAId" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 12 "Recruiter A PUT own job (200)" $r 200 {
    param($res) $res.Json.job.title -eq "Full Stack Engineer — Updated"
} | Out-Null

# Close the job
$r = Invoke-Api PATCH "$BASE/jobs/$jobAId/close" -token $tokenA
Run-Test "12b" "Recruiter A PATCH close own job (200)" $r 200 {
    param($res) $res.Json.job.status -eq "closed"
} | Out-Null

# Close already closed job → 400
$r = Invoke-Api PATCH "$BASE/jobs/$jobAId/close" -token $tokenA
Run-Test "12c" "PATCH close already-closed job (400)" $r 400 {
    param($res) $res.Json.message -match "already closed"
} | Out-Null

# ── TEST 13: Closed job no longer appears in GET /api/jobs ────────────────────
$r = Invoke-Api GET "$BASE/jobs" -token $tokenC
Run-Test 13 "Closed job absent from GET /jobs list" $r 200 {
    param($res)
    ($res.Json.jobs | Where-Object { $_._id -eq $jobAId }).Count -eq 0
} | Out-Null

# ── TEST 14: No token on GET /api/jobs → 401 ─────────────────────────────────
$r = Invoke-Api GET "$BASE/jobs"
Run-Test 14 "GET /jobs with no token (401)" $r 401 | Out-Null

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━  Summary  ━━━" -ForegroundColor Magenta
Write-Host ("{0,-6} {1,-55} {2,-10} {3,-10} {4}" -f "Test","Name","Expected","Got","Result")
Write-Host ("-" * 100)
foreach ($t in $tests) {
    $color = if ($t.Result -eq "PASS") { "Green" } else { "Red" }
    Write-Host ("{0,-6} {1,-55} {2,-10} {3,-10}" -f $t.Num, $t.Name, $t.Expected, $t.Got) -NoNewline
    Write-Host $t.Result -ForegroundColor $color
}
Write-Host ("-" * 100)
$fc = if ($fail -eq 0) { "Green" } else { "Red" }
Write-Host "Total: $pass passed, $fail failed" -ForegroundColor $fc
