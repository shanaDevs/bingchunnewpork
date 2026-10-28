`#!/usr/bin/env pwsh
# Bing Chun - Delivery Service CapRover deploy
# Run: pwsh delivery-service/deploy/deploy-delivery.ps1

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
if (-not $CaproverApp) { $CaproverApp = "bing-chun-delivery" }

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
[System.IO.Directory]::SetCurrentDirectory($PSScriptRoot)

$ServicePath = Split-Path $PSScriptRoot -Parent
$RepoRoot    = Split-Path $ServicePath -Parent
$TarFile     = Join-Path $PSScriptRoot "delivery-deploy.tar"
$StageDir    = Join-Path $PSScriptRoot ".deploy-stage"
$AppUrl      = "https://$($CaproverApp).mp.dartcodes.com"
$HealthUrl   = "$AppUrl/health"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Bing Chun - Delivery Service Deploy"        -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  App     : $CaproverApp"   -ForegroundColor Yellow
Write-Host "  Server  : $CaproverUrl"   -ForegroundColor Yellow
Write-Host "  Health  : $HealthUrl"     -ForegroundColor Yellow
Write-Host ""

if ([string]::IsNullOrWhiteSpace($AppToken)) {
    Write-Host "  [FAIL] Set CAPROVER_APP_TOKEN in deploy/.env.deploy or pass -AppToken" -ForegroundColor Red
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

Write-Host "  STEP 1/2  Packaging delivery-service source..." -ForegroundColor White

if (Test-Path $TarFile)  { Remove-Item $TarFile  -Force }
if (Test-Path $StageDir) { Remove-Item $StageDir -Recurse -Force }
New-Item -ItemType Directory -Path $StageDir | Out-Null

Copy-RequiredItem (Join-Path $PSScriptRoot "Dockerfile")         (Join-Path $StageDir "Dockerfile")
Copy-RequiredItem (Join-Path $PSScriptRoot "captain-definition") (Join-Path $StageDir "captain-definition")
Copy-RequiredItem (Join-Path $RepoRoot "package.json")           (Join-Path $StageDir "package.json")

$lockFile = Join-Path $RepoRoot "package-lock.json"
if (Test-Path $lockFile) {
    Copy-RequiredItem $lockFile (Join-Path $StageDir "package-lock.json")
}

Copy-RequiredItem (Join-Path $RepoRoot "packages\db\package.json")              (Join-Path $StageDir "packages\db\package.json")
Copy-RequiredItem (Join-Path $RepoRoot "packages\db\prisma")                    (Join-Path $StageDir "packages\db\prisma")
Copy-RequiredItem (Join-Path $RepoRoot "packages\db\tsconfig.json")             (Join-Path $StageDir "packages\db\tsconfig.json")
Copy-RequiredItem (Join-Path $RepoRoot "packages\db\src")                       (Join-Path $StageDir "packages\db\src")

$dbPrismaConfig = Join-Path $RepoRoot "packages\db\prisma.config.ts"
if (Test-Path $dbPrismaConfig) {
    Copy-RequiredItem $dbPrismaConfig (Join-Path $StageDir "packages\db\prisma.config.ts")
}

Copy-RequiredItem (Join-Path $RepoRoot "packages\delivery-domain\package.json") (Join-Path $StageDir "packages\delivery-domain\package.json")
Copy-RequiredItem (Join-Path $RepoRoot "packages\delivery-domain\tsconfig.json") (Join-Path $StageDir "packages\delivery-domain\tsconfig.json")
Copy-RequiredItem (Join-Path $RepoRoot "packages\delivery-domain\src")          (Join-Path $StageDir "packages\delivery-domain\src")

Copy-RequiredItem (Join-Path $RepoRoot "backend\package.json")                  (Join-Path $StageDir "backend\package.json")
Copy-RequiredItem (Join-Path $RepoRoot "Frontend\package.json")                 (Join-Path $StageDir "Frontend\package.json")

Copy-RequiredItem (Join-Path $ServicePath "src")                                  (Join-Path $StageDir "delivery-service\src")
Copy-RequiredItem (Join-Path $ServicePath "package.json")                       (Join-Path $StageDir "delivery-service\package.json")
Copy-RequiredItem (Join-Path $ServicePath "tsconfig.json")                      (Join-Path $StageDir "delivery-service\tsconfig.json")
Copy-RequiredItem (Join-Path $ServicePath "docker-entrypoint.sh")               (Join-Path $StageDir "delivery-service\docker-entrypoint.sh")

$entrypointPath = Join-Path $StageDir "delivery-service\docker-entrypoint.sh"
if (Test-Path $entrypointPath) {
    $entrypointText = [System.IO.File]::ReadAllText($entrypointPath) -replace "`r`n", "`n" -replace "`r", "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($entrypointPath, $entrypointText, $utf8NoBom)
}

tar -czf $TarFile -C $StageDir .
Remove-Item $StageDir -Recurse -Force
Write-Host "  [OK] Package ready" -ForegroundColor Green

Write-Host "  STEP 2/2  Uploading to CapRover..." -ForegroundColor White
$UploadTar = Join-Path $ServicePath "delivery-deploy.tar"
Copy-Item $TarFile $UploadTar -Force

Push-Location $ServicePath
try {
    [System.IO.Directory]::SetCurrentDirectory($ServicePath)
    npx -y caprover deploy --caproverUrl "$CaproverUrl" --caproverApp "$CaproverApp" --appToken "$AppToken" --tarFile "delivery-deploy.tar"
    if ($LASTEXITCODE -ne 0) { exit 1 }
} finally {
    Pop-Location
}

Remove-Item $TarFile -Force -ErrorAction SilentlyContinue
Remove-Item $UploadTar -Force -ErrorAction SilentlyContinue
Write-Host "  [SUCCESS] Delivery service deploy uploaded" -ForegroundColor Green
Write-Host "  Monitor : $($CaproverUrl)/#/apps/details/$($CaproverApp)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  CapRover App Configs:" -ForegroundColor Yellow
Write-Host "    Container HTTP Port = 4100  (HTTP Settings tab)"
Write-Host "    DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET"
Write-Host "    CORE_API_URL=https://bing-chung-b.mp.dartcodes.com"
Write-Host "    INTERNAL_SERVICE_SECRET=<same as backend>"
Write-Host "    DELIVERY_PORT=4100, NODE_ENV=production"
