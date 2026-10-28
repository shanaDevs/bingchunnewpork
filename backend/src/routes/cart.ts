import { Router } from 'express';
import * as cartController from '../controllers/cartController';
import { authenticate, requireActiveCustomer } from '../middleware/auth';

const router = Router();

router.use(authenticate, requireActiveCustomer);
router.get('/', cartController.getCart);
router.post('/items', cartController.addToCart);
router.put('/items/:itemId', cartController.updateCartItem);
router.delete('/', cartController.clearCart);

export default router;
