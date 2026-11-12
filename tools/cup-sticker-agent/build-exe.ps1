#Requires -Version 5.1
# Build Setup GUI + print/detect EXEs for Windows 7+ (no PowerShell on cashier PC).
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host 'Building helper + setup GUI EXEs...'
& cmd /c "`"$AgentDir\build-helpers.bat`""
if ($LASTEXITCODE -ne 0) { throw 'build-helpers.bat failed' }

Write-Host ''
Write-Host 'On Windows 7 cashier PC:'
Write-Host '  1. Copy the cup-sticker-agent folder'
Write-Host '  2. Run BingChunCupStickerSetup.exe'
Write-Host '  3. Select the correct printer in the GUI'
Write-Host '  4. Click Save && Install agent  (writes local.env for future use)'
