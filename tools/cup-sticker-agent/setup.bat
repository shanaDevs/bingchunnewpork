@echo off
title Bing Chun Cup Sticker Agent — Setup
cd /d "%~dp0"

if exist "%~dp0BingChunCupStickerSetup.exe" (
  start "" "%~dp0BingChunCupStickerSetup.exe"
  exit /b 0
)

echo Building setup EXE first...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-exe.ps1"
if exist "%~dp0BingChunCupStickerSetup.exe" (
  start "" "%~dp0BingChunCupStickerSetup.exe"
  exit /b 0
)

echo Opening PowerShell setup UI...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-ui.ps1"
pause
