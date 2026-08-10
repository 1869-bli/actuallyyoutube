@echo off
title actuallyYOUtube
cd /d "%~dp0"

where python >nul 2>nul || (
  echo [ERROR] Python is not installed. Get it from https://python.org
  pause
  exit /b
)

title actuallyYOUtube - installing
pip install -q -r requirements.txt

title actuallyYOUtube
start "" "http://127.0.0.1:5000"
python app.py

pause