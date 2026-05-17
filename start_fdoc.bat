@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [FDoc] Creating virtual environment...
  python -m venv .venv
)

echo [FDoc] Installing dependencies...
call ".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo [FDoc] Failed to install dependencies.
  pause
  exit /b 1
)

echo [FDoc] Starting server at http://127.0.0.1:8000
call ".venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

endlocal
