import { Router } from 'express';
import * as orderController from '../controllers/orderController';
import * as messagingWebhookController from '../controllers/messagingWebhookController';
import { authenticate, requireBranchOrderWrite, optionalAuth, requireActiveCustomer, assertOrderStoreAccess } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { orderTrackRateLimiter, orderPlacementRateLimiter } from '../middleware/rateLimiter';
import { payhereNotifyIpAllowlist } from '../middleware/payhereNotifyIpAllowlist';

const router = Router();

router.post('/', orderPlacementRateLimiter, optionalAuth, orderController.placeOrder);
router.get('/my', authenticate, requireActiveCustomer, orderController.getMyOrders);
router.get('/takeaway-queue', authenticate, requirePermission('ORDERS', 'read'), orderController.listTakeawayQueue);
router.get('/cashier-activity', authenticate, requirePermission('ORDERS', 'read'), orderController.getCashierActivity);
router.put('/takeaway-queue/reorder', authenticate, requirePermission('ORDERS', 'update'), requireBranchOrderWrite, orderController.reorderTakeawayQueueHandler);
router.post('/:id/confirm-payment', orderTrackRateLimiter, optionalAuth, orderController.confirmPaymentReturn);
router.post('/:id/confirm-payhere-popup', orderTrackRateLimiter, optionalAuth, orderController.confirmPayherePopup);
router.post('/:id/rating', orderTrackRateLimiter, optionalAuth, orderController.submitPlatformRating);
router.post('/:id/rider-rating', orderTrackRateLimiter, optionalAuth, orderController.submitRiderRating);
router.post('/:id/cancel', orderTrackRateLimiter, optionalAuth, orderController.cancelOrderByCustomer);
router.get('/:id', orderTrackRateLimiter, optionalAuth, orderController.getOrder);

// Admin
router.get('/', authenticate, requirePermission('ORDERS', 'read'), orderController.getAllOrders);
router.get('/:id/conversation', authenticate, requirePermission('ORDERS', 'read'), messagingWebhookController.getOrderConversation);
router.put('/:id/status', authenticate, requirePermission('ORDERS', 'update'), requireBranchOrderWrite, orderController.updateOrderStatus);
router.patch('/:id/contact', authenticate, requirePermission('ORDERS', 'update'), requireBranchOrderWrite, orderController.updateOrderContact);
router.put('/:id/items', authenticate, requirePermission('ORDERS', 'update'), requireBranchOrderWrite, orderController.updateOrderItems);
router.post('/:id/complete-takeaway', authenticate, requirePermission('ORDERS', 'update'), requireBranchOrderWrite, orderController.completeTakeawayPickup);
router.post('/:id/collect-payment', authenticate, requirePermission('ORDERS', 'update'), requireBranchOrderWrite, orderController.collectOrderPayment);

// Payment callback (no auth, verified by signature; optional PAYHERE_NOTIFY_IP_ALLOWLIST)
router.post('/payment-notify', payhereNotifyIpAllowlist, orderController.paymentNotify);

export default router;
