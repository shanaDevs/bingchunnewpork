import { Router } from 'express';
import { requireInternalSecret } from '../middleware/internalAuth';
import internalRoutes from './internal';

const router = Router();

// TODO(migration): mount real routes as controllers move from backend/src/controllers + lib:
//   paymentController, payherePayment, webxpayPayment -> /payments (checkout, return, notify webhooks)
//   walletController, walletService -> /wallets
//   withdrawalService -> /withdrawals
//   jasonLedgerController -> /ledger
//   platformEarningsController -> /platform-earnings
// Until migrated, bc-core keeps serving these paths directly (PAYMENT_SERVICE_ENABLED, default false).
// PayHere/WebXPay webhook URLs must be updated in their merchant dashboards only once this is live.

router.get('/status', (_req, res) => {
  res.json({
    success: true,
    data: { service: 'payment', migrated: ['internal/platform-provider-receivable'] },
  });
});

router.use('/internal', requireInternalSecret, internalRoutes);

export default router;
