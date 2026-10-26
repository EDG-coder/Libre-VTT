; LIBRE VTT - setup.exe per Windows, costruito da Inno Setup (lo fa GitHub Actions: vedi
; .github/workflows/rilascio.yml). Ha dentro tutto: programma, Node.js e collegamento a distanza.
; Stessa struttura dell'installatore «Installa LIBRE VTT.cmd»: una sola cartella privata in
; %LOCALAPPDATA%\LIBRE VTT, niente permessi da amministratore, niente PATH.
;
;   python pacchetti\installer\crea-installer.py out --stage-windows pacchetti\installer\windows\stage --node-win-x64 ... --link-win-x64 ...
;   iscc /DVersione=3.0 pacchetti\installer\windows\myvtt.iss

#ifndef Versione
  #define Versione "3.0"
#endif

[Setup]
AppId={{6E3C2A5B-7D41-4F0E-9B8A-3D2C1F5E9A71}
AppName=LIBRE VTT
AppVersion={#Versione}
AppPublisher=LIBRE VTT
AppComments=Tavolo da gioco virtuale per D&D 5e
DefaultDirName={localappdata}\LIBRE VTT
DisableDirPage=yes
UsePreviousAppDir=no
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\..\installatori
OutputBaseFilename=LIBRE-VTT-Setup
SetupIconFile=..\..\..\web\icona.ico
UninstallDisplayIcon={app}\app\web\icona.ico
UninstallDisplayName=LIBRE VTT
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes

[Languages]
Name: "it"; MessagesFile: "compiler:Languages\Italian.isl"

[Tasks]
Name: "desktop"; Description: "Metti un'icona sul desktop"

[Files]
Source: "stage\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "stage\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "stage\utente\bin\uffa-link.exe"; DestDir: "{app}\utente\bin"; Flags: ignoreversion skipifsourcedoesntexist
Source: "stage\avvia.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; avvia.ps1 lancia Node senza finestre nere; il collegamento parte già ridotto a icona
Name: "{userprograms}\LIBRE VTT"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\avvia.ps1"""; \
  WorkingDir: "{app}"; IconFilename: "{app}\app\web\icona.ico"; Comment: "LIBRE VTT - tavolo da gioco virtuale"; Flags: runminimized
Name: "{userdesktop}\LIBRE VTT"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\avvia.ps1"""; \
  WorkingDir: "{app}"; IconFilename: "{app}\app\web\icona.ico"; Comment: "LIBRE VTT - tavolo da gioco virtuale"; Flags: runminimized; Tasks: desktop

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\avvia.ps1"""; \
  Description: "Apri LIBRE VTT adesso"; Flags: postinstall nowait skipifsilent runhidden

[InstallDelete]
; il programma della versione di prima: si rimette tutto da capo (le campagne non stanno qui)
Type: filesandordirs; Name: "{app}\app"
; i collegamenti di quando si chiamava «MY VTT»
Type: files; Name: "{userprograms}\MY VTT.lnk"
Type: files; Name: "{userdesktop}\MY VTT.lnk"

[UninstallRun]
; prima di togliere i file, si spegne LIBRE VTT se è aperto
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ""Get-CimInstance Win32_Process | Where-Object {{ $_.ExecutablePath -like '{app}\*' } | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }"""; \
  Flags: runhidden; RunOnceId: "SpegniMyVtt"

[UninstallDelete]
; tutta la cartella privata (anche impostazioni e strumenti); le campagne in Documenti restano
Type: filesandordirs; Name: "{app}"

[Code]
// prima si chiamava «MY VTT»: la sua cartella (impostazioni, strumenti) diventa quella nuova
procedure CurStepChanged(CurStep: TSetupStep);
var Vecchia: String;
begin
  if CurStep = ssInstall then begin
    Vecchia := ExpandConstant('{localappdata}\MY VTT');
    if DirExists(Vecchia) and not DirExists(ExpandConstant('{app}')) then
      RenameFile(Vecchia, ExpandConstant('{app}'));
  end;
end;
