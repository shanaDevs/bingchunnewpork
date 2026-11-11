import { z } from 'zod';
import { WithdrawalStatus, WalletTransactionType } from '@prisma/client';

export const uuidParamSchema = z.string().uuid();

export const dateQuerySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const monthQuerySchema = z.string().regex(/^\d{4}-\d{2}$/);

export const optionalStoreIdQuerySchema = z.string().uuid().optional();

const paginationDefaults = { page: 1, limit: 20 };
const MAX_PAGE_LIMIT = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(paginationDefaults.page),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(paginationDefaults.limit),
});

export const walletWithdrawalsListQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(WithdrawalStatus).optional(),
  /** Branch ids include legacy slugs such as `store-bing-chun---moratuwa`, not only UUIDs. */
  storeId: z.string().min(1).optional(),
  id: z.string().uuid().optional(),
  from: dateQuerySchema.optional(),
  to: dateQuerySchema.optional(),
});

export const walletTransactionsQuerySchema = paginationQuerySchema.extend({
  type: z.nativeEnum(WalletTransactionType).optional(),
  direction: z.enum(['IN', 'OUT']).optional(),
  from: dateQuerySchema.optional(),
  to: dateQuerySchema.optional(),
});

export const PAYOUTS_DUE_PAGE_SIZE = 10;

export const walletPayoutsDueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(PAYOUTS_DUE_PAGE_SIZE),
  search: z.string().trim().max(120).optional(),
  from: dateQuerySchema.optional(),
  to: dateQuerySchema.optional(),
});

export const walletReportQuerySchema = z.object({
  from: dateQuerySchema.optional(),
  to: dateQuerySchema.optional(),
  storeId: z.string().uuid().optional(),
});

export const walletAnalysisQuerySchema = z.object({
  month: monthQuerySchema,
  /** Branch ids include legacy slugs such as `store-bing-chun---moratuwa`, not only UUIDs. */
  storeId: z.string().min(1).optional(),
});

export const payhereNotifyBodySchema = z.object({
  merchant_id: z.union([z.string(), z.number()]).optional(),
  order_id: z.union([z.string(), z.number()]).optional(),
  payment_id: z.union([z.string(), z.number()]).optional(),
  payhere_amount: z.union([z.string(), z.number()]).optional(),
  payhere_currency: z.string().optional(),
  status_code: z.union([z.string(), z.number()]).optional(),
  md5sig: z.string().optional(),
  status_message: z.string().optional(),
});

export const loyaltySummaryQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
});
