#Requires -Version 5.1
<#
.SYNOPSIS
  Print Bing Chun cup stickers on the local Xprinter (GDI → Windows spooler).
  Logo is pre-printed. Order + cup qty after logo. Product name is centered
  and manually word-wrapped onto 2–3 rows (full name, no ellipsis).
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$JsonPath,

  [string]$PrinterName = $(if ($env:BC_STICKER_PRINTER) { $env:BC_STICKER_PRINTER } else { 'Xprinter XP-D35B' }),

  [double]$WidthMm = $(if ($env:BC_STICKER_WIDTH_MM) { [double]$env:BC_STICKER_WIDTH_MM } else { 40 }),
  [double]$HeightMm = $(if ($env:BC_STICKER_HEIGHT_MM) { [double]$env:BC_STICKER_HEIGHT_MM } else { 30 })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function ConvertTo-HundredthsInch([double]$mm) {
  return [int][Math]::Round(($mm / 25.4) * 100)
}

function Split-AdvisoryLines([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return @() }
  $parts = [regex]::Split($text.Trim(), '(?<=\.)\s+') | Where-Object { $_ -and $_.Trim() }
  if (@($parts).Count -gt 1) { return @($parts | ForEach-Object { $_.Trim() }) }
  return @($text.Trim())
}

function Get-PackedLines {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Font]$Font,
    [string[]]$Words,
    [double]$MaxWidthMm,
    [int]$MaxLines
  )

  $lines = New-Object System.Collections.Generic.List[string]
  $current = ''
  for ($wi = 0; $wi -lt $Words.Count; $wi++) {
    $w = $Words[$wi]
    if ([string]::IsNullOrEmpty($current)) {
      $current = $w
      continue
    }
    $trial = "$current $w"
    # MeasureString is optimistic vs thermal output — keep a real safety gap.
    $fits = $Graphics.MeasureString($trial, $Font).Width -le ($MaxWidthMm - 1.2)
    $onLastRow = $lines.Count -ge ($MaxLines - 1)
    if ($fits) {
      $current = $trial
    } elseif ($onLastRow) {
      # Never drop words — keep full name on the last allowed row.
      $current = $trial
    } else {
      $lines.Add($current)
      $current = $w
    }
  }
  if (-not [string]::IsNullOrEmpty($current)) { $lines.Add($current) }
  return @($lines)
}

function Get-WrappedProductLines {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Text,
    [double]$MaxWidthMm,
    [int]$MaxLines = 3
  )

  $words = @([regex]::Split([string]$Text, '\s+') | Where-Object { $_ })
  if ($words.Count -eq 0) {
    $font = New-Object System.Drawing.Font('Arial', 7.0, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
    return @{ Font = $font; Lines = @('') }
  }

  # Never squash 3+ word names onto one line — it overflows the thermal edge.
  # Prefer "Blueberry Chocolate" / "Sundae", then 3 rows if needed.
  $sizes = @(7.5, 7.0, 6.5, 6.0, 5.5, 5.0)
  if ($words.Count -ge 3) {
    $lineCaps = @(2, 3)
  } elseif ($words.Count -eq 2) {
    $lineCaps = @(2, 1)
  } else {
    $lineCaps = @(1)
  }

  foreach ($lineCap in $lineCaps) {
    $cap = [Math]::Min($lineCap, $MaxLines)
    if ($cap -lt 1) { continue }
    foreach ($pt in $sizes) {
      $font = New-Object System.Drawing.Font('Arial', $pt, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
      $lines = @(Get-PackedLines -Graphics $Graphics -Font $font -Words $words -MaxWidthMm $MaxWidthMm -MaxLines $cap)
      $tooWide = $false
      foreach ($line in $lines) {
        if ($Graphics.MeasureString($line, $font).Width -gt ($MaxWidthMm - 0.8)) {
          $tooWide = $true
          break
        }
      }
      $usedAll = (($lines -join ' ') -replace '\s+', ' ').Trim() -eq (($words -join ' ').Trim())
      if (-not $tooWide -and $usedAll) {
        return @{ Font = $font; Lines = $lines }
      }
      $font.Dispose()
    }
  }

  $font = New-Object System.Drawing.Font('Arial', 5.0, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
  $fallback = @(Get-PackedLines -Graphics $Graphics -Font $font -Words $words -MaxWidthMm $MaxWidthMm -MaxLines $MaxLines)
  return @{ Font = $font; Lines = $fallback }
}

$raw = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8
$payload = $raw | ConvertFrom-Json
if (-not $payload.stickers -or @($payload.stickers).Count -lt 1) {
  throw 'No stickers in payload'
}

if ($payload.printerName) { $PrinterName = [string]$payload.printerName }
if ($payload.widthMm) { $WidthMm = [double]$payload.widthMm }
if ($payload.heightMm) { $HeightMm = [double]$payload.heightMm }

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

function Resolve-CupStickerPrinter([string]$requested) {
  $installed = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters)
  if ($requested -and (Test-PrinterReady $requested)) { return $requested.Trim() }

  $candidates = New-Object System.Collections.Generic.List[string]
  if ($env:BC_STICKER_PRINTER) { [void]$candidates.Add([string]$env:BC_STICKER_PRINTER) }
  foreach ($name in $installed) {
    if ($name -match '(?i)xprinter|xp-d35') { [void]$candidates.Add([string]$name) }
  }
  # Windows printer may have been renamed (e.g. "bingchun") but still uses the Xprinter driver.
  try {
    $xpByDriver = @(Get-Printer | Where-Object { $_.DriverName -match '(?i)xprinter|xp-d35' } | Select-Object -ExpandProperty Name)
    foreach ($name in $xpByDriver) { [void]$candidates.Add([string]$name) }
  } catch {
    # Get-Printer may be unavailable in some hosts; InstalledPrinters is enough.
  }
  [void]$candidates.Add('Xprinter XP-D35B')
  [void]$candidates.Add('bingchun')

  $seen = @{}
  foreach ($name in $candidates) {
    $key = $name.Trim()
    if (-not $key -or $seen.ContainsKey($key)) { continue }
    $seen[$key] = $true
    if (Test-PrinterReady $key) { return $key }
  }

  $list = if ($installed.Count -gt 0) { ($installed | ForEach-Object { "'$_'" }) -join ', ' } else { '(none)' }
  $wanted = if ($requested) { $requested } else { '(empty)' }
  throw "Printer not found or not ready: '$wanted'. Installed printers: $list. Set admin Printer name / BC_STICKER_PRINTER to the exact Windows name."
}

$PrinterName = Resolve-CupStickerPrinter $PrinterName

$paperW = ConvertTo-HundredthsInch $WidthMm
$paperH = ConvertTo-HundredthsInch $HeightMm
$printed = 0

foreach ($st in @($payload.stickers)) {
  $script:current = $st
  $one = New-Object System.Drawing.Printing.PrintDocument
  $one.PrinterSettings.PrinterName = $PrinterName
  $one.DocumentName = "Cup $($st.cupLabel) $($st.orderLabel)"
  # false = draw from page origin; large padL below clears the printer's left clip.
  $one.OriginAtMargins = $false
  $one.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $one.DefaultPageSettings.Landscape = $false
  $one.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('CupSticker', $paperW, $paperH)
  $one.PrintController = New-Object System.Drawing.Printing.StandardPrintController

  $one.add_PrintPage({
    param($sender, $e)
    $s = $script:current
    $g = $e.Graphics
    $g.PageUnit = [System.Drawing.GraphicsUnit]::Millimeter
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.Clear([System.Drawing.Color]::White)

    # Physical cup stickers are 40×30. Keep equal side gaps so the block is centered.
    $pageWmm = $WidthMm
    $pageHmm = $HeightMm

    $padL = 4.2
    $padR = 4.2
    $padY = 0.8
    $contentLeft = $padL
    $wrapW = [Math]::Max(20.0, $pageWmm - $padL - $padR)
    $headerLeft = $contentLeft
    $headerW = $wrapW

    $orderFont = New-Object System.Drawing.Font('Arial', 9, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
    $qtyFont = New-Object System.Drawing.Font('Arial', 9, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
    $metaFont = New-Object System.Drawing.Font('Arial', 5, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
    $advEn = New-Object System.Drawing.Font('Arial', 3.9, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
    $advSi = New-Object System.Drawing.Font('Nirmala UI', 3.7, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
    $brush = [System.Drawing.Brushes]::Black

    $sfLeftMid = New-Object System.Drawing.StringFormat
    $sfLeftMid.Alignment = [System.Drawing.StringAlignment]::Near
    $sfLeftMid.LineAlignment = [System.Drawing.StringAlignment]::Center
    $sfLeftMid.FormatFlags = [System.Drawing.StringFormatFlags]::NoClip
    $sfLeftMid.Trimming = [System.Drawing.StringTrimming]::None

    $sfCenterMid = New-Object System.Drawing.StringFormat
    $sfCenterMid.Alignment = [System.Drawing.StringAlignment]::Center
    $sfCenterMid.LineAlignment = [System.Drawing.StringAlignment]::Center
    $sfCenterMid.FormatFlags = [System.Drawing.StringFormatFlags]::NoClip
    $sfCenterMid.Trimming = [System.Drawing.StringTrimming]::None

    $sfCenterWrap = New-Object System.Drawing.StringFormat
    $sfCenterWrap.Alignment = [System.Drawing.StringAlignment]::Center
    $sfCenterWrap.LineAlignment = [System.Drawing.StringAlignment]::Near
    $sfCenterWrap.Trimming = [System.Drawing.StringTrimming]::Word
    $sfCenterWrap.FormatFlags = [System.Drawing.StringFormatFlags]::LineLimit

    # Always reserve bottom band for Sinhala so it cannot be pushed off the sticker.
    $siReserveMm = 6.8
    $pageBottom = $pageHmm - $padY
    $siTop = $pageBottom - $siReserveMm
    $topBudget = [Math]::Max(10.0, $siTop - $padY - 0.4)

    $headerH = 4.0
    $timeH = 2.2
    $gap1 = 0.15
    $gap2 = 0.2
    $enLineH = 2.0
    $enLines = @(Split-AdvisoryLines ([string]$s.advisoryEn))
    $enH = $enLines.Count * $enLineH

    # Fit product name into remaining top budget (still up to 3 centered rows).
    $nameBudget = [Math]::Max(4.0, $topBudget - $headerH - $gap1 - $timeH - $gap2 - $enH)
    $maxNameLines = 3
    if ($nameBudget -lt 7.5) { $maxNameLines = 2 }
    if ($nameBudget -lt 5.0) { $maxNameLines = 1 }

    $wrapped = Get-WrappedProductLines -Graphics $g -Text ([string]$s.itemName) -MaxWidthMm $wrapW -MaxLines $maxNameLines
    $itemFont = $wrapped.Font
    $itemLines = @($wrapped.Lines)
    $itemLineH = [Math]::Min(2.8, [Math]::Max(2.3, $nameBudget / [Math]::Max(1, $itemLines.Count)))
    if (($itemLines.Count * $itemLineH) -gt $nameBudget) {
      $itemLineH = $nameBudget / [Math]::Max(1, $itemLines.Count)
    }

    $blockH = $headerH + $gap1 + ($itemLines.Count * $itemLineH) + $timeH + $gap2 + $enH
    $startY = $padY + [Math]::Max(0.0, ($topBudget - $blockH) / 2.0)
    $y = $startY

    $orderText = [string]$s.orderLabel
    $cupText = [string]$s.cupLabel
    $orderSize = $g.MeasureString($orderText, $orderFont)
    $cupSize = $g.MeasureString($cupText, $qtyFont)
    # Full order text always — never clip digits like "002".
    $orderDrawW = [Math]::Max($orderSize.Width + 1.8, 12.0)
    $cupDrawW = [Math]::Max($cupSize.Width + 1.2, 6.0)
    # Spread header across full sticker: order left, cup right.
    $cupDrawLeft = $contentLeft + $wrapW - $cupDrawW
    if ($cupDrawLeft -lt ($headerLeft + $orderDrawW + 1.0)) {
      $cupDrawLeft = $headerLeft + $orderDrawW + 1.0
    }

    $sfRightMid = New-Object System.Drawing.StringFormat
    $sfRightMid.Alignment = [System.Drawing.StringAlignment]::Far
    $sfRightMid.LineAlignment = [System.Drawing.StringAlignment]::Center
    $sfRightMid.FormatFlags = [System.Drawing.StringFormatFlags]::NoClip
    $sfRightMid.Trimming = [System.Drawing.StringTrimming]::None

    $g.DrawString($orderText, $orderFont, $brush, (New-Object System.Drawing.RectangleF($headerLeft, $y, $orderDrawW, $headerH)), $sfLeftMid)
    $g.DrawString($cupText, $qtyFont, $brush, (New-Object System.Drawing.RectangleF($cupDrawLeft, $y, $cupDrawW, $headerH)), $sfRightMid)
    $sfRightMid.Dispose()
    $y += $headerH + $gap1

    foreach ($line in $itemLines) {
      $g.DrawString(
        $line,
        $itemFont,
        $brush,
        (New-Object System.Drawing.RectangleF($contentLeft, $y, $wrapW, $itemLineH)),
        $sfCenterMid
      )
      $y += $itemLineH
    }

    $printedAt = [string]$s.printedAt
    if ([string]::IsNullOrWhiteSpace($printedAt)) {
      $printedAt = (Get-Date).ToString('dd/MM HH:mm')
    } else {
      # Drop seconds only when time is HH:mm:ss (keep HH:mm minutes intact).
      $printedAt = ($printedAt -replace '(\d{1,2}:\d{2}):\d{2}\s*$', '$1').Trim()
      # Normalize "07/11 13 34" / "07/11, 13:34" → "07/11 13:34"
      $printedAt = ($printedAt -replace ',', ' ' -replace '\s+', ' ').Trim()
      if ($printedAt -match '^(\d{1,2}/\d{1,2})\s+(\d{1,2})[:\s](\d{2})$') {
        $printedAt = "$($Matches[1]) $($Matches[2]):$($Matches[3])"
      }
    }
    $g.DrawString(
      $printedAt,
      $metaFont,
      $brush,
      (New-Object System.Drawing.RectangleF($contentLeft, $y, $wrapW, $timeH)),
      $sfCenterMid
    )
    $y += $timeH + $gap2

    # English advisory — never draw into the reserved Sinhala band.
    foreach ($line in $enLines) {
      if (($y + $enLineH) -gt ($siTop - 0.2)) { break }
      $g.DrawString($line, $advEn, $brush, (New-Object System.Drawing.RectangleF($contentLeft, $y, $wrapW, $enLineH)), $sfCenterWrap)
      $y += $enLineH
    }

    # Sinhala advisory — always drawn in the reserved bottom band.
    $siText = [string]$s.advisorySi
    if (-not [string]::IsNullOrWhiteSpace($siText)) {
      $g.DrawString(
        $siText,
        $advSi,
        $brush,
        (New-Object System.Drawing.RectangleF($contentLeft, $siTop, $wrapW, $siReserveMm)),
        $sfCenterWrap
      )
    }

    $orderFont.Dispose(); $qtyFont.Dispose(); $itemFont.Dispose(); $metaFont.Dispose()
    $advEn.Dispose(); $advSi.Dispose()
    $sfLeftMid.Dispose(); $sfCenterMid.Dispose(); $sfCenterWrap.Dispose()
    $e.HasMorePages = $false
  })

  $one.Print()
  $one.Dispose()
  $printed++
  Start-Sleep -Milliseconds 180
}

Write-Output ("PRINTED " + $printed)
