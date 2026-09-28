@echo off
REM ADRESTIA frontend one-shot setup (Windows). Run once per machine.
cd /d %~dp0
node --version || (echo [ERROR] Node 18+ required. && pause && exit /b 1)
if not exist node_modules ( call npm install ) else ( echo node_modules already present, skipping. )
echo.
echo Done. Start frontend with:
echo   npm run dev
pause
