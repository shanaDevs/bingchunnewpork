import { Router } from 'express';
import { authenticate, requireActiveCustomer, requireSystemAdmin } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import * as loyaltyController from '../controllers/loyaltyController';
import * as loyaltyCampaignController from '../controllers/loyaltyCampaignController';

const router = Router();

router.get('/summary', authenticate, requireActiveCustomer, loyaltyController.getLoyaltySummary);

router.get(
  '/campaign',
  authenticate,
  requirePermission('PROMOS', 'read'),
  requireSystemAdmin,
  loyaltyCampaignController.getLoyaltyCampaignAdmin,
);
router.put(
  '/campaign',
  authenticate,
  requirePermission('PROMOS', 'update'),
  requireSystemAdmin,
  loyaltyCampaignController.upsertLoyaltyCampaignAdmin,
);
router.delete(
  '/campaign',
  authenticate,
  requirePermission('PROMOS', 'update'),
  requireSystemAdmin,
  loyaltyCampaignController.deleteBranchLoyaltyOverride,
);

export default router;
