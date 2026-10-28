import { Router } from 'express';
import { requireInternalSecret } from '../middleware/internalAuth';
import { getOrderTrackingInternal } from '../controllers/internalController';

const router = Router();

router.use(requireInternalSecret);
router.get('/orders/:orderId/tracking', getOrderTrackingInternal);

export default router;
