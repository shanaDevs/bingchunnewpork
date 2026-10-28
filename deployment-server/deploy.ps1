param(
    # Default: API microservices only (not shop/admin/pos webs or delivery frontend).
    # Use "all" for every CapRover app, or a single app name.
    [Parameter(Position = 0, Mandatory = $false)]
    [string]$Target = "apis"
)

$ErrorActionPreference = "Continue"
$CaproverUrl = "https://captain.bc.dartcodes.com"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir

# Load tokens from .env when present; fall back to known CapRover app tokens.
$EnvFile = Join-Path $ScriptDir ".env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
        $k, $v = $_ -split '=', 2
        [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), "Process")
    }
}

function Require-Token([string]$Name) {
    $val = [Environment]::GetEnvironmentVariable($Name, "Process")
    if (-not $val) {
        throw "Missing $Name in deployment-server/.env"
    }
    return $val
}

$Apps = [ordered]@{
    "bing-chun-core"              = (Require-Token "TOKEN_BING_CHUN_CORE")
    "bing-chun-shop"              = (Require-Token "TOKEN_BING_CHUN_SHOP")
    "bing-chun"                   = (Require-Token "TOKEN_BING_CHUN")
    "bing-chun-admin"             = (Require-Token "TOKEN_BING_CHUN_ADMIN")
    "bing-chun-admin-web"         = (Require-Token "TOKEN_BING_CHUN_ADMIN_WEB")
    "bing-chun-pos"               = (Require-Token "TOKEN_BING_CHUN_POS")
    "bing-chun-pos-web"           = (Require-Token "TOKEN_BING_CHUN_POS_WEB")
    "bing-chun-delivery"          = (Require-Token "TOKEN_BING_CHUN_DELIVERY")
    "bing-chun-delivery-frontend" = (Require-Token "TOKEN_BING_CHUN_DELIVERY_FRONTEND")
}

function Copy-ItemSafe {
    param([string]$Src, [string]$Dst)
    if (Test-Path $Src) {
        $parent = Split-Path $Dst -Parent
        if ($parent -and -not (Test-Path $parent)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        Copy-Item $Src $Dst -Recurse -Force
    }
}

function Package-Backend {
    param([string]$StageDir)

    Copy-ItemSafe (Join-Path $RepoRoot "backend\deploy\Dockerfile")         (Join-Path $StageDir "Dockerfile")
    Copy-ItemSafe (Join-Path $RepoRoot "backend\deploy\captain-definition") (Join-Path $StageDir "captain-definition")
    Copy-ItemSafe (Join-Path $RepoRoot "package.json")                       (Join-Path $StageDir "package.json")
    Copy-ItemSafe (Join-Path $RepoRoot "package-lock.json")                  (Join-Path $StageDir "package-lock.json")

    Copy-ItemSafe (Join-Path $RepoRoot "packages\db")                       (Join-Path $StageDir "packages\db")
    Copy-ItemSafe (Join-Path $RepoRoot "packages\cors")                     (Join-Path $StageDir "packages\cors")
    Copy-ItemSafe (Join-Path $RepoRoot "packages\delivery-domain")          (Join-Path $StageDir "packages\delivery-domain")
    Copy-ItemSafe (Join-Path $RepoRoot "packages\settlement")               (Join-Path $StageDir "packages\settlement")

    Copy-ItemSafe (Join-Path $RepoRoot "backend\package.json")              (Join-Path $StageDir "backend\package.json")
    Copy-ItemSafe (Join-Path $RepoRoot "backend\tsconfig.json")             (Join-Path $StageDir "backend\tsconfig.json")
    Copy-ItemSafe (Join-Path $RepoRoot "backend\docker-entrypoint.sh")      (Join-Path $StageDir "backend\docker-entrypoint.sh")
    Copy-ItemSafe (Join-Path $RepoRoot "backend\src")                       (Join-Path $StageDir "backend\src")
    Copy-ItemSafe (Join-Path $RepoRoot "backend\prisma")                    (Join-Path $StageDir "backend\prisma")
    Copy-ItemSafe (Join-Path $RepoRoot "backend\public")                    (Join-Path $StageDir "backend\public")
    Copy-ItemSafe (Join-Path $RepoRoot "backend\assets")                    (Join-Path $StageDir "backend\assets")

    Copy-ItemSafe (Join-Path $RepoRoot "delivery-service\package.json")     (Join-Path $StageDir "delivery-service\package.json")
    Copy-ItemSafe (Join-Path $RepoRoot "Frontend\package.json")             (Join-Path $StageDir "Frontend\package.json")

    $entrypoint = Join-Path $StageDir "backend\docker-entrypoint.sh"
    if (Test-Path $entrypoint) {
        $text = [System.IO.File]::ReadAllText($entrypoint) -replace "`r`n", "`n" -replace "`r", "`n"
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($entrypoint, $text, $utf8NoBom)
    }
}

function Package-Frontend {
    param([string]$StageDir, [string]$Surface)

    Copy-ItemSafe (Join-Path $RepoRoot "Frontend\deploy\Dockerfile") (Join-Path $StageDir "Dockerfile")

    $capDefObj = switch ($Surface) {
        "admin" {
            [ordered]@{
                WEB_SURFACE            = "admin"
                NEXT_PUBLIC_API_URL    = "/api"
                BACKEND_URL            = "https://bing-chun-admin.bc.dartcodes.com"
                API_PROXY_URL          = "https://bing-chun-admin.bc.dartcodes.com"
                ADMIN_API_URL          = "https://bing-chun-admin.bc.dartcodes.com"
                ADMIN_WEB_URL          = "https://bing-chun-admin-web.bc.dartcodes.com"
                NEXT_PUBLIC_SOCKET_URL = "https://bing-chun-admin.bc.dartcodes.com"
                NEXT_PUBLIC_SITE_URL   = "https://bing-chun-admin-web.bc.dartcodes.com"
            }
        }
        "pos" {
            [ordered]@{
                WEB_SURFACE            = "pos"
                NEXT_PUBLIC_API_URL    = "/api"
                BACKEND_URL            = "https://bing-chun-pos.bc.dartcodes.com"
                API_PROXY_URL          = "https://bing-chun-pos.bc.dartcodes.com"
                POS_API_URL            = "https://bing-chun-pos.bc.dartcodes.com"
                ADMIN_WEB_URL          = "https://bing-chun-admin-web.bc.dartcodes.com"
                NEXT_PUBLIC_SOCKET_URL = "https://bing-chun-pos.bc.dartcodes.com"
                NEXT_PUBLIC_SITE_URL   = "https://bing-chun-pos-web.bc.dartcodes.com"
            }
        }
        default {
            [ordered]@{
                WEB_SURFACE            = "shop"
                NEXT_PUBLIC_API_URL    = "/api"
                BACKEND_URL            = "https://bing-chun-shop.bc.dartcodes.com"
                API_PROXY_URL          = "https://bing-chun-shop.bc.dartcodes.com"
                SHOP_API_URL           = "https://bing-chun-shop.bc.dartcodes.com"
                ADMIN_API_URL          = "https://bing-chun-admin.bc.dartcodes.com"
                ADMIN_WEB_URL          = "https://bing-chun-admin-web.bc.dartcodes.com"
                NEXT_PUBLIC_SOCKET_URL = "https://bing-chun-shop.bc.dartcodes.com"
                NEXT_PUBLIC_SITE_URL   = "https://bing-chun.bc.dartcodes.com"
            }
        }
    }

    $capDef = @{
        schemaVersion  = 2
        dockerfilePath = "./Dockerfile"
        buildArgs      = $capDefObj
    } | ConvertTo-Json -Compress -Depth 5
    [System.IO.File]::WriteAllText((Join-Path $StageDir "captain-definition"), $capDef)

    Copy-ItemSafe (Join-Path $RepoRoot "package.json")                      (Join-Path $StageDir "package.json")
    Copy-ItemSafe (Join-Path $RepoRoot "package-lock.json")                 (Join-Path $StageDir "package-lock.json")
    Copy-ItemSafe (Join-Path $RepoRoot "packages\db\package.json")          (Join-Path $StageDir "packages\db\package.json")
    Copy-ItemSafe (Join-Path $RepoRoot "packages\delivery-domain\package.json") (Join-Path $StageDir "packages\delivery-domain\package.json")
    Copy-ItemSafe (Join-Path $RepoRoot "packages\settlement")               (Join-Path $StageDir "packages\settlement")
    Copy-ItemSafe (Join-Path $RepoRoot "backend\package.json")              (Join-Path $StageDir "backend\package.json")
    Copy-ItemSafe (Join-Path $RepoRoot "delivery-service\package.json")     (Join-Path $StageDir "delivery-service\package.json")
    Copy-ItemSafe (Join-Path $RepoRoot "Frontend\package.json")             (Join-Path $StageDir "Frontend\package.json")

    # Full Frontend tree except heavy local-only folders
    $feSrc = Join-Path $RepoRoot "Frontend"
    $feDst = Join-Path $StageDir "Frontend"
    New-Item -ItemType Directory -Path $feDst -Force | Out-Null
    Get-ChildItem $feSrc -Force | Where-Object {
        $_.Name -notin @("node_modules", ".next", "graphify-out", ".git")
    } | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $feDst $_.Name) -Recurse -Force
    }
}

function Package-Delivery {
    param([string]$StageDir)
    Copy-ItemSafe (Join-Path $RepoRoot "delivery-service\deploy\Dockerfile")         (Join-Path $StageDir "Dockerfile")
    Copy-ItemSafe (Join-Path $RepoRoot "delivery-service\deploy\captain-definition") (Join-Path $StageDir "captain-definition")
    Copy-ItemSafe (Join-Path $RepoRoot "package.json")                               (Join-Path $StageDir "package.json")
    Copy-ItemSafe (Join-Path $RepoRoot "package-lock.json")                          (Join-Path $StageDir "package-lock.json")
    Copy-ItemSafe (Join-Path $RepoRoot "packages\db")                               (Join-Path $StageDir "packages\db")
    Copy-ItemSafe (Join-Path $RepoRoot "packages\cors")                             (Join-Path $StageDir "packages\cors")
    Copy-ItemSafe (Join-Path $RepoRoot "packages\delivery-domain")                  (Join-Path $StageDir "packages\delivery-domain")
    Copy-ItemSafe (Join-Path $RepoRoot "delivery-service")                          (Join-Path $StageDir "delivery-service")
    Copy-ItemSafe (Join-Path $RepoRoot "backend\package.json")                      (Join-Path $StageDir "backend\package.json")
}

function Package-DeliveryFrontend {
    param([string]$StageDir)
    Copy-ItemSafe (Join-Path $RepoRoot "delivery-frontend\deploy\Dockerfile")         (Join-Path $StageDir "Dockerfile")
    Copy-ItemSafe (Join-Path $RepoRoot "delivery-frontend\deploy\captain-definition") (Join-Path $StageDir "captain-definition")
    Copy-ItemSafe (Join-Path $RepoRoot "delivery-frontend")                           (Join-Path $StageDir "delivery-frontend")
}

function Deploy-TarPackage {
    param(
        [string]$AppName,
        [string]$AppToken
    )

    Write-Host "========================================================" -ForegroundColor Magenta
    Write-Host "[DEPLOYING] App:    $AppName" -ForegroundColor Magenta
    Write-Host "[MODE]      Build:  Tar Source Upload -> CapRover Server Build" -ForegroundColor Yellow
    Write-Host "[SERVER]    URL:    $CaproverUrl" -ForegroundColor Gray
    Write-Host "========================================================" -ForegroundColor Magenta

    $StageDir = Join-Path $ScriptDir (".stage-" + $AppName)
    if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
    New-Item -ItemType Directory -Path $StageDir -Force | Out-Null

    Write-Host "Packaging source files for $AppName..." -ForegroundColor Cyan
    switch ($AppName) {
        "bing-chun-core"              { Package-Backend -StageDir $StageDir }
        "bing-chun-shop"              { Package-Backend -StageDir $StageDir }
        "bing-chun-admin"             { Package-Backend -StageDir $StageDir }
        "bing-chun-pos"               { Package-Backend -StageDir $StageDir }
        "bing-chun"                   { Package-Frontend -StageDir $StageDir -Surface "shop" }
        "bing-chun-admin-web"         { Package-Frontend -StageDir $StageDir -Surface "admin" }
        "bing-chun-pos-web"           { Package-Frontend -StageDir $StageDir -Surface "pos" }
        "bing-chun-delivery"          { Package-Delivery -StageDir $StageDir }
        "bing-chun-delivery-frontend" { Package-DeliveryFrontend -StageDir $StageDir }
        default {
            Write-Host "[ERROR] No packager for $AppName" -ForegroundColor Red
            return $false
        }
    }

    $TarFileName = "$AppName-deploy.tar"
    $TarFile = Join-Path $ScriptDir $TarFileName
    if (Test-Path $TarFile) { Remove-Item -Force $TarFile }

    Write-Host "Creating archive: $TarFileName..." -ForegroundColor Cyan
    Push-Location $StageDir
    try {
        tar -cf $TarFile *
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $TarFile)) {
        Write-Host "[FAILED] Tar not created for $AppName" -ForegroundColor Red
        return $false
    }
    $sizeMb = [math]::Round((Get-Item $TarFile).Length / 1MB, 2)
    Write-Host "Archive created: $sizeMb MB" -ForegroundColor Green

    # CapRover CLI joins tarFile to cwd as a relative path; absolute Windows
    # paths become invalid (cwd\C:\...). Always pass a path relative to ScriptDir.
    $TarRelative = $TarFileName
    $MaxAttempts = 3
    $DelaySec = 20
    Push-Location $ScriptDir
    try {
        for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
            Write-Host "[Attempt $attempt/$MaxAttempts] Uploading tar to CapRover ($AppName)..." -ForegroundColor Cyan
            npx -y caprover@2.2.3 deploy --caproverUrl $CaproverUrl --caproverApp $AppName --appToken $AppToken --tarFile $TarRelative 2>&1 | ForEach-Object { Write-Host $_ }
            $exitCode = $LASTEXITCODE
            if ($exitCode -eq 0) {
                Write-Host "[SUCCESS] Successfully uploaded tar for $AppName! Server is building Docker image." -ForegroundColor Green
                Remove-Item -Force $TarFile -ErrorAction SilentlyContinue
                Remove-Item -Recurse -Force $StageDir -ErrorAction SilentlyContinue
                return $true
            }
            Write-Host "[WARNING] Upload attempt $attempt returned exit code $exitCode." -ForegroundColor Yellow
            if ($attempt -lt $MaxAttempts) {
                Write-Host "Retrying in ${DelaySec}s..." -ForegroundColor Yellow
                Start-Sleep -Seconds $DelaySec
                $DelaySec = $DelaySec * 2
            }
        }
    } finally {
        Pop-Location
    }

    Remove-Item -Force $TarFile -ErrorAction SilentlyContinue
    Write-Host "[FAILED] Failed to upload tar for $AppName after $MaxAttempts attempts." -ForegroundColor Red
    return $false
}

# API / microservice CapRover apps only (excludes Next.js frontends).
$ApiApps = @(
    "bing-chun-core",
    "bing-chun-shop",
    "bing-chun-admin",
    "bing-chun-pos",
    "bing-chun-delivery"
)

Write-Host "========================================================" -ForegroundColor Magenta
Write-Host "       Bing Chun Microservices Tar Source Deployment    " -ForegroundColor Magenta
Write-Host "========================================================" -ForegroundColor Magenta

function Deploy-AppList([string[]]$Names) {
    $SuccessCount = 0
    $Failures = @()
    foreach ($name in $Names) {
        if (-not $Apps.Contains($name)) {
            Write-Host "[ERROR] Unknown service in list: $name" -ForegroundColor Red
            $Failures += $name
            continue
        }
        $ok = Deploy-TarPackage -AppName $name -AppToken $Apps[$name]
        if ($ok) { $SuccessCount++ } else { $Failures += $name }
    }
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Magenta
    Write-Host "Deployment Summary: $SuccessCount / $($Names.Count) uploaded." -ForegroundColor Green
    if ($Failures.Count -gt 0) {
        Write-Host "Failed services: $($Failures -join ', ')" -ForegroundColor Red
        exit 1
    }
}

if ($Target -eq "all") {
    Write-Host "Target: Deploy ALL $($Apps.Count) CapRover apps" -ForegroundColor Yellow
    Deploy-AppList -Names @($Apps.Keys)
} elseif ($Target -eq "apis" -or $Target -eq "microservices") {
    Write-Host "Target: Deploy API microservices only ($($ApiApps.Count) apps)" -ForegroundColor Yellow
    Deploy-AppList -Names $ApiApps
} else {
    if (-not $Apps.Contains($Target)) {
        Write-Host "[ERROR] Unknown service: '$Target'." -ForegroundColor Red
        Write-Host "Available services:" -ForegroundColor Yellow
        foreach ($k in $Apps.Keys) { Write-Host ("  - " + $k) }
        Write-Host "  - apis (default) / microservices"
        Write-Host "  - all"
        exit 1
    }

    $ok = Deploy-TarPackage -AppName $Target -AppToken $Apps[$Target]
    if (-not $ok) { exit 1 }
}
