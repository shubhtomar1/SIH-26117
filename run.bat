@echo off
REM ============================================================
REM  ADRESTIA - ONE COMMAND TO RUN EVERYTHING
REM  Type:  run      (from the project root)  or double-click.
REM
REM  Fast path: if the site is already built (frontend\out exists),
REM  it SKIPS the ~1-2 min build and starts instantly.
REM  Rebuild only when you changed the frontend code:
REM      run.bat build
REM ============================================================
cd /d "%~dp0"

echo [1/4] Freeing ports 3000 and 8000 ...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>&1

echo [2/4] Starting backend (new window) ...
start "ADRESTIA Backend" "%~dp0backend\start-backend.bat"

if /i "%~1"=="build" goto :build
if not exist "frontend\out\index.html" (
    echo No build found - building once ...
    goto :build
)

:serve
echo [3/4] Using existing build (instant).
echo [4/4] Website: http://localhost:3000   API: http://127.0.0.1:8000/docs
echo (Keep THIS window open. Ctrl+C or close it to stop the website.)
cd frontend
npx --yes serve@latest out -l 3000
goto :eof

:build
echo [3/4] Building frontend (~1 min) ...
cd frontend
call npm run build
if errorlevel 1 (
    echo BUILD FAILED - fix the errors above.
    pause
    exit /b 1
)
goto :serve
