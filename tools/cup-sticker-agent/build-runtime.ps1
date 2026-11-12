#Requires -Version 5.1
<#
.SYNOPSIS
  Build BingChunCupStickerAgentRuntime.exe — standalone agent (embeds Node, no install on cashier PC).
  Also ensures portable Node exists under runtime\ as a fallback.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutExe = Join-Path $AgentDir 'BingChunCupStickerAgentRuntime.exe'
$DistDir = Join-Path $AgentDir 'dist'
$Bundle = Join-Path $DistDir 'server.cjs'
$EnsureRuntime = Join-Path $AgentDir 'ensure-runtime.ps1'

Write-Host '==> Ensuring portable Node fallback (for PCs without Node.js)'
$portable = Join-Path $AgentDir 'runtime\node\node.exe'
if (-not (Test-Path $portable)) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $EnsureRuntime -ForcePortable
}

Write-Host '==> Bundling server.mjs -> dist\server.cjs'
if (-not (Test-Path $DistDir)) { New-Item -ItemType Directory -Path $DistDir | Out-Null }

Push-Location $AgentDir
try {
  npx --yes esbuild server.mjs --bundle --platform=node --format=cjs --outfile=dist/server.cjs
  if ($LASTEXITCODE -ne 0) { throw "esbuild failed ($LASTEXITCODE)" }

  # Packaged EXE must resolve scripts next to the .exe (not inside the snapshot).
  $banner = @'
process.env.BC_STICKER_AGENT_DIR = process.env.BC_STICKER_AGENT_DIR || require("path").dirname(process.execPath);
'@
  $cjs = Get-Content $Bundle -Raw
  Set-Content -Path $Bundle -Value ($banner + "`r`n" + $cjs) -Encoding UTF8

  Write-Host '==> Packaging with @yao-pkg/pkg -> BingChunCupStickerAgentRuntime.exe'
  npx --yes @yao-pkg/pkg "`"$Bundle`"" -t node18-win-x64 -o "`"$OutExe`""
  if (-not (Test-Path $OutExe)) {
    Write-Host 'WARNING: pkg did not produce runtime EXE. Portable Node will still work on cashier PCs.' -ForegroundColor Yellow
  } else {
    Write-Host "OK: $OutExe ($([math]::Round((Get-Item $OutExe).Length/1MB,1)) MB)"
  }
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'Cashier PC needs NO Node.js if either:'
Write-Host '  - BingChunCupStickerAgentRuntime.exe is present, or'
Write-Host '  - runtime\node\ was copied / auto-downloaded by setup'
