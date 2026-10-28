<#
.SYNOPSIS
  Run Bing Chun k6 load tests with dashboard + timestamped reports.

.EXAMPLE
  .\load-tests\run.ps1 -TargetEnv local -Profile smoke -Scenarios browse

.EXAMPLE
  .\load-tests\run.ps1 -TargetEnv production -Profile smoke -Scenarios browse -ConfirmProduction

.EXAMPLE
  .\load-tests\run.ps1 -TargetEnv production -Scenarios cart,account,validate `
    -ConfirmProduction -AllowProductionWrites -LoadTestKey "<key>" -Vus 10 -Duration 2m
#>
param(
  [ValidateSet('local', 'production')]
  [string]$TargetEnv = 'local',

  [ValidateSet('smoke', 'typical', 'baseline', 'stress', 'spike', 'soak')]
  [string]$Profile = 'smoke',

  # Accept "cart,account" or PowerShell array cart,account (commas become arrays)
  [string[]]$Scenarios = @('browse'),

  [int]$Vus = 0,
  [string]$Duration = '',
  [string]$Stages = '',
  [string]$LoadTestKey = '',
  [string]$DriverToken = '',
  [int]$ThinkTimeMs = 0,
  [int]$P95Ms = 0,
  [int]$WriteUserCount = 0,
  [int]$RegisterCount = 0,

  [switch]$ConfirmProduction,
  [switch]$AllowProductionOrders,
  [switch]$AllowProductionWrites,
  [switch]$IncludeGeocode,
  [switch]$SkipPreflight,
  [switch]$NoDashboard
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# PowerShell turns -Scenarios cart,account into @('cart','account'); k6 needs commas.
$ScenariosCsv = (
  $Scenarios |
    ForEach-Object { $_ -split ',' } |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ }
) -join ','
if (-not $ScenariosCsv) { $ScenariosCsv = 'browse' }

function Get-K6Path {
  if (Get-Command k6 -ErrorAction SilentlyContinue) { return 'k6' }
  $bundled = Join-Path $repoRoot 'load-tests\.tools\k6.exe'
  if (Test-Path $bundled) { return $bundled }
  throw 'k6 not found. Install from https://grafana.com/docs/k6/latest/set-up/install-k6/ or use load-tests/.tools/k6.exe'
}

function Get-TargetHealthUrl {
  param([string]$Environment)
  if ($Environment -eq 'production') {
    return 'https://bing-chun-core.bc.dartcodes.com/health'
  }
  return 'http://localhost:4000/health'
}

function Get-MaxVusFromProfile {
  param([string]$ProfileName, [string]$StagesRaw, [int]$VusOverride)
  if ($VusOverride -gt 0) { return $VusOverride }
  if ($StagesRaw) {
    $max = 0
    foreach ($part in $StagesRaw.Split(',')) {
      $target = [int]($part.Split(':')[1])
      if ($target -gt $max) { $max = $target }
    }
    return $max
  }
  switch ($ProfileName) {
    'smoke' { return 5 }
    'typical' { return 20 }
    'baseline' { return 100 }
    'stress' { return 5000 }
    'spike' { return 2000 }
    'soak' { return 200 }
    default { return 5 }
  }
}

# Production safety guards
if ($TargetEnv -eq 'production') {
  if (-not $ConfirmProduction) {
    throw 'Production run blocked. Re-run with -ConfirmProduction after notifying the team and choosing an off-peak window.'
  }
  if ($ScenariosCsv -match 'order' -and -not $AllowProductionOrders) {
    throw 'Order scenario writes real DB rows and may send SMS. Use -AllowProductionOrders to override (not recommended).'
  }
  if ($ScenariosCsv -match 'cart|account|authchurn' -and -not $AllowProductionWrites) {
    throw 'These scenarios write to the production database. Re-run with -AllowProductionWrites.'
  }
  if ($ScenariosCsv -match 'cart|account|authchurn|order' -and -not $LoadTestKey) {
    Write-Warning 'Write scenarios on production without -LoadTestKey will hit auth rate limits (20/15min). Setup may fail.'
  }
  if (@('smoke', 'typical') -notcontains $Profile -and $Vus -le 50 -and -not $Stages) {
    Write-Warning "Production profile '$Profile' may exceed safe limits. Consider -Profile smoke or -Vus 50."
  }
}

$k6 = Get-K6Path
$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$reportHtml = "load-tests/reports/$TargetEnv-$Profile-$stamp.html"

Write-Host "=== Bing Chun Load Test ===" -ForegroundColor Cyan
Write-Host "Environment : $TargetEnv"
Write-Host "Profile     : $Profile"
Write-Host "Scenarios   : $ScenariosCsv"
Write-Host "k6          : $k6"
Write-Host "Report HTML : $reportHtml"
Write-Host ""

if (-not $SkipPreflight) {
  Write-Host 'Preflight checks...' -ForegroundColor Yellow

  $healthUrl = Get-TargetHealthUrl -Environment $TargetEnv
  try {
    $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10
    if ($resp.StatusCode -ne 200) {
      throw "Health check returned $($resp.StatusCode)"
    }
    Write-Host "  OK  Target reachable: $healthUrl"
  } catch {
    throw "Target not reachable at $healthUrl - start the backend or check network. ($_)"
  }

  $portInfo = netsh int ipv4 show dynamicport tcp 2>$null
  if ($portInfo -match 'Start Port\s+:\s+(\d+).*Number of Ports\s+:\s+(\d+)') {
    $startPort = [int]$Matches[1]
    $numPorts = [int]$Matches[2]
    $maxPorts = $startPort + $numPorts
    $maxVus = Get-MaxVusFromProfile -ProfileName $Profile -StagesRaw $Stages -VusOverride $Vus
    $needed = [math]::Ceiling($maxVus * 1.5)
    Write-Host "  OK  Ephemeral TCP ports: ~$numPorts (start $startPort)"
    if ($needed -gt $numPorts) {
      Write-Warning "  WARN  Estimated VUs ($maxVus) may exceed ephemeral port capacity ($numPorts)."
      Write-Warning '        Run as admin: netsh int ipv4 set dynamicport tcp start=10000 num=55000'
    }
  }
}

if (-not $NoDashboard) {
  $env:K6_WEB_DASHBOARD = 'true'
  $env:K6_WEB_DASHBOARD_PERIOD = '2s'
  $env:K6_WEB_DASHBOARD_EXPORT = $reportHtml
  Write-Host "Dashboard   : http://localhost:5665 (live during run)" -ForegroundColor Green
}

$k6Args = @(
  'run',
  '-e', "ENV=$TargetEnv",
  '-e', "PROFILE=$Profile",
  '-e', "SCENARIOS=$ScenariosCsv",
  '-e', "REPORT_STAMP=$stamp",
  'load-tests/main.js'
)

if ($Vus -gt 0) { $k6Args += @('-e', "VUS=$Vus") }
if ($Duration) { $k6Args += @('-e', "DURATION=$Duration") }
if ($Stages) { $k6Args += @('-e', "STAGES=$Stages") }
if ($LoadTestKey) { $k6Args += @('-e', "LOAD_TEST_KEY=$LoadTestKey") }
if ($DriverToken) { $k6Args += @('-e', "DRIVER_TOKEN=$DriverToken") }
if ($ThinkTimeMs -gt 0) { $k6Args += @('-e', "THINK_TIME_MS=$ThinkTimeMs") }
if ($P95Ms -gt 0) { $k6Args += @('-e', "P95_MS=$P95Ms") }
if ($WriteUserCount -gt 0) { $k6Args += @('-e', "WRITE_USER_COUNT=$WriteUserCount") }
if ($RegisterCount -gt 0) { $k6Args += @('-e', "REGISTER_COUNT=$RegisterCount") }
if ($IncludeGeocode) { $k6Args += @('-e', 'INCLUDE_GEOCODE=true') }

Write-Host ''
Write-Host "Running: $k6 $($k6Args -join ' ')" -ForegroundColor Cyan
& $k6 @k6Args
$exitCode = $LASTEXITCODE

if (Test-Path $reportHtml) {
  Write-Host "HTML report : $reportHtml" -ForegroundColor Green
}
Write-Host "JSON/TXT/MD : load-tests/reports/$TargetEnv-$Profile-$stamp.*" -ForegroundColor Green

exit $exitCode
