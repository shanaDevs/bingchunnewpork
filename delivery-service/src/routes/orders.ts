import { Router } from 'express';
import { authenticate, requireDeliveryDriver } from '../middleware/auth';
import * as ordersController from '../controllers/ordersController';

const router = Router();

router.get('/:orderId', authenticate, requireDeliveryDriver, ordersController.getOrder);
router.put('/:orderId/status', authenticate, requireDeliveryDriver, ordersController.updateOrderStatus);
router.post('/:orderId/otp/resend', authenticate, requireDeliveryDriver, ordersController.resendOrderOtp);
router.post('/:orderId/otp/verify', authenticate, requireDeliveryDriver, ordersController.verifyOrderOtp);
router.post('/:orderId/arrive', authenticate, requireDeliveryDriver, ordersController.arriveAtOrder);
router.post('/:orderId/attempt', authenticate, requireDeliveryDriver, ordersController.createDeliveryAttempt);

export default router;
