@echo off
rem LIBRE VTT - installazione per Windows, in un solo file. Doppio clic per installare.
rem Il resto di questo file e' il programma di installazione (PowerShell, che c'e' in ogni
rem Windows 10/11) seguito dal programma stesso. Non serve essere amministratori.
setlocal
set "LIBRE_SELF=%~f0"
set "LIBRE_PS=%TEMP%\libre-vtt-installa-%RANDOM%%RANDOM%.ps1"
rem dove finisce il testo e comincia il programma (un .zip attaccato in fondo): lo scrive crea-installer.py
set "LIBRE_INIZIO=0000000000"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$n=[int]$env:LIBRE_INIZIO;$f=[IO.File]::OpenRead($env:LIBRE_SELF);$b=New-Object byte[] $n;$r=0;while($r -lt $n){$k=$f.Read($b,$r,$n-$r);if($k -le 0){break};$r+=$k};$f.Close();$t=[Text.Encoding]::UTF8.GetString($b,0,$r);$a=$t.IndexOf('#=INIZIO'+'-PS=#');$e=$t.IndexOf('::ARCH'+'IVIO::');[IO.File]::WriteAllText($env:LIBRE_PS,$t.Substring($a,$e-$a),(New-Object Text.UTF8Encoding $true))"
if errorlevel 1 (
  echo Non riesco a preparare l'installazione. Questo file potrebbe essere incompleto: scaricalo di nuovo.
  pause
  exit /b 1
)
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%LIBRE_PS%"
exit /b 0
#=INIZIO-PS=#
#<<PS1>>
