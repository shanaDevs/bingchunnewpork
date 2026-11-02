# Copy delivery-admin UI from Frontend → delivery-frontend (does not modify Frontend).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'Frontend\src'
$dst = Join-Path $root 'delivery-frontend\src'

function Copy-Tree($rel) {
  $from = Join-Path $src $rel
  $to = Join-Path $dst $rel
  if (-not (Test-Path $from)) { Write-Warning "Skip missing $rel"; return }
  if (Test-Path $from -PathType Leaf) {
    New-Item -ItemType Directory -Force -Path (Split-Path $to) | Out-Null
    Copy-Item -Path $from -Destination $to -Force
    return
  }
  New-Item -ItemType Directory -Force -Path $to | Out-Null
  Copy-Item -Path (Join-Path $from '*') -Destination $to -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $dst | Out-Null

Copy-Tree 'app\globals.css'
Copy-Tree 'components\ui'
$uiDst = Join-Path $dst 'components\ui'
Remove-Item (Join-Path $uiDst 'Providers.tsx') -ErrorAction SilentlyContinue
if (Test-Path (Join-Path $uiDst 'ui')) { Remove-Item (Join-Path $uiDst 'ui') -Recurse -Force }
Copy-Tree 'components\delivery'
Copy-Tree 'contexts\AdminNotificationProvider.tsx'
$hookFiles = @(
  'useAdminSessionGuard.ts', 'useBranchOrderingHours.ts', 'useAdminJobLiveRoute.ts',
  'useAdminJobStatus.ts', 'useMaxCupsPerRider.ts', 'useAuthHydrated.ts', 'useCartHydrated.ts'
)
$hooksDst = Join-Path $dst 'hooks'
if (Test-Path $hooksDst) { Remove-Item $hooksDst -Recurse -Force }
New-Item -ItemType Directory -Force -Path $hooksDst | Out-Null
foreach ($f in $hookFiles) {
  $from = Join-Path $src "hooks\$f"
  if (Test-Path $from) { Copy-Item $from (Join-Path $hooksDst $f) -Force }
}
$storeDst = Join-Path $dst 'store'
if (Test-Path $storeDst) { Remove-Item $storeDst -Recurse -Force }
$storeFiles = @('authStore.ts', 'cartStore.ts', 'confirmStore.ts', 'themeStore.ts')
New-Item -ItemType Directory -Force -Path $storeDst | Out-Null
foreach ($f in $storeFiles) {
  $from = Join-Path $src "store\$f"
  if (Test-Path $from) { Copy-Item $from (Join-Path $storeDst $f) -Force }
}
Copy-Tree 'types'

$libDst = Join-Path $dst 'lib'
New-Item -ItemType Directory -Force -Path $libDst | Out-Null
$libPreserve = @('deliveryApi.ts', 'deliveryAdminPaths.ts', 'adminApi.ts', 'deliveryWalletApi.ts')
$libBackups = @{}
foreach ($name in $libPreserve) {
  $p = Join-Path $libDst $name
  if (Test-Path $p) { $libBackups[$name] = Get-Content $p -Raw }
}
Get-ChildItem (Join-Path $src 'lib') -File | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $libDst $_.Name) -Force
}
foreach ($name in $libPreserve) {
  if ($libBackups.ContainsKey($name)) {
    Set-Content -Path (Join-Path $libDst $name) -Value $libBackups[$name] -NoNewline
  }
}
Remove-Item (Join-Path $libDst 'applyHomeOffer.ts') -ErrorAction SilentlyContinue
Get-ChildItem $libDst -File | Where-Object {
  ($_.Name -like 'brandSales*' -and $_.Name -ne 'brandSalesChartColors.ts') -or
  $_.Name -match '^(promotion|promo|spin|stock|openPayHere|payhere|refund|wallet)' -or $_.Name -match 'Report' -or $_.Name -match 'Export' -or $_.Name -match '\.test\.'
} | Remove-Item -Force
Copy-Item (Join-Path $src 'lib\brandSalesChartColors.ts') (Join-Path $libDst 'brandSalesChartColors.ts') -Force -ErrorAction SilentlyContinue
foreach ($keep in @('promotionTypes.ts', 'promotionCardDesign.ts')) {
  Copy-Item (Join-Path $src "lib\$keep") (Join-Path $libDst $keep) -Force -ErrorAction SilentlyContinue
}
$orderDst = Join-Path $dst 'components\order'
if (Test-Path $orderDst) { Remove-Item $orderDst -Recurse -Force }

@'
/** Delivery ops app — no customer storefront session keys. */
export function clearUserSessionData() {
  if (typeof window === 'undefined') return;
}
'@ | Set-Content -Path (Join-Path $libDst 'userSession.ts') -Encoding utf8

$adminAuthPath = Join-Path $libDst 'adminAuth.ts'
if (Test-Path $adminAuthPath) {
  $aa = Get-Content $adminAuthPath -Raw
  $aa = [regex]::Replace(
    $aa,
    'export function adminHomeHref\([^)]+\): string \{[\s\S]*?\n\}',
    "export function adminHomeHref(_admin: Pick<AdminSession, 'role'> | null): string {`n  return '/';`n}"
  )
  Set-Content -Path $adminAuthPath -Value $aa -NoNewline
}

$adminGlob = @(
  'AdminDelivery*', 'AdminDriver*', 'AdminLiveDrivers*', 'AdminActualRoute*',
  'AdminClassification*', 'AdminReassign*', 'deliveryAnalyticsUi.tsx', 'SearchableBranchSelect.tsx',
  'MonthlyDelivery*', 'BranchDelivery*', 'BranchDashboard*', 'SuperAdminTopRiders*', 'TopCustomersRiders.tsx',
  'useTimelineRiderPosition.ts', 'AdminNotificationBell.tsx',
  'AdminBranchRequestReviewModal.tsx', 'AdminComplaintDetailModal.tsx', 'AdminRiderKpiDetailModal.tsx',
  'CustomerStopsWizard.tsx', 'DeliveryRouteTimeline.tsx', 'TimelineScooterIcon.tsx',
  'ApiBaseUrlDialog.tsx', 'AdminOrderItemsCompact.tsx',
  'DashboardPeriodFilter.tsx',
  'DeliveryWallet*', 'DeliveryApprovePayoutModal.tsx', 'DeliveryFeesByBranchBreakdown.tsx',
  'DashboardKpiCard.tsx', 'BrandKpiIconBox.tsx', 'DateRangePicker.tsx', 'AdminTablePagination.tsx'
)
$adminDst = Join-Path $dst 'components\admin'
$portalDriversAdminFiles = @('AdminDriversPanel.tsx', 'SearchableRiderNameField.tsx')
$portalDriversAdminBackup = @{}
foreach ($f in $portalDriversAdminFiles) {
  $portalPath = Join-Path $adminDst $f
  if (Test-Path $portalPath) {
    $portalDriversAdminBackup[$f] = Get-Content $portalPath -Raw
  }
}
if (Test-Path $adminDst) { Remove-Item $adminDst -Recurse -Force }
New-Item -ItemType Directory -Force -Path $adminDst | Out-Null
Get-ChildItem (Join-Path $src 'components\admin') -File | Where-Object {
  $n = $_.Name
  if ($portalDriversAdminFiles -contains $n) { return $false }
  $adminGlob | Where-Object { $n -like $_ }
} | ForEach-Object { Copy-Item $_.FullName (Join-Path $adminDst $_.Name) -Force }
foreach ($f in $portalDriversAdminFiles) {
  if ($portalDriversAdminBackup.ContainsKey($f)) {
    Set-Content -Path (Join-Path $adminDst $f) -Value $portalDriversAdminBackup[$f] -NoNewline
  }
}

Write-Host "Delivery-frontend sync complete."
