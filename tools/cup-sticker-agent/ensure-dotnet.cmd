@echo off
REM Ensure .NET Framework 4.x exists (needed by Setup / print-stickers.exe on Windows 7).
setlocal EnableExtensions

reg query "HKLM\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" /v Release >nul 2>&1
if not errorlevel 1 (
  echo .NET Framework 4.x OK
  exit /b 0
)
reg query "HKLM\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Client" /v Release >nul 2>&1
if not errorlevel 1 (
  echo .NET Framework 4.x Client OK
  exit /b 0
)

echo .NET Framework 4 not found. Downloading offline installer...
set "DOTNET_URL=https://download.microsoft.com/download/9/5/A/95A9616B-7A37-4AF6-BC36-D6EA96C8DAAE/dotNetFx40_Full_x86_x64.exe"
set "DOTNET_EXE=%TEMP%\dotNetFx40_Full_x86_x64.exe"

if exist "%DOTNET_EXE%" del /f /q "%DOTNET_EXE%" >nul 2>&1
certutil -urlcache -split -f "%DOTNET_URL%" "%DOTNET_EXE%" >nul 2>&1
if not exist "%DOTNET_EXE%" bitsadmin /transfer "BCDotNet" /download /priority normal "%DOTNET_URL%" "%DOTNET_EXE%" >nul 2>&1

if not exist "%DOTNET_EXE%" (
  echo ERROR: Could not download .NET Framework 4.
  echo Download and install manually: https://www.microsoft.com/en-us/download/details.aspx?id=17718
  exit /b 1
)

echo Installing .NET Framework 4 ^(may take several minutes, needs admin^)...
"%DOTNET_EXE%" /q /norestart
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" if not "%ERR%"=="3010" (
  echo .NET install exit %ERR%. Try Run as administrator.
  exit /b 1
)

reg query "HKLM\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" /v Release >nul 2>&1
if errorlevel 1 (
  echo .NET Framework 4 still not detected. Reboot and run setup again, or install manually.
  exit /b 1
)

echo .NET Framework 4 installed.
exit /b 0
