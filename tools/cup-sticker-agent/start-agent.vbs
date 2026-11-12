' Start native agent without .bat (Windows 7 safe).
Option Explicit
Dim sh, fso, dir, exe
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = dir & "\BingChunCupStickerAgent.exe"
If Not fso.FileExists(exe) Then
  MsgBox "Missing: " & exe, 16, "Bing Chun Cup Sticker"
  WScript.Quit 1
End If
sh.CurrentDirectory = dir
sh.Run """" & exe & """", 0, False
