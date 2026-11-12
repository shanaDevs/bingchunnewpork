#Requires -Version 5.1
<#
.SYNOPSIS
  Change the Windows printer port (USB / COM / TCP-IP host).
  Examples:
    .\set-printer-port.ps1 -PrinterName bingchun -PortName USB002
    .\set-printer-port.ps1 -PrinterName bingchun -HostAddress 192.168.1.50 -TcpPort 9100
#>
param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [string]$PortName = '',
  [string]$HostAddress = '',
  [int]$TcpPort = 9100
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pr = Get-Printer -Name $PrinterName -ErrorAction Stop

if ($HostAddress.Trim()) {
  $ip = $HostAddress.Trim()
  $portLabel = "IP_$ip"
  $existing = Get-PrinterPort -Name $portLabel -ErrorAction SilentlyContinue
  if (-not $existing) {
    Add-PrinterPort -Name $portLabel -PrinterHostAddress $ip -PortNumber $TcpPort
    Write-Host "Created TCP/IP port $portLabel ($ip:$TcpPort)"
  } else {
    # Recreate if address/port changed
    try {
      if ([string]$existing.PrinterHostAddress -ne $ip -or [int]$existing.PortNumber -ne $TcpPort) {
        # Cannot easily edit; create a unique name
        $portLabel = "IP_${ip}_$TcpPort"
        if (-not (Get-PrinterPort -Name $portLabel -ErrorAction SilentlyContinue)) {
          Add-PrinterPort -Name $portLabel -PrinterHostAddress $ip -PortNumber $TcpPort
          Write-Host "Created TCP/IP port $portLabel ($ip:$TcpPort)"
        }
      }
    } catch {
      if (-not (Get-PrinterPort -Name $portLabel -ErrorAction SilentlyContinue)) {
        Add-PrinterPort -Name $portLabel -PrinterHostAddress $ip -PortNumber $TcpPort
      }
    }
  }
  Set-Printer -Name $PrinterName -PortName $portLabel
  Write-Host "Printer '$PrinterName' now uses port $portLabel"
  Write-Output $portLabel
  exit 0
}

if (-not $PortName.Trim()) {
  throw 'Provide -PortName (e.g. USB002) or -HostAddress (e.g. 192.168.1.50)'
}

$wanted = $PortName.Trim()
$portObj = Get-PrinterPort -Name $wanted -ErrorAction SilentlyContinue
if (-not $portObj) {
  throw "Printer port '$wanted' does not exist on this PC. Plug in the printer or create the TCP/IP port first."
}

Set-Printer -Name $PrinterName -PortName $wanted
Write-Host "Printer '$PrinterName' port changed: $($pr.PortName) -> $wanted"
Write-Output $wanted
