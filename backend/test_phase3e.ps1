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

# ── Generate dynamic slot dates in ISO 8601 UTC ──────────────────────────────
$now = [DateTime]::UtcNow
$slot1Start = $now.AddDays(1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$slot1End   = $now.AddDays(1).AddMinutes(45).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$slot2Start = $now.AddDays(2).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$slot2End   = $now.AddDays(2).AddMinutes(60).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$slot3Start = $now.AddDays(3).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$slot3End   = $now.AddDays(3).AddMinutes(30).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

Write-Host "`n━━━  PHASE 3e — Interview Scheduling Tests  ━━━" -ForegroundColor Magenta

# ════════════ SETUP ══════════════════════════════════════════════════════════
Write-Host "`n── Setup ──" -ForegroundColor Gray

# 1. Recruiter A + Company A + Job A1
$f = Write-Body "{`"name`":`"Recruiter A`",`"email`":`"rA_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pA = (Parse-Response $r).Json; $tokenA = $pA.token; $userAId = $pA.user.id

$f = Write-Body '{"name":"Acme Corp","industry":"Tech"}'
Invoke-Api POST "${BASE}/companies" -token $tokenA -bodyFile $f | Out-Null; Remove-Item $f

$f = Write-Body '{"title":"Backend Architect","description":"Lead system design","jobType":"full-time"}'
$r = Invoke-Api POST "${BASE}/jobs" -token $tokenA -bodyFile $f; Remove-Item $f
$jobA1Id = (Parse-Response $r).Json.job._id

# 2. Recruiter B + Company B
$f = Write-Body "{`"name`":`"Recruiter B`",`"email`":`"rB_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"recruiter`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pB = (Parse-Response $r).Json; $tokenB = $pB.token; $userBId = $pB.user.id

$f = Write-Body '{"name":"Beta Ltd","industry":"Finance"}'
Invoke-Api POST "${BASE}/companies" -token $tokenB -bodyFile $f | Out-Null; Remove-Item $f

# 3. Candidates: C1, C2
$f = Write-Body "{`"name`":`"Candidate One`",`"email`":`"c1_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC1 = (Parse-Response $r).Json; $tokenC1 = $pC1.token; $userC1Id = $pC1.user.id

$f = Write-Body "{`"name`":`"Candidate Two`",`"email`":`"c2_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$pC2 = (Parse-Response $r).Json; $tokenC2 = $pC2.token; $userC2Id = $pC2.user.id

# C1 applies to A1
$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
$r = Invoke-Api POST "${BASE}/applications" -token $tokenC1 -bodyFile $f; Remove-Item $f
$appC1Id = (Parse-Response $r).Json.application._id

# C2 applies to A1 (remains "applied")
$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
$r = Invoke-Api POST "${BASE}/applications" -token $tokenC2 -bodyFile $f; Remove-Item $f
$appC2Id = (Parse-Response $r).Json.application._id

# Recruiter A moves C1 application to "shortlisted"
$f = Write-Body '{"status":"shortlisted"}'
Invoke-Api PATCH "${BASE}/applications/${appC1Id}/status" -token $tokenA -bodyFile $f | Out-Null; Remove-Item $f

Write-Host "  Recruiter A : $userAId | Job A1: $jobA1Id"
Write-Host "  Recruiter B : $userBId"
Write-Host "  Candidate C1: $userC1Id (Application $appC1Id : shortlisted)"
Write-Host "  Candidate C2: $userC2Id (Application $appC2Id : applied)"

# ════════════ TESTS ══════════════════════════════════════════════════════════
Write-Host "`n━━━  Running Tests  ━━━" -ForegroundColor Magenta

# ── TEST 1: Recruiter A creates interview for C2 (not shortlisted) -> 400 ─────
$p1 = @"
{
  "applicationId": "${appC2Id}",
  "mode": "online",
  "meetingLink": "https://meet.google.com/abc-defg-hij",
  "slots": [{ "start": "${slot1Start}", "end": "${slot1End}" }]
}
"@
$f = Write-Body $p1
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 1 "Create interview for non-shortlisted application (400)" $r 400 {
    param($res) $res.Json.message -match "shortlisted"
} | Out-Null

# ── TEST 2: Recruiter A creates interview for C1 -> 201 ───────────────────────
$p2 = @"
{
  "applicationId": "${appC1Id}",
  "mode": "online",
  "meetingLink": "https://meet.google.com/abc-defg-hij",
  "notes": "Technical discussion",
  "slots": [
    { "start": "${slot1Start}", "end": "${slot1End}" },
    { "start": "${slot2Start}", "end": "${slot2End}" }
  ]
}
"@
$f = Write-Body $p2
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
$res2 = Run-Test 2 "Recruiter A creates interview: proposed, candidate & recruiter set by server (201)" $r 201 {
    param($res)
    $inv = $res.Json.interview
    $inv.status -eq "proposed" -and
    $inv.candidate._id -eq $userC1Id -and
    $inv.recruiter._id -eq $userAId -and
    $inv.job._id -eq $jobA1Id -and
    $inv.proposedSlots.Count -eq 2
}
$interviewC1Id = $res2.Json.interview._id

# ── TEST 3: Create second active interview for same application -> 409 ────────
$f = Write-Body $p2
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 3 "Create second active interview for same application: 409 duplicate" $r 409 {
    param($res) $res.Json.message -match "already exists"
} | Out-Null

# ── TEST 4: Recruiter B and Candidate C1 try to create interview -> 403 ───────
$f = Write-Body $p2
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenB -bodyFile $f; Remove-Item $f
Run-Test "4a" "Recruiter B creates interview for A1 application (403)" $r 403 | Out-Null

$f = Write-Body $p2
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test "4b" "Candidate C1 creates interview (403 role)" $r 403 | Out-Null

# ── TEST 5: Validation failures ───────────────────────────────────────────────
# Setup a fresh shortlisted candidate C3 for test 5 validations
$f = Write-Body "{`"name`":`"Candidate Three`",`"email`":`"c3_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$tokenC3 = (Parse-Response $r).Json.token

$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
$r = Invoke-Api POST "${BASE}/applications" -token $tokenC3 -bodyFile $f; Remove-Item $f
$appC3Id = (Parse-Response $r).Json.application._id

$f = Write-Body '{"status":"shortlisted"}'
Invoke-Api PATCH "${BASE}/applications/${appC3Id}/status" -token $tokenA -bodyFile $f | Out-Null; Remove-Item $f

# 5a: Slot in the past -> 400
$pastStart = $now.AddHours(-2).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$pastEnd   = $now.AddHours(-1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$f = Write-Body "{`"applicationId`":`"${appC3Id}`",`"mode`":`"phone`",`"slots`":[{`"start`":`"${pastStart}`",`"end`":`"${pastEnd}`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "5a" "Slot in the past: 400" $r 400 | Out-Null

# 5b: End before start -> 400
$f = Write-Body "{`"applicationId`":`"${appC3Id}`",`"mode`":`"phone`",`"slots`":[{`"start`":`"${slot1End}`",`"end`":`"${slot1Start}`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "5b" "End before start: 400" $r 400 | Out-Null

# 5c: Shorter than 15 minutes (10 mins) -> 400
$shortEnd = $now.AddDays(1).AddMinutes(10).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$f = Write-Body "{`"applicationId`":`"${appC3Id}`",`"mode`":`"phone`",`"slots`":[{`"start`":`"${slot1Start}`",`"end`":`"${shortEnd}`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "5c" "Shorter than 15 minutes: 400" $r 400 | Out-Null

# 5d: Longer than 240 minutes (300 mins) -> 400
$longEnd = $now.AddDays(1).AddMinutes(300).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$f = Write-Body "{`"applicationId`":`"${appC3Id}`",`"mode`":`"phone`",`"slots`":[{`"start`":`"${slot1Start}`",`"end`":`"${longEnd}`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "5d" "Longer than 240 minutes: 400" $r 400 | Out-Null

# 5e: 0 slots -> 422
$f = Write-Body "{`"applicationId`":`"${appC3Id}`",`"mode`":`"phone`",`"slots`":[]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "5e" "Zero slots: 422" $r 422 | Out-Null

# 5f: 6 slots -> 422
$slots6 = @()
for ($i=1; $i -le 6; $i++) {
    $s = $now.AddDays($i).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $e = $now.AddDays($i).AddMinutes(30).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $slots6 += "{`"start`":`"$s`",`"end`":`"$e`"}"
}
$body6 = "{`"applicationId`":`"${appC3Id}`",`"mode`":`"phone`",`"slots`":[" + ($slots6 -join ",") + "]}"
$f = Write-Body $body6
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "5f" "Six slots: 422" $r 422 | Out-Null

# 5g: Overlapping slots inside same request -> 400
$overlapA = $now.AddDays(4).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$overlapB = $now.AddDays(4).AddMinutes(45).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$overlapC = $now.AddDays(4).AddMinutes(30).ToString("yyyy-MM-ddTHH:mm:ss.fffZ") # overlaps
$overlapD = $now.AddDays(4).AddMinutes(75).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$f = Write-Body "{`"applicationId`":`"${appC3Id}`",`"mode`":`"phone`",`"slots`":[{`"start`":`"$overlapA`",`"end`":`"$overlapB`"},{`"start`":`"$overlapC`",`"end`":`"$overlapD`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "5g" "Two overlapping slots in same request: 400" $r 400 | Out-Null

# 5h: Online without meetingLink -> 422
$f = Write-Body "{`"applicationId`":`"${appC3Id}`",`"mode`":`"online`",`"slots`":[{`"start`":`"${slot1Start}`",`"end`":`"${slot1End}`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "5h" "Online without meetingLink: 422" $r 422 | Out-Null

# 5i: Onsite without location -> 422
$f = Write-Body "{`"applicationId`":`"${appC3Id}`",`"mode`":`"onsite`",`"slots`":[{`"start`":`"${slot1Start}`",`"end`":`"${slot1End}`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "5i" "Onsite without location: 422" $r 422 | Out-Null

# 5j: Invalid mode -> 422
$f = Write-Body "{`"applicationId`":`"${appC3Id}`",`"mode`":`"telepathy`",`"slots`":[{`"start`":`"${slot1Start}`",`"end`":`"${slot1End}`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "5j" "Invalid mode: 422" $r 422 | Out-Null

# 5k: Invalid date format -> 422
$f = Write-Body "{`"applicationId`":`"${appC3Id}`",`"mode`":`"phone`",`"slots`":[{`"start`":`"tomorrow`",`"end`":`"day-after`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "5k" "Invalid date format: 422" $r 422 | Out-Null

# ── TEST 6: Body override ignored ─────────────────────────────────────────────
$overridePayload = @"
{
  "applicationId": "${appC3Id}",
  "mode": "phone",
  "candidate": "${FAKE}",
  "recruiter": "${FAKE}",
  "status": "confirmed",
  "slots": [{ "start": "${slot1Start}", "end": "${slot1End}" }]
}
"@
$f = Write-Body $overridePayload
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test 6 "Body override of candidate, recruiter, status ignored (201)" $r 201 {
    param($res)
    $inv = $res.Json.interview
    $inv.status -eq "proposed" -and
    $inv.recruiter._id -eq $userAId -and
    $inv.candidate._id -ne $FAKE
} | Out-Null

# ── TEST 7: Listing interviews ────────────────────────────────────────────────
# 7a: C1 GET /interviews/my sees own interview
$r = Invoke-Api GET "${BASE}/interviews/my" -token $tokenC1
Run-Test "7a" "C1 GET /interviews/my sees interview with job & company name" $r 200 {
    param($res)
    $list = $res.Json.interviews
    $list.Count -ge 1 -and
    $list[0].job.title -eq "Backend Architect" -and
    $list[0].job.company.name -eq "Acme Corp"
} | Out-Null

# 7b: C2 GET /interviews/my is empty
$r = Invoke-Api GET "${BASE}/interviews/my" -token $tokenC2
Run-Test "7b" "C2 GET /interviews/my is empty" $r 200 {
    param($res) $res.Json.count -eq 0
} | Out-Null

# 7c: Recruiter A GET /interviews/recruiter
$r = Invoke-Api GET "${BASE}/interviews/recruiter?status=proposed" -token $tokenA
Run-Test "7c" "Recruiter A GET /interviews/recruiter?status=proposed works" $r 200 {
    param($res)
    $list = $res.Json.interviews
    $list.Count -ge 1 -and
    $list[0].candidate.name -ne $null -and
    $list[0].job.title -eq "Backend Architect"
} | Out-Null

# 7d: Bad page/limit safe fallback
$r = Invoke-Api GET "${BASE}/interviews/recruiter?page=-1&limit=abc" -token $tokenA
Run-Test "7d" "Recruiter A GET /interviews/recruiter?page=-1&limit=abc safe fallback" $r 200 {
    param($res) $res.Json.page -eq 1
} | Out-Null

# 7e: Filter by application
$r = Invoke-Api GET "${BASE}/interviews/recruiter?application=${appC1Id}" -token $tokenA
Run-Test "7e" "Recruiter A GET /interviews/recruiter?application=... works" $r 200 {
    param($res)
    $list = $res.Json.interviews
    $list.Count -ge 1 -and $list[0].application -eq $appC1Id
} | Out-Null

# 7f: Filter by job and active=true
$r = Invoke-Api GET "${BASE}/interviews/recruiter?job=${jobA1Id}&active=true" -token $tokenA
Run-Test "7f" "Recruiter A GET /interviews/recruiter?job=...&active=true works" $r 200 {
    param($res)
    $list = $res.Json.interviews
    $list.Count -ge 1 -and ($list[0].status -eq "proposed" -or $list[0].status -eq "confirmed")
} | Out-Null

# 7g: Invalid application ID -> 400
$r = Invoke-Api GET "${BASE}/interviews/recruiter?application=not-a-valid-id" -token $tokenA
Run-Test "7g" "GET /interviews/recruiter?application=not-a-valid-id -> 400" $r 400 | Out-Null

# 7h: Invalid job ID -> 400
$r = Invoke-Api GET "${BASE}/interviews/recruiter?job=not-a-valid-id" -token $tokenA
Run-Test "7h" "GET /interviews/recruiter?job=not-a-valid-id -> 400" $r 400 | Out-Null

# 7i: Cross-recruiter isolation by job (Recruiter B queries A's job) -> total 0
$r = Invoke-Api GET "${BASE}/interviews/recruiter?job=${jobA1Id}&active=true" -token $tokenB
Run-Test "7i" "Recruiter B queries A's job -> 0 interviews (cross-recruiter isolation)" $r 200 {
    param($res) $res.Json.total -eq 0 -and $res.Json.interviews.Count -eq 0
} | Out-Null

# 7j: Cross-recruiter isolation by application (Recruiter B queries A's application) -> total 0
$r = Invoke-Api GET "${BASE}/interviews/recruiter?application=${appC1Id}" -token $tokenB
Run-Test "7j" "Recruiter B queries A's application -> 0 interviews (cross-recruiter isolation)" $r 200 {
    param($res) $res.Json.total -eq 0 -and $res.Json.interviews.Count -eq 0
} | Out-Null

# ── TEST 8: GET /api/interviews/:id access & privacy ──────────────────────────
# 8a: C1 GET :id -> 200, no passwords
$r = Invoke-Api GET "${BASE}/interviews/${interviewC1Id}" -token $tokenC1
Run-Test "8a" "C1 GET /interviews/:id: 200, no password in response" $r 200 {
    param($res)
    $rawStr = $res.Body
    -not ($rawStr -match "password")
} | Out-Null

# 8b: Recruiter A GET :id -> 200, no passwords
$r = Invoke-Api GET "${BASE}/interviews/${interviewC1Id}" -token $tokenA
Run-Test "8b" "Recruiter A GET /interviews/:id: 200, no password in response" $r 200 {
    param($res)
    $rawStr = $res.Body
    -not ($rawStr -match "password")
} | Out-Null

# 8c: C2 GET C1's interview -> 403
$r = Invoke-Api GET "${BASE}/interviews/${interviewC1Id}" -token $tokenC2
Run-Test "8c" "C2 GET C1's interview (403)" $r 403 | Out-Null

# 8d: Recruiter B GET C1's interview -> 403
$r = Invoke-Api GET "${BASE}/interviews/${interviewC1Id}" -token $tokenB
Run-Test "8d" "Recruiter B GET C1's interview (403)" $r 403 | Out-Null

# ── TEST 9: Confirmation & concurrency ────────────────────────────────────────
# 9a: C1 confirms with slotIndex 0
$f = Write-Body '{"slotIndex":0}'
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC1Id}/confirm" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test "9a" "C1 confirms with slotIndex 0: status=confirmed, selectedSlot set, statusHistory updated (200)" $r 200 {
    param($res)
    $inv = $res.Json.interview
    $inv.status -eq "confirmed" -and
    $inv.selectedSlot -ne $null -and
    $inv.statusHistory.Count -ge 2 -and
    $inv.statusHistory[-1].status -eq "confirmed"
} | Out-Null

# 9b: Confirm again -> 400
$f = Write-Body '{"slotIndex":0}'
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC1Id}/confirm" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test "9b" "Confirm again on already confirmed interview (400)" $r 400 | Out-Null

# 9c: Two confirms fired concurrently on a fresh interview -> exactly one 200 and one 400
# Create candidate C4 shortlisted
$f = Write-Body "{`"name`":`"Candidate Four`",`"email`":`"c4_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$tokenC4 = (Parse-Response $r).Json.token

$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
$r = Invoke-Api POST "${BASE}/applications" -token $tokenC4 -bodyFile $f; Remove-Item $f
$appC4Id = (Parse-Response $r).Json.application._id

$f = Write-Body '{"status":"shortlisted"}'
Invoke-Api PATCH "${BASE}/applications/${appC4Id}/status" -token $tokenA -bodyFile $f | Out-Null; Remove-Item $f

# Propose interview for C4 with non-overlapping slot3
$pC4Inv = @"
{
  "applicationId": "${appC4Id}",
  "mode": "phone",
  "slots": [
    { "start": "${slot3Start}", "end": "${slot3End}" }
  ]
}
"@
$f = Write-Body $pC4Inv
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
$interviewC4Id = (Parse-Response $r).Json.interview._id

# Concurrent confirms
$fConfirmC4 = Write-Body '{"slotIndex":0}'
$job1 = Start-Job -ScriptBlock {
    param($url, $tok, $bFile)
    curl.exe -s -w "`n%{http_code}" -X PATCH $url -H "Authorization: Bearer ${tok}" -H "Content-Type: application/json" --data "@${bFile}"
} -ArgumentList ("${BASE}/interviews/${interviewC4Id}/confirm", $tokenC4, $fConfirmC4)

$job2 = Start-Job -ScriptBlock {
    param($url, $tok, $bFile)
    curl.exe -s -w "`n%{http_code}" -X PATCH $url -H "Authorization: Bearer ${tok}" -H "Content-Type: application/json" --data "@${bFile}"
} -ArgumentList ("${BASE}/interviews/${interviewC4Id}/confirm", $tokenC4, $fConfirmC4)

$raw1 = Receive-Job -Job $job1 -Wait -AutoRemoveJob
$raw2 = Receive-Job -Job $job2 -Wait -AutoRemoveJob
Remove-Item $fConfirmC4

$c1Code = (Parse-Response $raw1).Code
$c2Code = (Parse-Response $raw2).Code

$concurrentPass = ($c1Code -eq "200" -and $c2Code -eq "400") -or ($c1Code -eq "400" -and $c2Code -eq "200")
if ($concurrentPass) {
    Write-Host ""
    Write-Host "TEST 9c — Concurrent confirms: exactly one 200 and one 400" -ForegroundColor Cyan
    Write-Host "  Status : $c1Code & $c2Code"
    Write-Host "  Result : " -NoNewline; Write-Host "PASS" -ForegroundColor Green
    $script:pass++
    $script:tests += [PSCustomObject]@{ Num="9c"; Name="Concurrent confirms: exactly one 200 and one 400"; Expected="One 200, one 400"; Got="$c1Code & $c2Code"; Result="PASS" }
} else {
    Write-Host ""
    Write-Host "TEST 9c — Concurrent confirms: exactly one 200 and one 400" -ForegroundColor Cyan
    Write-Host "  Status : $c1Code & $c2Code"
    Write-Host "  Result : " -NoNewline; Write-Host "FAIL" -ForegroundColor Red
    $script:fail++
    $script:tests += [PSCustomObject]@{ Num="9c"; Name="Concurrent confirms: exactly one 200 and one 400"; Expected="One 200, one 400"; Got="$c1Code & $c2Code"; Result="FAIL" }
}

# ── TEST 10: Invalid slotIndex (negative, too large, not a number) ────────────
# 10a: negative slotIndex -> 422
$f = Write-Body '{"slotIndex":-1}'
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC1Id}/confirm" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test "10a" "Negative slotIndex (422)" $r 422 | Out-Null

# 10b: not a number -> 422
$f = Write-Body '{"slotIndex":"first"}'
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC1Id}/confirm" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test "10b" "Non-numeric slotIndex (422)" $r 422 | Out-Null

# 10c: slotIndex too large -> 400
# Use a fresh proposed interview for candidate C5
$f = Write-Body "{`"name`":`"Candidate Five`",`"email`":`"c5_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$tokenC5 = (Parse-Response $r).Json.token

$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
$r = Invoke-Api POST "${BASE}/applications" -token $tokenC5 -bodyFile $f; Remove-Item $f
$appC5Id = (Parse-Response $r).Json.application._id

$f = Write-Body '{"status":"shortlisted"}'
Invoke-Api PATCH "${BASE}/applications/${appC5Id}/status" -token $tokenA -bodyFile $f | Out-Null; Remove-Item $f

$slot5Start = $now.AddDays(5).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$slot5End   = $now.AddDays(5).AddMinutes(30).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$f = Write-Body "{`"applicationId`":`"${appC5Id}`",`"mode`":`"phone`",`"slots`":[{`"start`":`"$slot5Start`",`"end`":`"$slot5End`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
$interviewC5Id = (Parse-Response $r).Json.interview._id

$f = Write-Body '{"slotIndex":99}'
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC5Id}/confirm" -token $tokenC5 -bodyFile $f; Remove-Item $f
Run-Test "10c" "slotIndex too large: 400" $r 400 | Out-Null

# ── TEST 11: Slot that has passed in the database ─────────────────────────────
# Set proposedSlots.0.start in past directly in MongoDB
$nodeScript11 = @"
require('dotenv').config();
const mongoose = require('mongoose');
const Interview = require('./models/Interview');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  await Interview.updateOne(
    { _id: '${interviewC5Id}' },
    { `$set: { 'proposedSlots.0.start': new Date(Date.now() - 3600000), 'proposedSlots.0.end': new Date(Date.now() - 1800000) } }
  );
  await mongoose.disconnect();
  console.log('proposedSlot updated to past');
  process.exit(0);
});
"@
node -e $nodeScript11 | Out-Null

$f = Write-Body '{"slotIndex":0}'
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC5Id}/confirm" -token $tokenC5 -bodyFile $f; Remove-Item $f
Run-Test 11 "Confirm slot that has passed: 400" $r 400 {
    param($res) $res.Json.message -match "no longer in the future"
} | Out-Null

# ── TEST 12: Overlap check against confirmed selectedSlot -> 409 ──────────────
# Setup candidate C6 shortlisted
$f = Write-Body "{`"name`":`"Candidate Six`",`"email`":`"c6_${TS}@t.com`",`"password`":`"pass1234`",`"role`":`"candidate`"}"
$r = Invoke-Api POST "${BASE}/auth/register" -bodyFile $f; Remove-Item $f
$tokenC6 = (Parse-Response $r).Json.token

$f = Write-Body "{`"jobId`":`"${jobA1Id}`"}"
$r = Invoke-Api POST "${BASE}/applications" -token $tokenC6 -bodyFile $f; Remove-Item $f
$appC6Id = (Parse-Response $r).Json.application._id

$f = Write-Body '{"status":"shortlisted"}'
Invoke-Api PATCH "${BASE}/applications/${appC6Id}/status" -token $tokenA -bodyFile $f | Out-Null; Remove-Item $f

# Note: In Test 9a, C1 confirmed slot1 ($slot1Start to $slot1End)
# In createInterview, proposing a slot that overlaps a confirmed interview is caught and rejected with 409!
$f = Write-Body "{`"applicationId`":`"${appC6Id}`",`"mode`":`"phone`",`"slots`":[{`"start`":`"$slot1Start`",`"end`":`"$slot1End`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
Run-Test "12a" "Propose slot overlapping existing confirmed interview: 409 on create" $r 409 | Out-Null

# Next, test confirming an overlapping slot:
# Recruiter proposes non-overlapping slot6 ($slot6Start to $slot6End) to C6
$slot6Start = $now.AddDays(6).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$slot6End   = $now.AddDays(6).AddMinutes(30).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$f = Write-Body "{`"applicationId`":`"${appC6Id}`",`"mode`":`"phone`",`"slots`":[{`"start`":`"$slot6Start`",`"end`":`"$slot6End`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
$interviewC6Id = (Parse-Response $r).Json.interview._id

# Now update C1's confirmed selectedSlot to overlap slot6 via MongoDB directly, simulating a concurrent confirmation
$nodeScript12 = @"
require('dotenv').config();
const mongoose = require('mongoose');
const Interview = require('./models/Interview');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  await Interview.updateOne(
    { _id: '${interviewC1Id}' },
    { `$set: { 'selectedSlot.start': new Date('${slot6Start}'), 'selectedSlot.end': new Date('${slot6End}') } }
  );
  await mongoose.disconnect();
  console.log('C1 selectedSlot shifted to slot6');
  process.exit(0);
});
"@
node -e $nodeScript12 | Out-Null

# Now candidate C6 tries to confirm slot6 -> 409 overlap!
$f = Write-Body '{"slotIndex":0}'
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC6Id}/confirm" -token $tokenC6 -bodyFile $f; Remove-Item $f
Run-Test "12b" "Candidate tries to confirm slot that now overlaps confirmed interview: 409" $r 409 {
    param($res) $res.Json.message -match "overlaps an existing confirmed interview"
} | Out-Null

# ── TEST 13: Unauthorized confirm, decline, cancel -> 403 ─────────────────────
# C2 tries to confirm C6's interview -> 403
$f = Write-Body '{"slotIndex":0}'
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC6Id}/confirm" -token $tokenC2 -bodyFile $f; Remove-Item $f
Run-Test "13a" "Another candidate (C2) tries to confirm: 403" $r 403 | Out-Null

# C2 tries to decline C6's interview -> 403
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC6Id}/decline" -token $tokenC2
Run-Test "13b" "Another candidate (C2) tries to decline: 403" $r 403 | Out-Null

# Recruiter B tries to cancel A's interview -> 403
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC6Id}/cancel" -token $tokenB
Run-Test "13c" "Recruiter B tries to cancel A's interview: 403" $r 403 | Out-Null

# ── TEST 14: Decline interview ────────────────────────────────────────────────
# 14a: Candidate C6 declines fresh proposed interview -> 200
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC6Id}/decline" -token $tokenC6
Run-Test "14a" "Candidate declines proposed interview: status=declined (200)" $r 200 {
    param($res) $res.Json.interview.status -eq "declined"
} | Out-Null

# 14b: Try to decline already confirmed interview (interviewC1Id) -> 400
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC1Id}/decline" -token $tokenC1
Run-Test "14b" "Decline already confirmed interview: 400" $r 400 | Out-Null

# ── TEST 15: Cancel interview ─────────────────────────────────────────────────
# 15a: Recruiter A cancels confirmed interview (interviewC1Id) -> 200
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC1Id}/cancel" -token $tokenA
Run-Test "15a" "Recruiter cancels confirmed interview: status=cancelled (200)" $r 200 {
    param($res) $res.Json.interview.status -eq "cancelled"
} | Out-Null

# 15b: Cancel it again -> 400
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC1Id}/cancel" -token $tokenA
Run-Test "15b" "Cancel already cancelled interview: 400" $r 400 | Out-Null

# ── TEST 16: Create new interview after cancel or decline -> 201 ──────────────
# App C1's interview was cancelled. Recruiter A proposes a new interview for App C1
$slot7Start = $now.AddDays(7).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$slot7End   = $now.AddDays(7).AddMinutes(45).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$f = Write-Body "{`"applicationId`":`"${appC1Id}`",`"mode`":`"phone`",`"slots`":[{`"start`":`"$slot7Start`",`"end`":`"$slot7End`"}]}"
$r = Invoke-Api POST "${BASE}/interviews" -token $tokenA -bodyFile $f; Remove-Item $f
$res16 = Run-Test 16 "Recruiter A creates new interview for same application after cancellation (201)" $r 201 {
    param($res) $res.Json.interview.status -eq "proposed"
}
$interviewC1NewId = $res16.Json.interview._id

# ── TEST 17: Move application away from shortlisted, then try confirm -> 400 ──
# Change C1's application status to "rejected"
$f = Write-Body '{"status":"rejected"}'
Invoke-Api PATCH "${BASE}/applications/${appC1Id}/status" -token $tokenA -bodyFile $f | Out-Null; Remove-Item $f

# C1 tries to confirm the proposed interview -> 400
$f = Write-Body '{"slotIndex":0}'
$r = Invoke-Api PATCH "${BASE}/interviews/${interviewC1NewId}/confirm" -token $tokenC1 -bodyFile $f; Remove-Item $f
Run-Test 17 "Confirm when application moved away from shortlisted: 400" $r 400 {
    param($res) $res.Json.message -match "no longer shortlisted"
} | Out-Null

# ── TEST 18: Invalid ID (400), Missing ID (404), No token (401) ──────────────
# 18a: Invalid ObjectId -> 400
$r = Invoke-Api GET "${BASE}/interviews/invalid-id" -token $tokenA
Run-Test "18a" "GET /interviews/invalid-id (400)" $r 400 | Out-Null

# 18b: Missing ID -> 404
$r = Invoke-Api GET "${BASE}/interviews/${FAKE}" -token $tokenA
Run-Test "18b" "GET /interviews/<missing-id> (404)" $r 404 | Out-Null

# 18c: No token on GET /interviews/my -> 401
$r = Invoke-Api GET "${BASE}/interviews/my"
Run-Test "18c" "GET /interviews/my no token (401)" $r 401 | Out-Null

# 18d: No token on POST /interviews -> 401
$f = Write-Body "{`"applicationId`":`"${appC1Id}`"}"
$r = Invoke-Api POST "${BASE}/interviews" -bodyFile $f; Remove-Item $f
Run-Test "18d" "POST /interviews no token (401)" $r 401 | Out-Null

# ════════════ CODE SAFETY CHECKS ══════════════════════════════════════════════
Write-Host ""
Write-Host "━━━  Code Safety & Architecture Checks  ━━━" -ForegroundColor Magenta

$ctrl = Get-Content "controllers\interviewController.js" -Raw
$equalsCount = ([regex]::Matches($ctrl, '\.equals\(')).Count
$dangerousEq = ([regex]::Matches($ctrl, '(req\.user\._id|interview\.candidate|interview\.recruiter)\s*===|===\s*(req\.user\._id|interview\.candidate|interview\.recruiter)')).Count

Write-Host "  .equals() calls found in interviewController.js : $equalsCount"
Write-Host "  Dangerous === on ObjectIds: " -NoNewline
if ($dangerousEq -eq 0) { Write-Host "NONE ✓" -ForegroundColor Green }
else                     { Write-Host "$dangerousEq FOUND — review!" -ForegroundColor Red }

Write-Host "  Confirm logic function : confirmInterview (controllers/interviewController.js)"
Write-Host "  Decline logic function : declineInterview (controllers/interviewController.js)"
Write-Host "  Cancel logic function  : cancelInterview (controllers/interviewController.js)"

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
