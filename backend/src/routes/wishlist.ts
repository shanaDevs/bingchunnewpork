import { Router } from 'express';
import * as wishlistController from '../controllers/wishlistController';
import { authenticate, requireActiveCustomer } from '../middleware/auth';

const router = Router();

router.get('/shared/:token', wishlistController.getSharedWishlist);

router.use(authenticate, requireActiveCustomer);

router.get('/', wishlistController.getWishlist);
router.get('/ids', wishlistController.getWishlistIds);
router.post('/share', wishlistController.createShareLink);
router.post('/:productId', wishlistController.addToWishlist);
router.delete('/:productId', wishlistController.removeFromWishlist);

export default router;
