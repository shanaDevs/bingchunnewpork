@echo off
REM Download portable Node 16 into runtime\node (Windows 7 compatible backup).
REM Normal agent does NOT need Node — this is for manual copy / backup only.
setlocal EnableExtensions
cd /d "%~dp0"

set "NODEVER=v16.20.2"
set "ARCH=x64"
if /I "%PROCESSOR_ARCHITECTURE%"=="x86" if not defined PROCESSOR_ARCHITEW6432 set "ARCH=x86"

set "ZIPNAME=node-%NODEVER%-win-%ARCH%.zip"
set "URL=https://nodejs.org/dist/%NODEVER%/%ZIPNAME%"
set "ZIP=%TEMP%\%ZIPNAME%"
set "EXTRACT=%TEMP%\bc-node16-extract"
set "DEST=%~dp0runtime\node"

echo Downloading Node %NODEVER% arch=%ARCH% for manual copy / Win7 backup...
echo %URL%

if exist "%ZIP%" del /f /q "%ZIP%" >nul 2>&1
certutil -urlcache -split -f "%URL%" "%ZIP%" >nul 2>&1
if not exist "%ZIP%" bitsadmin /transfer "BCNode16" /download /priority normal "%URL%" "%ZIP%" >nul 2>&1
if not exist "%ZIP%" (
  echo Download failed. See MANUAL-COPY-GUIDE.txt section B Option 2.
  pause
  exit /b 1
)

if exist "%EXTRACT%" rd /s /q "%EXTRACT%"
mkdir "%EXTRACT%" >nul 2>&1
cscript //nologo "%~dp0unzip.vbs" "%ZIP%" "%EXTRACT%"
if errorlevel 1 (
  echo Unzip failed.
  pause
  exit /b 1
)

if not exist "%~dp0runtime" mkdir "%~dp0runtime"
if exist "%DEST%" rd /s /q "%DEST%"
for /d %%D in ("%EXTRACT%\node-*") do (
  move "%%D" "%DEST%" >nul
  goto :ok
)
echo Unexpected zip layout.
pause
exit /b 1

:ok
del /f /q "%ZIP%" >nul 2>&1
rd /s /q "%EXTRACT%" >nul 2>&1
echo.
echo OK: %DEST%\node.exe
"%DEST%\node.exe" -v
echo.
echo Copy the whole runtime\node folder to the Win7 PC if needed.
echo See MANUAL-COPY-GUIDE.txt
pause
exit /b 0
