import { Router } from 'express';
import * as refundController from '../controllers/refundController';
import { authenticate, blockCashier, requireBranchAdminOnly } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

router.get('/', authenticate, blockCashier, requirePermission('ORDERS', 'read'), refundController.getRefunds);
router.get('/summary', authenticate, blockCashier, requirePermission('ORDERS', 'read'), refundController.getRefundsSummary);
router.get('/analytics', authenticate, blockCashier, requirePermission('ORDERS', 'read'), refundController.getRefundAnalytics);
router.get('/:id', authenticate, blockCashier, requirePermission('ORDERS', 'read'), refundController.getRefund);
router.put(
  '/:id/status',
  authenticate,
  requirePermission('ORDERS', 'update'),
  requireBranchAdminOnly,
  refundController.updateRefundStatus,
);

export default router;
