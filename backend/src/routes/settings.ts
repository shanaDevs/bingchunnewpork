import { Router } from 'express';
import * as settingsController from '../controllers/settingsController';
import { authenticate, requireSystemAdmin } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

router.get('/payment-methods', settingsController.getPublicPaymentMethods);

router.get('/payment', authenticate, requirePermission('SETTINGS', 'read'), requireSystemAdmin, settingsController.getAdminPaymentSettings);
router.put('/payment', authenticate, requirePermission('SETTINGS', 'update'), requireSystemAdmin, settingsController.updateAdminPaymentSettings);

router.get('/messaging', authenticate, requirePermission('SETTINGS', 'read'), requireSystemAdmin, settingsController.getAdminMessagingSettings);
router.put('/messaging', authenticate, requirePermission('SETTINGS', 'update'), requireSystemAdmin, settingsController.updateAdminMessagingSettings);

router.get('/app', settingsController.getAppSettings);
router.put('/app', authenticate, requirePermission('SETTINGS', 'update'), requireSystemAdmin, settingsController.updateAppSettings);

router.get('/delivery-zones', settingsController.getDeliveryZones);
router.post('/delivery-zones', authenticate, requirePermission('SETTINGS', 'create'), requireSystemAdmin, settingsController.createDeliveryZone);
router.put('/delivery-zones/:id', authenticate, requirePermission('SETTINGS', 'update'), requireSystemAdmin, settingsController.updateDeliveryZone);
router.delete('/delivery-zones/:id', authenticate, requirePermission('SETTINGS', 'delete'), requireSystemAdmin, settingsController.deleteDeliveryZone);

router.get('/loyalty-program', authenticate, requirePermission('SETTINGS', 'read'), requireSystemAdmin, settingsController.getLoyaltyProgramSettings);
router.put('/loyalty-program', authenticate, requirePermission('SETTINGS', 'update'), requireSystemAdmin, settingsController.updateLoyaltyProgramSettings);

router.get('/branch-ordering-hours', authenticate, requirePermission('SETTINGS', 'read'), settingsController.getBranchOrderingHours);
router.put('/branch-ordering-hours', authenticate, requirePermission('SETTINGS', 'update'), settingsController.updateBranchOrderingHours);

router.get('/platform-discount-payback', authenticate, requirePermission('SETTINGS', 'read'), requireSystemAdmin, settingsController.getPlatformDiscountPaybackSettings);
router.put('/platform-discount-payback', authenticate, requirePermission('SETTINGS', 'update'), requireSystemAdmin, settingsController.updatePlatformDiscountPaybackSettings);

router.get('/cancel-reasons', settingsController.getPublicCancelReasons);
router.get('/cancel-reasons/all', authenticate, requirePermission('SETTINGS', 'read'), requireSystemAdmin, settingsController.getAllCancelReasonConfigs);
router.post('/cancel-reasons', authenticate, requirePermission('SETTINGS', 'create'), requireSystemAdmin, settingsController.createCancelReasonConfig);
router.put('/cancel-reasons/:id', authenticate, requirePermission('SETTINGS', 'update'), requireSystemAdmin, settingsController.updateCancelReasonConfig);
router.delete('/cancel-reasons/:id', authenticate, requirePermission('SETTINGS', 'delete'), requireSystemAdmin, settingsController.deleteCancelReasonConfig);

router.get('/order-status-refunds/all', authenticate, requirePermission('SETTINGS', 'read'), requireSystemAdmin, settingsController.getAllOrderStatusRefundConfigsHandler);
router.put('/order-status-refunds/:status', authenticate, requirePermission('SETTINGS', 'update'), requireSystemAdmin, settingsController.updateOrderStatusRefundConfig);

export default router;
