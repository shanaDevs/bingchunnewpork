import { Router } from 'express';
import { authenticate, requireDeliveryDriver } from '../middleware/auth';
import * as routeController from '../controllers/routeController';

const router = Router();

router.get('/', authenticate, requireDeliveryDriver, routeController.getOptimizedRoute);

export default router;
