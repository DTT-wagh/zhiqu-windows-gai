@echo off
setlocal
cd /d "%~dp0frontend"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js LTS is required to serve the web build. Install Node.js and run this file again.
  pause
  exit /b 1
)

echo Starting Zhiqu web demo at http://localhost:8082 ...
node serve-static.cjs
pause
