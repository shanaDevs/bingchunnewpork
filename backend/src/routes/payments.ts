import { Router } from 'express';
import * as paymentController from '../controllers/paymentController';

const router = Router();

router.get('/payhere/:orderNumber/session', paymentController.payhereCheckoutSession);
router.get('/payhere/:orderNumber', paymentController.payhereCheckoutPage);
router.get('/payhere-return/:orderNumber', paymentController.payhereReturnPage);
router.post('/payhere-return/:orderNumber', paymentController.payhereReturnPage);
router.get('/webxpay/:orderNumber', paymentController.webxpayCheckoutPage);
router.get('/webxpay-return', paymentController.webxpayReturnPage);
router.post('/webxpay-return', paymentController.webxpayReturnPage);
router.get('/webxpay-return/:orderNumber', paymentController.webxpayReturnPage);
router.post('/webxpay-return/:orderNumber', paymentController.webxpayReturnPage);

export default router;
