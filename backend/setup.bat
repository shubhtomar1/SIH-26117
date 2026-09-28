@echo off
REM ADRESTIA backend one-shot setup (Windows). Run once per machine.
cd /d %~dp0
python --version || (echo [ERROR] Python 3.11+ required. && pause && exit /b 1)
if not exist venv ( python -m venv venv ) else ( echo venv already exists, reusing. )
call venv\Scripts\activate
pip install -r requirements.txt
if not exist .env ( copy .env.example .env >nul && echo .env created from example. )
echo.
echo Done. Start backend with:
echo   venv\Scripts\uvicorn app.main:app --reload
pause
