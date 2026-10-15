' Avvia LIBRE VTT senza far comparire la finestra nera del prompt.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
cartella = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = cartella

' Il file .vbs di suo ha un'icona generica di Windows: qui creiamo (o rinfreschiamo) accanto
' un collegamento "LIBRE VTT.lnk" con l'icona vera. Costa pochissimo, lo rifacciamo ad ogni avvio
' così segue la cartella anche se la sposti. Da li' in poi conviene aprire quello, non il .vbs.
On Error Resume Next
If fso.FileExists(cartella & "\icona.ico") Then
  Set lnk = sh.CreateShortcut(cartella & "\LIBRE VTT.lnk")
  lnk.TargetPath = sh.ExpandEnvironmentStrings("%WINDIR%") & "\System32\wscript.exe"
  lnk.Arguments = """" & cartella & "\LIBRE VTT.vbs"""
  lnk.WorkingDirectory = cartella
  lnk.IconLocation = cartella & "\icona.ico, 0"
  lnk.Description = "LIBRE VTT - tavolo da gioco virtuale"
  lnk.Save
End If
On Error GoTo 0

' Node c'è?
On Error Resume Next
prova = sh.Run("cmd /c where node", 0, True)
On Error GoTo 0
If prova <> 0 Then
  risposta = MsgBox("Per far partire LIBRE VTT serve Node." & vbCrLf & vbCrLf & _
                    "Vuoi aprire nodejs.org per scaricarlo?", vbYesNo + vbExclamation, "Manca Node")
  If risposta = vbYes Then sh.Run "https://nodejs.org", 1, False
  WScript.Quit 1
End If

' 0 = finestra nascosta: il giocatore non vede nessun terminale.
sh.Run "cmd /c node launcher.js", 0, False
