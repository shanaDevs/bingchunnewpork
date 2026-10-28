import { Router } from 'express';
import { authenticate, requireDeliveryDriver } from '../middleware/auth';
import * as meController from '../controllers/meController';

const router = Router();

router.get('/', authenticate, requireDeliveryDriver, meController.getMe);
router.patch('/duty', authenticate, requireDeliveryDriver, meController.updateDuty);
router.post('/fcm-token', authenticate, requireDeliveryDriver, meController.updateFcmToken);
router.delete('/fcm-token', authenticate, requireDeliveryDriver, meController.deleteFcmToken);
router.get('/history', authenticate, requireDeliveryDriver, meController.getHistory);
router.get('/ratings', authenticate, requireDeliveryDriver, meController.getRatings);
router.get('/merit-history', authenticate, requireDeliveryDriver, meController.getMeritHistory);
router.get('/stats', authenticate, requireDeliveryDriver, meController.getMyStats);
router.get('/shifts', authenticate, requireDeliveryDriver, meController.listMyShifts);
router.post('/complaints', authenticate, requireDeliveryDriver, meController.createComplaint);
router.get('/complaints', authenticate, requireDeliveryDriver, meController.listMyComplaints);
router.post('/branch-requests', authenticate, requireDeliveryDriver, meController.createBranchRequest);
router.get('/branch-requests', authenticate, requireDeliveryDriver, meController.listMyBranchRequests);

export default router;
