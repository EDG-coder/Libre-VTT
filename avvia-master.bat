@echo off
chcp 65001 >nul
rem Avvia tutto quello che serve a chi conduce.
cd /d "%~dp0"
set "LINK=uffa-link\target\release\uffa-link.exe"

where node >nul 2>nul
if errorlevel 1 (
  echo Node non risulta installato. Scaricalo da https://nodejs.org e riprova.
  pause
  exit /b 1
)

echo Avvio il VTT su http://localhost:3000 ...
start "VTT - file" cmd /c node server.js

echo Avvio il server di gioco su http://localhost:4000 ...
start "VTT - gioco" cmd /c node game-server.js host

timeout /t 1 /nobreak >nul

if exist "%LINK%" (
  echo Apro la sessione su iroh ...
  start "VTT - sessione" cmd /c "%LINK%" host
) else (
  echo.
  echo   uffa-link non e' ancora compilato: la sessione resta solo su questo computer.
  echo   Per farla a distanza:  cd uffa-link   e poi   cargo build --release
  echo.
)

timeout /t 2 /nobreak >nul
start "" http://localhost:3000
start "" http://localhost:4000

echo.
echo   Tutto acceso. L'ID da dare ai giocatori e' nella finestra "VTT - sessione"
echo   e nel pannello su http://localhost:4000
echo   Per terminare la sessione chiudi le finestre che si sono aperte.
echo.
pause
