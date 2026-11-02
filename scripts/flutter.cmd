@echo off
setlocal

if defined FLUTTER_ROOT (
  if exist "%FLUTTER_ROOT%\bin\flutter.bat" (
    "%FLUTTER_ROOT%\bin\flutter.bat" %*
    exit /b %ERRORLEVEL%
  )
)

if exist "C:\flutter-sdk\bin\flutter.bat" (
  "C:\flutter-sdk\bin\flutter.bat" %*
  exit /b %ERRORLEVEL%
)

if exist "%USERPROFILE%\flutter\bin\flutter.bat" (
  "%USERPROFILE%\flutter\bin\flutter.bat" %*
  exit /b %ERRORLEVEL%
)

where flutter >nul 2>nul
if %ERRORLEVEL%==0 (
  flutter %*
  exit /b %ERRORLEVEL%
)

echo Flutter SDK not found. Install from https://docs.flutter.dev/get-started/install
echo Or set FLUTTER_ROOT to your Flutter install folder.
exit /b 1
