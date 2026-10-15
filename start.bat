@echo off
chcp 65001 >nul
rem Gioco da solo su questo computer.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node non risulta installato. Scaricalo da https://nodejs.org e riprova.
  pause
  exit /b 1
)
start "VTT" cmd /c node server.js
timeout /t 2 /nobreak >nul
start "" http://localhost:3000
echo.
echo   Il tavolo e' su http://localhost:3000 - chiudi la finestra "VTT" per fermarlo.
echo.
pause
