import { Router } from 'express';
import * as promoController from '../controllers/promoController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { productImageUpload } from '../middleware/upload';

const router = Router();

router.get('/', promoController.getActivePromos);
router.post('/validate', optionalAuth, promoController.validatePromo);
router.post('/eligible', optionalAuth, promoController.getEligiblePromos);

// Admin
router.get('/admin/all', authenticate, requirePermission('PROMOS', 'read'), promoController.getAllPromos);
router.get('/admin/usages', authenticate, requirePermission('PROMOS', 'read'), promoController.getPromotionUsages);
router.get('/admin/discount-report', authenticate, requirePermission('PROMOS', 'read'), promoController.getPromoDiscountReport);
router.post('/admin', authenticate, requirePermission('PROMOS', 'create'), promoController.createPromo);
router.put('/admin/reorder', authenticate, requirePermission('PROMOS', 'update'), promoController.reorderPromos);
router.post('/admin/bulk-delete', authenticate, requirePermission('PROMOS', 'delete'), promoController.bulkDeletePromos);
router.post('/admin/bulk-status', authenticate, requirePermission('PROMOS', 'update'), promoController.bulkSetPromoActive);
router.put('/admin/:id', authenticate, requirePermission('PROMOS', 'update'), promoController.updatePromo);
router.delete('/admin/:id', authenticate, requirePermission('PROMOS', 'delete'), promoController.deletePromo);
router.post('/admin/upload-image', authenticate, requirePermission('PROMOS', 'create'), productImageUpload.single('image'), promoController.uploadPromoImage);

export default router;
