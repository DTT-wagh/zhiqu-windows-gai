@echo off
setlocal

start "Zhiqu API" cmd /k call "%~dp0start-server.cmd"

echo Waiting for Zhiqu API to become ready ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline = (Get-Date).AddSeconds(45); while ((Get-Date) -lt $deadline) { try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/actuator/health' -TimeoutSec 2; if ($health.status -eq 'UP') { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; exit 1"
if errorlevel 1 (
  echo Zhiqu API did not become ready within 45 seconds.
  echo Check the Zhiqu API window for the startup error.
  pause
  exit /b 1
)

start "Zhiqu Web" cmd /k call "%~dp0start-web.cmd"
timeout /t 2 /nobreak >nul
start "" http://localhost:8082
