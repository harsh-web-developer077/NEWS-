@echo off
rem Apne computer par site chalane ke liye. Pehle nodejs.org se Node.js (version 22 ya upar) install karein.
rem Is file par double-click karein, phir browser me http://localhost:3000 kholein.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nahi mila. https://nodejs.org se LTS version install karein, phir dobara chalayein.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Pehli baar: zaroori packages install ho rahe hain...
  call npm install
)
start "" http://localhost:3000
node server.js
pause
