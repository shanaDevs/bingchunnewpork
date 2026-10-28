import { Router } from 'express';
import { authenticate, requireActiveCustomer } from '../middleware/auth';
import { requireInternalSecret } from '../middleware/internalAuth';
import { reservationCheckoutRateLimiter } from '../middleware/rateLimiter';
import {
  checkoutHandler,
  createReservationHandler,
  deleteReservationHandler,
  expireReservationsHandler,
  getAvailableStockHandler,
  getBatchAvailableStockHandler,
  paymentFailureHandler,
  paymentSuccessHandler,
  reservationStatusHandler,
} from '../controllers/inventoryReservationController';

const router = Router();

router.get('/availability', getAvailableStockHandler);
router.get('/availability/batch', getBatchAvailableStockHandler);
router.get('/reservations/:uuid', authenticate, requireActiveCustomer, reservationStatusHandler);
router.post('/reservations', reservationCheckoutRateLimiter, authenticate, requireActiveCustomer, createReservationHandler);
router.post('/checkout', reservationCheckoutRateLimiter, authenticate, requireActiveCustomer, checkoutHandler);
router.post('/reservations/payment-success', requireInternalSecret, paymentSuccessHandler);
router.post('/reservations/payment-failure', requireInternalSecret, paymentFailureHandler);
router.post('/reservations/expire', requireInternalSecret, expireReservationsHandler);
router.delete('/reservations/:uuid', authenticate, requireActiveCustomer, deleteReservationHandler);

export default router;
