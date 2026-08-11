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

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js LTS is required to assemble the server patch set. Install Node.js and run this file again.
  pause
  exit /b 1
)

echo Assembling server from the immutable baseline and registered patches ...
node patch-src\apply-patches.cjs
if errorlevel 1 (
  if not exist generated\zhiqu-server.jar (
    echo Server assembly failed and no previously generated server is available.
    pause
    exit /b 1
  )
  echo WARNING: Server assembly failed. Starting the last successfully generated server.
)

if exist .env set SPRING_CONFIG_IMPORT=optional:file:.env[.properties]

echo Starting Zhiqu API at http://localhost:8080 ...
java -jar generated\zhiqu-server.jar
pause
