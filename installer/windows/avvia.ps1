# Avvia LIBRE VTT con il suo Node e la sua cartella, senza finestre nere e ignorando il resto del sistema.
$D = Split-Path -Parent $MyInvocation.MyCommand.Path
Remove-Item Env:NODE_OPTIONS, Env:NODE_PATH -ErrorAction SilentlyContinue
$env:MYVTT_USERDIR = Join-Path $D 'utente'
New-Item -ItemType Directory -Force -Path $env:MYVTT_USERDIR | Out-Null
$log = Join-Path $env:MYVTT_USERDIR 'avvio.log'
$node = Join-Path $D 'runtime\node\node.exe'
$js = Join-Path $D 'app\launcher.js'
$si = New-Object System.Diagnostics.ProcessStartInfo
$si.FileName = $env:ComSpec
$si.Arguments = '/d /c ""' + $node + '" "' + $js + '" > "' + $log + '" 2>&1"'
$si.UseShellExecute = $false
$si.CreateNoWindow = $true
$si.WorkingDirectory = Join-Path $D 'app'
$p = [System.Diagnostics.Process]::Start($si)
Start-Sleep -Seconds 4
if ($p.HasExited -and $p.ExitCode -ne 0) {
  Add-Type -AssemblyName System.Windows.Forms
  $coda = ''
  try { $coda = (Get-Content -Path $log -Tail 15 -ErrorAction SilentlyContinue) -join "`r`n" } catch {}
  [System.Windows.Forms.MessageBox]::Show("LIBRE VTT si e' chiuso subito dopo l'avvio.`r`n`r`nRegistro: $log`r`n`r`n$coda", 'LIBRE VTT', 'OK', 'Error') | Out-Null
}
