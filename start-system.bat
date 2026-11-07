@echo off
title Bing Chun — start system
cd /d "%~dp0"

echo Starting backend, frontend, and cup sticker agent...
echo (stickers also start with npm run dev:web)
echo.
call npm run dev:web
