@echo off
REM Build Win7-compatible helper EXEs (no PowerShell at runtime).
cd /d "%~dp0"
set "CSC="
for /d %%D in ("%WINDIR%\Microsoft.NET\Framework64\v4*") do if exist "%%D\csc.exe" set "CSC=%%D\csc.exe"
if not defined CSC for /d %%D in ("%WINDIR%\Microsoft.NET\Framework\v4*") do if exist "%%D\csc.exe" set "CSC=%%D\csc.exe"
if not defined CSC (
  echo ERROR: .NET Framework 4.x csc.exe not found.
  exit /b 1
)

echo Using %CSC%
"%CSC%" /nologo /target:exe /r:System.Drawing.dll /r:System.Runtime.Serialization.dll /out:"%~dp0print-stickers.exe" "%~dp0src\PrintStickers.cs"
if errorlevel 1 exit /b 1
"%CSC%" /nologo /target:exe /r:System.Drawing.dll /r:System.Management.dll /out:"%~dp0detect-printer.exe" "%~dp0src\DetectPrinter.cs"
if errorlevel 1 exit /b 1
"%CSC%" /nologo /target:exe /r:System.Drawing.dll /out:"%~dp0BingChunCupStickerAgent.exe" "%~dp0src\NativeAgent.cs"
if errorlevel 1 exit /b 1
"%CSC%" /nologo /target:winexe /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Management.dll /out:"%~dp0BingChunCupStickerSetup.exe" "%~dp0src\SetupForm.cs"
if errorlevel 1 exit /b 1
echo OK: print-stickers.exe
echo OK: detect-printer.exe
echo OK: BingChunCupStickerAgent.exe
echo OK: BingChunCupStickerSetup.exe
exit /b 0
