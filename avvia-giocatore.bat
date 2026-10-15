@echo off
chcp 65001 >nul
rem Avvia tutto quello che serve a un giocatore.
cd /d "%~dp0"
set "LINK=uffa-link\target\release\uffa-link.exe"

where node >nul 2>nul
if errorlevel 1 (
  echo Node non risulta installato. Scaricalo da https://nodejs.org e riprova.
  pause
  exit /b 1
)

if not exist "%LINK%" (
  echo uffa-link non e' compilato. Fallo una volta sola cosi':
  echo     cd uffa-link
  echo     cargo build --release
  echo.
  pause
  exit /b 1
)

set "ID=%~1"
if "%ID%"=="" set /p "ID=Incolla l'ID che ti ha dato il master e premi Invio: "
if "%ID%"=="" (
  echo Senza ID non posso collegarmi.
  pause
  exit /b 1
)

echo Avvio il VTT su http://localhost:3000 ...
start "VTT - file" cmd /c node server.js

echo Mi collego alla sessione ...
start "VTT - sessione" cmd /c "%LINK%" join %ID%

timeout /t 1 /nobreak >nul
start "VTT - gioco" cmd /c node game-server.js join

timeout /t 2 /nobreak >nul
start "" http://localhost:3000

echo.
echo   Se vedi la mappa del master sei dentro.
echo   Per uscire chiudi le finestre che si sono aperte.
echo.
pause
