@echo off
REM ADRESTIA frontend — start dev server with a FRESH .next cache every time.
REM This fixes the "styles break after refresh" issue permanently.
cd /d %~dp0
echo Cleaning .next cache...
rmdir /s /q .next 2>nul
echo Starting dev server on http://localhost:3000 ...
call npm run dev
pause
