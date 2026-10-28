import { Router } from 'express';
import { authenticate, requireDeliveryDriver } from '../middleware/auth';
import * as locationsController from '../controllers/locationsController';

const router = Router();

router.post('/batch', authenticate, requireDeliveryDriver, locationsController.batchLocations);

export default router;
