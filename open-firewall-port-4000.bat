@echo off
echo Adding Windows Firewall rule for Bing Chun Backend (port 4000)...
netsh advfirewall firewall delete rule name="Bing Chun Backend 4000" >nul 2>&1
netsh advfirewall firewall add rule name="Bing Chun Backend 4000" dir=in action=allow protocol=TCP localport=4000 profile=private,domain
if %ERRORLEVEL%==0 (
    echo.
    echo SUCCESS! Port 4000 is now open on your local network.
    echo Your phone can now reach the backend at http://192.168.1.62:4000
) else (
    echo.
    echo ERROR: Could not add firewall rule. Try running as Administrator.
)
echo.
pause
