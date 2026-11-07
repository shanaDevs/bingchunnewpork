import { Router } from 'express';
import * as storeController from '../controllers/storeController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

router.get('/', optionalAuth, storeController.getStores);
router.get('/address/autocomplete', storeController.autocompleteAddress);
router.get('/address/geocode', storeController.geocodeAddress);
router.get('/address/reverse', storeController.reverseGeocodeAddress);
router.get('/address/tiles', storeController.customerMapTiles);
router.get('/address/directions', storeController.drivingDirections);
router.get('/address/place', storeController.placeLocation);
router.post('/validate-delivery', storeController.validateDelivery);
router.get('/:id', storeController.getStore);

// Admin
router.post('/', authenticate, requirePermission('STORES', 'create'), storeController.createStore);
router.put('/:id', authenticate, requirePermission('STORES', 'update'), storeController.updateStore);
router.post('/zones', authenticate, requirePermission('STORES', 'create'), storeController.createDeliveryZone);

export default router;
