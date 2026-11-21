Set-Location "e:\Projects\Devflow Platform\backend"

$passCount = 0
$failCount = 0

function Report-Result($name, $passed, $details = "") {
    if ($passed) {
        $script:passCount++
        Write-Host "  [PASS] $name" -ForegroundColor Green
    } else {
        $script:failCount++
        Write-Host "  [FAIL] $name" -ForegroundColor Red
    }
    if ($details) { Write-Host "         $details" -ForegroundColor Gray }
}

function Write-Body($json) {
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmp, $json, [System.Text.Encoding]::UTF8)
    return $tmp
}

# 1. Stop any residual process on port 5000
$existing = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
if ($existing) {
    Stop-Process -Id $existing.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# 2. Start server with rate limiting ENABLED
$env:DISABLE_RATE_LIMIT = "false"
$env:NODE_ENV = "development"

$server = Start-Process node -ArgumentList "server.js" -PassThru -NoNewWindow
Start-Sleep -Seconds 4

$BASE = "http://localhost:5000/api"

try {
    Write-Host "`n--- Phase 6a Verification Tests ---" -ForegroundColor Cyan

    # TEST 1: CORS Check
    $rAllowed = curl.exe -s -i "$BASE/health" -H "Origin: http://localhost:5173"
    $hasAllowed = ($rAllowed -match "access-control-allow-origin:\s*http://localhost:5173")

    $rEvil = curl.exe -s -i "$BASE/health" -H "Origin: https://evil.example"
    $hasEvil = ($rEvil -match "access-control-allow-origin:\s*https://evil.example")

    $test1Pass = $hasAllowed -and (-not $hasEvil)
    Report-Result "CORS: http://localhost:5173 gets allow header, https://evil.example does not" $test1Pass `
        "AllowedHeader=$hasAllowed, EvilBlocked=$(-not $hasEvil)"

    # TEST 2: 11th Failed Login returns 429
    $fFail = Write-Body '{"email":"nobody_rate_test@devflow.com","password":"wrong_password"}'
    $all401 = $true
    for ($i = 1; $i -le 10; $i++) {
        $res = curl.exe -s -w "`n%{http_code}" -X POST "$BASE/auth/login" -H "Content-Type: application/json" --data "@$fFail"
        $code = ($res -split "`n")[-1].Trim()
        if ($code -ne "401") { $all401 = $false }
    }

    $r11 = curl.exe -s -w "`n%{http_code}" -X POST "$BASE/auth/login" -H "Content-Type: application/json" --data "@$fFail"
    Remove-Item $fFail -ErrorAction SilentlyContinue
    $r11Lines = $r11 -split "`n"
    $code11 = $r11Lines[-1].Trim()
    $body11 = ($r11Lines[0..($r11Lines.Count - 2)] -join "`n").Trim()
    $json11 = try { $body11 | ConvertFrom-Json } catch { $null }

    $test2Pass = $all401 -and ($code11 -eq "429") -and ($json11.success -eq $false) -and ($json11.message -match "Too many failed login attempts")
    Report-Result "Rate Limit: 10 failed logins return 401, 11th returns 429 in standard error format" $test2Pass `
        "TenFailedReturned401=$all401, EleventhStatus=$code11"

    # TEST 3: Body over 100kb returns 413, Malformed JSON returns 400
    # A) Body over 100kb
    $big = "X" * 115000
    $fBig = Write-Body "{`"email`":`"a@b.com`",`"data`":`"$big`"}"
    $rBig = curl.exe -s -w "`n%{http_code}" -X POST "$BASE/auth/login" -H "Content-Type: application/json" --data "@$fBig"
    Remove-Item $fBig -ErrorAction SilentlyContinue
    $bigLines = $rBig -split "`n"
    $codeBig = $bigLines[-1].Trim()
    $bodyBig = ($bigLines[0..($bigLines.Count - 2)] -join "`n").Trim()
    $jsonBig = try { $bodyBig | ConvertFrom-Json } catch { $null }
    $pass413 = ($codeBig -eq "413") -and ($jsonBig.success -eq $false) -and ($jsonBig.message -match "Payload too large")

    # B) Malformed JSON
    $fBad = Write-Body "{ bad_json_no_quotes "
    $rBad = curl.exe -s -w "`n%{http_code}" -X POST "$BASE/auth/login" -H "Content-Type: application/json" --data "@$fBad"
    Remove-Item $fBad -ErrorAction SilentlyContinue
    $badLines = $rBad -split "`n"
    $codeBad = $badLines[-1].Trim()
    $bodyBad = ($badLines[0..($badLines.Count - 2)] -join "`n").Trim()
    $jsonBad = try { $bodyBad | ConvertFrom-Json } catch { $null }
    $pass400 = ($codeBad -eq "400") -and ($jsonBad.success -eq $false) -and ($jsonBad.message -match "Malformed JSON")

    $test3Pass = $pass413 -and $pass400
    Report-Result "Payload Validation: Body > 100kb returns 413, malformed JSON returns 400" $test3Pass `
        "BodyOver100kb413=$pass413, MalformedJson400=$pass400"

} finally {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    Write-Host "`nServer stopped." -ForegroundColor Gray
}

Write-Host "Results: $passCount passed, $failCount failed`n" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
if ($failCount -gt 0) { exit 1 } else { exit 0 }
