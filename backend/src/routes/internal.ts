import { Router } from 'express';
import { requireInternalSecret } from '../middleware/internalAuth';
import * as internalController from '../controllers/internalController';

const router = Router();

// Every route here is service-to-service only — no admin/customer JWTs apply.
router.use(requireInternalSecret);

router.post('/delivery/order-status', internalController.updateOrderStatusInternal);
router.post('/delivery/send-code', internalController.sendDeliveryCodeInternal);
router.post('/socket/emit', internalController.emitSocketInternal);

export default router;
