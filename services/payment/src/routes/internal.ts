import { Router } from 'express';
import { z } from 'zod';
import {
  computePlatformProviderReceivable,
  platformProviderReceivableToLkr,
} from '@bingchun/settlement';

const router = Router();

const platformProviderReceivableSchema = z.object({
  commissionFeeCents: z.number().int(),
  platformPaybackCents: z.number().int().optional(),
  loyaltyDiscountCents: z.number().int().optional(),
  sharedPromoPlatformCents: z.number().int().optional(),
  normalConvenienceFeeCents: z.number().int().optional(),
  completedRefundConvenienceFeeCents: z.number().int().optional(),
  rejectedRefundConvenienceFeeCents: z.number().int().optional(),
  refundConvenienceFeeCents: z.number().int().optional(),
  gatewayRatePct: z.number(),
});

router.post('/platform-provider-receivable', (req, res) => {
  const parsed = platformProviderReceivableSchema.parse(req.body);
  const breakdown = computePlatformProviderReceivable(parsed);
  res.json({
    success: true,
    data: {
      breakdown,
      lkr: platformProviderReceivableToLkr(breakdown),
    },
  });
});

export default router;
