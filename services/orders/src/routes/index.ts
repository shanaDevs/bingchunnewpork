import { Router } from 'express';

const router = Router();

// TODO(migration): mount real routes as controllers move from backend/src/controllers + lib:
//   orderController, orderSchema, orderPlacement, orderPlacementReversal, orderCancel -> /orders
//   inventoryReservationController -> /inventory
//   refundController -> /refunds
//   invoiceController -> /invoices
//   takeawayQueue -> internal cron
// Until migrated, bc-core keeps serving these paths directly (ORDER_SERVICE_ENABLED, default false).
// Socket events must be republished through Redis so customers tracking on bc-core's socket
// server still receive updates once this moves (see @socket.io/redis-adapter in docs/28).

router.get('/status', (_req, res) => {
  res.json({ success: true, data: { service: 'orders', migrated: [] } });
});

export default router;
