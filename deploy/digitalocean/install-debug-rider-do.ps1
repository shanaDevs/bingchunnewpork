# Debug Flutter rider on USB device — DO hosted Core + Delivery, logcat-friendly.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$appDir = Join-Path $repoRoot 'driver_flutter'
$pkg = 'com.bingchun.bing_chun_driver'
$core = 'https://bingchunsrilanka.com/api'
$delivery = 'https://bingchun-delivery-6mgs2.ondigitalocean.app/delivery-api'
$defines = @(
  "--dart-define=CORE_API_BASE_URL=$core",
  "--dart-define=DELIVERY_API_BASE_URL=$delivery"
)

function Resolve-Flutter {
  if ($env:FLUTTER_ROOT -and (Test-Path "$env:FLUTTER_ROOT\bin\flutter.bat")) {
    return "$env:FLUTTER_ROOT\bin\flutter.bat"
  }
  $homeFlutter = Join-Path $env:USERPROFILE 'flutter\bin\flutter.bat'
  if (Test-Path $homeFlutter) { return $homeFlutter }
  $cmd = Get-Command flutter -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw 'Flutter SDK not found. Install Flutter and retry.'
}

$flutter = Resolve-Flutter
adb devices
Push-Location $appDir
try {
  & $flutter pub get | Out-Null
  Write-Host 'Building debug APK (first run can take 15–25 min)...'
  & $flutter build apk --debug @defines
  $apk = Join-Path $appDir 'build\app\outputs\flutter-apk\app-debug.apk'
  if (-not (Test-Path $apk)) { throw "APK not found: $apk" }
  adb install -r $apk
}
finally {
  Pop-Location
}

$xml = Join-Path $PSScriptRoot 'flutter-driver-do-urls.xml'
Get-Content $xml -Raw | adb shell "run-as $pkg sh -c 'cat > shared_prefs/FlutterSharedPreferences.xml'"
adb shell am force-stop $pkg
adb shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host "Installed debug $pkg — DO URLs set. Login: phone OTP. Server URLs: login logo 5x (debug)."
Write-Host "Logcat: adb logcat -s flutter"
