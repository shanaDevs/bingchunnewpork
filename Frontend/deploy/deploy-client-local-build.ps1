# Bing Chun - Frontend local build + CapRover deploy
# Run from frontend folder:
#   .\deploy\deploy-client-local-build.ps1
# Or from project root:
#   pwsh frontend/deploy/deploy-client-local-build.ps1

param(
    [string]$CaproverUrl = "https://captain.mp.dartcodes.com/",
    [string]$CaproverApp = "bing-chung",
    [string]$AppToken = "b188dcc21befe653bd1941273f41ace529de4b61b4789d59f171c020cf899c11",
    [string]$ApiUrl = ""
)

$DeployEnvFile = Join-Path $PSScriptRoot ".env.deploy"
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
            'API_URL'            { if (-not $ApiUrl)      { $ApiUrl = $value } }
        }
    }
}

if (-not $CaproverUrl) { $CaproverUrl = "https://captain.mp.dartcodes.com" }
if (-not $CaproverApp) { $CaproverApp = "bing-chung" }
if (-not $AppToken)    { $AppToken = "a79f37b2fd943b503423a985dde5ec362732285f9bc99ff3f93c3f12771441a6" }
if (-not $ApiUrl)      { $ApiUrl = "https://bing-chung-b.mp.dartcodes.com/api" }

$BackendUrl = $ApiUrl -replace '/api/?$', ''

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
[System.IO.Directory]::SetCurrentDirectory($PSScriptRoot)

$FrontendPath = Split-Path $PSScriptRoot -Parent
$TarFile      = Join-Path $PSScriptRoot "frontend-prebuilt-deploy.tar"
$StageDir     = Join-Path $PSScriptRoot ".deploy-stage"
$AppUrl       = "https://$($CaproverApp).mp.dartcodes.com"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Bing Chun - Frontend Deploy" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  App     : $CaproverApp"   -ForegroundColor Yellow
Write-Host "  Server  : $CaproverUrl"   -ForegroundColor Yellow
Write-Host "  API URL : $ApiUrl"        -ForegroundColor Yellow
Write-Host "  Backend : $BackendUrl"    -ForegroundColor Yellow
Write-Host "  Live at : $AppUrl"        -ForegroundColor Yellow
Write-Host ""

if ([string]::IsNullOrWhiteSpace($AppToken)) {
    Write-Host '  [FAIL] Set CAPROVER_APP_TOKEN in deploy/.env.deploy or pass -AppToken' -ForegroundColor Red
    exit 1
}

# STEP 1: Write .env.production
Write-Host ""
Write-Host "---------------------------------------------" -ForegroundColor DarkGray
Write-Host "  STEP 1/4  Writing production environment"   -ForegroundColor White
Write-Host "---------------------------------------------" -ForegroundColor DarkGray

$envProdPath = Join-Path $FrontendPath ".env.production"
$envLines = @(
    "NEXT_PUBLIC_API_URL=/api"
    "BACKEND_URL=$BackendUrl"
    "API_PROXY_URL=$BackendUrl"
    "NEXT_PUBLIC_SOCKET_URL=$BackendUrl"
)
$envLines | Set-Content -Path $envProdPath -Encoding UTF8
Write-Host '  [OK] .env.production written' -ForegroundColor Green
Write-Host "       NEXT_PUBLIC_API_URL=/api" -ForegroundColor DarkGray
Write-Host "       BACKEND_URL=$BackendUrl" -ForegroundColor DarkGray

# STEP 2: Build Next.js locally
Write-Host ""
Write-Host "---------------------------------------------" -ForegroundColor DarkGray
Write-Host "  STEP 2/4  Building Next.js locally"         -ForegroundColor White
Write-Host "            (This takes 1-3 minutes)"         -ForegroundColor DarkGray
Write-Host "---------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

Push-Location $FrontendPath
try {
    $env:NEXT_PUBLIC_API_URL = '/api'
    $env:BACKEND_URL = $BackendUrl
    $env:API_PROXY_URL = $BackendUrl
    $env:NEXT_PUBLIC_SOCKET_URL = $BackendUrl
    $buildStart = Get-Date
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host '  [FAIL] BUILD FAILED - check errors above' -ForegroundColor Red
        exit 1
    }
    $buildTime = [math]::Round(((Get-Date) - $buildStart).TotalSeconds, 0)
    Write-Host ""
    Write-Host ('  [OK] Build done in ' + $buildTime + 's') -ForegroundColor Green
} finally {
    Pop-Location
}

$standalonePath = Join-Path $FrontendPath ".next\standalone"
$staticPath     = Join-Path $FrontendPath ".next\static"
$publicPath     = Join-Path $FrontendPath "public"

if (-not (Test-Path $standalonePath)) {
    Write-Host '  [FAIL] .next/standalone not found' -ForegroundColor Red
    Write-Host '  Ensure next.config.ts has output: standalone' -ForegroundColor Red
    exit 1
}

$expectedServerJs = @(
    (Join-Path $standalonePath "Frontend\server.js"),
    (Join-Path $standalonePath "frontend\server.js"),
    (Join-Path $standalonePath "server.js")
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $expectedServerJs) {
    Write-Host '  [FAIL] server.js missing from standalone output' -ForegroundColor Red
    Write-Host '  Expected one of:' -ForegroundColor DarkGray
    Write-Host '    .next/standalone/Frontend/server.js' -ForegroundColor DarkGray
    Write-Host '    .next/standalone/frontend/server.js' -ForegroundColor DarkGray
    Write-Host '    .next/standalone/server.js' -ForegroundColor DarkGray
    Write-Host '  Check outputFileTracingRoot in next.config.ts' -ForegroundColor Red
    Get-ChildItem $standalonePath -Force | Select-Object -ExpandProperty Name | ForEach-Object {
        Write-Host ("    found: " + $_) -ForegroundColor DarkGray
    }
    exit 1
}
Write-Host ('  [OK] Standalone output verified: ' + $expectedServerJs.Substring($standalonePath.Length + 1)) -ForegroundColor Green

# STEP 3: Package pre-built output
Write-Host ""
Write-Host "---------------------------------------------" -ForegroundColor DarkGray
Write-Host "  STEP 3/4  Packaging for CapRover"           -ForegroundColor White
Write-Host "---------------------------------------------" -ForegroundColor DarkGray

if (Test-Path $TarFile)  { Remove-Item $TarFile  -Force }
if (Test-Path $StageDir) { Remove-Item $StageDir -Recurse -Force }
New-Item -ItemType Directory -Path $StageDir | Out-Null

Copy-Item (Join-Path $PSScriptRoot "Dockerfile.prebuilt") (Join-Path $StageDir "Dockerfile")
Copy-Item (Join-Path $PSScriptRoot "captain-definition") (Join-Path $StageDir "captain-definition")

Write-Host "  Copying pre-built output..." -ForegroundColor DarkGray
$nextStageDir = Join-Path $StageDir ".next"
New-Item -ItemType Directory -Path $nextStageDir | Out-Null
Copy-Item $standalonePath (Join-Path $nextStageDir "standalone") -Recurse
Copy-Item $staticPath     (Join-Path $nextStageDir "static")     -Recurse
Copy-Item $publicPath     (Join-Path $StageDir "public")         -Recurse

Remove-Item (Join-Path $nextStageDir "standalone\.env")            -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $nextStageDir "standalone\.env.production") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $nextStageDir "standalone\.env.local")      -Force -ErrorAction SilentlyContinue

Write-Host "  Creating tar archive..." -ForegroundColor DarkGray
tar -czf $TarFile -C $StageDir .
if ($LASTEXITCODE -ne 0) {
    Write-Host '  [FAIL] tar creation failed' -ForegroundColor Red
    exit 1
}
Remove-Item $StageDir -Recurse -Force

$ParentTarFile = Join-Path $FrontendPath "frontend-prebuilt-deploy.tar"
Copy-Item $TarFile $ParentTarFile -Force -ErrorAction SilentlyContinue

$tarSizeMB = [math]::Round((Get-Item $TarFile).Length / 1MB, 1)
Write-Host ('  [OK] Package ready: ' + $tarSizeMB + ' MB') -ForegroundColor Green

# STEP 4: Upload to CapRover
Write-Host ""
Write-Host "---------------------------------------------" -ForegroundColor DarkGray
Write-Host "  STEP 4/4  Uploading to CapRover"            -ForegroundColor White
Write-Host "---------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

Push-Location $PSScriptRoot
try {
    [System.IO.Directory]::SetCurrentDirectory($PSScriptRoot)
    $tarFileName = Split-Path $TarFile -Leaf
    npx -y caprover@2.2.3 deploy --caproverUrl "$CaproverUrl" --caproverApp "$CaproverApp" --appToken "$AppToken" --tarFile "$tarFileName"
    if ($LASTEXITCODE -ne 0) {
        Write-Host '  [FAIL] Upload failed' -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

Remove-Item $TarFile       -Force -ErrorAction SilentlyContinue
Remove-Item $ParentTarFile -Force -ErrorAction SilentlyContinue
Remove-Item $envProdPath   -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host '  [SUCCESS] DEPLOY COMPLETE!' -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  App URL : $AppUrl" -ForegroundColor Cyan
Write-Host "  Monitor : $($CaproverUrl)/#/apps/details/$($CaproverApp)" -ForegroundColor Cyan
Write-Host ""

Write-Host "  Waiting 45s for container to start..." -ForegroundColor DarkGray
Start-Sleep -Seconds 45

try {
    $r = Invoke-WebRequest -Uri $AppUrl -TimeoutSec 20 -UseBasicParsing
    $code = $r.StatusCode
    if ($r.Content -match "__NEXT_DATA__" -or $r.Content -match "_next/static") {
        Write-Host ('  [OK] Next.js app is LIVE (HTTP ' + $code + ')') -ForegroundColor Green
    } elseif ($code -eq 200) {
        Write-Host ('  [OK] App responding (HTTP ' + $code + ')') -ForegroundColor Green
    }
    Write-Host "  Visit: $AppUrl" -ForegroundColor Cyan
} catch {
    Write-Host ('  [WARN] Visit manually: ' + $AppUrl) -ForegroundColor Yellow
}
Write-Host ""
