Set-Location "e:\Projects\Devflow Platform\backend"

$srv = Start-Process node -ArgumentList "server.js" -PassThru -NoNewWindow `
       -RedirectStandardOutput "$env:TEMP\devflow_out.txt" `
       -RedirectStandardError  "$env:TEMP\devflow_err.txt"

Write-Host "Server started (PID $($srv.Id)), waiting 5 s..."
Start-Sleep 5

powershell -ExecutionPolicy Bypass -File "test_phase3b.ps1"

Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
Write-Host "Server stopped."
