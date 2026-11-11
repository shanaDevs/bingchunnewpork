#Requires -Version 5.1
<#
.SYNOPSIS
  List Windows printers with port name, host IP, TCP port, and ready flag.
  Output: one JSON array (UTF-8) for the setup UI / agent health.
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

function Get-PortInfo([string]$portName) {
  $info = [ordered]@{
    portName     = $portName
    hostAddress  = ''
    tcpPort      = $null
    description  = ''
    kind         = 'other'
  }
  if ([string]::IsNullOrWhiteSpace($portName)) { return $info }

  try {
    $p = Get-PrinterPort -Name $portName -ErrorAction SilentlyContinue
    if ($p) {
      $info.hostAddress = [string]($p.PrinterHostAddress)
      if ($null -ne $p.PortNumber -and [string]$p.PortNumber -ne '') {
        $info.tcpPort = [int]$p.PortNumber
      }
      $info.description = [string]$p.Description
    }
  } catch {}

  if ($portName -match '(?i)^USB\d+') { $info.kind = 'usb' }
  elseif ($portName -match '(?i)^COM\d+') { $info.kind = 'com' }
  elseif ($info.hostAddress) { $info.kind = 'tcpip' }
  elseif ($portName -match '(?i)^IP_') { $info.kind = 'tcpip' }
  elseif ($portName -match '(?i)nul:|PORTPROMPT:|FILE:') { $info.kind = 'virtual' }

  return $info
}

$rows = @()
try {
  $printers = @(Get-Printer)
} catch {
  $printers = @()
}

foreach ($pr in $printers) {
  $port = Get-PortInfo ([string]$pr.PortName)
  $name = [string]$pr.Name
  $driver = [string]$pr.DriverName
  $isSticker = ($driver -match '(?i)xprinter|xp-d35' -or $name -match '(?i)xprinter|xp-d35|bingchun')
  $rows += [ordered]@{
    name        = $name
    driverName  = $driver
    portName    = $port.portName
    hostAddress = $port.hostAddress
    tcpPort     = $port.tcpPort
    portKind    = $port.kind
    status      = [string]$pr.PrinterStatus
    ready       = [bool](Test-PrinterReady $name)
    stickerLikely = [bool]$isSticker
  }
}

# Also list unused-looking USB / TCP ports for rebinding UI.
$ports = @()
try {
  foreach ($p in @(Get-PrinterPort)) {
    $info = Get-PortInfo ([string]$p.Name)
    if ($info.kind -in @('usb', 'tcpip', 'com')) {
      $ports += $info
    }
  }
} catch {}

$suggested = ''
foreach ($r in $rows) {
  if ($r.stickerLikely -and $r.ready) { $suggested = [string]$r.name; break }
}
if (-not $suggested) {
  foreach ($r in $rows) {
    if ($r.stickerLikely) { $suggested = [string]$r.name; break }
  }
}
$result = [ordered]@{
  printers  = $rows
  ports     = $ports
  suggested = $suggested
}

$json = $result | ConvertTo-Json -Depth 6 -Compress
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Write-Output $json
