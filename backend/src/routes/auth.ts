import { Router } from 'express';
import * as authController from '../controllers/authController';
import * as socialAuthController from '../controllers/socialAuthController';
import { authenticate, requireActiveCustomer } from '../middleware/auth';
import {
  otpRateLimiter,
  authRateLimiter,
  refreshRateLimiter,
  deliveryAuthRateLimiter,
} from '../middleware/rateLimiter';

const router = Router();

router.post('/register', authRateLimiter, authController.register);
router.post('/login', authRateLimiter, authController.login);
router.post('/phone/login', authRateLimiter, authController.phoneLogin);
router.post('/phone/check', authRateLimiter, authController.checkPhone);
router.post('/google', authRateLimiter, socialAuthController.googleLogin);
router.post('/facebook', authRateLimiter, socialAuthController.facebookLogin);
router.get('/facebook/start', socialAuthController.startFacebookOAuth);
router.get('/facebook/callback', socialAuthController.facebookOAuthCallback);
router.get('/social-config', socialAuthController.getSocialConfig);
router.post('/otp/request', otpRateLimiter, authController.requestOtp);
router.post('/otp/verify', authRateLimiter, authController.verifyOtp);
// Dedicated refresh budget — not the login failure limiter.
router.post('/refresh', refreshRateLimiter, authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/logout-all', authenticate, authController.logoutAll);
router.post('/password/forgot', authRateLimiter, authController.forgotPassword);
router.post('/password/reset', authRateLimiter, authController.resetPassword);
router.get('/me', authenticate, authController.getMe);
router.post('/phone/link/request', authenticate, requireActiveCustomer, otpRateLimiter, authController.linkPhoneRequest);
router.post('/phone/link/verify', authenticate, requireActiveCustomer, authController.linkPhoneVerify);
router.put('/me', authenticate, requireActiveCustomer, authController.updateMe);
router.delete('/me', authenticate, authController.deleteAccount);

// Admin auth
router.post('/admin/login', authRateLimiter, authController.adminLogin);
router.post('/admin/refresh', refreshRateLimiter, authController.adminRefreshToken);
router.get('/admin/socket-token', authController.adminSocketToken);
router.post('/admin/logout', authController.adminLogout);
router.post('/admin/password/forgot', authRateLimiter, authController.adminForgotPassword);
router.post('/admin/password/reset', authRateLimiter, authController.adminResetPassword);

// Delivery driver auth (mobile) — mobile OTP. Always served by core: the code is
// texted from here, and the delivery service's own /auth/login only knows PINs.
router.post('/delivery/otp/request', otpRateLimiter, authController.deliveryOtpRequest);
router.post('/delivery/login', deliveryAuthRateLimiter, authController.deliveryLogin);

export default router;
