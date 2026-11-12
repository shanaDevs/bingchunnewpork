@echo off
title Bing Chun Cup Sticker Agent — Remove auto-start / service
cd /d "%~dp0"

echo Stopping / uninstalling Windows Service ...
if exist "%~dp0service\BingChunCupStickerAgent.exe" (
  "%~dp0service\BingChunCupStickerAgent.exe" stop >nul 2>&1
  "%~dp0service\BingChunCupStickerAgent.exe" uninstall >nul 2>&1
)
sc stop BingChunCupStickerAgent >nul 2>&1
sc delete BingChunCupStickerAgent >nul 2>&1

echo Removing Windows logon task BingChunCupStickerAgent ...
powershell.exe -NoProfile -Command "Unregister-ScheduledTask -TaskName 'BingChunCupStickerAgent' -Confirm:$false -ErrorAction SilentlyContinue" >nul 2>&1
schtasks /Delete /TN "BingChunCupStickerAgent" /F >nul 2>&1

echo Removing Startup shortcut ...
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Bing Chun Cup Sticker Agent.lnk" >nul 2>&1

echo.
echo Stopping agent on port 9177 if running...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":9177 .*LISTENING"') do (
  taskkill /F /PID %%p >nul 2>&1
)

echo Auto-start / service removed.
pause
