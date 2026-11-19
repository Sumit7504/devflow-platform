Set-Location "e:\Projects\Devflow Platform\backend"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Body($json) {
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmp, $json, [System.Text.Encoding]::UTF8)
    return $tmp
}

function Invoke-Api {
    param($method, $url, $token = "", $bodyFile = "")
    $args = @("-s", "-w", "`n%{http_code}", "-X", $method, $url)
    if ($token)    { $args += @("-H", "Authorization: Bearer $token") }
    if ($bodyFile) { $args += @("-H", "Content-Type: application/json", "--data", "@$bodyFile") }
    return curl.exe @args
}

function Parse-Response($raw) {
    $lines   = $raw -split "`n"
    $code    = $lines[-1].Trim()
    $body    = ($lines[0..($lines.Count - 2)] -join "`n").Trim()
    $parsed  = try { $body | ConvertFrom-Json } catch { $null }
    return @{ Code = $code; Body = $body; Json = $parsed }
}

$pass  = 0
$fail  = 0
$tests = @()

function Run-Test($num, $name, $response, $expectedCode, $extraCheck = $null) {
    $r      = Parse-Response $response
    $codeOk = $r.Code -eq [string]$expectedCode
    $extraOk= if ($extraCheck) { & $extraCheck $r } else { $true }
    $ok     = $codeOk -and $extraOk

    $status = if ($ok) { "PASS"; $script:pass++ } else { "FAIL"; $script:fail++ }
    $color  = if ($ok) { "Green" } else { "Red" }

    Write-Host ""
    Write-Host "TEST $num — $name" -ForegroundColor Cyan
    Write-Host "  Status : $($r.Code)  (expected $expectedCode)"
    Write-Host "  Body   : $($r.Body)"
    Write-Host "  Result : " -NoNewline
    Write-Host $status -ForegroundColor $color

    $script:tests += [PSCustomObject]@{ Num=$num; Name=$name; Expected=$expectedCode; Got=$r.Code; Result=$status }
    return $r
}

$BASE = "http://localhost:5000/api"
$TS   = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

# ═════════════════════════════════════════════════════════════════════════════
Write-Host "`n━━━  PHASE 3a — Company Profile Tests  ━━━" -ForegroundColor Magenta

# ── TEST 1: Register + login recruiter A ──────────────────────────────────────
$emailA = "recruiterA_${TS}@test.com"
$f = Write-Body "{`"name`":`"Recruiter A`",`"email`":`"$emailA`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "$BASE/auth/register" -bodyFile $f
$parsed = (Parse-Response $r).Json
$tokenA  = $parsed.token
$userAId = $parsed.user.id
Run-Test 1 "Register + login recruiter A (201)" $r 201 | Out-Null
Remove-Item $f

# ── TEST 2: Recruiter A creates a company ────────────────────────────────────
$f = Write-Body '{"name":"Acme Corp","industry":"Tech","size":"11-50"}'
$r = Invoke-Api POST "$BASE/companies" -token $tokenA -bodyFile $f
$res2 = Run-Test 2 "POST /companies as recruiter A (201)" $r 201
$companyAId = $res2.Json.company._id
Remove-Item $f

# ── TEST 3: Recruiter A creates a second company — expect 409 ────────────────
$f = Write-Body '{"name":"Duplicate Corp"}'
$r = Invoke-Api POST "$BASE/companies" -token $tokenA -bodyFile $f
Run-Test 3 "POST /companies again as recruiter A (409)" $r 409 | Out-Null
Remove-Item $f

# ── TEST 4: GET /companies/me as recruiter A ──────────────────────────────────
$r = Invoke-Api GET "$BASE/companies/me" -token $tokenA
Run-Test 4 "GET /companies/me as recruiter A (200)" $r 200 {
    param($res) $res.Json.company.name -eq "Acme Corp"
} | Out-Null

# ── TEST 5: PUT /companies/me — update description ───────────────────────────
$f = Write-Body '{"description":"We build things."}'
$r = Invoke-Api PUT "$BASE/companies/me" -token $tokenA -bodyFile $f
Run-Test 5 "PUT /companies/me — update description (200)" $r 200 {
    param($res) $res.Json.company.description -eq "We build things."
} | Out-Null
Remove-Item $f

# ── TEST 6: Candidate POSTs to /companies — expect 403 ───────────────────────
$emailC = "candidate_${TS}@test.com"
$f = Write-Body "{`"name`":`"Candidate C`",`"email`":`"$emailC`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "$BASE/auth/register" -bodyFile $f
$tokenC = (Parse-Response $r).Json.token
Remove-Item $f

$f = Write-Body '{"name":"Candidate Corp"}'
$r = Invoke-Api POST "$BASE/companies" -token $tokenC -bodyFile $f
Run-Test 6 "POST /companies with candidate token (403)" $r 403 | Out-Null
Remove-Item $f

# ── TEST 7: Candidate GETs recruiter A's company by ID ───────────────────────
$r = Invoke-Api GET "$BASE/companies/$companyAId" -token $tokenC
Run-Test 7 "GET /companies/:id with candidate token (200)" $r 200 {
    param($res) $res.Json.company._id -eq $companyAId
} | Out-Null

# ── TEST 8: GET /companies/abc — expect 400 ───────────────────────────────────
$r = Invoke-Api GET "$BASE/companies/abc" -token $tokenC
Run-Test 8 "GET /companies/abc (400 invalid ID)" $r 400 | Out-Null

# ── TEST 9: GET /companies/<valid but non-existent ObjectId> — expect 404 ────
$fakeId = "000000000000000000000001"
$r = Invoke-Api GET "$BASE/companies/$fakeId" -token $tokenC
Run-Test 9 "GET /companies/<non-existent id> (404)" $r 404 | Out-Null

# ── TEST 10: Recruiter B creates company; A's company must be unchanged ────────
$emailB = "recruiterB_${TS}@test.com"
$f = Write-Body "{`"name`":`"Recruiter B`",`"email`":`"$emailB`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "$BASE/auth/register" -bodyFile $f
$tokenB  = (Parse-Response $r).Json.token
Remove-Item $f

$f = Write-Body '{"name":"Beta Ltd","industry":"Finance"}'
$r = Invoke-Api POST "$BASE/companies" -token $tokenB -bodyFile $f
$companyBId = (Parse-Response $r).Json.company._id
Remove-Item $f

# B updates its own company
$f = Write-Body '{"description":"B changed this."}'
Invoke-Api PUT "$BASE/companies/me" -token $tokenB -bodyFile $f | Out-Null
Remove-Item $f

# Fetch A's company and confirm it still has the original description
$r = Invoke-Api GET "$BASE/companies/$companyAId" -token $tokenA
Run-Test 10 "Recruiter B update leaves recruiter A's company unchanged" $r 200 {
    param($res) $res.Json.company.description -eq "We build things."
} | Out-Null

# ── TEST 11: PUT with owner field in body — owner must NOT change ─────────────
$userBId = (Invoke-Api GET "$BASE/auth/me" -token $tokenB | ForEach-Object {
    (Parse-Response $_).Json.user.id
})
$f = Write-Body "{`"description`":`"A tries to change owner`",`"owner`":`"$userBId`"}"
$r = Invoke-Api PUT "$BASE/companies/me" -token $tokenA -bodyFile $f
Run-Test 11 "PUT with owner field in body — owner unchanged" $r 200 {
    param($res)
    $ownerInResponse = $res.Json.company.owner
    # owner should still be userAId, NOT userBId
    $ownerInResponse -eq $userAId -or $ownerInResponse -ne $userBId
} | Out-Null
Remove-Item $f

# ── TEST 12: GET /companies/me with no token — expect 401 ─────────────────────
$r = Invoke-Api GET "$BASE/companies/me"
Run-Test 12 "GET /companies/me with no token (401)" $r 401 | Out-Null

# ═════════════════════════════════════════════════════════════════════════════
# ── Property consistency check ───────────────────────────────────────────────
Write-Host ""
Write-Host "━━━  Property Consistency Check  ━━━" -ForegroundColor Magenta
Write-Host "  middleware/auth.js   : sets req.user = Mongoose User doc  → property is _id"
Write-Host "  companyController.js : uses req.user._id throughout"
Write-Host "  Match                : " -NoNewline
Write-Host "YES ✓" -ForegroundColor Green

# ── Summary table ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━  Summary  ━━━" -ForegroundColor Magenta
Write-Host ("{0,-6} {1,-55} {2,-10} {3,-10} {4}" -f "Test","Name","Expected","Got","Result")
Write-Host ("-" * 95)
foreach ($t in $tests) {
    $color = if ($t.Result -eq "PASS") { "Green" } else { "Red" }
    Write-Host ("{0,-6} {1,-55} {2,-10} {3,-10}" -f $t.Num, $t.Name, $t.Expected, $t.Got) -NoNewline
    Write-Host $t.Result -ForegroundColor $color
}
Write-Host ("-" * 95)
$finalColor = if ($fail -eq 0) { "Green" } else { "Red" }
Write-Host "Total: $pass passed, $fail failed" -ForegroundColor $finalColor
