<#
.SYNOPSIS
  Walk the VU ladder and record results.

.EXAMPLE
  .\load-tests\ladder.ps1 -Scenarios browse -MaxRung 200

.EXAMPLE
  .\load-tests\ladder.ps1 -TargetEnv production -Scenarios cart,account,validate `
    -Rungs 5,10,20,35,50 -Duration 2m -LoadTestKey "<key>"
#>
param(
  [ValidateSet('local', 'production')]
  [string]$TargetEnv = 'local',

  # Accept "cart,account" or PowerShell array cart,account
  [string[]]$Scenarios = @('browse'),
  [int[]]$Rungs = @(50, 200, 1000, 5000, 10000, 30000),
  [int]$MaxRung = 0,
  [string]$Duration = '2m',
  [string]$LoadTestKey = '',
  [int]$WriteUserCount = 0,
  [double]$AbortErrorRate = 0,

  [switch]$ConfirmProduction,
  [switch]$AllowProductionWrites
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

# Production writes: abort earlier (2%) than local browse ladder (5%)
if ($AbortErrorRate -le 0) {
  if ($TargetEnv -eq 'production' -and $ScenariosCsv -match 'cart|account|authchurn|order') {
    $AbortErrorRate = 0.02
  } else {
    $AbortErrorRate = 0.05
  }
}

$resultsFile = Join-Path $PSScriptRoot 'reports\ladder-results.md'
$lines = @(
  '# VU Ladder Results',
  '',
  "| Timestamp | Env | VUs | Duration | p95 (ms) | Error rate | dropped_iterations | http_req_blocked avg | Notes |",
  '|-----------|-----|-----|----------|----------|------------|--------------------|-----------------------|-------|'
)

if ($MaxRung -gt 0) {
  $Rungs = $Rungs | Where-Object { $_ -le $MaxRung }
}

foreach ($vus in $Rungs) {
  Write-Host "=== Ladder rung: $vus VUs ($TargetEnv) ===" -ForegroundColor Cyan

  $runParams = @{
    TargetEnv     = $TargetEnv
    Profile       = 'smoke'
    Scenarios     = $ScenariosCsv
    Vus           = $vus
    Duration      = $Duration
    SkipPreflight = $true
    NoDashboard   = $true
  }
  if ($LoadTestKey) { $runParams.LoadTestKey = $LoadTestKey }
  if ($WriteUserCount -gt 0) { $runParams.WriteUserCount = $WriteUserCount }
  if ($ConfirmProduction) { $runParams.ConfirmProduction = $true }
  if ($AllowProductionWrites) { $runParams.AllowProductionWrites = $true }

  if ($TargetEnv -eq 'production' -and -not $ConfirmProduction) {
    throw 'Production ladder requires -ConfirmProduction'
  }
  if ($TargetEnv -eq 'production' -and $ScenariosCsv -match 'cart|account|authchurn' -and -not $AllowProductionWrites) {
    throw 'Production write ladder requires -AllowProductionWrites'
  }

  $before = Get-Date
  & (Join-Path $PSScriptRoot 'run.ps1') @runParams
  $exitCode = $LASTEXITCODE

  $jsonGlob = Join-Path $PSScriptRoot "reports\$TargetEnv-smoke-*.json"
  $jsonPath = Get-ChildItem $jsonGlob |
    Where-Object { $_.LastWriteTime -ge $before } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  $p95 = 'n/a'
  $errRate = 'n/a'
  $dropped = 'n/a'
  $blocked = 'n/a'
  $stamp = if ($jsonPath) { $jsonPath.BaseName -replace "^$TargetEnv-smoke-", '' } else { (Get-Date -Format 'yyyy-MM-dd_HH-mm-ss') }
  $notes = if ($exitCode -ne 0) { 'thresholds failed' } else { 'ok' }

  if ($jsonPath) {
    $data = Get-Content $jsonPath.FullName -Raw | ConvertFrom-Json
    $p95 = $data.metrics.'http_req_duration'.values.'p(95)'
    $errRate = $data.metrics.http_req_failed.values.rate
    $dropped = $data.metrics.dropped_iterations.values.count
    $blocked = $data.metrics.http_req_blocked.values.avg
  }

  $lines += "| $stamp | $TargetEnv | $vus | $Duration | $p95 | $errRate | $dropped | $blocked | $notes |"

  $errNumeric = 0
  if ($errRate -is [double] -or $errRate -is [decimal] -or $errRate -is [int]) {
    $errNumeric = [double]$errRate
  } elseif ($errRate -match '^[0-9.]+$') {
    $errNumeric = [double]$errRate
  }

  if (($dropped -is [int] -and $dropped -gt 0) -or ($dropped -match '^\d+$' -and [int]$dropped -gt 0) -or $errNumeric -gt $AbortErrorRate) {
    Write-Warning "Stopping ladder at $vus VUs - client or server degradation detected (abort error rate=$AbortErrorRate)."
    break
  }
}

$lines | Set-Content $resultsFile -Encoding UTF8
Write-Host "Ladder results written to $resultsFile" -ForegroundColor Green
