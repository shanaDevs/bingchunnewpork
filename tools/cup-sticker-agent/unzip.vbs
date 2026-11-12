' Unzip for Windows 7 (no PowerShell Expand-Archive).
' Usage: cscript //nologo unzip.vbs <zip> <destFolder>
Option Explicit
Dim zipPath, destPath, fso, shell, zipNs, destNs, i
If WScript.Arguments.Count < 2 Then
  WScript.Echo "Usage: unzip.vbs zip dest"
  WScript.Quit 1
End If
zipPath = WScript.Arguments(0)
destPath = WScript.Arguments(1)
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(zipPath) Then
  WScript.Echo "ZIP missing: " & zipPath
  WScript.Quit 1
End If
If Not fso.FolderExists(destPath) Then fso.CreateFolder(destPath)
Set shell = CreateObject("Shell.Application")
Set zipNs = shell.NameSpace(fso.GetAbsolutePathName(zipPath))
Set destNs = shell.NameSpace(fso.GetAbsolutePathName(destPath))
If zipNs Is Nothing Or destNs Is Nothing Then
  WScript.Echo "Shell unzip failed"
  WScript.Quit 1
End If
' 16 = Yes to All, 4 = No UI
destNs.CopyHere zipNs.Items, 20
' Wait until files appear (Shell copy is async)
For i = 1 To 120
  WScript.Sleep 500
  If destNs.Items.Count > 0 Then Exit For
Next
WScript.Quit 0
