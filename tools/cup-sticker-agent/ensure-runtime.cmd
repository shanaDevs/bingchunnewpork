@echo off
REM Portable Node for cashier PCs — NO PowerShell.
REM Windows 7/8/8.1 MUST use Node 16 (Node 18+ crashes: EventSetInformation / ADVAPI32).
setlocal EnableExtensions
cd /d "%~dp0"

if exist "%~dp0BingChunCupStickerAgentRuntime.exe" (
  echo %~dp0BingChunCupStickerAgentRuntime.exe
  exit /b 0
)

REM Detect legacy Windows (6.x = Win7/8/8.1)
set "LEGACY=0"
ver | find "Version 6." >nul && set "LEGACY=1"

set "ARCH=x64"
if /I "%PROCESSOR_ARCHITECTURE%"=="x86" if not defined PROCESSOR_ARCHITEW6432 set "ARCH=x86"

if "%LEGACY%"=="1" (
  set "NODEVER=v16.20.2"
) else (
  set "NODEVER=v20.19.0"
)

set "NODEEXE=%~dp0runtime\node\node.exe"

REM If portable Node exists, verify it actually runs on this OS.
if exist "%NODEEXE%" (
  "%NODEEXE%" -e "process.exit(0)" >nul 2>&1
  if errorlevel 1 (
    echo Existing portable Node cannot run on this Windows ^(EventSetInformation / ADVAPI32^).
    echo Removing incompatible runtime and downloading Node %NODEVER% ...
    rd /s /q "%~dp0runtime\node" >nul 2>&1
  ) else if "%LEGACY%"=="1" (
    "%NODEEXE%" -v 2>nul | find "v16." >nul
    if errorlevel 1 (
      echo Portable Node is not v16 — Windows 7 needs Node 16. Replacing...
      rd /s /q "%~dp0runtime\node" >nul 2>&1
    ) else (
      echo %NODEEXE%
      exit /b 0
    )
  ) else (
    echo %NODEEXE%
    exit /b 0
  )
)

REM System Node — only accept if it runs AND is v16 on legacy Windows
where node >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%N in ('where node') do (
    "%%N" -e "process.exit(0)" >nul 2>&1
    if not errorlevel 1 (
      if "%LEGACY%"=="1" (
        "%%N" -v 2>nul | find "v16." >nul
        if not errorlevel 1 (
          echo %%N
          exit /b 0
        )
        "%%N" -v 2>nul | find "v14." >nul
        if not errorlevel 1 (
          echo %%N
          exit /b 0
        )
      ) else (
        echo %%N
        exit /b 0
      )
    )
  )
  if "%LEGACY%"=="1" echo System Node is too new or broken on Windows 7. Downloading portable Node 16...
)

call :DownloadNode
if errorlevel 1 exit /b 1
echo %NODEEXE%
exit /b 0

:DownloadNode
set "ZIPNAME=node-%NODEVER%-win-%ARCH%.zip"
set "URL=https://nodejs.org/dist/%NODEVER%/%ZIPNAME%"
set "ZIP=%TEMP%\%ZIPNAME%"
set "EXTRACT=%TEMP%\bc-node-extract"
set "RUNTIME=%~dp0runtime"
set "NODEROOT=%RUNTIME%\node"

echo Downloading portable Node %NODEVER% arch=%ARCH% ...
echo %URL%

if exist "%ZIP%" del /f /q "%ZIP%" >nul 2>&1
certutil -urlcache -split -f "%URL%" "%ZIP%" >nul 2>&1
if not exist "%ZIP%" bitsadmin /transfer "BCNode" /download /priority normal "%URL%" "%ZIP%" >nul 2>&1

if not exist "%ZIP%" (
  echo ERROR: Could not download Node.js automatically.
  echo Manual fix for Windows 7:
  echo   1. On another PC download: %URL%
  echo   2. Unzip and copy the folder contents to:
  echo      %NODEROOT%
  echo   3. Run BingChunCupStickerSetup.exe again
  exit /b 1
)

if exist "%EXTRACT%" rd /s /q "%EXTRACT%"
mkdir "%EXTRACT%" >nul 2>&1
cscript //nologo "%~dp0unzip.vbs" "%ZIP%" "%EXTRACT%"
if errorlevel 1 (
  echo ERROR: Unzip failed.
  exit /b 1
)

if not exist "%RUNTIME%" mkdir "%RUNTIME%"
if exist "%NODEROOT%" rd /s /q "%NODEROOT%"

for /d %%D in ("%EXTRACT%\node-*") do (
  move "%%D" "%NODEROOT%" >nul
  goto :Verify
)
echo ERROR: Unexpected Node zip layout.
exit /b 1

:Verify
del /f /q "%ZIP%" >nul 2>&1
rd /s /q "%EXTRACT%" >nul 2>&1

if not exist "%NODEROOT%\node.exe" (
  echo ERROR: node.exe missing after extract.
  exit /b 1
)

"%NODEROOT%\node.exe" -e "process.exit(0)" >nul 2>&1
if errorlevel 1 (
  echo ERROR: Downloaded Node still cannot start on this Windows.
  echo Install Windows 7 SP1 + updates, or use a 32-bit Node 16 build if this PC is x86.
  exit /b 1
)

echo Portable Node ready:
"%NODEROOT%\node.exe" -v
exit /b 0
