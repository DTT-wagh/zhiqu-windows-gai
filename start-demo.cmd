@echo off
setlocal

start "Zhiqu API" cmd /k call "%~dp0start-server.cmd"
timeout /t 3 /nobreak >nul
start "Zhiqu Web" cmd /k call "%~dp0start-web.cmd"
timeout /t 2 /nobreak >nul
start "" http://localhost:8082
