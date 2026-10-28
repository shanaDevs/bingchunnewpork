import { Router } from 'express';
import { logger } from '../utils/logger';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'delivery-admin', status: 'ok' });
});

function mountBackendAdminDeliveryRoutes(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@bingchun/backend/dist/routes/adminDelivery');
    const adminDeliveryRoutes = mod.default ?? mod;
    router.use(adminDeliveryRoutes);
  } catch (err) {
    logger.error(
      'Failed to mount @bingchun/backend admin delivery routes — run `npm run build -w @bingchun/backend`',
      err,
    );
  }
}

mountBackendAdminDeliveryRoutes();

export default router;
