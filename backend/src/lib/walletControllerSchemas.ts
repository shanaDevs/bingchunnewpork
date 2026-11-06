import { z } from 'zod';
import { PAYOUT_PERIOD_DAYS } from './withdrawalService';
import { zLkrToCentsInput } from './moneyDecimal';

const periodDaysSchema = z.coerce.number().refine((n) => (PAYOUT_PERIOD_DAYS as readonly number[]).includes(n), {
  message: `periodDays must be one of: ${PAYOUT_PERIOD_DAYS.join(', ')}`,
});

export const adminPinField = z.string().min(1, 'PIN is required');

export const walletPinSchema = z.object({
  password: adminPinField,
});

/** Settle preview (query) and settle body share the same date range fields. */
export const settleRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(500).optional(),
});

export const settleWalletBodySchema = settleRangeSchema.extend({
  password: adminPinField,
});

function superRefineCheckPaymentFields(
  data: { paymentMethod: string; checkNumber?: string | null; checkDate?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.paymentMethod !== 'CHECK') return;
  if (!data.checkNumber?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Check number is required',
      path: ['checkNumber'],
    });
  }
  if (!data.checkDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Check date is required',
      path: ['checkDate'],
    });
  }
}

export const adjustSchema = z.object({
  type: z.enum(['ADJUSTMENT', 'PAYOUT', 'REFUND', 'CREDIT', 'DEBIT']),
  amount: z.number().int().positive(),
  description: z.string().trim().min(1, 'A reason is required').max(500),
  reference: z.string().max(255).optional(),
  isCredit: z.boolean().optional(),
  direction: z.enum(['IN', 'OUT']).optional(),
  password: z.string().min(1, 'PIN is required'),
});

export const withdrawalRequestSchema = z.object({
  amount: zLkrToCentsInput(z).pipe(z.number().int().positive()),
  periodDays: periodDaysSchema,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  remarks: z.string().max(500).optional(),
  isAdvance: z.boolean().optional().default(false),
  /** Admin password (PIN) — required to initiate a payout request. */
  password: adminPinField,
});

export const withdrawalRejectSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const netPreviewQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodDays: z.coerce.number().optional(),
  storeId: z.string().min(1).optional(),
});

export const approveWithdrawalBodySchema = z
  .object({
    paymentMethod: z.enum(['BANK_TRANSFER', 'CASH', 'CHECK']),
    checkNumber: z.string().max(64).optional(),
    checkDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** Admin password (PIN) — required to approve a payout request. */
    password: adminPinField,
  })
  .superRefine(superRefineCheckPaymentFields);

export const initiatePayoutBodySchema = z
  .object({
    amount: zLkrToCentsInput(z).pipe(z.number().int().positive()),
    periodDays: periodDaysSchema,
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    remarks: z.string().max(500).optional(),
    isAdvance: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .optional()
      .transform((v) => v === true || v === 'true'),
    paymentMethod: z.enum(['BANK_TRANSFER', 'CASH', 'CHECK']),
    checkNumber: z.string().max(64).optional(),
    checkDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** Admin password (PIN) — required to initiate a direct branch payout. */
    password: adminPinField,
    /**
     * Preferred proof transport: base64 JSON (multipart to App Platform was returning
     * edge 504 before the handler ran).
     */
    proofBase64: z.string().min(8).max(6_000_000).optional(),
    proofFileName: z.string().min(1).max(255).optional(),
    proofMimeType: z.string().min(3).max(100).optional(),
  })
  .superRefine(superRefineCheckPaymentFields);

export const attachWithdrawalProofBodySchema = z.object({
  password: adminPinField,
  proofBase64: z.string().min(8).max(6_000_000),
  proofFileName: z.string().min(1).max(255).optional(),
  proofMimeType: z.string().min(3).max(100).optional(),
});

export const payoutReviewPeriodSchema = z.object({
  storeId: z.string().min(1),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const setPayoutReviewSchema = payoutReviewPeriodSchema.extend({
  inReview: z.boolean(),
});

export const payoutReviewZipSchema = z.object({
  items: z.array(payoutReviewPeriodSchema).min(1).max(40),
});
