#Requires -Version 5.1
<#
.SYNOPSIS
  One-time / reinstall cashier PC setup for the Bing Chun cup sticker agent:
  - checks Node.js (offers winget install if missing)
  - npm install (agent folder)
  - auto-detects the local sticker printer (name + port/IP)
  - writes local.env
  - installs Windows Service (boot start) when possible, else Startup shortcut
  - starts the agent now
#>
param(
  [switch]$NoStart,
  [switch]$NoAutoStart,
  [string]$PrinterName = '',
  [string]$PrinterPort = '',
  [string]$PrinterHost = '',
  [string]$PrinterTcpPort = '',
  [string]$ApiUrl = 'https://admin.bingchunsrilanka.com/api',
  [string]$Secret = 'bingchun-cup-sticker-local',
  [string]$StoreId = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalEnv = Join-Path $AgentDir 'local.env'
$StartBat = Join-Path $AgentDir 'start.bat'
$DetectPs1 = Join-Path $AgentDir 'detect-printer.ps1'
$ListPs1 = Join-Path $AgentDir 'list-printers.ps1'
$TaskName = 'BingChunCupStickerAgent'
$ServiceId = 'BingChunCupStickerAgent'
$ServiceDir = Join-Path $AgentDir 'service'
$WinSwExe = Join-Path $ServiceDir 'BingChunCupStickerAgent.exe'
$WinSwXml = Join-Path $ServiceDir 'BingChunCupStickerAgent.xml'
$script:AutoStartLabel = ''

function Write-Step([string]$msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

$RuntimeExe = Join-Path $AgentDir 'BingChunCupStickerAgentRuntime.exe'
$PortableNode = Join-Path $AgentDir 'runtime\node\node.exe'
$EnsureRuntimePs1 = Join-Path $AgentDir 'ensure-runtime.ps1'
$script:ResolvedRunner = ''

function Get-AgentRunner {
  if (Test-Path $RuntimeExe) { return $RuntimeExe }
  if (Test-Path $PortableNode) { return $PortableNode }
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) { return $node.Source }
  return $null
}

function Ensure-Node {
  Write-Step 'Checking runtime (standalone EXE / portable Node / system Node)'
  $runner = Get-AgentRunner
  if ($runner) {
    $script:ResolvedRunner = $runner
    if ($runner -like '*BingChunCupStickerAgentRuntime.exe') {
      Write-Host "Standalone agent EXE ready (no Node.js needed): $runner"
    } elseif ($runner -like '*\runtime\node\node.exe') {
      Write-Host "Portable Node ready: $runner ($(& $runner -v))"
    } else {
      Write-Host "System Node ready: $runner ($(& $runner -v))"
    }
    return
  }

  Write-Host 'No Node.js on this PC — downloading portable runtime (works without install/admin)...'
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $EnsureRuntimePs1
  $runner = [string]($out | Select-Object -Last 1)
  if (-not $runner -or -not (Test-Path $runner)) {
    throw 'Could not prepare a runtime. Connect internet and re-run setup, or copy runtime\node from another PC.'
  }
  $script:ResolvedRunner = $runner
  Write-Host "Runtime ready: $runner"
}

function Install-NpmDeps {
  # Pure Node stdlib agent — npm only needed if package.json gains deps later.
  # Skip entirely when using standalone EXE (no Node/npm required).
  if ($script:ResolvedRunner -like '*BingChunCupStickerAgentRuntime.exe') {
    Write-Host 'Standalone EXE mode — skipping npm'
    return
  }
  Write-Step 'Installing agent dependencies'
  Push-Location $AgentDir
  try {
    if (Test-Path (Join-Path $AgentDir 'package.json')) {
      $npm = Get-Command npm -ErrorAction SilentlyContinue
      if (-not $npm -and (Test-Path (Join-Path $AgentDir 'runtime\node\npm.cmd'))) {
        $env:Path = (Join-Path $AgentDir 'runtime\node') + ';' + $env:Path
        $npm = Get-Command npm -ErrorAction SilentlyContinue
      }
      if ($npm) {
        & npm install --omit=dev
        if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
        Write-Host 'npm install complete'
      } else {
        Write-Host 'npm not found — agent uses Node built-ins only; continuing'
      }
    } else {
      Write-Host 'No package.json - skipping npm install'
    }
  } finally {
    Pop-Location
  }
}

function Get-PrinterDetails([string]$name) {
  try {
    $raw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ListPs1
    $snap = ($raw | Out-String) | ConvertFrom-Json
    if (-not $snap) { return $null }
    if ($name) {
      return @($snap.printers | Where-Object { $_.name -eq $name } | Select-Object -First 1)
    }
    if ($snap.suggested) {
      return @($snap.printers | Where-Object { $_.name -eq $snap.suggested } | Select-Object -First 1)
    }
    return $null
  } catch {
    return $null
  }
}

function Resolve-Printer {
  if ($PrinterName.Trim()) {
    Write-Host "Using printer from argument: $($PrinterName.Trim())"
    return $PrinterName.Trim()
  }
  Write-Step 'Detecting sticker printer'
  $detected = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DetectPs1
  $detected = [string]$detected
  if (-not [string]::IsNullOrWhiteSpace($detected)) {
    Write-Host "Detected printer: $detected"
    return $detected.Trim()
  }
  Write-Host 'WARNING: No ready Xprinter / bingchun queue found.' -ForegroundColor Yellow
  Write-Host 'Plug in the USB printer, install its driver, then re-run setup.exe / install.bat'
  Write-Host 'Or open setup-ui to pick a port/IP and reinstall.'
  return ''
}

function Write-LocalEnv([string]$printer) {
  Write-Step 'Writing local.env'
  $details = Get-PrinterDetails $printer
  $portName = if ($PrinterPort.Trim()) { $PrinterPort.Trim() } elseif ($details) { [string]$details.portName } else { '' }
  $hostAddr = if ($PrinterHost.Trim()) { $PrinterHost.Trim() } elseif ($details) { [string]$details.hostAddress } else { '' }
  $tcp = if ($PrinterTcpPort.Trim()) { $PrinterTcpPort.Trim() } elseif ($details -and $null -ne $details.tcpPort) { [string]$details.tcpPort } else { '' }

  $lines = @(
    '# Auto-generated by install.ps1 - edit if needed, then restart the agent / service',
    "BC_STICKER_API_URL=$ApiUrl",
    "BC_STICKER_SECRET=$Secret",
    "BC_STICKER_PRINTER=$printer",
    "BC_STICKER_PRINTER_PORT=$portName",
    "BC_STICKER_PRINTER_HOST=$hostAddr",
    "BC_STICKER_PRINTER_TCP_PORT=$tcp",
    'BC_STICKER_WIDTH_MM=40',
    'BC_STICKER_HEIGHT_MM=30',
    "BC_STICKER_STORE_ID=$StoreId",
    'BC_STICKER_SILENT=1'
  )
  [System.IO.File]::WriteAllLines($LocalEnv, $lines)
  Write-Host "Saved $LocalEnv"
  if ($portName -or $hostAddr) {
    Write-Host "Printer port=$portName host=$hostAddr tcp=$tcp"
  }
}

function Ensure-WinSw {
  if (-not (Test-Path $ServiceDir)) {
    New-Item -ItemType Directory -Path $ServiceDir | Out-Null
  }

  $runner = $script:ResolvedRunner
  if (-not $runner) { $runner = Get-AgentRunner }
  if (-not $runner) { throw 'No agent runtime resolved for Windows Service.' }

  if ($runner -like '*BingChunCupStickerAgentRuntime.exe') {
    $exe = $runner
    $args = ''
  } else {
    $exe = $runner
    $args = "`"$AgentDir\server.mjs`""
  }

  $argsXml = if ($args) { "  <arguments>$args</arguments>`r`n" } else { '' }
  $xml = @"
<service>
  <id>$ServiceId</id>
  <name>Bing Chun Cup Sticker Agent</name>
  <description>Polls Bing Chun admin and prints cup stickers on the local label printer. Starts automatically when Windows boots.</description>
  <executable>$exe</executable>
$argsXml  <workingdirectory>$AgentDir</workingdirectory>
  <env name="BC_STICKER_AGENT_DIR" value="$AgentDir" />
  <logmode>rotate</logmode>
  <onfailure action="restart" delay="5 sec"/>
  <onfailure action="restart" delay="10 sec"/>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <stoptimeout>15 sec</stoptimeout>
</service>
"@
  [System.IO.File]::WriteAllText($WinSwXml, $xml)

  if (Test-Path $WinSwExe) {
    return $true
  }

  Write-Host 'Downloading WinSW service wrapper...'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $urls = @(
    'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe',
    'https://github.com/winsw/winsw/releases/download/v3.0.0/WinSW-x64.exe'
  )
  foreach ($url in $urls) {
    try {
      Write-Host "Trying $url"
      curl.exe -L --fail --retry 3 --connect-timeout 20 -o "$WinSwExe" "$url"
      if ((Test-Path $WinSwExe) -and ((Get-Item $WinSwExe).Length -gt 100000)) {
        return $true
      }
    } catch {
      Write-Host "  failed: $($_.Exception.Message)"
    }
  }
  Write-Host 'WinSW download failed. Place WinSW-x64.exe as service\BingChunCupStickerAgent.exe' -ForegroundColor Yellow
  return $false
}

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $prin = New-Object Security.Principal.WindowsPrincipal($id)
  return $prin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Register-WindowsService {
  if (-not (Ensure-WinSw)) { return $false }
  if (-not (Test-IsAdmin)) {
    Write-Host 'Windows Service install needs Administrator. Right-click setup.exe / install.bat -> Run as administrator for boot service.' -ForegroundColor Yellow
    return $false
  }

  Write-Step "Installing Windows Service ($ServiceId)"
  # Stop/uninstall previous
  & $WinSwExe stop 2>$null | Out-Null
  & $WinSwExe uninstall 2>$null | Out-Null
  Start-Sleep -Seconds 1
  & $WinSwExe install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "WinSW install failed (exit $LASTEXITCODE)" -ForegroundColor Yellow
    return $false
  }
  & $WinSwExe start
  Write-Host "Windows Service OK: $ServiceId (Automatic Delayed Start on boot)"
  $script:AutoStartLabel = "Windows Service $ServiceId (boot)"
  return $true
}

function Register-StartupShortcut {
  $autoBat = Join-Path $AgentDir 'start-autostart.bat'
  $startup = [Environment]::GetFolderPath('Startup')
  $lnkPath = Join-Path $startup 'Bing Chun Cup Sticker Agent.lnk'
  $wscript = New-Object -ComObject WScript.Shell
  $shortcut = $wscript.CreateShortcut($lnkPath)
  $shortcut.TargetPath = $autoBat
  $shortcut.WorkingDirectory = $AgentDir
  $shortcut.WindowStyle = 7 # minimized
  $shortcut.Description = 'Bing Chun cup sticker print agent'
  $shortcut.Save()
  Write-Host "Startup shortcut OK: $lnkPath"
  return $lnkPath
}

function Register-AutoStart {
  if ($NoAutoStart) {
    Write-Host 'Skipping auto-start registration (-NoAutoStart)'
    return
  }

  # Prefer real Windows Service (starts every boot). Fallbacks: task / Startup folder.
  if (Register-WindowsService) {
    # Remove duplicate Startup shortcut if service is active
    $startup = [Environment]::GetFolderPath('Startup')
    $lnkPath = Join-Path $startup 'Bing Chun Cup Sticker Agent.lnk'
    if (Test-Path $lnkPath) { Remove-Item $lnkPath -Force -ErrorAction SilentlyContinue }
    return
  }

  Write-Step "Registering Windows logon auto-start ($TaskName)"
  $autoBat = Join-Path $AgentDir 'start-autostart.bat'
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

  $script:AutoStartLabel = "Windows logon task $TaskName"
  $action = New-ScheduledTaskAction -Execute $autoBat -WorkingDirectory $AgentDir
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

  try {
    Register-ScheduledTask `
      -TaskName $TaskName `
      -Action $action `
      -Trigger $trigger `
      -Settings $settings `
      -Principal $principal `
      -Force | Out-Null
    Write-Host "Auto-start OK: scheduled task '$TaskName' for $env:USERNAME"
  } catch {
    Write-Host "Scheduled task not permitted ($($_.Exception.Message))" -ForegroundColor Yellow
    Write-Host 'Falling back to Startup folder shortcut (no admin needed)...'
    [void](Register-StartupShortcut)
    $script:AutoStartLabel = 'Startup folder shortcut (runs at Windows logon)'
  }
}

function Start-AgentNow {
  if ($NoStart) {
    Write-Host 'Skipping immediate start (-NoStart)'
    return
  }

  # If Windows Service is running, don't also launch start.bat
  try {
    $svc = Get-Service -Name $ServiceId -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') {
      Write-Step 'Service already running'
      Start-Sleep -Seconds 2
      try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:9177/health' -TimeoutSec 5
        Write-Host ("Agent online - printer={0} ready={1} port={2} host={3}" -f `
          $health.printer, $health.printerReady, $health.printerPort, $health.printerHost) -ForegroundColor Green
      } catch {
        Write-Host 'Service started; health not ready yet.' -ForegroundColor Yellow
      }
      return
    }
  } catch {}

  Write-Step 'Starting agent now'
  try {
    $lines = netstat -ano | Select-String ':9177 .*LISTENING'
    foreach ($line in $lines) {
      $parts = ($line.ToString() -split '\s+') | Where-Object { $_ }
      $procId = $parts[-1]
      if ($procId -match '^\d+$') {
        Write-Host "Stopping old agent PID $procId"
        taskkill /F /PID $procId 2>$null | Out-Null
      }
    }
  } catch {}

  Start-Process -FilePath $StartBat -WorkingDirectory $AgentDir -WindowStyle Minimized
  Start-Sleep -Seconds 2
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:9177/health' -TimeoutSec 5
    Write-Host ("Agent online - printer={0} ready={1} port={2} host={3}" -f `
      $health.printer, $health.printerReady, $health.printerPort, $health.printerHost) -ForegroundColor Green
  } catch {
    Write-Host 'Agent started (health check not ready yet). Check the minimized window.' -ForegroundColor Yellow
  }
}

Write-Host 'Bing Chun Cup Sticker Agent - install'
Write-Host "Folder: $AgentDir"

Ensure-Node
Install-NpmDeps
$printer = Resolve-Printer
Write-LocalEnv -printer $printer
Register-AutoStart
Start-AgentNow

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host '  Health:   http://127.0.0.1:9177/health'
if (-not $script:AutoStartLabel) { $script:AutoStartLabel = 'not registered' }
Write-Host "  Auto:     $script:AutoStartLabel"
Write-Host '  Setup UI: setup.bat  or  BingChunCupStickerSetup.exe'
Write-Host '  Uninstall: uninstall-autostart.bat'
Write-Host ''
Write-Host 'If printer USB port or network IP changes: open setup, pick new port/IP, click Reinstall.'
if ($printer) {
  Write-Host "Detected/configured printer: $printer" -ForegroundColor Green
}
