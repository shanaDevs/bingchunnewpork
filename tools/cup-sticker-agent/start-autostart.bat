@echo off
REM Wrapper used by Windows Scheduled Task (logon auto-start).
cd /d "%~dp0"
call "%~dp0start.bat" --autostart
