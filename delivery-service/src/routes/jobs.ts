import { Router } from 'express';
import { authenticate, requireDeliveryDriver } from '../middleware/auth';
import * as jobsController from '../controllers/jobsController';

const router = Router();

router.get('/', authenticate, requireDeliveryDriver, jobsController.listJobs);
router.get('/active', authenticate, requireDeliveryDriver, jobsController.getActiveJob);
router.get('/history', authenticate, requireDeliveryDriver, jobsController.getMyJobHistory);
router.get('/:id/route', authenticate, requireDeliveryDriver, jobsController.getJobRoute);
router.get('/:id', authenticate, requireDeliveryDriver, jobsController.getJob);
router.post('/:id/assign', authenticate, requireDeliveryDriver, jobsController.assignJob);
router.post('/:id/claim', authenticate, requireDeliveryDriver, jobsController.claimJob);
router.post('/:id/reject', authenticate, requireDeliveryDriver, jobsController.rejectJob);
router.post('/:id/pickup', authenticate, requireDeliveryDriver, jobsController.pickupJob);
router.post('/:id/start', authenticate, requireDeliveryDriver, jobsController.startJob);
router.post('/:id/complete', authenticate, requireDeliveryDriver, jobsController.completeJob);
router.post('/vehicle-failure', authenticate, requireDeliveryDriver, jobsController.reportVehicleFailure);

export default router;
