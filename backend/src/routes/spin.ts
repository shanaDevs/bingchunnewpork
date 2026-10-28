import { Router } from 'express';
import * as spinController from '../controllers/spinController';
import { authenticate, optionalAuth, requireAdmin, requireSystemAdmin } from '../middleware/auth';
import { spinPlayRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.get('/offers', spinController.getPublicOffers);
router.get('/eligibility', optionalAuth, spinController.getSpinEligibility);
router.get('/my-claim', optionalAuth, spinController.getMyClaim);
router.post('/play', spinPlayRateLimiter, optionalAuth, spinController.playSpin);
router.post('/validate', spinController.validateSpinClaim);

// Spin wheel admin config is super-admin only (not granted to branch managers by default).
router.get('/admin/offers', authenticate, requireAdmin, requireSystemAdmin, spinController.getAllOffers);
router.post('/admin/offers', authenticate, requireAdmin, requireSystemAdmin, spinController.createOffer);
router.put('/admin/offers/:id', authenticate, requireAdmin, requireSystemAdmin, spinController.updateOffer);
router.delete('/admin/offers/:id', authenticate, requireAdmin, requireSystemAdmin, spinController.deleteOffer);
router.get('/admin/results', authenticate, requireAdmin, requireSystemAdmin, spinController.getRecentResults);

export default router;
