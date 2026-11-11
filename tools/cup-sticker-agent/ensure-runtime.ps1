#Requires -Version 5.1
<#
.SYNOPSIS
  Ensure the cup-sticker agent can run without a system-wide Node.js install.
  Preference order:
    1) BingChunCupStickerAgentRuntime.exe (standalone, no Node needed)
    2) Portable Node in runtime\node\node.exe
    3) System Node on PATH
    4) Download portable Node into runtime\ (no admin required)
    5) winget / MSI install of Node.js (best-effort)
#>
param(
  [switch]$Quiet,
  [switch]$ForcePortable
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeExe = Join-Path $AgentDir 'BingChunCupStickerAgentRuntime.exe'
$PortableNode = Join-Path $AgentDir 'runtime\node\node.exe'
$NodeVersion = 'v20.19.0'
$NodeZipName = "node-$NodeVersion-win-x64.zip"
$NodeUrl = "https://nodejs.org/dist/$NodeVersion/$NodeZipName"

function Write-Info([string]$msg) {
  if (-not $Quiet) { Write-Host $msg }
}

function Get-SystemNode {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
    [System.Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
    (Join-Path $AgentDir 'runtime\node')
}

function Install-PortableNode {
  Write-Info "Downloading portable Node.js $NodeVersion (no admin needed)..."
  $runtimeRoot = Join-Path $AgentDir 'runtime'
  $nodeRoot = Join-Path $runtimeRoot 'node'
  $zipPath = Join-Path $env:TEMP $NodeZipName
  $extractTo = Join-Path $env:TEMP "node-extract-$NodeVersion"

  if (-not (Test-Path $runtimeRoot)) {
    New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
  }
  if (Test-Path $extractTo) { Remove-Item $extractTo -Recurse -Force -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Path $extractTo | Out-Null

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  curl.exe -L --fail --retry 3 --connect-timeout 30 -o "$zipPath" "$NodeUrl"
  if (-not (Test-Path $zipPath) -or ((Get-Item $zipPath).Length -lt 1000000)) {
    throw "Failed to download Node.js from $NodeUrl"
  }

  Expand-Archive -Path $zipPath -DestinationPath $extractTo -Force
  $inner = Get-ChildItem $extractTo -Directory | Select-Object -First 1
  if (-not $inner) { throw 'Portable Node zip layout unexpected.' }

  if (Test-Path $nodeRoot) { Remove-Item $nodeRoot -Recurse -Force }
  Move-Item -Path $inner.FullName -Destination $nodeRoot

  Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
  Remove-Item $extractTo -Recurse -Force -ErrorAction SilentlyContinue

  if (-not (Test-Path $PortableNode)) {
    throw "Portable Node missing after extract: $PortableNode"
  }
  Write-Info "Portable Node ready: $PortableNode ($(& $PortableNode -v))"
}

function Try-InstallSystemNode {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Write-Info 'Installing Node.js LTS via winget...'
    try {
      & winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
      Refresh-Path
      $n = Get-SystemNode
      if ($n) {
        Write-Info "Installed system Node: $n ($(& $n -v))"
        return $true
      }
    } catch {
      Write-Info "winget install failed: $($_.Exception.Message)"
    }
  }

  # Silent MSI (may need admin)
  try {
    Write-Info 'Trying Node.js MSI silent install...'
    $msi = Join-Path $env:TEMP "node-$NodeVersion-x64.msi"
    $msiUrl = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-x64.msi"
    curl.exe -L --fail --retry 3 --connect-timeout 30 -o "$msi" "$msiUrl"
    if ((Test-Path $msi) -and ((Get-Item $msi).Length -gt 1000000)) {
      $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
      Refresh-Path
      $n = Get-SystemNode
      if ($n) {
        Write-Info "Installed system Node via MSI: $n"
        return $true
      }
      if ($p.ExitCode -ne 0) {
        Write-Info "MSI exit $($p.ExitCode) (often needs Run as administrator). Using portable Node instead."
      }
    }
  } catch {
    Write-Info "MSI install skipped: $($_.Exception.Message)"
  }
  return $false
}

# --- main ---
if (-not $ForcePortable -and (Test-Path $RuntimeExe)) {
  Write-Info "Standalone agent EXE found (no Node required): $RuntimeExe"
  Write-Output $RuntimeExe
  exit 0
}

Refresh-Path

if (-not $ForcePortable) {
  $system = Get-SystemNode
  if ($system) {
    Write-Info "Using system Node: $system ($(& $system -v))"
    Write-Output $system
    exit 0
  }
}

if (Test-Path $PortableNode) {
  Write-Info "Using portable Node: $PortableNode ($(& $PortableNode -v))"
  Write-Output $PortableNode
  exit 0
}

# No Node / forced portable — download into runtime\ (works without admin).
try {
  Install-PortableNode
  Write-Output $PortableNode
  exit 0
} catch {
  Write-Info "Portable Node download failed: $($_.Exception.Message)"
}

# Last resort: system install
if (Try-InstallSystemNode) {
  $system = Get-SystemNode
  Write-Output $system
  exit 0
}

Write-Error 'Could not find or install Node.js. Check internet, or copy runtime\node from another PC.'
exit 1
