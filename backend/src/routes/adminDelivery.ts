/**
 * Admin delivery operations — mounted on core `/api/admin` and delivery-service `/delivery-api/admin`.
 * Handlers stay in backend controllers; delivery-service loads this router from compiled `@bingchun/backend`.
 */
import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController';
import * as storeDeliveryAccessController from '../controllers/storeDeliveryAccessController';
import * as adminDeliveryController from '../controllers/adminDeliveryController';
import * as deliveryJobController from '../controllers/deliveryJobController';
import * as deliveryWalletController from '../controllers/deliveryWalletController';
import {
  requireSystemAdmin,
  requireSystemOrDeliveryAdmin,
} from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/permission';
import { authRateLimiter } from '../middleware/rateLimiter';
import { requireDeliveryWalletUnlock } from '../middleware/deliveryWalletUnlock';
import {
  settlementProofMemoryUpload,
  driverImageUpload,
  optionalDriverImageUpload,
} from '../middleware/upload';

const router = Router();

router.get(
  '/reports/monthly-delivery-orders',
  requireSystemAdmin,
  analyticsController.getMonthlyDeliveryOrders,
);

router.post(
  '/delivery-wallet/unlock',
  authRateLimiter,
  requirePermission('DELIVERY_WALLET', 'read'),
  deliveryWalletController.unlockDeliveryWalletHandler,
);
router.get(
  '/delivery-wallet',
  requirePermission('DELIVERY_WALLET', 'read'),
  requireDeliveryWalletUnlock,
  deliveryWalletController.getDeliveryWalletHandler,
);
router.get(
  '/delivery-wallet/payout-preview',
  requirePermission('DELIVERY_WALLET', 'read'),
  requireDeliveryWalletUnlock,
  deliveryWalletController.getDeliveryPayoutPreviewHandler,
);
router.get(
  '/delivery-wallet/payouts-due',
  requireSystemAdmin,
  requireDeliveryWalletUnlock,
  deliveryWalletController.listDeliveryPayoutsDueHandler,
);
router.get(
  '/delivery-wallet/payout-due-reviews',
  requireSystemAdmin,
  requireDeliveryWalletUnlock,
  deliveryWalletController.listDeliveryPayoutDueReviewsHandler,
);
router.put(
  '/delivery-wallet/payout-due-reviews',
  requireSystemAdmin,
  requireDeliveryWalletUnlock,
  deliveryWalletController.setDeliveryPayoutDueReviewHandler,
);
router.get(
  '/delivery-wallet/payouts-due/statement',
  requireSystemAdmin,
  requireDeliveryWalletUnlock,
  deliveryWalletController.getDeliveryPayoutDueStatementHandler,
);
router.get(
  '/delivery-wallet/payouts',
  requirePermission('DELIVERY_WALLET', 'read'),
  requireDeliveryWalletUnlock,
  deliveryWalletController.listDeliveryPayoutsHandler,
);
router.post(
  '/delivery-wallet/payouts/statement-zip',
  requirePermission('DELIVERY_WALLET', 'read'),
  requireDeliveryWalletUnlock,
  deliveryWalletController.downloadDeliveryPayoutStatementZipHandler,
);
router.get(
  '/delivery-wallet/payouts/:id/statement',
  requirePermission('DELIVERY_WALLET', 'read'),
  requireDeliveryWalletUnlock,
  deliveryWalletController.getDeliveryPayoutStatementHandler,
);
router.get(
  '/delivery-wallet/payouts/:id/proof-url',
  requirePermission('DELIVERY_WALLET', 'read'),
  requireDeliveryWalletUnlock,
  deliveryWalletController.getDeliveryPayoutProofUrlHandler,
);
router.post(
  '/delivery-wallet/payouts',
  requireSystemAdmin,
  requireDeliveryWalletUnlock,
  deliveryWalletController.attachDeliveryPayoutUploadFolder,
  settlementProofMemoryUpload.single('proof'),
  deliveryWalletController.postDeliveryPayoutHandler,
);
router.post(
  '/delivery-wallet/payouts/:id/cancel',
  requirePermission('DELIVERY_WALLET', 'create'),
  requireDeliveryWalletUnlock,
  deliveryWalletController.cancelDeliveryPayoutHandler,
);
router.post(
  '/delivery-wallet/payouts/:id/approve',
  requireSystemAdmin,
  requireDeliveryWalletUnlock,
  deliveryWalletController.attachDeliveryPayoutUploadFolder,
  settlementProofMemoryUpload.single('proof'),
  deliveryWalletController.approveDeliveryPayoutHandler,
);
router.post(
  '/delivery-wallet/payouts/:id/proof',
  requireSystemAdmin,
  requireDeliveryWalletUnlock,
  deliveryWalletController.attachDeliveryPayoutUploadFolder,
  settlementProofMemoryUpload.single('proof'),
  deliveryWalletController.attachDeliveryPayoutProofHandler,
);
router.post(
  '/delivery-wallet/payouts/:id/reject',
  requireSystemAdmin,
  requireDeliveryWalletUnlock,
  deliveryWalletController.rejectDeliveryPayoutHandler,
);

router.get('/stores/delivery-access', requireSystemAdmin, storeDeliveryAccessController.listDeliveryAccessStores);
router.get(
  '/stores/delivery-access-log',
  requireSystemAdmin,
  storeDeliveryAccessController.getDeliveryAccessLog,
);
router.patch(
  '/stores/:id/delivery-access',
  requireSystemAdmin,
  storeDeliveryAccessController.patchDeliveryAccess,
);

router.get('/delivery/pending-orders', requirePermission('DELIVERY', 'read'), adminDeliveryController.listPendingDeliveryOrders);
router.post('/delivery/classify', requirePermission('DELIVERY', 'update'), adminDeliveryController.classifyDeliveryOrders);
router.post('/delivery/preview-route', requirePermission('DELIVERY', 'read'), adminDeliveryController.previewDeliveryRoute);
router.get('/delivery-jobs', requireAnyPermission(['DELIVERY', 'LIVE_DRIVERS'], 'read'), adminDeliveryController.listAdminDeliveryJobs);
router.get('/delivery-jobs/:id', requirePermission('DELIVERY', 'read'), adminDeliveryController.getAdminDeliveryJob);
router.get('/delivery-jobs/:id/route', requirePermission('DELIVERY', 'read'), adminDeliveryController.getAdminDeliveryJobRoute);
router.get('/delivery-jobs/:id/actual-route', requirePermission('DELIVERY', 'read'), adminDeliveryController.getAdminDeliveryJobActualRoute);
router.get('/delivery-jobs/:id/live-route', requirePermission('DELIVERY', 'read'), adminDeliveryController.getAdminDeliveryJobLiveRoute);
router.post('/delivery-jobs', requirePermission('DELIVERY', 'create'), deliveryJobController.createDeliveryJob);
router.post('/delivery-jobs/:id/re-ring', requirePermission('DELIVERY', 'update'), deliveryJobController.reRingDeliveryJob);
router.post(
  '/delivery-jobs/:id/cancel',
  requireSystemOrDeliveryAdmin,
  requirePermission('DELIVERY', 'update'),
  deliveryJobController.adminCancelDeliveryJob,
);
router.get('/drivers', requirePermission('DELIVERY', 'read'), adminDeliveryController.listDeliveryDrivers);
router.get(
  '/drivers/:id/ratings',
  requirePermission('DELIVERY', 'read'),
  adminDeliveryController.getDriverRatings,
);
router.get(
  '/branches/:storeId/driver-pool',
  requirePermission('DELIVERY', 'read'),
  adminDeliveryController.getBranchDriverPool,
);
router.get(
  '/live-drivers',
  requireAnyPermission(['DELIVERY', 'LIVE_DRIVERS'], 'read'),
  adminDeliveryController.listLiveDrivers,
);
router.get(
  '/driver-analytics/rider/:riderId',
  requirePermission('DELIVERY', 'read'),
  adminDeliveryController.getRiderKpiDetail,
);
router.get(
  '/driver-analytics',
  requirePermission('DELIVERY', 'read'),
  adminDeliveryController.getDriverAnalytics,
);
router.get(
  '/delivery-dashboard',
  requirePermission('DELIVERY', 'read'),
  adminDeliveryController.getDeliveryDashboard,
);
router.get(
  '/delivery-failures',
  requirePermission('DELIVERY', 'read'),
  adminDeliveryController.listDeliveryFailures,
);
router.post(
  '/delivery-failures/:attemptId/reassign',
  requirePermission('DELIVERY', 'create'),
  adminDeliveryController.reassignDeliveryFailure,
);
router.get(
  '/vehicle-breakdowns',
  requirePermission('DELIVERY', 'read'),
  adminDeliveryController.listVehicleBreakdowns,
);
router.post(
  '/drivers/:driverId/vehicle-fixed',
  requirePermission('DELIVERY', 'update'),
  adminDeliveryController.adminMarkDriverVehicleFixed,
);
router.get(
  '/driver-complaints',
  requirePermission('DELIVERY', 'read'),
  adminDeliveryController.listDriverComplaints,
);
router.get(
  '/driver-complaints/:id',
  requirePermission('DELIVERY', 'read'),
  adminDeliveryController.getDriverComplaint,
);
router.patch(
  '/driver-complaints/:id',
  requirePermission('DELIVERY', 'update'),
  adminDeliveryController.updateDriverComplaint,
);
router.get(
  '/driver-branch-requests',
  requireSystemOrDeliveryAdmin,
  requirePermission('DELIVERY', 'read'),
  adminDeliveryController.listDriverBranchRequests,
);
router.patch(
  '/driver-branch-requests/:id',
  requireSystemOrDeliveryAdmin,
  requirePermission('DELIVERY', 'update'),
  adminDeliveryController.reviewDriverBranchRequest,
);
router.post(
  '/drivers',
  requireSystemOrDeliveryAdmin,
  requirePermission('DELIVERY', 'create'),
  driverImageUpload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'licenseImage', maxCount: 1 },
  ]),
  adminDeliveryController.createDeliveryDriver,
);
router.patch(
  '/drivers/:id',
  requireSystemOrDeliveryAdmin,
  requirePermission('DELIVERY', 'update'),
  optionalDriverImageUpload,
  adminDeliveryController.updateDeliveryDriver,
);

export default router;
