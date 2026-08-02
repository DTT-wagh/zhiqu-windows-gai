@echo off
setlocal
cd /d "%~dp0server"

if not exist data mkdir data
where java >nul 2>nul
if errorlevel 1 (
  echo Java 17 or newer is required. Install Eclipse Temurin 17 and run this file again.
  pause
  exit /b 1
)

if exist .env set SPRING_CONFIG_IMPORT=optional:file:.env[.properties]

echo Starting Zhiqu API at http://localhost:8080 ...
java -jar zhiqu-server.jar
pause
