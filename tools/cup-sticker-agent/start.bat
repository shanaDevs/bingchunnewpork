@echo off
title Bing Chun Cup Sticker Agent
cd /d "%~dp0"

REM Cloud admin API — agent pulls print jobs (Chrome cannot call localhost from HTTPS).
if not defined BC_STICKER_API_URL set BC_STICKER_API_URL=https://admin.bingchunsrilanka.com/api
REM Must match server CUP_STICKER_AGENT_SECRET / INTERNAL_SERVICE_SECRET (default works out of the box).
if not defined BC_STICKER_SECRET set BC_STICKER_SECRET=bingchun-cup-sticker-local

echo Starting cup sticker agent
echo   Local health:  http://127.0.0.1:9177/health
echo   Cloud queue:    %BC_STICKER_API_URL%/cup-sticker-agent/claim
echo   Printer:       Xprinter XP-D35B  (override with BC_STICKER_PRINTER)
echo Run this on the cashier PC with the USB printer — keep this window open.
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
