import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireDeliveryDriver } from '../middleware/auth';
import { shouldSkipRateLimit } from '../middleware/loadTestBypass';
import * as authController from '../controllers/authController';

const router = Router();

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
  skip: shouldSkipRateLimit,
});

router.post('/login', authRateLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, requireDeliveryDriver, authController.logout);

export default router;
