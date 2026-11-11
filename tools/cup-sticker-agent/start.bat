@echo off
REM Windows 7 safe: prefer native .NET agent — NO Node.js (avoids ADVAPI32 EventSetInformation).
title Bing Chun Cup Sticker Agent
cd /d "%~dp0"
set "BC_STICKER_AGENT_DIR=%~dp0"

set "AUTOSTART=0"
if /I "%~1"=="--autostart" set "AUTOSTART=1"
if /I "%~1"=="/autostart" set "AUTOSTART=1"

if exist "%~dp0local.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%~dp0local.env") do (
    if not "%%A"=="" set "%%A=%%B"
  )
)

if not defined BC_STICKER_API_URL set BC_STICKER_API_URL=https://admin.bingchunsrilanka.com/api
if not defined BC_STICKER_SECRET set BC_STICKER_SECRET=bingchun-cup-sticker-local
if not defined BC_STICKER_PRINTER set BC_STICKER_PRINTER=
if "%BC_STICKER_PRINTER%"=="" if exist "%~dp0detect-printer.exe" (
  for /f "usebackq delims=" %%P in (`"%~dp0detect-printer.exe"`) do set "BC_STICKER_PRINTER=%%P"
)
if "%BC_STICKER_PRINTER%"=="" set BC_STICKER_PRINTER=bingchun

if not exist "%~dp0print-stickers.exe" if exist "%~dp0build-helpers.bat" call "%~dp0build-helpers.bat"
if not exist "%~dp0BingChunCupStickerAgent.exe" if exist "%~dp0build-helpers.bat" call "%~dp0build-helpers.bat"

if not exist "%~dp0BingChunCupStickerAgent.exe" (
  echo ERROR: BingChunCupStickerAgent.exe missing.
  echo Copy the full cup-sticker-agent folder, or run build-helpers.bat on a PC with .NET 4.
  if "%AUTOSTART%"=="0" pause
  exit /b 1
)

if not "%AUTOSTART%"=="1" if not "%BC_STICKER_SILENT%"=="1" (
  echo Starting cup sticker agent ^(native .NET — no Node.js^)
  echo   Health:   http://127.0.0.1:9177/health
  echo   Printer:  %BC_STICKER_PRINTER%
  echo.
)

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":9177 .*LISTENING"') do (
  taskkill /F /PID %%p >nul 2>&1
)
ping -n 2 127.0.0.1 >nul

"%~dp0BingChunCupStickerAgent.exe"
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo Agent stopped ^(exit %ERR%^).
  if "%AUTOSTART%"=="0" if not "%BC_STICKER_SILENT%"=="1" pause
  exit /b %ERR%
)
if "%AUTOSTART%"=="0" if not "%BC_STICKER_SILENT%"=="1" pause
