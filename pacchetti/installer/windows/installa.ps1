# LIBRE VTT - installazione per Windows (PowerShell 5.1 + WinForms: ci sono in ogni Windows 10/11).
#
# Tutto finisce in UNA cartella privata, %LOCALAPPDATA%\LIBRE VTT:
#   app\       il programma
#   runtime\   il suo Node.js (scaricato da nodejs.org e controllato, o gia' dentro questo file)
#   utente\    impostazioni, collegamento a distanza, eventuali strumenti per costruirlo
# Non serve essere amministratori, non si cambia il PATH, non si usa ne' si tocca nessun Node,
# Rust o altro gia' installato. Le campagne vanno in Documenti\LIBRE VTT.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.Windows.Forms.Application]::EnableVisualStyles()
# nodejs.org e GitHub vogliono TLS 1.2: su alcuni Windows 10 PowerShell parte ancora con 1.0
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$script:Self = $env:MYVTT_SELF
$script:Nome = 'LIBRE VTT'
$script:Dest = Join-Path $env:LOCALAPPDATA 'LIBRE VTT'
$script:Vecchia = Join-Path $env:LOCALAPPDATA 'MY VTT'     # la cartella di prima del cambio di nome
$script:Dist = 'https://nodejs.org/dist/latest-v22.x'
if ($env:MYVTT_NODE_DIST) { $script:Dist = $env:MYVTT_NODE_DIST }
$script:Fatto = $false
$script:Log = Join-Path $env:TEMP 'myvtt-installa.log'
Set-Content -Path $script:Log -Value ("LIBRE VTT - installazione " + (Get-Date)) -Encoding UTF8

# che Windows e': 64 bit Intel/AMD o ARM (anche se questo PowerShell fosse a 32 bit)
$arch = $env:PROCESSOR_ARCHITECTURE
if ($env:PROCESSOR_ARCHITEW6432) { $arch = $env:PROCESSOR_ARCHITEW6432 }
$script:Arch = $null
if ($arch -eq 'AMD64') { $script:Arch = 'x64' } elseif ($arch -eq 'ARM64') { $script:Arch = 'arm64' }

# ------------------------------------------------------------------ la finestra
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Installa LIBRE VTT'
$form.ClientSize = New-Object System.Drawing.Size(560, 380)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(250, 250, 253)
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$titolo = New-Object System.Windows.Forms.Label
$titolo.Text = 'LIBRE VTT'
$titolo.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 20)
$titolo.ForeColor = [System.Drawing.Color]::FromArgb(106, 76, 240)
$titolo.Location = New-Object System.Drawing.Point(24, 18)
$titolo.AutoSize = $true
$form.Controls.Add($titolo)

$testo = New-Object System.Windows.Forms.Label
$testo.Location = New-Object System.Drawing.Point(26, 70)
$testo.Size = New-Object System.Drawing.Size(510, 150)
$form.Controls.Add($testo)

$barra = New-Object System.Windows.Forms.ProgressBar
$barra.Location = New-Object System.Drawing.Point(26, 228)
$barra.Size = New-Object System.Drawing.Size(508, 18)
$barra.Minimum = 0; $barra.Maximum = 100
$barra.Visible = $false
$form.Controls.Add($barra)

$stato = New-Object System.Windows.Forms.Label
$stato.Location = New-Object System.Drawing.Point(26, 252)
$stato.Size = New-Object System.Drawing.Size(508, 40)
$stato.ForeColor = [System.Drawing.Color]::FromArgb(90, 98, 115)
$form.Controls.Add($stato)

$apri = New-Object System.Windows.Forms.CheckBox
$apri.Text = 'Apri LIBRE VTT adesso'
$apri.Checked = $true
$apri.AutoSize = $true
$apri.Location = New-Object System.Drawing.Point(28, 300)
$apri.Visible = $false
$form.Controls.Add($apri)

$annulla = New-Object System.Windows.Forms.Button
$annulla.Text = 'Annulla'
$annulla.Size = New-Object System.Drawing.Size(110, 34)
$annulla.Location = New-Object System.Drawing.Point(424, 330)
$form.Controls.Add($annulla)

$vai = New-Object System.Windows.Forms.Button
$vai.Text = 'Installa'
$vai.Size = New-Object System.Drawing.Size(130, 34)
$vai.Location = New-Object System.Drawing.Point(284, 330)
$vai.BackColor = [System.Drawing.Color]::FromArgb(106, 76, 240)
$vai.ForeColor = [System.Drawing.Color]::White
$vai.FlatStyle = 'Flat'
$form.Controls.Add($vai)
$form.AcceptButton = $vai
$form.CancelButton = $annulla

function Scrivi([string]$riga) {
  Add-Content -Path $script:Log -Value ((Get-Date -Format 'HH:mm:ss') + ' ' + $riga) -Encoding UTF8
}
function Passo([int]$p, [string]$t) {
  Scrivi $t
  $barra.Value = [Math]::Max(0, [Math]::Min(100, $p))
  $stato.Text = $t
  [System.Windows.Forms.Application]::DoEvents()
}
function Ferma([string]$msg) { throw (New-Object System.Exception $msg) }

# scarica a pezzi, cosi' la finestra resta viva e mostra a che punto e'
function Scarica([string]$url, [string]$dest, [string]$etichetta, [int]$da, [int]$a) {
  Scrivi ('scarico ' + $url)
  $req = [System.Net.HttpWebRequest]::Create($url)
  $req.UserAgent = 'LIBRE-VTT'
  $req.Timeout = 60000
  $req.ReadWriteTimeout = 60000
  $res = $req.GetResponse()
  $tot = $res.ContentLength
  $in = $res.GetResponseStream()
  $out = [System.IO.File]::Create($dest)
  $buf = New-Object byte[] 65536
  $got = 0
  try {
    while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
      $out.Write($buf, 0, $n)
      $got += $n
      if ($tot -gt 0) {
        $perc = [int]($da + ($a - $da) * $got / $tot)
        $barra.Value = [Math]::Min(100, $perc)
        $stato.Text = ('{0}: {1:N1} di {2:N1} MB' -f $etichetta, ($got / 1MB), ($tot / 1MB))
      }
      [System.Windows.Forms.Application]::DoEvents()
    }
  } finally { $out.Close(); $in.Close(); $res.Close() }
}
function TestoDa([string]$url) {
  $f = [System.IO.Path]::GetTempFileName()
  try { Scarica $url $f 'Scarico' 0 0; return [System.IO.File]::ReadAllText($f) } finally { Remove-Item $f -Force -ErrorAction SilentlyContinue }
}
function Impronta([string]$f) { return (Get-FileHash -Algorithm SHA256 -Path $f).Hash.ToLower() }
function NodeVa([string]$exe) {
  if (-not (Test-Path $exe)) { return $false }
  try { $v = & $exe -v 2>$null; return ($v -match '^v(\d+)\.' -and [int]$Matches[1] -ge 18) } catch { return $false }
}

# ------------------------------------------------------------------ l'installazione
function Installa {
  if (-not $script:Arch) { Ferma 'Questo Windows non e'' a 64 bit: LIBRE VTT ha bisogno di un Windows 10 o 11 a 64 bit.' }
  $tmp = Join-Path $env:TEMP ('myvtt-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  # prima il programma si chiamava «MY VTT»: la sua cartella (Node, impostazioni, strumenti)
  # diventa quella nuova, e spariscono i vecchi collegamenti e la vecchia voce in «App installate»
  if ((Test-Path $script:Vecchia) -and -not (Test-Path $script:Dest)) {
    Passo 3 'Passo da MY VTT a LIBRE VTT...'
    $dv = $script:Vecchia.TrimEnd('\') + '\*'
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like $dv } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
    Rename-Item -Path $script:Vecchia -NewName (Split-Path $script:Dest -Leaf) -ErrorAction Stop
    foreach ($c in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
      if ($c) { Remove-Item (Join-Path $c 'MY VTT.lnk') -Force -ErrorAction SilentlyContinue }
    }
    Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MY VTT' -Recurse -Force -ErrorAction SilentlyContinue
  }
  # si estrae accanto alla destinazione (stesso disco): spostare cartelle da un disco
  # all'altro con PowerShell 5.1 non si puo'
  New-Item -ItemType Directory -Force -Path $script:Dest | Out-Null
  $pac = Join-Path $script:Dest '_pacchetto'
  $nodeTmp = Join-Path $script:Dest '_node'
  foreach ($x in @($pac, $nodeTmp)) { if (Test-Path $x) { Remove-Item $x -Recurse -Force } }
  try {
    Passo 5 'Estraggo il programma...'
    $t = [System.IO.File]::ReadAllText($script:Self, [System.Text.Encoding]::UTF8)
    $i = $t.IndexOf('::ARCH' + 'IVIO::')
    if ($i -lt 0) { Ferma 'Questo file di installazione e'' incompleto: scaricalo di nuovo.' }
    $b64 = ($t.Substring($i + 12) -replace '\s', '')
    $zip = Join-Path $tmp 'pacchetto.zip'
    [System.IO.File]::WriteAllBytes($zip, [Convert]::FromBase64String($b64))
    $t = $null; $b64 = $null
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $pac)
    if (-not (Test-Path (Join-Path $pac 'app\server\launcher.js'))) { Ferma 'Questo file di installazione e'' incompleto: scaricalo di nuovo.' }

    # --- Node, solo per LIBRE VTT ---
    $nuovoNode = $null
    $incluso = Join-Path $pac ('node-win-' + $script:Arch)
    if (-not (Test-Path (Join-Path $incluso 'node.exe'))) { $incluso = Join-Path $pac 'node-win-x64' }
    if (Test-Path (Join-Path $incluso 'node.exe')) {
      $nuovoNode = $incluso; Passo 30 'Node.js e'' gia'' dentro l''installazione.'
    } elseif (NodeVa (Join-Path $script:Dest 'runtime\node\node.exe')) {
      Passo 30 'Node.js c''e'' gia'' (quello di LIBRE VTT): lo tengo.'
    } else {
      Passo 10 'Scarico Node.js da nodejs.org...'
      $somme = TestoDa ($script:Dist + '/SHASUMS256.txt')
      $m = [regex]::Match($somme, '([a-f0-9]{64})\s+(node-v\d+\.\d+\.\d+-win-' + $script:Arch + '\.zip)')
      if (-not $m.Success) { Ferma 'Sul sito di Node non trovo la versione per questo computer.' }
      $nzip = Join-Path $tmp $m.Groups[2].Value
      Scarica ($script:Dist + '/' + $m.Groups[2].Value) $nzip 'Scarico Node.js' 10 40
      Passo 42 'Controllo che Node.js sia integro...'
      if ((Impronta $nzip) -ne $m.Groups[1].Value.ToLower()) { Ferma 'Il file di Node.js arrivato non e'' integro: per sicurezza non lo uso. Riprova.' }
      Passo 45 'Estraggo Node.js...'
      [System.IO.Compression.ZipFile]::ExtractToDirectory($nzip, $nodeTmp)
      $nuovoNode = Join-Path $nodeTmp ($m.Groups[2].Value -replace '\.zip$', '')
    }
    if ($nuovoNode -and -not (NodeVa (Join-Path $nuovoNode 'node.exe'))) { Ferma 'Node.js non parte su questo computer.' }

    # --- al suo posto ---
    Passo 55 'Chiudo LIBRE VTT se e'' aperto...'
    $dove = $script:Dest.TrimEnd('\') + '\*'
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like $dove } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500

    Passo 60 'Copio il programma...'
    New-Item -ItemType Directory -Force -Path (Join-Path $script:Dest 'runtime'), (Join-Path $script:Dest 'utente\bin') | Out-Null
    $app = Join-Path $script:Dest 'app'
    $appNuova = Join-Path $script:Dest 'app.nuova'
    if (Test-Path $appNuova) { Remove-Item $appNuova -Recurse -Force }
    Move-Item (Join-Path $pac 'app') $appNuova
    if (Test-Path $app) { Remove-Item $app -Recurse -Force }
    Rename-Item $appNuova 'app'
    if ($nuovoNode) {
      $rn = Join-Path $script:Dest 'runtime\node'
      if (Test-Path $rn) { Remove-Item $rn -Recurse -Force }
      Move-Item $nuovoNode $rn
    }
    $link = Join-Path $pac 'bin\uffa-link-windows-x64.exe'
    if (Test-Path $link) {
      Passo 68 'Il collegamento a distanza e'' gia'' pronto dentro l''installazione.'
      Copy-Item $link (Join-Path $script:Dest 'utente\bin\uffa-link.exe') -Force
    }

    Passo 75 'Preparo l''avvio e la disinstallazione...'
    $avvia = @'
#<<AVVIA>>
'@
    Set-Content -Path (Join-Path $script:Dest 'avvia.ps1') -Value $avvia -Encoding UTF8

    $disinstalla = @'
# Toglie LIBRE VTT: la sua cartella, i collegamenti e la voce in «App installate». Le campagne restano.
Add-Type -AssemblyName System.Windows.Forms
$D = Split-Path -Parent $MyInvocation.MyCommand.Path
$r = [System.Windows.Forms.MessageBox]::Show("Tolgo LIBRE VTT da questo computer?`r`n`r`nLe tue campagne (in Documenti\LIBRE VTT) restano dove sono.", 'LIBRE VTT', 'YesNo', 'Question')
if ($r -ne 'Yes') { exit 0 }
$dove = $D.TrimEnd('\') + '\*'
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like $dove } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 700
foreach ($c in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
  Remove-Item (Join-Path $c 'LIBRE VTT.lnk') -Force -ErrorAction SilentlyContinue
}
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LIBRE VTT' -Recurse -Force -ErrorAction SilentlyContinue
Set-Location $env:TEMP
Remove-Item $D -Recurse -Force -ErrorAction SilentlyContinue
[System.Windows.Forms.MessageBox]::Show('LIBRE VTT e'' stato tolto.', 'LIBRE VTT', 'OK', 'Information') | Out-Null
'@
    Set-Content -Path (Join-Path $script:Dest 'disinstalla.ps1') -Value $disinstalla -Encoding UTF8

    Passo 85 'Creo i collegamenti nel menu Start e sul desktop...'
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $icona = Join-Path $script:Dest 'app\web\icona.ico'
    $sh = New-Object -ComObject WScript.Shell
    foreach ($c in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
      if (-not $c) { continue }
      $lnk = $sh.CreateShortcut((Join-Path $c 'LIBRE VTT.lnk'))
      $lnk.TargetPath = $ps
      $lnk.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $script:Dest 'avvia.ps1') + '"'
      $lnk.WorkingDirectory = $script:Dest
      $lnk.IconLocation = $icona + ',0'
      $lnk.WindowStyle = 7          # ridotto a icona: niente lampi di finestre nere
      $lnk.Description = 'LIBRE VTT - tavolo da gioco virtuale'
      $lnk.Save()
    }

    Passo 92 'Aggiungo LIBRE VTT a «App installate»...'
    $chiave = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LIBRE VTT'
    New-Item -Path $chiave -Force | Out-Null
    $kb = [int]((Get-ChildItem $script:Dest -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1KB)
    $voci = @{
      DisplayName = 'LIBRE VTT'; DisplayVersion = '3.0'; Publisher = 'LIBRE VTT'; DisplayIcon = $icona
      InstallLocation = $script:Dest
      UninstallString = '"' + $ps + '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $script:Dest 'disinstalla.ps1') + '"'
    }
    foreach ($k in $voci.Keys) { Set-ItemProperty -Path $chiave -Name $k -Value $voci[$k] }
    Set-ItemProperty -Path $chiave -Name NoModify -Value 1 -Type DWord
    Set-ItemProperty -Path $chiave -Name NoRepair -Value 1 -Type DWord
    Set-ItemProperty -Path $chiave -Name EstimatedSize -Value $kb -Type DWord

    Passo 100 'Fatto.'
    Scrivi ('installato in ' + $script:Dest)
  } finally {
    foreach ($x in @($tmp, $pac, $nodeTmp)) { Remove-Item $x -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

# ------------------------------------------------------------------ cosa dice la finestra
$giaInstallato = Test-Path (Join-Path $script:Dest 'avvia.ps1')
if (-not $giaInstallato -and (Test-Path (Join-Path $script:Vecchia 'avvia.ps1'))) {
  $testo.Text = "Qui c'e' MY VTT, che adesso si chiama LIBRE VTT: lo aggiorno a questa versione con il nuovo nome.`r`n`r`nLe tue campagne e le impostazioni restano come sono."
  $vai.Text = 'Aggiorna'
} elseif ($giaInstallato) {
  $testo.Text = "LIBRE VTT e' gia' installato: lo aggiorno a questa versione.`r`n`r`nLe tue campagne e le impostazioni restano come sono."
  $vai.Text = 'Aggiorna'
} else {
  $testo.Text = "Installo LIBRE VTT per questo utente, in:`r`n" + $script:Dest + "`r`n`r`nNon servono permessi da amministratore e non tocco niente del sistema ne' quello che hai gia' installato. Se serve, scarico Node.js dal sito ufficiale (circa 30 MB), solo per LIBRE VTT.`r`n`r`nLe campagne andranno in Documenti\LIBRE VTT."
}

$script:Lavora = $false
$annulla.Add_Click({ $form.Close() })
$form.Add_FormClosing({ if ($script:Lavora) { $_.Cancel = $true } })   # non si chiude a meta' installazione
$vai.Add_Click({
  if ($script:Fatto) {
    if ($apri.Checked) {
      $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
      Start-Process -FilePath $ps -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $script:Dest 'avvia.ps1') + '"') -WindowStyle Hidden
    }
    $form.Close()
    return
  }
  $vai.Enabled = $false; $annulla.Enabled = $false
  $barra.Visible = $true
  $script:Lavora = $true
  try {
    Installa
    $script:Lavora = $false
    $script:Fatto = $true
    $testo.Text = "LIBRE VTT e' installato.`r`n`r`nLo trovi nel menu Start e sul desktop. Per toglierlo: Impostazioni > App > App installate > LIBRE VTT."
    $stato.Text = ''
    $apri.Visible = $true
    $vai.Text = 'Fine'; $vai.Enabled = $true
    $annulla.Visible = $false
  } catch {
    $script:Lavora = $false
    Scrivi ('ERRORE: ' + $_.Exception.Message)
    $barra.Visible = $false
    $stato.Text = ''
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message + "`r`n`r`nDettagli in: " + $script:Log, 'LIBRE VTT', 'OK', 'Error') | Out-Null
    $vai.Text = 'Riprova'; $vai.Enabled = $true; $annulla.Enabled = $true
  }
})

[void]$form.ShowDialog()
Remove-Item $PSCommandPath -Force -ErrorAction SilentlyContinue
