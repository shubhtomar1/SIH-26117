@echo off
REM ADRESTIA frontend — production launcher (static export + tiny static server)
REM Safe to double-click any time: kills any old server on port 3000 first.
cd /d "%~dp0"

echo [1/3] Stopping any server already on port 3000...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>&1

echo [2/3] Building static site (out/) ...
call npm run build
if errorlevel 1 (
    echo BUILD FAILED — see errors above.
    pause
    exit /b 1
)

echo [3/3] Serving on http://localhost:3000 ...
npx --yes serve@latest out -l 3000
pause
