# Generates Android/iOS launcher icons and splash assets from assets/brand/app_icon.png
# Mirrors flutter_launcher_icons + flutter_native_splash output when the Flutter SDK is unavailable.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "pubspec.yaml"))) {
  $root = "d:\dart codes\bingchung\mobile"
}
$srcPath = Join-Path $root "assets\brand\app_icon.png"
if (-not (Test-Path -LiteralPath $srcPath)) {
  throw "Missing source icon: $srcPath"
}

$blue = [System.Drawing.Color]::FromArgb(255, 5, 193, 255) # #05C1FF
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

function New-Dir($p) {
  if (-not (Test-Path -LiteralPath $p)) {
    New-Item -ItemType Directory -Path $p -Force | Out-Null
  }
}

function Save-Resized {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$Size,
    [string]$DestPath,
    [System.Drawing.Color]$Background,
    [bool]$Flatten
  )
  New-Dir (Split-Path $DestPath)
  $dest = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($dest)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  if ($Flatten) {
    $g.Clear($Background)
  } else {
    $g.Clear([System.Drawing.Color]::Transparent)
  }
  $g.DrawImage($Source, 0, 0, $Size, $Size)
  $g.Dispose()
  $dest.Save($DestPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $dest.Dispose()
}

# --- Android legacy launcher (flatten so round corners are not black) ---
$mip = Join-Path $root "android\app\src\main\res"
$androidLegacy = @{
  "mipmap-mdpi"    = 48
  "mipmap-hdpi"    = 72
  "mipmap-xhdpi"   = 96
  "mipmap-xxhdpi"  = 144
  "mipmap-xxxhdpi" = 192
}
foreach ($kv in $androidLegacy.GetEnumerator()) {
  Save-Resized $src $kv.Value (Join-Path $mip "$($kv.Key)\ic_launcher.png") $blue $true
}

# --- Android adaptive foreground (keep alpha) ---
$fg = @{
  "drawable-mdpi"    = 108
  "drawable-hdpi"    = 162
  "drawable-xhdpi"   = 216
  "drawable-xxhdpi"  = 324
  "drawable-xxxhdpi" = 432
}
foreach ($kv in $fg.GetEnumerator()) {
  Save-Resized $src $kv.Value (Join-Path $mip "$($kv.Key)\ic_launcher_foreground.png") $blue $false
}

# --- Android splash logo ~240dp ---
$splash = @{
  "drawable-mdpi"    = 240
  "drawable-hdpi"    = 360
  "drawable-xhdpi"   = 480
  "drawable-xxhdpi"  = 720
  "drawable-xxxhdpi" = 960
}
foreach ($kv in $splash.GetEnumerator()) {
  Save-Resized $src $kv.Value (Join-Path $mip "$($kv.Key)\splash.png") $blue $false
}

# Android 12 splash icon
New-Dir (Join-Path $mip "drawable-v31")
Save-Resized $src 960 (Join-Path $mip "drawable-v31\android12splash.png") $blue $false

# --- iOS AppIcon (flattened, no alpha) ---
$iosIconDir = Join-Path $root "ios\Runner\Assets.xcassets\AppIcon.appiconset"
$iosIcons = @{
  "Icon-App-20x20@1x.png"      = 20
  "Icon-App-20x20@2x.png"      = 40
  "Icon-App-20x20@3x.png"      = 60
  "Icon-App-29x29@1x.png"      = 29
  "Icon-App-29x29@2x.png"      = 58
  "Icon-App-29x29@3x.png"      = 87
  "Icon-App-40x40@1x.png"      = 40
  "Icon-App-40x40@2x.png"      = 80
  "Icon-App-40x40@3x.png"      = 120
  "Icon-App-50x50@1x.png"      = 50
  "Icon-App-50x50@2x.png"      = 100
  "Icon-App-57x57@1x.png"      = 57
  "Icon-App-57x57@2x.png"      = 114
  "Icon-App-60x60@2x.png"      = 120
  "Icon-App-60x60@3x.png"      = 180
  "Icon-App-72x72@1x.png"      = 72
  "Icon-App-72x72@2x.png"      = 144
  "Icon-App-76x76@1x.png"      = 76
  "Icon-App-76x76@2x.png"      = 152
  "Icon-App-83.5x83.5@2x.png"  = 167
  "Icon-App-1024x1024@1x.png"  = 1024
}
foreach ($kv in $iosIcons.GetEnumerator()) {
  Save-Resized $src $kv.Value (Join-Path $iosIconDir $kv.Key) $blue $true
}

# --- iOS launch images (keep alpha; storyboard sits on blue) ---
$launchDir = Join-Path $root "ios\Runner\Assets.xcassets\LaunchImage.imageset"
Save-Resized $src 320 (Join-Path $launchDir "LaunchImage.png") $blue $false
Save-Resized $src 640 (Join-Path $launchDir "LaunchImage@2x.png") $blue $false
Save-Resized $src 960 (Join-Path $launchDir "LaunchImage@3x.png") $blue $false

# 1x1 launch background color
$bgDir = Join-Path $root "ios\Runner\Assets.xcassets\LaunchBackground.imageset"
New-Dir $bgDir
$bgBmp = New-Object System.Drawing.Bitmap 1, 1, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bgBmp.SetPixel(0, 0, $blue)
$bgBmp.Save((Join-Path $bgDir "background.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bgBmp.Dispose()

$src.Dispose()
Write-Host "Generated launcher and splash images."
