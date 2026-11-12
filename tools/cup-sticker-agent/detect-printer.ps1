#Requires -Version 5.1
<#
.SYNOPSIS
  Pick the best local Windows printer queue for Bing Chun cup stickers.
  Prefers Xprinter driver / XP-D35 / renamed queues like "bingchun".
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing | Out-Null

function Test-PrinterReady([string]$name) {
  if ([string]::IsNullOrWhiteSpace($name)) { return $false }
  $doc = New-Object System.Drawing.Printing.PrintDocument
  try {
    $doc.PrinterSettings.PrinterName = $name
    return [bool]$doc.PrinterSettings.IsValid
  } finally {
    $doc.Dispose()
  }
}

$installed = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters)
$byDriver = @()
try {
  $byDriver = @(Get-Printer | Where-Object {
    $_.DriverName -match '(?i)xprinter|xp-d35' -or $_.Name -match '(?i)xprinter|xp-d35|bingchun'
  } | Select-Object -ExpandProperty Name)
} catch {}

$candidates = New-Object System.Collections.Generic.List[string]
foreach ($name in @($byDriver + $installed)) {
  if ($name -and -not $candidates.Contains($name)) { [void]$candidates.Add([string]$name) }
}

$preferred = @(
  $candidates | Where-Object { $_ -match '(?i)xprinter|xp-d35' }
) + @(
  $candidates | Where-Object { $_ -match '(?i)^bingchun$' }
) + @(
  $candidates | Where-Object { $_ -notmatch '(?i)pdf|onenote|fax|xps|microsoft|3d systems' }
)

$seen = @{}
foreach ($name in $preferred) {
  $key = $name.Trim()
  if (-not $key -or $seen.ContainsKey($key)) { continue }
  $seen[$key] = $true
  if (Test-PrinterReady $key) {
    Write-Output $key
    exit 0
  }
}

Write-Output ''
exit 1
