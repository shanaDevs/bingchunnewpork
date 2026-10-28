import { Router } from 'express';
import * as addressController from '../controllers/addressController';
import { authenticate, requireActiveCustomer } from '../middleware/auth';

const router = Router();

router.use(authenticate, requireActiveCustomer);
router.get('/', addressController.getAddresses);
router.post('/', addressController.createAddress);
router.put('/:id', addressController.updateAddress);
router.delete('/:id', addressController.deleteAddress);

export default router;
