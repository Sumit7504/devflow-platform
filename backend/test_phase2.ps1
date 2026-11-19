Set-Location "e:\Projects\Devflow Platform\backend"

# ── Helper: write JSON body to a temp file so PowerShell never touches the braces ──
function Write-Body($json) {
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmp, $json, [System.Text.Encoding]::UTF8)
    return $tmp
}

# ── Start server ──────────────────────────────────────────────────────────────
$server = Start-Process node -ArgumentList "server.js" -PassThru -NoNewWindow `
          -RedirectStandardOutput "$env:TEMP\devflow_out.txt" `
          -RedirectStandardError  "$env:TEMP\devflow_err.txt"
Start-Sleep -Seconds 4

$pass = 0
$fail = 0

function Run-Test {
    param($name, $response, $expectedCode)
    $lines    = $response -split "`n"
    $httpCode = $lines[-1].Trim()
    $body     = ($lines[0..($lines.Count - 2)] -join "`n").Trim()

    if ($httpCode -eq [string]$expectedCode) {
        Write-Host "  [PASS]" -ForegroundColor Green -NoNewline
        $script:pass++
    } else {
        Write-Host "  [FAIL] got HTTP $httpCode, expected $expectedCode" -ForegroundColor Red -NoNewline
        $script:fail++
    }
    Write-Host " $name"
    Write-Host "  $body"
    Write-Host ""
    return $body
}

$BASE = "http://localhost:5000/api/auth"

# ── TEST 1: Register as candidate ────────────────────────────────────────────
Write-Host "TEST 1: Register candidate" -ForegroundColor Yellow
$f1 = Write-Body '{"name":"Alice","email":"alice@devflow.com","password":"secret123","role":"candidate"}'
$r1 = curl.exe -s -w "`n%{http_code}" -X POST "$BASE/register" `
      -H "Content-Type: application/json" --data "@$f1"
$r1body = Run-Test "POST /register (candidate)" $r1 201
$token = try { ($r1body | ConvertFrom-Json).token } catch { "" }

# ── TEST 2: Login ─────────────────────────────────────────────────────────────
Write-Host "TEST 2: Login" -ForegroundColor Yellow
$f2 = Write-Body '{"email":"alice@devflow.com","password":"secret123"}'
$r2 = curl.exe -s -w "`n%{http_code}" -X POST "$BASE/login" `
      -H "Content-Type: application/json" --data "@$f2"
Run-Test "POST /login" $r2 200 | Out-Null

# ── TEST 3: GET /me with valid token ─────────────────────────────────────────
Write-Host "TEST 3: GET /me with valid token" -ForegroundColor Yellow
$r3 = curl.exe -s -w "`n%{http_code}" "$BASE/me" `
      -H "Authorization: Bearer $token"
Run-Test "GET /me (valid token)" $r3 200 | Out-Null

# ── TEST 4: GET /admin-only with candidate token — expect 403 ────────────────
Write-Host "TEST 4: GET /admin-only with candidate token (expect 403)" -ForegroundColor Yellow
$r4 = curl.exe -s -w "`n%{http_code}" "$BASE/admin-only" `
      -H "Authorization: Bearer $token"
Run-Test "GET /admin-only (candidate token)" $r4 403 | Out-Null

# ── TEST 5: GET /me with no token — expect 401 ───────────────────────────────
Write-Host "TEST 5: GET /me with no token (expect 401)" -ForegroundColor Yellow
$r5 = curl.exe -s -w "`n%{http_code}" "$BASE/me"
Run-Test "GET /me (no token)" $r5 401 | Out-Null

# ── TEST 6: Register with role admin — expect 422 ────────────────────────────
Write-Host "TEST 6: Register with role=admin (expect 422)" -ForegroundColor Yellow
$f6 = Write-Body '{"name":"Hacker","email":"hacker@devflow.com","password":"secret123","role":"admin"}'
$r6 = curl.exe -s -w "`n%{http_code}" -X POST "$BASE/register" `
      -H "Content-Type: application/json" --data "@$f6"
Run-Test "POST /register (role=admin)" $r6 422 | Out-Null

# ── Cleanup temp files ────────────────────────────────────────────────────────
Remove-Item $f1, $f2, $f6 -ErrorAction SilentlyContinue

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host "──────────────────────────────────────────"
$color = if ($fail -eq 0) { "Green" } else { "Red" }
Write-Host "Results: $pass passed, $fail failed" -ForegroundColor $color

# ── Stop server ───────────────────────────────────────────────────────────────
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
Write-Host "Server stopped."
