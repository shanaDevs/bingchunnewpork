# Graph Report - Frontend  (2026-09-09)

## Corpus Check
- 568 files · ~1,836,288 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4408 nodes · 12844 edges · 173 communities (163 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a139867a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- MenuClient.tsx
- chart.tsx
- useAuthStore
- loyalty.ts
- react-hot-toast
- PaymentHistoryContent.tsx
- formatMoney
- settlementTypes.ts
- cartStore.ts
- BrandSalesOverviewHero.tsx
- react
- BranchWalletDetail.tsx
- getApiBaseUrl
- WalletApproveWithdrawalModal.tsx
- StockMovementPanel.tsx
- AdminDeliveryRouteView.tsx
- branchDisplayName
- admin/layout.tsx
- delivery/page.tsx
- DeliveryRouteTimeline.tsx
- types/index.ts
- SpinWheelModal.tsx
- DashboardPeriodFilter.tsx
- getAdminSession
- order/[id]/page.tsx
- LoyaltyCampaignDashboard.tsx
- DeliveryAccessSettingsTable.tsx
- AdminTakeawayQueuePanel.tsx
- cn
- ApprovePayoutBreakdown.tsx
- SuperAdminDashboard.tsx
- framer-motion
- all-orders/page.tsx
- adminPermissions.ts
- admin/menu/page.tsx
- datetime.ts
- WalletAnalysisSection.tsx
- orderSchedule.ts
- biweeklyPeriods.ts
- AdminOrderEditModal.tsx
- promotionCardDesign.ts
- promoDiscountExport.ts
- PromoOffersPanel.tsx
- AdminDriverOpsPanel.tsx
- checkout/page.tsx
- ProductImage.tsx
- lucide-react
- StockTableTab.tsx
- DashboardHourlyPeakTimes.tsx
- SiteOrderPrompt.tsx
- users/page.tsx
- PromotionProductPicker.tsx
- PromotionCreatePanel.tsx
- AdminNotificationProvider.tsx
- stockApi.ts
- apiBase.ts
- @tanstack/react-query
- branch-managers/page.tsx
- AdminReassignFailedOrderModal.tsx
- AdminTakeawayScanner.tsx
- promotionTypes.ts
- RefundProcessModal.tsx
- admin/orders/page.tsx
- PromotionManagementDashboard.tsx
- cartAuthSync.ts
- dependencies
- admin/stores/page.tsx
- AdminDeliveryDashboard.tsx
- ProcessPaymentBulkModal.tsx
- refundsExport.ts
- formatMoneyAmount
- orderCancel.ts
- AdminReportPreviewSheet.tsx
- uiSounds.ts
- app/layout.tsx
- AdminDeliveryJobsTable.tsx
- ReportSection.tsx
- package.json
- sales/page.tsx
- spin/page.tsx
- SettlementStatementView.tsx
- RefundAnalyticsPanel.tsx
- jason/page.tsx
- receipt.ts
- BrandOrderSummaryByBranchChart.tsx
- promotionFormUtils.ts
- components.json
- AdminOrdersContent
- platform-earnings/page.tsx
- AdminDeliveryClassificationPanel.tsx
- AdminDeliveryJobDrawer.tsx
- CustomerStopsWizard.tsx
- AdminRiderKpiDetailModal.tsx
- adminStockFetch
- AdminDeliveryClassificationTable.tsx
- PromotionBranchSelector.tsx
- openPayHereCheckout.ts
- useCustomerSocket.ts
- refunds/page.tsx
- orderStatus.ts
- DeliveryMap.tsx
- spinStorage.ts
- compilerOptions
- next
- OrderQrCard.tsx
- api.ts
- LiveDeliveryMap.tsx
- AdminDriverDetailSheet.tsx
- AdminDriverRegistrationModal.tsx
- PromotionCardPreview
- AdminActualRouteView.tsx
- AdminDriversPanel.tsx
- BranchWalletSummaryCards.tsx
- ProcessPaymentModal.tsx
- DashboardRecentOrdersTable.tsx
- SuperAdminDashboardLowerSection.tsx
- RefundStatusBadge.tsx
- reportUtils.ts
- TopCustomersRiders.tsx
- LoyaltyPointsFloat.tsx
- account/orders/page.tsx
- CartPage
- AdminOrderDrawer.tsx
- PromotionCardDesigner
- FloatingRewardsPeek.tsx
- adminBadgeClass
- pos/page.tsx
- StoresClient.tsx
- SearchableBranchSelect.tsx
- CancellationReport.tsx
- spinEligibility.ts
- useBranchOrderingHours.ts
- manifest.json
- CancellationReasonDialog.tsx
- OrderModeSelector
- devDependencies
- PlatformEarningsMonthDetail.tsx
- RefundOrderTimeline.tsx
- getStatusLabel
- useAdminJobLiveRoute.ts
- app/menu/page.tsx
- AdminNotificationBell.tsx
- CancelReasonConfigPanel.tsx
- StockReportsPanel.tsx
- Footer.tsx
- adminOrderSync.ts
- route.ts
- app/stores/page.tsx
- AdminPrintReport.tsx
- PlatformDiscountPaybackSettings.tsx
- product/[id]/page.tsx
- RevenueOverviewBarChart.tsx
- WalletSettleModal.tsx
- scripts
- deploy.sh
- SettlementWithdrawalPickerModal.tsx
- StockLevelTabs.tsx
- AdminPinGateModal.tsx
- RevenueActivityCard.tsx
- beverageTheme.ts
- README.md
- CategoryEmoji.tsx
- RiderRatingCard
- update_dark_mode.js
- AGENTS.md
- deploy-frontend
- eslint.config.mjs
- next-env.d.ts
- postcss.config.mjs
- social-login.d.ts

## God Nodes (most connected - your core abstractions)
1. `react` - 287 edges
2. `lucide-react` - 251 edges
3. `getApiBaseUrl()` - 213 edges
4. `formatMoney()` - 162 edges
5. `@tanstack/react-query` - 128 edges
6. `react-hot-toast` - 111 edges
7. `cn()` - 103 edges
8. `framer-motion` - 84 edges
9. `useAuthStore` - 81 edges
10. `getAdminSession()` - 73 edges

## Surprising Connections (you probably didn't know these)
- `removeAddress()` --calls--> `confirmDialog()`  [EXTRACTED]
  src/app/account/addresses/page.tsx → src/store/confirmStore.ts
- `LoyaltyHistoryPage()` --calls--> `useAuthStore`  [EXTRACTED]
  src/app/account/loyalty/history/page.tsx → src/store/authStore.ts
- `openAddSheet()` --calls--> `todayDateString()`  [EXTRACTED]
  src/app/admin/jason/page.tsx → src/lib/datetime.ts
- `handleToggleAvailability()` --calls--> `confirmDialog()`  [EXTRACTED]
  src/app/admin/menu/page.tsx → src/store/confirmStore.ts
- `handleSyncBranch()` --calls--> `confirmDialog()`  [EXTRACTED]
  src/app/admin/stock/page.tsx → src/store/confirmStore.ts

## Import Cycles
- None detected.

## Communities (173 total, 7 thin omitted)

### Community 0 - "MenuClient.tsx"
Cohesion: 0.06
Nodes (86): CartItemRow(), categoryLabel(), MenuPageContent(), SORT_OPTIONS, TAG_FILTER_OPTIONS, useDebouncedValue(), HomePage(), ProductReview (+78 more)

### Community 1 - "chart.tsx"
Cohesion: 0.05
Nodes (58): recharts, BranchOrderModeStackedChart(), chartConfig, OrderModePoint, Props, chartConfig, Props, SalesOverviewPoint (+50 more)

### Community 2 - "useAuthStore"
Cohesion: 0.07
Nodes (51): AccountLayout(), PUBLIC_ACCOUNT_PATHS, LoyaltyPage(), WishlistPage(), PromoDisplay, AppShell(), CustomerSidebar(), CustomerSidebarProps (+43 more)

### Community 3 - "loyalty.ts"
Cohesion: 0.07
Nodes (56): LoyaltyHistoryPage(), LoyaltyActivityTimeline(), LoyaltyActivityTimelineProps, fadeUp, LoyaltyDashboard(), LoyaltyDashboardProps, FILTERS, HistoryFilter (+48 more)

### Community 4 - "react-hot-toast"
Cohesion: 0.07
Nodes (50): react-hot-toast, LoginPage(), handleDeletedChoice(), handleResendOtp(), handleSendOtp(), handleVerifyOtp(), sendOtp(), LoginStep (+42 more)

### Community 5 - "PaymentHistoryContent.tsx"
Cohesion: 0.06
Nodes (52): ChannelBreakdown, ChannelConfig, CHANNELS, CommissionBreakdown, CommissionBreakdownBadges(), Props, CommissionSlabTable(), formatMonthLabel() (+44 more)

### Community 6 - "formatMoney"
Cohesion: 0.05
Nodes (51): BranchLeastPerformingCard(), LeastPerformingBranch, Props, shortBranchName(), BranchProfitLossCard(), formatPeriodBadge(), LineRow(), Props (+43 more)

### Community 7 - "settlementTypes.ts"
Cohesion: 0.06
Nodes (50): amount(), amountOrZero(), ChannelSalesTable(), discountCell(), Props, PayoutFormulaBreakdown(), Props, firstNumber() (+42 more)

### Community 8 - "cartStore.ts"
Cohesion: 0.06
Nodes (42): zustand, AddToCupIconProps, CupIcon(), CupIconProps, CupIconSize, EmptyCartState(), bottomNavOffset(), cornerToPoint() (+34 more)

### Community 9 - "BrandSalesOverviewHero.tsx"
Cohesion: 0.07
Nodes (46): BOX, BrandKpiCardHeader(), HeaderProps, ICON_SIZE, Props, BRANCH_TIER_THEME, BranchStatCard(), BranchStatSection() (+38 more)

### Community 10 - "react"
Cohesion: 0.07
Nodes (45): react, adminFetch(), AdminSettingsPage(), MethodConfig, MethodKey, WEEKLY_RESET_DAY_OPTIONS, BranchWalletTab, BranchWalletTabs() (+37 more)

### Community 11 - "BranchWalletDetail.tsx"
Cohesion: 0.07
Nodes (42): formatPrintCents(), BranchSystemWalletTab(), Props, BranchWalletDetail(), BranchWalletDetailProps, dedupeTransactions(), fmt(), getTodayStr() (+34 more)

### Community 12 - "getApiBaseUrl"
Cohesion: 0.06
Nodes (37): DeliveryPayoutRow, DeliveryWalletBranch, DeliveryWalletPageContent(), handlePreset(), submitPin(), DeliveryWalletSummary, DeliveryWalletTab, fetchDeliveryPayouts() (+29 more)

### Community 13 - "WalletApproveWithdrawalModal.tsx"
Cohesion: 0.12
Nodes (45): AdminInitiatePayoutModal(), cappedPeriodPayoutLkr(), formatDefaultAmount(), isValidRange(), PaymentMethod, Props, computeFinalPayoutLkr(), computePeriodGatewayLkr() (+37 more)

### Community 14 - "StockMovementPanel.tsx"
Cohesion: 0.07
Nodes (39): AdminTablePagination(), AdminTablePaginationProps, BatchesTab(), BatchSort, BatchStatus, BatchTypeFilter, BranchBatch, isLowRemaining() (+31 more)

### Community 15 - "AdminDeliveryRouteView.tsx"
Cohesion: 0.09
Nodes (37): AdminDeliveryRouteMap, AdminDeliveryRouteMap(), branchMarkerIcon(), COLOMBO, driverMarkerIcon(), isValidLatLng(), LiveDriverMarker(), Props (+29 more)

### Community 16 - "branchDisplayName"
Cohesion: 0.18
Nodes (39): ReportTab, TABS, ReportTab, TABS, WalletFullReportPage(), formatPrintMoney(), formatPrintMoneyNoSymbol(), BranchPerformanceReport() (+31 more)

### Community 17 - "admin/layout.tsx"
Cohesion: 0.10
Nodes (37): adminFetchAppSettings(), AdminLayout(), confirmBranchClose(), handleCloseBranch(), logout(), ALL_NAV, CASHIER_NAV_HREFS, DELIVERY_MENU_KEYS (+29 more)

### Community 18 - "delivery/page.tsx"
Cohesion: 0.07
Nodes (35): socket.io-client, adminFetch(), AdminLiveDeliveryPage(), AdminLiveDriversMap, DriverLocationEvent, LiveJob, StoreOption, ACTIVE_JOB_STATUSES (+27 more)

### Community 19 - "DeliveryRouteTimeline.tsx"
Cohesion: 0.11
Nodes (37): CustomerStopsWizard(), CANCEL_REASON_LABELS, connectorColorToNode(), DeliveryRouteTimeline(), deliveryRouteTimelineHeadingExtra(), formatNodeTime(), nodeAriaLabel(), Props (+29 more)

### Community 20 - "types/index.ts"
Cohesion: 0.07
Nodes (33): AddressesPage(), removeAddress(), AddressForm, emptyForm(), MenuTodaySpecial(), MenuTodaySpecialProps, pad(), useCountdown() (+25 more)

### Community 21 - "SpinWheelModal.tsx"
Cohesion: 0.09
Nodes (33): CartCelebration(), CupPourOverlay(), dedupeWheelOffers(), isSkippedRoute(), ModalPhase, offerIcon(), PlayResponse, PRIZE_CHIPS (+25 more)

### Community 22 - "DashboardPeriodFilter.tsx"
Cohesion: 0.09
Nodes (34): date-fns, react-day-picker, adminFetch(), BrandSalesPage(), BrandTab, buildBrandAnalyticsUrl(), buildBrandBranchPerformanceUrl(), buildTierAnalyticsUrl() (+26 more)

### Community 23 - "getAdminSession"
Cohesion: 0.12
Nodes (32): BranchReportsPage(), AdminLoyaltyPage(), adminApi(), AdminDashboard(), branchDisplayName(), buildBrandAnalyticsUrl(), dashboardWelcome(), fmtWallet() (+24 more)

### Community 24 - "order/[id]/page.tsx"
Cohesion: 0.09
Nodes (34): getCancelledStatusMessage(), OrderPage(), celebrateOrder(), fetchFreshOrder(), handlePaymentResult(), OrderPageActions(), AssignedDriver, AssignedDriverCard() (+26 more)

### Community 25 - "LoyaltyCampaignDashboard.tsx"
Cohesion: 0.10
Nodes (33): adminFetch(), CampaignForm, campaignToForm(), DEFAULT_FORM, LoyaltyCampaignDashboard(), LoyaltyCampaignDashboardProps, PromotionBranchSelectorProps, PromotionFormState (+25 more)

### Community 26 - "DeliveryAccessSettingsTable.tsx"
Cohesion: 0.08
Nodes (29): adminFetch(), DeliveryAccessFilter, DeliveryAccessRow, DeliveryAccessSettingsTable(), Props, resolveMilestone(), shortBranchName(), DeliveryMilestoneProgressCell() (+21 more)

### Community 27 - "AdminTakeawayQueuePanel.tsx"
Cohesion: 0.09
Nodes (32): AdminOrderStatusReadonly(), Props, STATUS_FILL, statusLabel(), AdminOrderStatusSelect(), Props, STATUS_FILL, statusLabel() (+24 more)

### Community 28 - "cn"
Cohesion: 0.12
Nodes (28): AllTimePaymentsCard(), PaymentColumn, Props, DeliveryRejectPayoutModal(), Props, Props, TimelineScooterIcon(), Props (+20 more)

### Community 29 - "ApprovePayoutBreakdown.tsx"
Cohesion: 0.08
Nodes (28): ApprovePayoutBreakdown(), BreakdownRow(), BreakdownTone, contributionLabel(), finalLkr(), moneyAmount(), payoutSectionLayout(), Props (+20 more)

### Community 30 - "SuperAdminDashboard.tsx"
Cohesion: 0.06
Nodes (29): DashboardTopCustomerCard(), initials(), Props, MEDAL, MedalTier, RankMedalBadge(), tierForRank(), BRANCH_DRINK_IMAGES (+21 more)

### Community 31 - "framer-motion"
Cohesion: 0.08
Nodes (26): framer-motion, HomeOfferCard(), orderNow(), HomeOfferCardProps, HomeOffer, chunkOffers(), HomeOffersSlider(), HomeOffersSliderProps (+18 more)

### Community 32 - "all-orders/page.tsx"
Cohesion: 0.08
Nodes (27): activeExcludeStatus(), adminFetch(), AdminOrderItem, AdminOrderRow, AllOrdersPage(), exportCsv(), API_BASE, ArchiveView (+19 more)

### Community 33 - "adminPermissions.ts"
Cohesion: 0.10
Nodes (30): adminFetch(), CashiersPage(), EDIT_EMPTY, EMPTY, formatDate(), adminFetch(), AdminUser, normalizePermissionsResponse() (+22 more)

### Community 34 - "admin/menu/page.tsx"
Cohesion: 0.08
Nodes (30): adminFetch(), AdminMenuPage(), addCoverFile(), addCoverFiles(), addOtherFiles(), closeForm(), handleToggleAvailability(), startCreate() (+22 more)

### Community 35 - "datetime.ts"
Cohesion: 0.10
Nodes (33): formatOrderedTime(), formatPickupTime(), AppSettings, buildResetRows(), canAddResetQty(), defaultResetQty(), fetchAppSettings(), ResetRow (+25 more)

### Community 36 - "WalletAnalysisSection.tsx"
Cohesion: 0.10
Nodes (29): AnalysisCard(), Props, BranchContributionChart(), chartConfig, Props, formatAxisAmount(), chartConfig, InflowOutflowTrendChart() (+21 more)

### Community 37 - "orderSchedule.ts"
Cohesion: 0.14
Nodes (36): OrderSchedulePicker(), selectCustomTime(), selectPreset(), toggleCustomPicker(), Props, tabClass(), clampScheduledAt(), detectScheduleMode() (+28 more)

### Community 38 - "biweeklyPeriods.ts"
Cohesion: 0.10
Nodes (34): react-dom, DeliveryApprovePayoutModal(), formatPeriod(), Props, adminFetch(), DeliveryPayoutPeriodOption, DeliveryPayoutPreview, DeliveryPayoutRequestModal() (+26 more)

### Community 39 - "AdminOrderEditModal.tsx"
Cohesion: 0.09
Nodes (32): AdminOrderEditModal(), addProduct(), handleAddProductClick(), handleSave(), formatNewItemOptionLine(), getToppingNames(), newClientId(), OrderEditProductCard() (+24 more)

### Community 40 - "promotionCardDesign.ts"
Cohesion: 0.11
Nodes (33): PromotionCardDesignerProps, ThemeMode, FONT_SIZES, PromotionCardFormatRibbon(), PromotionCardFormatRibbonProps, PromotionCardPreviewProps, ResizeCorner, applyLayoutPreset() (+25 more)

### Community 41 - "promoDiscountExport.ts"
Cohesion: 0.12
Nodes (35): xlsx-js-style, applyCellStyle(), applyHeaderTitle(), buildBranchSheet(), writeRow(), buildPromoSheet(), writeRow(), buildSummarySheet() (+27 more)

### Community 42 - "PromoOffersPanel.tsx"
Cohesion: 0.13
Nodes (30): PromoOffersPanel(), applyManualCode(), dismissCurrentOffer(), handleClear(), pastePromoCode(), PromoOffersPanelProps, usePromoSubtotalDiscount(), PromoCartLinePayload (+22 more)

### Community 43 - "AdminDriverOpsPanel.tsx"
Cohesion: 0.11
Nodes (29): orderCustomerName(), AdminComplaintDetailModal(), adminFetch(), formatEnumLabel(), formatSize(), mapExternalUrl(), Props, useIsClient() (+21 more)

### Community 44 - "checkout/page.tsx"
Cohesion: 0.12
Nodes (26): CheckoutPage(), placeOrder(), SavedDeliveryInfo, validationFromDeliveryInfo(), CheckoutPointsRedeem(), CheckoutPointsRedeemProps, getFrontendOrigin(), isPlaceholderCustomerName() (+18 more)

### Community 45 - "ProductImage.tsx"
Cohesion: 0.09
Nodes (24): AdminOrderItemsCell(), itemImageUrl(), OrderItemPreview, BatchesTabProps, buildRows(), BulkRestockModal(), applyTargetToSelected(), setQtyEqualTarget() (+16 more)

### Community 46 - "lucide-react"
Cohesion: 0.07
Nodes (21): lucide-react, floatTransition, NotFoundPage(), HeroTrustBadgesProps, TRUST_BADGES, REVIEWS, MascotHeadRating(), MascotHeadRatingProps (+13 more)

### Community 47 - "StockTableTab.tsx"
Cohesion: 0.12
Nodes (24): AdminStockPage(), handleSyncBranch(), StockTableTab(), deactivateProduct(), handlePowerToggle(), openSettings(), patchStockItem(), StockTableTabProps (+16 more)

### Community 48 - "DashboardHourlyPeakTimes.tsx"
Cohesion: 0.10
Nodes (28): BrandHourlyPeakHeatmap(), PeakHourPoint, Props, adminApi(), buildHourlyPeakHeatmapUrl(), DashboardHourlyPeakTimes(), formatBranchName(), Props (+20 more)

### Community 49 - "SiteOrderPrompt.tsx"
Cohesion: 0.09
Nodes (24): HERO_SLIDES, HomeHeroCarousel(), HomeHeroSectionProps, CustomerBottomNav(), NAV_ITEMS, MenuHardcodedSpecial(), modeToPose(), OrderModeModal() (+16 more)

### Community 50 - "users/page.tsx"
Cohesion: 0.10
Nodes (24): adminFetch(), AdminUser, getEmpId(), StaffManagementPage(), handleToggleActive(), adminFetch(), AdminUser, getEmpId() (+16 more)

### Community 51 - "PromotionProductPicker.tsx"
Cohesion: 0.10
Nodes (25): PromotionBannerSetup(), handleUpload(), PromotionBannerSetupProps, syncPrimaryProduct(), adminFetch(), productToSelected(), PromotionCategoryPicker(), PromotionCategoryPickerProps (+17 more)

### Community 52 - "PromotionCreatePanel.tsx"
Cohesion: 0.11
Nodes (27): CardDesignMode, cardDesignModeFromKind(), MODES, PromotionCardDesignModePicker(), PromotionCardDesignModePickerProps, emptyPromotionForm(), PromotionCreatePanel(), canProceedFromSetup() (+19 more)

### Community 53 - "AdminNotificationProvider.tsx"
Cohesion: 0.10
Nodes (29): adminFetch(), AdminNotificationContext, AdminNotificationContextValue, AdminNotificationProvider(), AdminStockQueryData, apiNotificationToOrderPayload(), BellHandlers, BranchNewOrderToast() (+21 more)

### Community 54 - "stockApi.ts"
Cohesion: 0.10
Nodes (29): API_BASE, applyCellStyle(), buildLedgerBatchDetailRows(), buildLedgerExportRows(), BulkRestockPayload, cellRef(), colLetter(), exportLedgerCsv() (+21 more)

### Community 55 - "apiBase.ts"
Cohesion: 0.12
Nodes (26): PayHereLegacyRedirect(), WebXPayLegacyRedirectPage(), ApiBaseUrlDialog(), reset(), save(), Props, LiveDeliveryMap(), API_BASE_OVERRIDE_KEY (+18 more)

### Community 56 - "@tanstack/react-query"
Cohesion: 0.10
Nodes (26): @tanstack/react-query, COLUMNS, formatTypeLabel(), isPayoutRow(), LedgerReportBfAmount(), LedgerReportFooterTotal(), LedgerRow, WalletOverviewResponse (+18 more)

### Community 57 - "branch-managers/page.tsx"
Cohesion: 0.10
Nodes (21): adminFetch(), BranchAccessPage(), EDIT_EMPTY, EMPTY, formatBranchLabel(), formatDate(), matchesManagerSearch(), DeliveryAccessHistoryLog() (+13 more)

### Community 58 - "AdminReassignFailedOrderModal.tsx"
Cohesion: 0.09
Nodes (28): AdminLiveDriversMap(), COLOMBO, destinationIcon, driverDivIcon(), LiveDestinationMarker, LiveDriverMarker, LiveStoreMarker, Props (+20 more)

### Community 59 - "AdminTakeawayScanner.tsx"
Cohesion: 0.11
Nodes (21): html5-qrcode, confirmPickup(), AdminOrderQrScanner(), startCamera(), Props, AdminOrder, AdminTakeawayScanner(), confirmAndCompletePickup() (+13 more)

### Community 60 - "promotionTypes.ts"
Cohesion: 0.12
Nodes (24): FALLBACK_OFFERS, formatDiscountSubtitle(), formatDiscountTitle(), imageForPromo(), mapPromosToDisplays(), mapPromosToHomeOffers(), mapPromoToDisplay(), OFFER_IMAGES (+16 more)

### Community 61 - "RefundProcessModal.tsx"
Cohesion: 0.11
Nodes (24): ActionMode, BreakdownRow(), BreakdownTag, computeRefundFromPercentage(), fetchRefund(), FullRefundBreakdownCard(), isFullRefundScenario(), isOnlinePaidOrder() (+16 more)

### Community 62 - "admin/orders/page.tsx"
Cohesion: 0.08
Nodes (24): AdminOrderItem, AdminOrderRow, ALL_STATUSES, applyInstantRowHighlight(), ArchiveView, CANCEL_REASON_LABELS, CANCELLED_BY_LABELS, clearRowHighlights() (+16 more)

### Community 63 - "PromotionManagementDashboard.tsx"
Cohesion: 0.11
Nodes (19): adminFetch(), benefitLabel(), PromoMoreMenu(), PromoMoreMenuProps, promoStatusLabel(), PromotionManagementDashboard(), handleBulkActivate(), handleBulkDeactivate() (+11 more)

### Community 64 - "cartAuthSync.ts"
Cohesion: 0.14
Nodes (24): CartAuthSync(), migrateLegacyCartStorage(), captureCartSnapshot(), CartSnapshot, cartStorageReadyListeners, fetchServerCartIntoStore(), handleCartOnLogin(), handleCartOnLogout() (+16 more)

### Community 65 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, @base-ui/react, @bingchun/settlement, class-variance-authority, clsx, date-fns, framer-motion, gsap (+19 more)

### Community 66 - "admin/stores/page.tsx"
Cohesion: 0.10
Nodes (18): adminFetch(), AdminStoresPage(), buildHoursPayload(), startEdit(), submitForm(), EMPTY, matchesStoreSearch(), normalizeTimeForInput() (+10 more)

### Community 67 - "AdminDeliveryDashboard.tsx"
Cohesion: 0.10
Nodes (22): AdminDeliveryDashboard(), adminFetch(), buildDashboardQuery(), DashboardResponse, formatDistance(), formatMinutesValue(), JOB_STATUS_BADGE, KPI_ICON_TONE (+14 more)

### Community 68 - "ProcessPaymentBulkModal.tsx"
Cohesion: 0.12
Nodes (26): branchPaymentHistoryHref(), buildPayoutRequestRows(), BulkResult, computeRequestAmounts(), extractPlatformProviderReceivableLkr(), formatPeriodLabel(), formatWithdrawalPeriod(), formatWithdrawalRequestSummary() (+18 more)

### Community 69 - "refundsExport.ts"
Cohesion: 0.12
Nodes (26): cancellationReasonLabel(), applyCellStyle(), buildSubtitle(), cellRef(), colLetter(), customerDisplayName(), exportHeaders(), exportRefundsExcel() (+18 more)

### Community 70 - "formatMoneyAmount"
Cohesion: 0.12
Nodes (22): OrderItemsSummary(), BreakdownRow(), BreakdownTone, buildPreviewInput(), finalLkr(), moneyAmount(), PlatformProviderReceivable(), Props (+14 more)

### Community 71 - "orderCancel.ts"
Cohesion: 0.18
Nodes (20): AdminOrderCancelCountdown(), Props, AdminOrderCancelCountdownBadge(), resolveCanCancel(), resolveCancelWindowEndsAt(), Row, buildConfirmMessage(), OrderCancelCountdown() (+12 more)

### Community 72 - "AdminReportPreviewSheet.tsx"
Cohesion: 0.12
Nodes (22): AdminReportPdf(), formatReportGeneratedAt(), pdfToneColor(), Props, ReportPdfRow, ReportPdfTotal, ReportStatCard, AdminReportPreviewSheet() (+14 more)

### Community 73 - "uiSounds.ts"
Cohesion: 0.18
Nodes (23): CONFETTI_COLORS, OrderDeliveredCelebration(), Props, handleSpin(), ConfirmDialog(), handleConfirm(), cubicBezierEase(), getAudioContext() (+15 more)

### Community 74 - "app/layout.tsx"
Cohesion: 0.15
Nodes (19): geist, gscVerification, metadata, poppins, RootLayout(), viewport, GoogleAnalytics(), foodEstablishmentSchema() (+11 more)

### Community 75 - "AdminDeliveryJobsTable.tsx"
Cohesion: 0.13
Nodes (23): AdminDeliveryJobsTable(), CompletedJobFilters, DeliveryJobDetail, fetchJobDetail(), formatAmount(), formatDistance(), formatItemsCompact(), formatJobStatusLabel() (+15 more)

### Community 76 - "ReportSection.tsx"
Cohesion: 0.13
Nodes (20): Props, ReportOption, ReportOptionsBar(), BranchRow, COLUMNS, COLUMNS, LoyaltyRow, COLUMNS (+12 more)

### Community 77 - "package.json"
Cohesion: 0.08
Nodes (23): name, private, version, @base-ui/react, @bingchun/settlement, class-variance-authority, clsx, cross-env (+15 more)

### Community 78 - "sales/page.tsx"
Cohesion: 0.10
Nodes (15): adminFetch(), BEHAVIOR_CHART_COLORS, behaviorChartConfig, BranchAnalytics, BranchSalesPage(), buildBranchAnalyticsUrl(), CHANNEL_CARDS, PLATFORM_CHART_COLORS (+7 more)

### Community 79 - "spin/page.tsx"
Cohesion: 0.13
Nodes (17): adminFetch(), AdminSpinPage(), addCriterion(), DAY_OPTIONS, EMPTY, MenuProduct, TYPE_OPTIONS, DEFAULT_SPIN_DISPLAY (+9 more)

### Community 80 - "SettlementStatementView.tsx"
Cohesion: 0.18
Nodes (19): AdminPrintCanvas(), printAdminReport(), Props, Props, SettlementBreakdownCards(), settlementServiceProviderTotal(), sumSettlementOrderCount(), formatPeriod() (+11 more)

### Community 81 - "RefundAnalyticsPanel.tsx"
Cohesion: 0.13
Nodes (19): BreakdownCard(), DistributionRankList(), fetchRefundAnalytics(), formatProcessingHours(), Props, RefundAmountComboCard(), RefundAnalyticsPanel(), RefundAnalyticsPayload (+11 more)

### Community 82 - "jason/page.tsx"
Cohesion: 0.11
Nodes (16): adminFetch(), EMPTY_FORM, JasonLedgerPage(), handleToggleActive(), openAddSheet(), LedgerEntry, LedgerResponse, LedgerType (+8 more)

### Community 83 - "receipt.ts"
Cohesion: 0.17
Nodes (18): AdminReceiptModal(), fetchAdminOrder(), Props, OrderCheckoutSummary(), OrderCheckoutSummaryProps, orderModeLabel(), OrderReceipt(), Props (+10 more)

### Community 84 - "BrandOrderSummaryByBranchChart.tsx"
Cohesion: 0.11
Nodes (17): BranchDeliveryPickupBarChart(), BranchDeliveryPickupPoint, chartConfig, Props, shortBranchName(), TooltipPayload, BranchOrderSummaryPoint, BrandOrderSummaryByBranchChart() (+9 more)

### Community 85 - "promotionFormUtils.ts"
Cohesion: 0.17
Nodes (19): adminFetch(), PromotionEditorPage(), Props, AdminPromoRow, buildBranchShareSplitsPayload(), buildPromotionFormStateFromPromo(), coerceSharePct(), deriveDiscountFields() (+11 more)

### Community 86 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 87 - "AdminOrdersContent"
Cohesion: 0.10
Nodes (16): activeExcludeStatus(), adminFetch(), AdminOrdersContent(), applyQuickFilter(), deliveryLocation(), exportCsv(), switchTab(), defaultSortDir() (+8 more)

### Community 88 - "platform-earnings/page.tsx"
Cohesion: 0.14
Nodes (19): centsToMoney(), fetchMonthlyBreakdown(), fetchMonthlySummary(), formatMonthLabel(), MonthlyEarningsStatus, MonthlySummaryRow, PlatformEarningsPage(), PlatformPosition (+11 more)

### Community 89 - "AdminDeliveryClassificationPanel.tsx"
Cohesion: 0.12
Nodes (13): AdminDeliveryClassificationPanel(), ClassifyOptions, ClassifyResult, DeliveryBatch, DeliveryStop, Props, AdminDeliveryRouteMap, AdminDeliveryRouteModal() (+5 more)

### Community 90 - "AdminDeliveryJobDrawer.tsx"
Cohesion: 0.14
Nodes (18): ActualRouteOverlay, AdminDeliveryJobDetail, AdminDeliveryJobDrawer(), retryLoad(), DeliveryStopOrder, fetchActualRoute(), fetchJobDetail(), fetchJobRoute() (+10 more)

### Community 91 - "CustomerStopsWizard.tsx"
Cohesion: 0.17
Nodes (19): AdminDeliveryLocationModal(), DeliveryLocationStop, deliveryMapExternalUrl(), formatLocation(), hasDeliveryMapLocation(), mapEmbedUrl(), mapExternalUrl(), Props (+11 more)

### Community 92 - "AdminRiderKpiDetailModal.tsx"
Cohesion: 0.17
Nodes (18): adminFetch(), AdminRiderKpiDetailModal(), buildDetailQuery(), DUTY_STATUS_BADGE, DUTY_STATUS_LABEL, formatDistance(), formatPeriod(), formatTimestampCell() (+10 more)

### Community 93 - "adminStockFetch"
Cohesion: 0.16
Nodes (17): EodPromptVariant, EodStockResetPrompt(), EodStockResetPromptProps, batchStoreCode(), ReceiveStockModal(), StockAdjustModal(), StockAdjustModalProps, adminStockFetch() (+9 more)

### Community 94 - "AdminDeliveryClassificationTable.tsx"
Cohesion: 0.22
Nodes (16): AdminDeliveryClassificationTable(), formatOrderedAt(), PendingDeliveryOrder, Props, fetchMaxCupsPerRider(), useMaxCupsPerRider(), canAddOrderToSelection(), DEFAULT_MAX_CUPS_PER_RIDER (+8 more)

### Community 95 - "PromotionBranchSelector.tsx"
Cohesion: 0.15
Nodes (15): adminFetchProducts(), PromotionBranchSelector(), branchLabel(), renderSimpleList(), renderSplitPanel(), toggleBranch(), updateSplit(), branchIdsForProduct() (+7 more)

### Community 96 - "openPayHereCheckout.ts"
Cohesion: 0.18
Nodes (17): PayHereSession, preloadPayHereScript(), startPayHerePayment(), startPayHerePaymentAsync(), toPopupSession(), whenPayHereReady(), Window, openPayHereCheckout() (+9 more)

### Community 97 - "useCustomerSocket.ts"
Cohesion: 0.16
Nodes (16): ADR-0005, CustomerSocketProvider(), DeliveryCodePayload, DeliveryStatePayload, deliveryStateToOrderStatus(), EtaUpdatePayload, eventMatchesOrder(), OrderStatusEvent (+8 more)

### Community 98 - "refunds/page.tsx"
Cohesion: 0.14
Nodes (15): adminFetch(), adminFetchSummary(), AdminRefundsPage(), handleExportExcel(), MAIN_TABS, PaginatedRefunds, RefundMainTab, RefundRow (+7 more)

### Community 99 - "orderStatus.ts"
Cohesion: 0.15
Nodes (17): CustomerNotification, formatStatusChangedAt(), OrderTrackingProgress(), Props, CustomerNotificationPayload, DELIVERY_STEPS, DeliveryTrackPhase, GLOBAL_STATUS_ORDER (+9 more)

### Community 100 - "DeliveryMap.tsx"
Cohesion: 0.15
Nodes (15): DeliveryMap, branchIcon, COLOMBO, customerIcon, DeliveryMapProps, RouteAnimationMode, RouteLayer(), selectedBranchIcon (+7 more)

### Community 101 - "spinStorage.ts"
Cohesion: 0.20
Nodes (14): useApplySpinClaim(), rewardFromSpinClaim(), clearSpinClaim(), clearSpinConsumed(), clearSpinPopupShown(), formatSpinOffer(), getSpinClaim(), getSpinGuestKey() (+6 more)

### Community 102 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 103 - "next"
Cohesion: 0.13
Nodes (9): backendOrigin, deliveryServiceOrigin, nextConfig, next, metadata, PromotionsClient(), fetchProductIds(), ProductRow (+1 more)

### Community 104 - "OrderQrCard.tsx"
Cohesion: 0.17
Nodes (12): qrcode.react, OrderReceiptPage(), handleBack(), OrderQrCard(), handleDownload(), Props, downloadPickupQrCardPng(), downloadQrCodePng() (+4 more)

### Community 105 - "api.ts"
Cohesion: 0.32
Nodes (13): OAuthCallbackPage(), CustomerAuthSync(), request(), tryRefreshCustomerToken(), clearToken(), ensureCustomerAccessToken(), getCustomerRefreshToken(), getToken() (+5 more)

### Community 106 - "LiveDeliveryMap.tsx"
Cohesion: 0.12
Nodes (11): LiveDeliveryMap, DELIVERY_RIDER_MARKER_GLYPH, Props, COLOMBO, destinationIcon, driverIcon, DriverLocationPayload, EtaUpdatePayload (+3 more)

### Community 107 - "AdminDriverDetailSheet.tsx"
Cohesion: 0.18
Nodes (11): AdminDriverDetailSheet(), startEditing(), driverBranchIds(), dutyStatusClass(), dutyStatusLabel(), editFormFromDriver(), formatAmount(), formatBranchName() (+3 more)

### Community 108 - "AdminDriverRegistrationModal.tsx"
Cohesion: 0.15
Nodes (13): handleLicenseImageChange(), handleProfilePhotoChange(), AdminDriverRegistrationModal(), DriverRegistrationFormState, formatBranchName(), Props, UploadZone(), pickFile() (+5 more)

### Community 109 - "PromotionCardPreview"
Cohesion: 0.24
Nodes (13): PromotionCardPreview(), getCanvasRect(), handleCanvasResizePointerDown(), onMove(), onUp(), handleDragPointerDown(), onUp(), handleResizePointerDown() (+5 more)

### Community 110 - "AdminActualRouteView.tsx"
Cohesion: 0.17
Nodes (10): leaflet, react-leaflet, ActualRoutePayload, AdminActualRouteMap(), COLOMBO, Props, storeIcon(), AdminActualRouteView() (+2 more)

### Community 111 - "AdminDriversPanel.tsx"
Cohesion: 0.16
Nodes (13): DriverEditFormState, AdminDriversPanel(), adminFetch(), adminFetchForm(), CreatedDriverPin, DriverFilters, DriverFormState, dutyStatusClass() (+5 more)

### Community 112 - "BranchWalletSummaryCards.tsx"
Cohesion: 0.20
Nodes (13): BranchWalletDashboard, BranchWalletSummaryCards(), centsToMoney(), HINTS, lkrMoney(), Props, Variant, fmt() (+5 more)

### Community 113 - "ProcessPaymentModal.tsx"
Cohesion: 0.17
Nodes (14): ChannelKey, ChannelSettlementCard(), money(), isValidRange(), ProcessPaymentModal(), handleSubmit(), Props, todayStr() (+6 more)

### Community 114 - "DashboardRecentOrdersTable.tsx"
Cohesion: 0.17
Nodes (14): BadgeView, DashboardRecentOrdersTable(), formatOrderDate(), matchesStatusFilter(), orderTypeLabel(), PAYMENT_LABELS, Props, RecentOrderRow (+6 more)

### Community 115 - "SuperAdminDashboardLowerSection.tsx"
Cohesion: 0.15
Nodes (13): chartConfig, ChartPoint, PlatformUsersPieChart(), Props, UserPlatformBreakdown, BranchRow, Props, Store (+5 more)

### Community 116 - "RefundStatusBadge.tsx"
Cohesion: 0.20
Nodes (14): REFUND_STATUS_BADGE, REFUND_STATUS_LABEL, RefundRequestTypeBadge(), RefundStatus, RefundStatusBadge(), refundStatusLabel(), RefundSubmittedByBadge(), refundSubmittedByLabel() (+6 more)

### Community 117 - "reportUtils.ts"
Cohesion: 0.20
Nodes (12): COLUMNS, itemsSummary(), OrderLifecycleReport(), OrderRow, OrdersResponse, STATUS_OPTIONS, Props, ReportFooterTotalCell() (+4 more)

### Community 118 - "TopCustomersRiders.tsx"
Cohesion: 0.14
Nodes (8): AVATAR_PALETTES, avatarPalette(), initials(), PersonAvatar(), PODIUM_RANK, Props, TopCustomer, TopRider

### Community 119 - "LoyaltyPointsFloat.tsx"
Cohesion: 0.20
Nodes (15): centerOf(), FloatingGift(), FloatParticle, formatFloatLabel(), getCartSourcePoint(), getFirstVisibleCenter(), getRewardsTargetPoint(), isVisibleRect() (+7 more)

### Community 120 - "account/orders/page.tsx"
Cohesion: 0.14
Nodes (11): ACTIVE_STATUSES, MODE_FILTERS, ModeFilter, OrdersPageContent(), RANGE_FILTERS, RangeFilter, SORT_FILTERS, SortFilter (+3 more)

### Community 121 - "CartPage"
Cohesion: 0.22
Nodes (14): CartPage(), appliesConvenienceFee(), chargedConvenienceFee(), computeConvenienceFee(), convenienceFeeBase(), convenienceFeeRateForOrder(), ConvenienceFeeRates, DEFAULT_CONVENIENCE_FEE_RATE (+6 more)

### Community 122 - "AdminOrderDrawer.tsx"
Cohesion: 0.18
Nodes (11): AdminOrderDrawer(), confirmCancel(), confirmCancelWithOtherReason(), updateStatus(), CANCEL_REASON_OPTIONS, CancelReasonValue, ConversationMessage, drawerBadgeClass() (+3 more)

### Community 123 - "PromotionCardDesigner"
Cohesion: 0.25
Nodes (13): PromotionCardDesigner(), addElement(), applyChange(), copyActiveToOtherTheme(), handleCanvasResize(), handleDrag(), handleImageUpload(), handlePreset() (+5 more)

### Community 124 - "FloatingRewardsPeek.tsx"
Cohesion: 0.28
Nodes (13): bottomNavOffset(), FloatingRewardsPeek(), isLeftDock(), nearestDock(), openPoint(), peekPoint(), readStoredDock(), RewardsDock (+5 more)

### Community 125 - "adminBadgeClass"
Cohesion: 0.24
Nodes (13): PaymentStatusBadge(), ModeBadge(), PaymentStatusBadge(), PaymentStatusBadge(), PaymentStatusBadge(), adminBadgeClass(), DELIVERY_JOB_STATUS_BADGE, DELIVERY_JOB_STATUS_LABEL (+5 more)

### Community 126 - "pos/page.tsx"
Cohesion: 0.18
Nodes (9): adminFetch(), AdminPosPage(), clearCart(), placeOrder(), API_BASE, PlaceOrderResult, PosCartItem, PosProductCard() (+1 more)

### Community 127 - "StoresClient.tsx"
Cohesion: 0.26
Nodes (10): StoreDetailPanel(), StoreExpandedContent(), StoreMapEmbed(), DeliveryMap(), buildGoogleMapsDirectionsUrl(), buildGoogleMapsEmbedUrl(), fixSwappedSriLankaCoordinates(), isValidMapCoordinate() (+2 more)

### Community 128 - "SearchableBranchSelect.tsx"
Cohesion: 0.20
Nodes (11): DateRangePicker(), formatRangeLabel(), Props, Props, SearchableBranchSelect(), Store, PopoverContent(), PopoverDescription() (+3 more)

### Community 129 - "CancellationReport.tsx"
Cohesion: 0.21
Nodes (11): CancellationRow, COLUMNS, BranchFulfillment, COLUMNS, FulfillmentReport(), minutesLabel(), Props, ReportBranchFilter() (+3 more)

### Community 130 - "spinEligibility.ts"
Cohesion: 0.26
Nodes (11): reveal(), isSpinPopupPath(), loyaltyGatesSpin(), resolveDisplay(), shouldAutoOpenSpinPopup(), shouldShowSpinEntryPoints(), shouldShowSpinFab(), shouldShowSpinHeaderButton() (+3 more)

### Community 131 - "useBranchOrderingHours.ts"
Cohesion: 0.26
Nodes (12): getBranchOrderingOpenFromCart(), DEFAULT_PICKUP_CUTOFF_MINUTES, earlierTime(), FulfillmentOrderingInfo, isOnlineOrderingOpen(), onlineOrderingClosedMessage(), orderingConfigFromFulfillment(), parseTimeOnDate() (+4 more)

### Community 132 - "manifest.json"
Cohesion: 0.15
Nodes (12): background_color, categories, description, display, icons, lang, name, orientation (+4 more)

### Community 133 - "CancellationReasonDialog.tsx"
Cohesion: 0.24
Nodes (10): CancellationReasonDialog(), REASON_ICONS, reasonIcon(), CancelReasonOption, FALLBACK_CANCELLATION_REASONS, fetchActiveCancelReasons(), OTHER_CANCEL_REASON_VALUE, CancellationReasonResult (+2 more)

### Community 134 - "OrderModeSelector"
Cohesion: 0.22
Nodes (9): orderingFieldsFromStore(), OrderModeSelector(), confirmTakeaway(), pickMode(), saveDeliveryFromValidation(), selectDeliveryBranch(), selectDeliveryBranchFromMap(), selectTakeawayStore() (+1 more)

### Community 135 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, cross-env, eslint, eslint-config-next, rimraf, tailwindcss, @tailwindcss/postcss, @types/leaflet (+4 more)

### Community 136 - "PlatformEarningsMonthDetail.tsx"
Cohesion: 0.26
Nodes (11): BranchEarningsGroup, BranchGroup(), centsToMoney(), formatMonthLabel(), formatPeriod(), PayoutLineItem(), PlatformEarningsLineItem, PlatformEarningsMonthDetail() (+3 more)

### Community 137 - "RefundOrderTimeline.tsx"
Cohesion: 0.23
Nodes (11): buildRefundOrderTimeline(), getOrderStatusAtCancellation(), KIND_ICONS, ORDER_STATUS_LABELS, RefundOrderTimeline(), RefundOrderTimelineProps, statusToKind(), TimelineEntry (+3 more)

### Community 138 - "getStatusLabel"
Cohesion: 0.24
Nodes (9): CancelledAtStatusBadge(), adminFetch(), EditFormState, OrderStatusRefundConfig, OrderStatusRefundConfigPanel(), STATUS_ORDER, getStatusLabel(), cancelledAtStatusLabel() (+1 more)

### Community 139 - "useAdminJobLiveRoute.ts"
Cohesion: 0.24
Nodes (10): AdminJobDriverPosition, AdminJobLiveRouteData, appendPathPoint(), DriverLocationEvent, fetchLiveRoute(), LiveRouteApiResponse, normalizeDriverPosition(), Options (+2 more)

### Community 140 - "app/menu/page.tsx"
Cohesion: 0.27
Nodes (8): MenuPage(), fetchMenuProducts(), MenuPage(), metadata, JsonLd(), JsonLdProps, menuItemListSchema(), ProductForSchema

### Community 141 - "AdminNotificationBell.tsx"
Cohesion: 0.33
Nodes (9): adminFetch(), AdminNotification, AdminNotificationBell(), markAllRead(), markRead(), openNotification(), toBellNotification(), AdminNotificationPayload (+1 more)

### Community 142 - "CancelReasonConfigPanel.tsx"
Cohesion: 0.24
Nodes (6): adminFetch(), CancelReasonConfig, CancelReasonConfigPanel(), EMPTY_FORM, FormState, parseForm()

### Community 143 - "StockReportsPanel.tsx"
Cohesion: 0.27
Nodes (9): adminFetch(), API_BASE, AuditLog, downloadCsv(), ReportItem, ReportTab, StockReportsPanel(), exportAuditCsv() (+1 more)

### Community 144 - "Footer.tsx"
Cohesion: 0.29
Nodes (7): Footer(), SOCIAL_LINKS, FacebookIcon(), IconProps, InstagramIcon(), TikTokIcon(), BINGCHUN_SOCIAL_LINKS

### Community 145 - "adminOrderSync.ts"
Cohesion: 0.24
Nodes (9): ADMIN_NEW_ORDER_EVENT, AdminNewOrderSocketPayload, AdminOrdersListResponse, AdminOrdersQueryKey, dispatchAdminNewOrder(), OptimisticAdminOrderRow, orderMatchesQuery(), snapshotFromNewOrderPayload() (+1 more)

### Community 146 - "route.ts"
Cohesion: 0.39
Nodes (8): backendOrigin(), dynamic, forwardToApi(), GET(), hasReturnPayload(), POST(), redirectHome(), runtime

### Community 147 - "app/stores/page.tsx"
Cohesion: 0.28
Nodes (6): fetchStores(), metadata, StoresPage(), StoresPage(), StoreForSchema, storesItemListSchema()

### Community 148 - "AdminPrintReport.tsx"
Cohesion: 0.28
Nodes (7): AdminPrintReport(), formatPrintDate(), PrintReportRow, PrintReportTotal, Props, Props, ReceiptBrandHeader()

### Community 149 - "PlatformDiscountPaybackSettings.tsx"
Cohesion: 0.25
Nodes (3): adminFetch(), BranchPaybackRow, PlatformDiscountPaybackSettings()

### Community 150 - "product/[id]/page.tsx"
Cohesion: 0.36
Nodes (7): fetchProduct(), generateMetadata(), PageProps, ProductMeta, ProductPage(), productSchema(), DEFAULT_DESCRIPTION

### Community 151 - "RevenueOverviewBarChart.tsx"
Cohesion: 0.36
Nodes (7): chartConfig, estimateYAxisWidth(), formatAxisAmount(), MonthlyPoint, Props, RevenueOverviewBarChart(), shortMonth()

### Community 152 - "WalletSettleModal.tsx"
Cohesion: 0.32
Nodes (7): fmt(), fmtDay(), inputStyle, labelStyle, SettleInfo, SettlePreview, WalletSettleModal()

### Community 153 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, clean, dev, dev:turbo, lint, start

### Community 154 - "deploy.sh"
Cohesion: 0.33
Nodes (5): API_PROXY_URL, BACKEND_URL, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SOCKET_URL, deploy.sh script

### Community 155 - "SettlementWithdrawalPickerModal.tsx"
Cohesion: 0.53
Nodes (5): formatPeriod(), Props, SettlementWithdrawalPickerModal(), statusBadgeClass(), statusLabel()

### Community 156 - "StockLevelTabs.tsx"
Cohesion: 0.47
Nodes (5): countBadgeClass(), StockLevelTabs(), StockLevelTabsProps, TABS, StockLevelTab

### Community 157 - "AdminPinGateModal.tsx"
Cohesion: 0.60
Nodes (3): AdminPinGateModal(), Props, verifyWalletPin()

### Community 158 - "RevenueActivityCard.tsx"
Cohesion: 0.50
Nodes (4): fmtChannelAmount(), Props, RevenueActivityCard(), RevenueSlice

### Community 159 - "beverageTheme.ts"
Cohesion: 0.40
Nodes (3): BeverageTheme, DEFAULT, THEMES

### Community 160 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 162 - "RiderRatingCard"
Cohesion: 0.50
Nodes (3): buildComment(), RiderRatingCard(), handleSubmit()

### Community 163 - "update_dark_mode.js"
Cohesion: 0.50
Nodes (3): files, fs, replacements

## Knowledge Gaps
- **1092 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+1087 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1452 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `MenuClient.tsx`, `chart.tsx`, `useAuthStore`, `loyalty.ts`, `react-hot-toast`, `PaymentHistoryContent.tsx`, `formatMoney`, `cartStore.ts`, `BrandSalesOverviewHero.tsx`, `BranchWalletDetail.tsx`, `getApiBaseUrl`, `WalletApproveWithdrawalModal.tsx`, `StockMovementPanel.tsx`, `AdminDeliveryRouteView.tsx`, `branchDisplayName`, `admin/layout.tsx`, `delivery/page.tsx`, `DeliveryRouteTimeline.tsx`, `types/index.ts`, `SpinWheelModal.tsx`, `DashboardPeriodFilter.tsx`, `getAdminSession`, `order/[id]/page.tsx`, `LoyaltyCampaignDashboard.tsx`, `DeliveryAccessSettingsTable.tsx`, `AdminTakeawayQueuePanel.tsx`, `cn`, `ApprovePayoutBreakdown.tsx`, `framer-motion`, `all-orders/page.tsx`, `adminPermissions.ts`, `admin/menu/page.tsx`, `datetime.ts`, `WalletAnalysisSection.tsx`, `orderSchedule.ts`, `biweeklyPeriods.ts`, `AdminOrderEditModal.tsx`, `promotionCardDesign.ts`, `PromoOffersPanel.tsx`, `AdminDriverOpsPanel.tsx`, `checkout/page.tsx`, `ProductImage.tsx`, `lucide-react`, `StockTableTab.tsx`, `DashboardHourlyPeakTimes.tsx`, `SiteOrderPrompt.tsx`, `users/page.tsx`, `PromotionProductPicker.tsx`, `PromotionCreatePanel.tsx`, `AdminNotificationProvider.tsx`, `apiBase.ts`, `@tanstack/react-query`, `branch-managers/page.tsx`, `AdminReassignFailedOrderModal.tsx`, `AdminTakeawayScanner.tsx`, `RefundProcessModal.tsx`, `admin/orders/page.tsx`, `PromotionManagementDashboard.tsx`, `cartAuthSync.ts`, `admin/stores/page.tsx`, `AdminDeliveryDashboard.tsx`, `ProcessPaymentBulkModal.tsx`, `formatMoneyAmount`, `orderCancel.ts`, `AdminReportPreviewSheet.tsx`, `uiSounds.ts`, `AdminDeliveryJobsTable.tsx`, `ReportSection.tsx`, `package.json`, `sales/page.tsx`, `spin/page.tsx`, `SettlementStatementView.tsx`, `RefundAnalyticsPanel.tsx`, `jason/page.tsx`, `receipt.ts`, `BrandOrderSummaryByBranchChart.tsx`, `promotionFormUtils.ts`, `platform-earnings/page.tsx`, `AdminDeliveryClassificationPanel.tsx`, `AdminDeliveryJobDrawer.tsx`, `CustomerStopsWizard.tsx`, `AdminRiderKpiDetailModal.tsx`, `adminStockFetch`, `AdminDeliveryClassificationTable.tsx`, `PromotionBranchSelector.tsx`, `useCustomerSocket.ts`, `refunds/page.tsx`, `DeliveryMap.tsx`, `spinStorage.ts`, `OrderQrCard.tsx`, `api.ts`, `LiveDeliveryMap.tsx`, `AdminDriverDetailSheet.tsx`, `AdminDriverRegistrationModal.tsx`, `AdminActualRouteView.tsx`, `AdminDriversPanel.tsx`, `BranchWalletSummaryCards.tsx`, `ProcessPaymentModal.tsx`, `DashboardRecentOrdersTable.tsx`, `SuperAdminDashboardLowerSection.tsx`, `reportUtils.ts`, `LoyaltyPointsFloat.tsx`, `account/orders/page.tsx`, `AdminOrderDrawer.tsx`, `FloatingRewardsPeek.tsx`, `pos/page.tsx`, `StoresClient.tsx`, `SearchableBranchSelect.tsx`, `CancellationReport.tsx`, `useBranchOrderingHours.ts`, `CancellationReasonDialog.tsx`, `PlatformEarningsMonthDetail.tsx`, `RefundOrderTimeline.tsx`, `getStatusLabel`, `useAdminJobLiveRoute.ts`, `AdminNotificationBell.tsx`, `CancelReasonConfigPanel.tsx`, `StockReportsPanel.tsx`, `PlatformDiscountPaybackSettings.tsx`, `RevenueOverviewBarChart.tsx`, `WalletSettleModal.tsx`, `SettlementWithdrawalPickerModal.tsx`, `AdminPinGateModal.tsx`?**
  _High betweenness centrality (0.264) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `lucide-react` to `MenuClient.tsx`, `chart.tsx`, `useAuthStore`, `loyalty.ts`, `react-hot-toast`, `PaymentHistoryContent.tsx`, `formatMoney`, `settlementTypes.ts`, `cartStore.ts`, `BrandSalesOverviewHero.tsx`, `react`, `BranchWalletDetail.tsx`, `getApiBaseUrl`, `WalletApproveWithdrawalModal.tsx`, `StockMovementPanel.tsx`, `AdminDeliveryRouteView.tsx`, `branchDisplayName`, `admin/layout.tsx`, `delivery/page.tsx`, `DeliveryRouteTimeline.tsx`, `types/index.ts`, `SpinWheelModal.tsx`, `DashboardPeriodFilter.tsx`, `getAdminSession`, `order/[id]/page.tsx`, `LoyaltyCampaignDashboard.tsx`, `DeliveryAccessSettingsTable.tsx`, `AdminTakeawayQueuePanel.tsx`, `cn`, `ApprovePayoutBreakdown.tsx`, `SuperAdminDashboard.tsx`, `framer-motion`, `all-orders/page.tsx`, `adminPermissions.ts`, `admin/menu/page.tsx`, `datetime.ts`, `WalletAnalysisSection.tsx`, `orderSchedule.ts`, `biweeklyPeriods.ts`, `AdminOrderEditModal.tsx`, `promotionCardDesign.ts`, `PromoOffersPanel.tsx`, `AdminDriverOpsPanel.tsx`, `checkout/page.tsx`, `ProductImage.tsx`, `StockTableTab.tsx`, `DashboardHourlyPeakTimes.tsx`, `SiteOrderPrompt.tsx`, `users/page.tsx`, `PromotionProductPicker.tsx`, `PromotionCreatePanel.tsx`, `AdminNotificationProvider.tsx`, `@tanstack/react-query`, `branch-managers/page.tsx`, `AdminReassignFailedOrderModal.tsx`, `AdminTakeawayScanner.tsx`, `RefundProcessModal.tsx`, `admin/orders/page.tsx`, `PromotionManagementDashboard.tsx`, `admin/stores/page.tsx`, `AdminDeliveryDashboard.tsx`, `ProcessPaymentBulkModal.tsx`, `formatMoneyAmount`, `orderCancel.ts`, `AdminReportPreviewSheet.tsx`, `uiSounds.ts`, `AdminDeliveryJobsTable.tsx`, `ReportSection.tsx`, `package.json`, `sales/page.tsx`, `spin/page.tsx`, `SettlementStatementView.tsx`, `RefundAnalyticsPanel.tsx`, `jason/page.tsx`, `receipt.ts`, `platform-earnings/page.tsx`, `AdminDeliveryClassificationPanel.tsx`, `AdminDeliveryJobDrawer.tsx`, `CustomerStopsWizard.tsx`, `AdminRiderKpiDetailModal.tsx`, `adminStockFetch`, `AdminDeliveryClassificationTable.tsx`, `PromotionBranchSelector.tsx`, `refunds/page.tsx`, `orderStatus.ts`, `OrderQrCard.tsx`, `api.ts`, `LiveDeliveryMap.tsx`, `AdminDriverDetailSheet.tsx`, `AdminDriverRegistrationModal.tsx`, `AdminActualRouteView.tsx`, `AdminDriversPanel.tsx`, `BranchWalletSummaryCards.tsx`, `ProcessPaymentModal.tsx`, `DashboardRecentOrdersTable.tsx`, `SuperAdminDashboardLowerSection.tsx`, `LoyaltyPointsFloat.tsx`, `account/orders/page.tsx`, `AdminOrderDrawer.tsx`, `FloatingRewardsPeek.tsx`, `pos/page.tsx`, `StoresClient.tsx`, `SearchableBranchSelect.tsx`, `CancellationReasonDialog.tsx`, `PlatformEarningsMonthDetail.tsx`, `RefundOrderTimeline.tsx`, `getStatusLabel`, `AdminNotificationBell.tsx`, `CancelReasonConfigPanel.tsx`, `StockReportsPanel.tsx`, `Footer.tsx`, `PlatformDiscountPaybackSettings.tsx`, `WalletSettleModal.tsx`, `SettlementWithdrawalPickerModal.tsx`, `AdminPinGateModal.tsx`?**
  _High betweenness centrality (0.215) - this node is a cross-community bridge._
- **Why does `getApiBaseUrl()` connect `getApiBaseUrl` to `PaymentHistoryContent.tsx`, `formatMoney`, `settlementTypes.ts`, `CancellationReasonDialog.tsx`, `react`, `BranchWalletDetail.tsx`, `app/menu/page.tsx`, `AdminNotificationBell.tsx`, `CancelReasonConfigPanel.tsx`, `AdminDeliveryRouteView.tsx`, `getStatusLabel`, `admin/layout.tsx`, `delivery/page.tsx`, `app/stores/page.tsx`, `branchDisplayName`, `PlatformDiscountPaybackSettings.tsx`, `DashboardPeriodFilter.tsx`, `getAdminSession`, `product/[id]/page.tsx`, `LoyaltyCampaignDashboard.tsx`, `DeliveryAccessSettingsTable.tsx`, `SettlementWithdrawalPickerModal.tsx`, `cn`, `SpinWheelModal.tsx`, `all-orders/page.tsx`, `adminPermissions.ts`, `admin/menu/page.tsx`, `datetime.ts`, `WalletAnalysisSection.tsx`, `biweeklyPeriods.ts`, `AdminOrderEditModal.tsx`, `AdminDriverOpsPanel.tsx`, `DashboardHourlyPeakTimes.tsx`, `users/page.tsx`, `PromotionProductPicker.tsx`, `AdminNotificationProvider.tsx`, `stockApi.ts`, `apiBase.ts`, `branch-managers/page.tsx`, `AdminReassignFailedOrderModal.tsx`, `AdminTakeawayScanner.tsx`, `useAdminJobLiveRoute.ts`, `RefundProcessModal.tsx`, `admin/orders/page.tsx`, `PromotionManagementDashboard.tsx`, `admin/stores/page.tsx`, `AdminDeliveryDashboard.tsx`, `ProcessPaymentBulkModal.tsx`, `refundsExport.ts`, `AdminDeliveryJobsTable.tsx`, `sales/page.tsx`, `StockReportsPanel.tsx`, `RefundAnalyticsPanel.tsx`, `jason/page.tsx`, `receipt.ts`, `SettlementStatementView.tsx`, `promotionFormUtils.ts`, `AdminOrdersContent`, `platform-earnings/page.tsx`, `AdminDeliveryJobDrawer.tsx`, `AdminRiderKpiDetailModal.tsx`, `AdminDeliveryClassificationTable.tsx`, `PromotionBranchSelector.tsx`, `refunds/page.tsx`, `next`, `api.ts`, `AdminActualRouteView.tsx`, `AdminDriversPanel.tsx`, `ProcessPaymentModal.tsx`, `reportUtils.ts`, `AdminOrderDrawer.tsx`, `pos/page.tsx`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _1092 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MenuClient.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05625790139064475 - nodes in this community are weakly interconnected._
- **Should `chart.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.04924102184376157 - nodes in this community are weakly interconnected._
- **Should `useAuthStore` be split into smaller, more focused modules?**
  _Cohesion score 0.07267884322678843 - nodes in this community are weakly interconnected._