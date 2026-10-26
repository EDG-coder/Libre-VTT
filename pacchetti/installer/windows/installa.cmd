@echo off
rem LIBRE VTT - installazione per Windows, in un solo file. Doppio clic per installare.
rem Il resto di questo file e' il programma di installazione (PowerShell, che c'e' in ogni
rem Windows 10/11) seguito dal programma stesso. Non serve essere amministratori.
setlocal
set "MYVTT_SELF=%~f0"
set "MYVTT_PS=%TEMP%\myvtt-installa-%RANDOM%%RANDOM%.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:MYVTT_SELF,[Text.Encoding]::UTF8);$a=$t.IndexOf('#=INIZIO'+'-PS=#');$b=$t.IndexOf('::ARCH'+'IVIO::');[IO.File]::WriteAllText($env:MYVTT_PS,$t.Substring($a,$b-$a),(New-Object Text.UTF8Encoding $true))"
if errorlevel 1 (
  echo Non riesco a preparare l'installazione. Questo file potrebbe essere incompleto: scaricalo di nuovo.
  pause
  exit /b 1
)
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%MYVTT_PS%"
exit /b 0
#=INIZIO-PS=#
#<<PS1>>
