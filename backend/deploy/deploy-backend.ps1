#!/usr/bin/env pwsh
# ============================================================
# Bing Chun - Backend CapRover deploy
# ============================================================
# Builds on the server (Dockerfile in package).
# Run from backend folder:
#   .\deploy\deploy-backend.ps1
# Or from project root:
#   pwsh backend/deploy/deploy-backend.ps1
# ============================================================

param(
    [string]$CaproverUrl,
    [string]$CaproverApp,
    [string]$AppToken
)

$DeployEnvFile = Join-Path $PSScriptRoot ".env.deploy"
if (-not (Test-Path $DeployEnvFile)) {
    $DeployEnvFile = Join-Path $PSScriptRoot ".env"
}
if (Test-Path $DeployEnvFile) {
    Get-Content $DeployEnvFile | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
        $name, $value = $_ -split '=', 2
        $name = $name.Trim()
        $value = $value.Trim()
        switch ($name) {
            'CAPROVER_URL'       { if (-not $CaproverUrl) { $CaproverUrl = $value } }
            'CAPROVER_APP'       { if (-not $CaproverApp) { $CaproverApp = $value } }
            'CAPROVER_APP_TOKEN' { if (-not $AppToken)    { $AppToken = $value } }
        }
    }
}

if (-not $CaproverUrl) { $CaproverUrl = "https://captain.mp.dartcodes.com" }
if (-not $CaproverApp) { $CaproverApp = "bing-chun-backend" }

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
[System.IO.Directory]::SetCurrentDirectory($PSScriptRoot)

$BackendPath = Split-Path $PSScriptRoot -Parent
$RepoRoot    = Split-Path $BackendPath -Parent
$TarFile     = Join-Path $PSScriptRoot "backend-deploy.tar"
$StageDir    = Join-Path $PSScriptRoot ".deploy-stage"
$AppUrl      = "https://$($CaproverApp).mp.dartcodes.com"
$HealthUrl   = "$AppUrl/health"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Bing Chun - Backend Deploy"                 -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  App     : $CaproverApp"   -ForegroundColor Yellow
Write-Host "  Server  : $CaproverUrl"   -ForegroundColor Yellow
Write-Host "  API URL : $AppUrl/api"    -ForegroundColor Yellow
Write-Host "  Health  : $HealthUrl"     -ForegroundColor Yellow
Write-Host ""

if ([string]::IsNullOrWhiteSpace($AppToken)) {
    Write-Host "  [FAIL] Set CAPROVER_APP_TOKEN in deploy/.env.deploy or pass -AppToken" -ForegroundColor Red
    Write-Host "         CapRover -> bing-chun-backend -> App Configs -> App Token" -ForegroundColor DarkGray
    exit 1
}

function Copy-RequiredItem {
    param([string]$Src, [string]$Dst)
    if (-not (Test-Path $Src)) {
        Write-Host "  [FAIL] Missing: $Src" -ForegroundColor Red
        exit 1
    }
    $parent = Split-Path $Dst -Parent
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Copy-Item $Src $Dst -Recurse -Force
}

# ---- PHASE 1: Package source for CapRover -----------------
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  PHASE 1/4  Packaging backend source"        -ForegroundColor Cyan
Write-Host "             (monorepo workspace layout)"     -ForegroundColor DarkGray
Write-Host "=============================================" -ForegroundColor Cyan

if (Test-Path $TarFile)  { Remove-Item $TarFile  -Force }
if (Test-Path $StageDir) { Remove-Item $StageDir -Recurse -Force }
New-Item -ItemType Directory -Path $StageDir | Out-Null

Copy-RequiredItem (Join-Path $PSScriptRoot "Dockerfile")          (Join-Path $StageDir "Dockerfile")
Copy-RequiredItem (Join-Path $PSScriptRoot "captain-definition")  (Join-Path $StageDir "captain-definition")
Copy-RequiredItem (Join-Path $RepoRoot "package.json")            (Join-Path $StageDir "package.json")

$lockFile = Join-Path $RepoRoot "package-lock.json"
if (Test-Path $lockFile) {
    Copy-RequiredItem $lockFile (Join-Path $StageDir "package-lock.json")
}

Copy-RequiredItem (Join-Path $RepoRoot "packages\db\package.json")              (Join-Path $StageDir "packages\db\package.json")
Copy-RequiredItem (Join-Path $RepoRoot "packages\db\prisma")                  (Join-Path $StageDir "packages\db\prisma")
Copy-RequiredItem (Join-Path $RepoRoot "packages\db\tsconfig.json")           (Join-Path $StageDir "packages\db\tsconfig.json")
Copy-RequiredItem (Join-Path $RepoRoot "packages\db\src")                     (Join-Path $StageDir "packages\db\src")

$dbPrismaConfig = Join-Path $RepoRoot "packages\db\prisma.config.ts"
if (Test-Path $dbPrismaConfig) {
    Copy-RequiredItem $dbPrismaConfig (Join-Path $StageDir "packages\db\prisma.config.ts")
}

Copy-RequiredItem (Join-Path $RepoRoot "packages\delivery-domain\package.json") (Join-Path $StageDir "packages\delivery-domain\package.json")
Copy-RequiredItem (Join-Path $RepoRoot "delivery-service\package.json")       (Join-Path $StageDir "delivery-service\package.json")
Copy-RequiredItem (Join-Path $RepoRoot "Frontend\package.json")               (Join-Path $StageDir "Frontend\package.json")

foreach ($dir in @("src", "prisma", "public")) {
    $srcDir = Join-Path $BackendPath $dir
    if (Test-Path $srcDir) {
        Copy-RequiredItem $srcDir (Join-Path $StageDir "backend\$dir")
    }
}
Copy-RequiredItem (Join-Path $BackendPath "package.json")         (Join-Path $StageDir "backend\package.json")
Copy-RequiredItem (Join-Path $BackendPath "tsconfig.json")        (Join-Path $StageDir "backend\tsconfig.json")
Copy-RequiredItem (Join-Path $BackendPath "docker-entrypoint.sh") (Join-Path $StageDir "backend\docker-entrypoint.sh")

$entrypointPath = Join-Path $StageDir "backend\docker-entrypoint.sh"
if (Test-Path $entrypointPath) {
    $entrypointText = [System.IO.File]::ReadAllText($entrypointPath) -replace "`r`n", "`n" -replace "`r", "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($entrypointPath, $entrypointText, $utf8NoBom)
}

$ProductsSrc = Join-Path $RepoRoot "Frontend\public\products"
if (-not (Test-Path $ProductsSrc)) {
    $ProductsSrc = Join-Path $RepoRoot "frontend\public\products"
}
if (Test-Path $ProductsSrc) {
    $ProductsDst = Join-Path $StageDir "backend\public\products"
    New-Item -ItemType Directory -Force -Path $ProductsDst | Out-Null
    Copy-Item (Join-Path $ProductsSrc "*") $ProductsDst -Recurse -Force
}

Write-Host "  Creating tar archive..." -ForegroundColor DarkGray
tar -czf $TarFile -C $StageDir .
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] tar creation failed" -ForegroundColor Red
    exit 1
}
Remove-Item $StageDir -Recurse -Force

$tarSizeMB = [math]::Round((Get-Item $TarFile).Length / 1MB, 1)
Write-Host "  [OK] Package ready: ${tarSizeMB} MB" -ForegroundColor Green

# ---- PHASE 2: Upload to CapRover --------------------------
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  PHASE 2/4  Uploading package to CapRover"   -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$UploadTar = Join-Path $BackendPath "backend-deploy.tar"
Copy-Item $TarFile $UploadTar -Force

Push-Location $BackendPath
try {
    [System.IO.Directory]::SetCurrentDirectory($BackendPath)
    npx -y caprover@2.2.3 deploy --caproverUrl "$CaproverUrl" --caproverApp "$CaproverApp" --appToken "$AppToken" --tarFile "backend-deploy.tar"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [FAIL] Upload failed" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

Remove-Item $TarFile -Force -ErrorAction SilentlyContinue
Remove-Item $UploadTar -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  [OK] Package uploaded" -ForegroundColor Green

# ---- PHASE 3: Remote Docker build (app token hides live stream) ----
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  PHASE 3/4  CapRover Docker build"           -ForegroundColor Cyan
Write-Host "             (server-side, ~2-5 min)"         -ForegroundColor DarkGray
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Note: CapRover app-token deploys do not stream build logs here." -ForegroundColor Yellow
Write-Host "  Watch live phases in CapRover UI:" -ForegroundColor Yellow
Write-Host "    $($CaproverUrl)/#/apps/details/$($CaproverApp)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Expected Docker build phases on the server:" -ForegroundColor White
Write-Host "    PHASE 1/5  System packages (openssl)" -ForegroundColor DarkGray
Write-Host "    PHASE 2/5  npm install (workspace deps)" -ForegroundColor DarkGray
Write-Host "    PHASE 3/5  Prisma generate + build @bingchun/db" -ForegroundColor DarkGray
Write-Host "    PHASE 4/5  Build @bingchun/backend" -ForegroundColor DarkGray
Write-Host "    PHASE 5/5  Runtime image (openssl, user)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  API URL : $AppUrl/api"                        -ForegroundColor Cyan
Write-Host "  Health  : $HealthUrl"                         -ForegroundColor Cyan
Write-Host ""

# ---- PHASE 4: Health check --------------------------------
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  PHASE 4/4  Waiting for API health"          -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Waiting 90s for container to start..."        -ForegroundColor DarkGray
Start-Sleep -Seconds 90

try {
    $r = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 20 -UseBasicParsing
    $code = $r.StatusCode
    if ($r.Content -match '"status"\s*:\s*"ok"') {
        Write-Host "  [OK] API is LIVE! (HTTP $code)" -ForegroundColor Green
    } elseif ($code -eq 200) {
        Write-Host "  [OK] Health endpoint responding (HTTP $code)" -ForegroundColor Green
    }
} catch {
    Write-Host "  [WARN] Health check pending - check CapRover logs" -ForegroundColor Yellow
    Write-Host "         $HealthUrl" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  [SUCCESS] BACKEND DEPLOY COMPLETE"          -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
