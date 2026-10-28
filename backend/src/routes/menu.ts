import { Router } from 'express';
import * as menuController from '../controllers/menuController';
import * as dailySpecialController from '../controllers/dailySpecialController';
import { authenticate, optionalAuth, requireAdmin, requireSystemAdmin } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { productImageUpload } from '../middleware/upload';

const router = Router();

router.get('/categories', menuController.getCategories);
router.get('/toppings', menuController.getToppings);
router.post('/toppings', authenticate, requirePermission('MENU', 'create'), menuController.createTopping);
router.put('/toppings/:id', authenticate, requirePermission('MENU', 'update'), menuController.updateTopping);
router.delete('/toppings/:id', authenticate, requirePermission('MENU', 'delete'), menuController.deleteTopping);
router.post('/toppings/bulk-assign', authenticate, requirePermission('MENU', 'update'), menuController.bulkAssignToppings);
router.get('/products', optionalAuth, menuController.getProducts);
router.get('/products/:id/ratings', menuController.getProductRatings);
router.post('/products/:id/rating', optionalAuth, menuController.submitProductRating);
router.get('/products/:id', optionalAuth, menuController.getProduct);
router.get('/specials/today', dailySpecialController.getTodaySpecial);
router.get('/specials', authenticate, requirePermission('MENU', 'read'), dailySpecialController.listSpecials);
router.post('/specials', authenticate, requirePermission('MENU', 'create'), dailySpecialController.createSpecial);
router.put('/specials/:id', authenticate, requirePermission('MENU', 'update'), dailySpecialController.updateSpecial);
router.delete('/specials/:id', authenticate, requirePermission('MENU', 'delete'), dailySpecialController.deleteSpecial);

// Admin
router.post('/categories', authenticate, requirePermission('MENU', 'create'), menuController.createCategory);
router.put('/categories/:id', authenticate, requirePermission('MENU', 'update'), menuController.updateCategory);
router.post('/products/upload', authenticate, requirePermission('MENU', 'create'), requireSystemAdmin, productImageUpload.single('image'), menuController.uploadProductImage);
router.post('/products', authenticate, requirePermission('MENU', 'create'), requireSystemAdmin, menuController.createProduct);
router.put('/products/:id', authenticate, requirePermission('MENU', 'update'), requireSystemAdmin, menuController.updateProduct);
router.delete('/products/:id', authenticate, requirePermission('MENU', 'delete'), requireSystemAdmin, menuController.deleteProduct);

export default router;
