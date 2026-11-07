@echo off
title Bing Chun Cup Sticker Agent
cd /d "%~dp0"

echo Starting cup sticker agent on http://127.0.0.1:9177
echo Printer default: Xprinter XP-D35B  (override with BC_STICKER_PRINTER)
echo Run this on the cashier PC with the USB printer — not on the server.
echo Keep this window open while using the cashier browser on THIS PC.
echo.

REM Free port 9177 if a previous agent is still running
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":9177 .*LISTENING"') do (
  echo Port 9177 already in use — stopping old process %%p ...
  taskkill /F /PID %%p >nul 2>&1
)
timeout /t 1 /nobreak >nul

node "%~dp0server.mjs"
if errorlevel 1 (
  echo.
  echo Agent stopped with an error.
)
pause
