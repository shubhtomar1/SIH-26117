@echo off
cd /d "%~dp0"
if not exist venv\Scripts\python.exe (
    echo [ERROR] venv not found. Run setup.bat first.
    pause
    exit /b 1
)
echo Starting ADRESTIA backend with project venv...
venv\Scripts\python.exe -m uvicorn app.main:app --reload
pause
