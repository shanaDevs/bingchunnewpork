import { Router } from 'express';
import { authenticate, requireActiveCustomer } from '../middleware/auth';
import * as customerNotificationController from '../controllers/customerNotificationController';
import * as fcmTokenController from '../controllers/fcmTokenController';

const router = Router();

router.get('/', authenticate, requireActiveCustomer, customerNotificationController.listMyNotifications);
router.patch('/:id/read', authenticate, requireActiveCustomer, customerNotificationController.markNotificationRead);
router.post('/read-all', authenticate, requireActiveCustomer, customerNotificationController.markAllNotificationsRead);

// FCM device token management
router.post('/fcm-token', authenticate, requireActiveCustomer, fcmTokenController.registerFcmToken);
router.delete('/fcm-token', authenticate, requireActiveCustomer, fcmTokenController.unregisterFcmToken);

export default router;
