import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController';
import * as storeInventoryController from '../controllers/storeInventoryController';
import * as stockReportController from '../controllers/stockReportController';
import * as batchStockController from '../controllers/batchStockController';
import * as adminNotificationController from '../controllers/adminNotificationController';
import * as walletController from '../controllers/walletController';
import * as paymentHistoryController from '../controllers/paymentHistoryController';
import * as platformEarningsController from '../controllers/platformEarningsController';
import * as invoiceController from '../controllers/invoiceController';
import * as protectedFilesController from '../controllers/protectedFilesController';
import * as adminUserController from '../controllers/adminUserController';
import * as messagingAdminController from '../controllers/messagingAdminController';
import * as adminCustomerController from '../controllers/adminCustomerController';
import * as branchOperatingController from '../controllers/branchOperatingController';
import {
  authenticate,
  requireAdmin,
  requireSystemAdmin,
  requireBranchAdminOnly,
  blockCashier,
} from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/permission';
import { adminReportsRateLimiter, authRateLimiter } from '../middleware/rateLimiter';
import { deliveryAdminServiceProxy } from '../middleware/deliveryAdminProxy';
import { settlementProofMemoryUpload } from '../middleware/upload';
import adminDeliveryRoutes from './adminDelivery';

const router = Router();

router.use(authenticate, requireAdmin);
router.use('/reports', adminReportsRateLimiter);
router.use(deliveryAdminServiceProxy);

router.get(
  '/invoices/withdrawal/:withdrawalId',
  requireAnyPermission(['PAYMENT_HISTORY', 'WALLET'], 'read'),
  invoiceController.getWithdrawalInvoiceHandler,
);
router.get(
  '/invoices/settlement/:settlementId',
  requireAnyPermission(['PAYMENT_HISTORY', 'WALLET'], 'read'),
  invoiceController.getSettlementInvoiceHandler,
);
router.get(
  '/invoices/settlement/:settlementId/platform-provider',
  requireAnyPermission(['PAYMENT_HISTORY', 'WALLET'], 'read'),
  invoiceController.getPlatformProviderSettlementInvoiceHandler,
);

router.get(
  '/spaces-proof',
  requirePermission('PAYMENT_HISTORY', 'read'),
  protectedFilesController.serveSpacesProof,
);
router.get(
  '/settlement-receipts/:storeId/:filename',
  requirePermission('PAYMENT_HISTORY', 'read'),
  protectedFilesController.serveSettlementReceipt,
);
router.get(
  '/invoice-files/:storeId/:filename',
  requireAnyPermission(['PAYMENT_HISTORY', 'WALLET'], 'read'),
  protectedFilesController.serveInvoiceFile,
);

router.get('/dashboard', requirePermission('DASHBOARD', 'read'), analyticsController.getDashboardStats);
router.get('/payment-history', requirePermission('PAYMENT_HISTORY', 'read'), paymentHistoryController.getPaymentHistory);
router.get(
  '/payment-history/pending-all',
  requirePermission('PAYMENT_HISTORY', 'read'),
  paymentHistoryController.listPendingAllHandler,
);
router.get(
  '/payment-history/ready-to-process',
  requirePermission('PAYMENT_HISTORY', 'read'),
  paymentHistoryController.listReadyToProcessHandler,
);
router.get(
  '/payment-history/ready-to-process/:month',
  requirePermission('PAYMENT_HISTORY', 'read'),
  paymentHistoryController.getReadyToProcessMonthHandler,
);
router.get('/payment-history/settlement-preview', requirePermission('PAYMENT_HISTORY', 'read'), paymentHistoryController.getSettlementPreview);
router.post(
  '/payment-history/settlement',
  requirePermission('PAYMENT_HISTORY', 'create'),
  settlementProofMemoryUpload.single('receipt'),
  paymentHistoryController.submitSettlement,
);
router.post(
  '/payment-history/settlement/bulk',
  requirePermission('PAYMENT_HISTORY', 'create'),
  settlementProofMemoryUpload.single('receipt'),
  paymentHistoryController.bulkSettleHandler,
);
router.get('/payment-history/settlements/:id', requirePermission('PAYMENT_HISTORY', 'read'), paymentHistoryController.getSettlement);
router.get(
  '/payment-history/settlements/:id/platform-receivable',
  requirePermission('PAYMENT_HISTORY', 'read'),
  paymentHistoryController.getSettlementPlatformReceivable,
);
router.get(
  '/payment-history/settlements/:id/receipt-url',
  requirePermission('PAYMENT_HISTORY', 'read'),
  paymentHistoryController.getSettlementReceiptUrl,
);
router.get('/reports/sales', blockCashier, requirePermission('REPORTS', 'read'), analyticsController.getSalesReport);
router.get('/reports/top-products', blockCashier, requirePermission('REPORTS', 'read'), analyticsController.getTopProducts);
router.get('/reports/brand-analytics', requireSystemAdmin, analyticsController.getBrandAnalytics);
router.get(
  '/reports/branch-tier-analytics',
  requireSystemAdmin,
  analyticsController.getBranchTierAnalytics,
);
router.get(
  '/reports/brand-branch-performance',
  requireSystemAdmin,
  analyticsController.getBrandBranchPerformance,
);
router.get(
  '/reports/top-branches-channel-breakdown',
  requireSystemAdmin,
  analyticsController.getTopBranchesChannelBreakdown,
);
router.get(
  '/reports/hourly-peak-heatmap',
  requireSystemAdmin,
  analyticsController.getHourlyPeakHeatmap,
);
router.get(
  '/reports/top-customers',
  requireSystemAdmin,
  analyticsController.getTopCustomers,
);
router.get(
  '/reports/customer-loyalty',
  requirePermission('REPORTS', 'read'),
  analyticsController.getCustomerLoyalty,
);
router.get(
  '/reports/order-fulfillment',
  requireSystemAdmin,
  analyticsController.getOrderFulfillment,
);
router.get(
  '/reports/order-cancellations',
  requirePermission('REPORTS', 'read'),
  analyticsController.getOrderCancellations,
);
router.get(
  '/reports/settlements',
  requirePermission('REPORTS', 'read'),
  analyticsController.getSettlementReports,
);
router.get(
  '/reports/wallet-ledger',
  requirePermission('REPORTS', 'read'),
  analyticsController.getWalletLedger,
);
router.get(
  '/platform-earnings',
  requireSystemAdmin,
  platformEarningsController.listMonthlyEarningsHandler,
);
router.get(
  '/platform-earnings/:yearMonth/preview',
  requireSystemAdmin,
  platformEarningsController.getSettlementPreviewHandler,
);
router.get(
  '/platform-earnings/:yearMonth',
  requireSystemAdmin,
  platformEarningsController.getMonthlyEarningsDetailHandler,
);
router.post(
  '/platform-earnings/:yearMonth/settle',
  requireSystemAdmin,
  platformEarningsController.settleMonthlyEarningsHandler,
);
router.get('/reports/branch-analytics', blockCashier, requirePermission('SALES', 'read'), analyticsController.getBranchAnalytics);

router.get(
  '/branch-operating-status',
  requireBranchAdminOnly,
  branchOperatingController.getBranchOperatingStatus,
);
router.post('/branch/close', requireBranchAdminOnly, branchOperatingController.closeBranch);
router.post('/branch/open', requireBranchAdminOnly, branchOperatingController.openBranch);

router.get('/stock', requirePermission('STOCK', 'read'), storeInventoryController.listBranchStock);
router.get('/stock/batch-preview', requirePermission('STOCK', 'read'), batchStockController.previewNextBatchNumber);
router.get('/stock/batches', requirePermission('STOCK', 'read'), batchStockController.listBranchBatches);
router.get('/stock/reset/preview', requirePermission('STOCK', 'read'), batchStockController.previewResetBatchNumber);
router.post('/stock/reset', requirePermission('STOCK', 'update'), requireBranchAdminOnly, batchStockController.createStockReset);
router.post('/stock/bulk-restock', requirePermission('STOCK', 'update'), requireBranchAdminOnly, batchStockController.createBulkRestock);
router.get('/stock/reset-groups', requirePermission('STOCK', 'read'), batchStockController.listStockBatchGroups);
router.get('/stock/invariant-check', requireSystemAdmin, batchStockController.stockInvariantCheck);
router.get('/stock/:productId/pricing', requirePermission('STOCK', 'read'), batchStockController.getProductPricing);
router.get('/stock/:productId/batches', requirePermission('STOCK', 'read'), batchStockController.listProductBatches);
router.post('/stock/:productId/batches', requirePermission('STOCK', 'update'), requireBranchAdminOnly, batchStockController.receiveStockBatch);
router.patch('/stock/batches/:batchId', requirePermission('STOCK', 'update'), requireBranchAdminOnly, batchStockController.patchBatch);
router.patch('/stock/:productId/settings', requirePermission('STOCK', 'update'), requireBranchAdminOnly, batchStockController.updateProductStockSettings);
router.get('/stock/report', requirePermission('STOCK', 'read'), stockReportController.stockWeeklyReport);
router.get('/stock/audit-logs', requirePermission('STOCK', 'read'), stockReportController.stockAuditLogs);
router.get('/stock/movement-ledger', requirePermission('STOCK', 'read'), stockReportController.stockMovementLedger);
router.post('/stock/sync', requirePermission('STOCK', 'update'), requireBranchAdminOnly, storeInventoryController.syncBranchInventory);
router.patch('/stock/:productId', requirePermission('STOCK', 'update'), requireBranchAdminOnly, storeInventoryController.updateBranchStock);
router.post('/stock/:productId/topup', requirePermission('STOCK', 'update'), requireBranchAdminOnly, stockReportController.stockTopUp);

// Notifications usually don't need strict RBAC because they are personal. 
// We'll leave them protected by general admin auth.
router.get('/notifications', adminNotificationController.listMyNotifications);
router.patch('/notifications/:id/read', adminNotificationController.markNotificationRead);
router.post('/notifications/read-all', adminNotificationController.markAllNotificationsRead);
router.post('/notifications/read-order', adminNotificationController.markReadByOrder);

router.use(adminDeliveryRoutes);

// Wallet routes
router.get('/wallet', requirePermission('WALLET', 'read'), walletController.listWallets);
router.get('/wallet/summary', requirePermission('WALLET', 'read'), walletController.getWalletSummaryHandler);
router.get('/wallet/withdrawals', requirePermission('WALLET', 'read'), walletController.listWithdrawalsHandler);
router.get(
  '/wallet/security-audit-logs',
  requirePermission('WALLET', 'read'),
  walletController.listWalletSecurityAuditLogsHandler,
);
router.get(
  '/wallet/withdrawals/:id/proof-url',
  requirePermission('WALLET', 'read'),
  walletController.getWithdrawalProofUrlHandler,
);
router.post(
  '/wallet/withdrawals/:id/proof',
  requireSystemAdmin,
  walletController.attachWithdrawalProofHandler,
);
router.get('/wallet/withdrawals/:id', requirePermission('WALLET', 'read'), walletController.getWithdrawalByIdHandler);
router.post(
  '/wallet/verify-pin',
  authRateLimiter,
  requirePermission('WALLET', 'create'),
  walletController.verifyWalletPinHandler,
);
router.post('/wallet/withdrawals', requirePermission('WALLET', 'create'), walletController.requestWithdrawalHandler);
router.post(
  '/wallet/withdrawals/:id/approve',
  requireSystemAdmin,
  walletController.attachWithdrawalStoreForUpload,
  settlementProofMemoryUpload.single('proof'),
  walletController.approveWithdrawalHandler,
);
router.post('/wallet/withdrawals/:id/reject', requireSystemAdmin, walletController.rejectWithdrawalHandler);
router.delete('/wallet/withdrawals/:id', requirePermission('WALLET', 'delete'), walletController.cancelWithdrawalHandler);
router.get('/wallet/report', requirePermission('WALLET', 'read'), walletController.getWalletReport);
router.get('/wallet/analysis', requirePermission('WALLET', 'read'), walletController.getWalletAnalysisHandler);
router.get('/wallet/payout-period-info', requirePermission('WALLET', 'read'), walletController.getPayoutPeriodInfoHandler);
router.get(
  '/wallet/payouts-due',
  requireSystemAdmin,
  requirePermission('WALLET', 'read'),
  walletController.getPayoutsDueHandler,
);
router.get(
  '/wallet/payout-reviews',
  requireSystemAdmin,
  requirePermission('WALLET', 'read'),
  walletController.listPayoutReviewsHandler,
);
router.put(
  '/wallet/payout-reviews',
  requireSystemAdmin,
  requirePermission('WALLET', 'update'),
  walletController.setPayoutReviewHandler,
);
router.get(
  '/wallet/payout-review-invoice',
  requireSystemAdmin,
  requirePermission('WALLET', 'read'),
  walletController.getPayoutReviewInvoiceHandler,
);
router.post(
  '/wallet/payout-review-zip',
  requireSystemAdmin,
  requirePermission('WALLET', 'read'),
  walletController.downloadPayoutReviewZipHandler,
);
router.get(
  '/wallet/payout-periods',
  requirePermission('WALLET', 'read'),
  walletController.getPayoutPeriodsHandler,
);
router.get('/wallet/pending-withdrawal', requireSystemAdmin, walletController.getPendingWithdrawalForSettlement);
router.get('/wallet/settlement-withdrawals', requireSystemAdmin, walletController.listWithdrawalsForSettlement);
router.get('/wallet/net-preview', requirePermission('WALLET', 'read'), walletController.getNetPreviewHandler);
router.get('/wallet/cancelled-by-branch-orders', requirePermission('WALLET', 'read'), walletController.getCancelledByBranchOrdersHandler);
router.get('/wallet/payout-details', requirePermission('WALLET', 'read'), walletController.getPayoutDetailsBatch);
router.get('/wallet/payout-detail/:transactionId', requirePermission('WALLET', 'read'), walletController.getPayoutDetail);
// Store-scoped reconcile (branch managers); manual balance edits use POST /wallet/:storeId/adjust (update).
router.post('/wallet/sync', requirePermission('WALLET', 'read'), walletController.syncWallets);
router.post(
  '/wallet/:storeId/initiate-payout',
  requireSystemAdmin,
  walletController.attachStoreIdFromWalletParams,
  // Multipart to this route was 504'ing at the App Platform edge; JSON base64 is preferred.
  // Keep multer as a no-op fallback when Content-Type is still multipart.
  (req, res, next) => {
    if (req.is('multipart/form-data')) {
      return settlementProofMemoryUpload.single('proof')(req, res, next);
    }
    return next();
  },
  walletController.initiatePayoutHandler,
);
router.get('/wallet/:storeId/settle-info', requirePermission('WALLET', 'read'), walletController.getSettleInfo);
router.get('/wallet/:storeId/settle-preview', requirePermission('WALLET', 'read'), walletController.getSettlePreview);
router.post('/wallet/:storeId/settle', authRateLimiter, requirePermission('WALLET', 'create'), walletController.settleWallet);
router.get('/wallet/:storeId/transactions', requirePermission('WALLET', 'read'), walletController.getWalletTransactions);
router.post('/wallet/:storeId/adjust', authRateLimiter, requirePermission('WALLET', 'update'), walletController.adjustWallet);
router.get('/wallet/:storeId', requirePermission('WALLET', 'read'), walletController.getWallet);

import * as roleController from '../controllers/roleController';
import * as jasonLedgerController from '../controllers/jasonLedgerController';

router.get('/me/permissions', adminUserController.getMyPermissions);

router.get('/users', requirePermission('USERS', 'read'), adminUserController.listUsers);
router.post('/users', requirePermission('USERS', 'create'), adminUserController.createAdminUser);
router.get('/users/:id', requirePermission('USERS', 'read'), adminUserController.getUser);
// Permission split inside updateAdminUser: isActive → delete; password → update.
router.patch('/users/:id', requireAnyPermission(['USERS'], 'update'), adminUserController.updateAdminUser);
router.get('/users/:id/permissions', requirePermission('USERS', 'read'), adminUserController.getPermissions);
router.put('/users/:id/permissions', requireSystemAdmin, adminUserController.updatePermissions);
router.get('/users/:id/stores', requirePermission('USERS', 'read'), adminUserController.getUserStores);
router.put('/users/:id/stores', requirePermission('USERS', 'update'), adminUserController.updateUserStores);

router.get('/jason', requireSystemAdmin, jasonLedgerController.listJasonLedger);
router.post('/jason', requireSystemAdmin, jasonLedgerController.createJasonLedgerEntry);
router.patch('/jason/:id', requireSystemAdmin, jasonLedgerController.updateJasonLedgerEntry);

router.get('/roles', requireSystemAdmin, roleController.getRoles);
router.post('/roles', requireSystemAdmin, roleController.createRole);
router.put('/roles/:id', requireSystemAdmin, roleController.updateRole);
router.delete('/roles/:id', requireSystemAdmin, roleController.deleteRole);

router.get('/branch-managers', requirePermission('BRANCH_MANAGERS', 'read'), adminUserController.listBranchManagers);
router.post('/branch-managers', requirePermission('BRANCH_MANAGERS', 'create'), adminUserController.createBranchManager);
router.patch('/branch-managers/:id', requirePermission('BRANCH_MANAGERS', 'update'), adminUserController.updateBranchManager);

router.get('/cashiers', requirePermission('CASHIERS', 'read'), adminUserController.listCashiers);
router.post('/cashiers', requirePermission('CASHIERS', 'create'), adminUserController.createCashier);
// Permission split inside updateCashier: isActive → delete; name/email/password → update.
router.patch('/cashiers/:id', requireAnyPermission(['CASHIERS'], 'update'), adminUserController.updateCashier);

router.get(
  '/messaging/conversations',
  requireSystemAdmin,
  messagingAdminController.listMessagingConversations,
);
router.get(
  '/messaging/whatsapp-status',
  requireSystemAdmin,
  messagingAdminController.getWhatsAppStatus,
);
router.get(
  '/messaging/conversations/:externalUserId/messages',
  requireSystemAdmin,
  messagingAdminController.listMessagingConversationMessages,
);
router.post(
  '/messaging/conversations/:externalUserId/reply',
  requireSystemAdmin,
  messagingAdminController.sendAdminMessagingReply,
);

// Customer 360 profile and actions (Super Admin only)
router.get('/customers', requireSystemAdmin, adminCustomerController.listCustomers);
router.get('/customers/:id', requireSystemAdmin, adminCustomerController.getCustomerProfile);
router.get('/customers/:id/orders', requireSystemAdmin, adminCustomerController.getCustomerOrders);
router.get('/customers/:id/loyalty', requireSystemAdmin, adminCustomerController.getCustomerLoyaltyHistory);
router.post('/customers/:id/ban', requireSystemAdmin, adminCustomerController.banCustomer);
router.post('/customers/:id/restore', requireSystemAdmin, adminCustomerController.restoreCustomer);

export default router;
