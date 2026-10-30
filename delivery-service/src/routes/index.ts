import { Router } from 'express';
import jobsRoutes from './jobs';
import ordersRoutes from './orders';
import authRoutes from './auth';
import meRoutes from './me';
import locationsRoutes from './locations';
import routeRoutes from './route';
import internalRoutes from './internal';
import adminRoutes from './admin';
import { authenticateAdmin, requireAdmin } from '../middleware/adminBackendAuth';

const router = Router();

router.use('/jobs', jobsRoutes);
router.use('/orders', ordersRoutes);
router.use('/auth', authRoutes);
router.use('/me', meRoutes);
router.use('/locations', locationsRoutes);
router.use('/route', routeRoutes);
router.use('/internal', internalRoutes);
router.get('/admin/health', (_req, res) => {
  res.json({ success: true, service: 'delivery-admin', status: 'ok' });
});
router.use('/admin', authenticateAdmin, requireAdmin, adminRoutes);

export default router;
