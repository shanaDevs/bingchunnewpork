import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Prisma, prisma } from '../lib/prisma';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
import {
  assertSettlementProofFile,
  requireSettlementProofUpload,
  withUploadedProofCleanup,
} from '../lib/settlementProofUpload';
import { uploadSettlementProof } from '../lib/spaces';
import { buildProofAccessResponse } from '../lib/settlementProofAccess';
import { logPinGatedDeniedIf401, logWalletSecurityEventFromRequest } from '../lib/walletSecurityAudit';
import {
  listLegacyBranchWithdrawalAuditRows,
  mergeWalletSecurityAuditRows,
} from '../lib/walletSecurityAuditLegacy';
import {
  listWalletSecurityAuditLogs,
  parseWalletSecurityAuditListQuery,
} from '../lib/walletSecurityAuditSchema';
import { z } from 'zod';
import { resolveBranchCancellationGatewayFeeLkr } from '../lib/refundPaymentStructure';
import { isWalletCreditPaymentMethod } from '../lib/orderPayment';
import { ensureWalletSettlementColumns } from '../lib/walletSchema';
import { ensureWithdrawalSchema } from '../lib/withdrawalSchema';
import {
  listWithdrawalsUnsettledForDartCodes,
} from '../lib/settlementWithdrawalQuery';
import { fetchSummarizedPaidOrderRevenue } from '../lib/walletRevenue';
import { getWalletAnalysis } from '../lib/walletAnalysis';
import { recalculateWalletBalance, syncMissingWalletPayments } from '../lib/walletSync';
import {
  centsToDecimal,
  decimalFieldToCentsNumber,
  lkrToCents,
  parseDecimalFromDb,
  zLkrToCentsInput,
} from '../lib/moneyDecimal';
import { insertWalletLedgerRow } from '../lib/walletTransactionInsert';
import { parseLockedStoreWallet, walletDataAfterBalanceDelta, walletDataAfterDebit } from '../lib/walletStoreUpdates';
import {
  serializeStoreWallet,
  serializeWalletSummary,
  serializeWalletTransaction,
  serializeWithdrawal,
  txnAmountCents,
  walletBalanceCents,
  walletTotalWithdrawnCents,
  withdrawalAmountCents,
} from '../lib/walletApiMoney';
import {
  computeBreakdownForPeriod,
  computeNetTransferableEarnings,
  enrichWalletRow,
  getBranchWalletDashboard,
  getOrCreateWallet,
  getPendingWithdrawalTotal,
  getWalletSummary,
  listCancelledByBranchRefundsForPeriod,
} from '../lib/walletService';
import {
  approveWithdrawal,
  cancelWithdrawal,
  createApprovedWithdrawalRecord,
  initiateAndApproveWithdrawal,
  listWithdrawals,
  getWithdrawalById,
  PAYOUT_PERIOD_DAYS,
  rejectWithdrawal,
  requestWithdrawal,
  validatePayoutRequest,
} from '../lib/withdrawalService';
import { verifyAdminPin } from '../lib/verifyAdminPin';
import { isBranchScopedRole, resolveBranchStoreId } from '../middleware/auth';
import { retryOnceOnDisconnect } from '../utils/prismaErrors';
import {
  analyticsCacheKey,
  invalidateAnalyticsCache,
  invalidateAnalyticsCacheByPrefix,
  withAnalyticsCache,
} from '../lib/analyticsResponseCache';
import {
  assertRangeAfterLastSettled,
  assertStoreAccess,
  buildNetPreviewResponseData,
  buildPayoutDetailData,
  buildPayoutPeriodInfoData,
  buildWalletReportPayload,
  finalizeWithdrawalWithInvoice,
  getUnsettledInRange,
  loadAdminWalletListPayload,
  listSuperAdminPayoutsDueItems,
  loadPayoutPeriodItems,
  minFromDate,
  parseOptionalWalletPeriod,
  parseSettlementCheckDate,
  parseSettlementRange,
  PAYOUT_PERIODS_CACHE_TTL_MS,
  resolveNetPreviewPeriodBounds,
  resolveScopedStoreId,
  resolveStoreId,
  toDateStr,
} from '../lib/walletControllerSupport';
import type { WithdrawalStatus } from '@prisma/client';
import {
  walletAnalysisQuerySchema,
  walletReportQuerySchema,
  walletTransactionsQuerySchema,
  walletWithdrawalsListQuerySchema,
} from '../lib/httpSchemas';

const adjustSchema = z.object({
  type: z.enum(['ADJUSTMENT', 'PAYOUT', 'REFUND', 'CREDIT', 'DEBIT']),
  amount: z.number().int().positive(),
  description: z.string().trim().min(1, 'A reason is required').max(500),
  reference: z.string().max(255).optional(),
  isCredit: z.boolean().optional(),
  direction: z.enum(['IN', 'OUT']).optional(),
  password: z.string().min(1, 'PIN is required'),
});

const settleRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(500).optional(),
});

const adminPinField = z.string().min(1, 'PIN is required');

const walletPinSchema = z.object({
  password: adminPinField,
});

const withdrawalRequestSchema = z.object({
  amount: zLkrToCentsInput(z).pipe(z.number().int().positive()),
  periodDays: z.coerce.number().refine((n) => (PAYOUT_PERIOD_DAYS as readonly number[]).includes(n), {
    message: `periodDays must be one of: ${PAYOUT_PERIOD_DAYS.join(', ')}`,
  }),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  remarks: z.string().max(500).optional(),
  isAdvance: z.boolean().optional().default(false),
  /** Admin password (PIN) — required to initiate a payout request. */
  password: adminPinField,
});

const withdrawalRejectSchema = z.object({
  reason: z.string().max(500).optional(),
});

const netPreviewQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodDays: z.coerce.number().optional(),
  storeId: z.string().min(1).optional(),
});

const approveWithdrawalBodySchema = z
  .object({
    paymentMethod: z.enum(['BANK_TRANSFER', 'CASH', 'CHECK']),
    checkNumber: z.string().max(64).optional(),
    checkDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** Admin password (PIN) — required to approve a payout request. */
    password: adminPinField,
  })
  .superRefine((data, ctx) => {
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
  });

const initiatePayoutBodySchema = z
  .object({
    amount: zLkrToCentsInput(z).pipe(z.number().int().positive()),
    periodDays: z.coerce.number().refine((n) => (PAYOUT_PERIOD_DAYS as readonly number[]).includes(n), {
      message: `periodDays must be one of: ${PAYOUT_PERIOD_DAYS.join(', ')}`,
    }),
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
  })
  .superRefine((data, ctx) => {
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
  });

export async function listWallets(req: Request, res: Response) {
  await ensureWithdrawalSchema();
  const user = req.user!;
  await resolveBranchStoreId(req);
  const dashboardPeriod = parseOptionalWalletPeriod(req);
  const data = await loadAdminWalletListPayload(user, dashboardPeriod);
  res.json({ success: true, data });
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/summary
// ──────────────────────────────────────────────────────────────────────────────
export async function getWalletSummaryHandler(req: Request, res: Response) {
  const storeId = await resolveScopedStoreId(req, req.query.storeId as string | undefined);
  if (!storeId) throw new AppError('storeId is required', 400);
  const summary = await getWalletSummary(storeId);
  res.json({ success: true, data: serializeWalletSummary(summary) });
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/payout-period-info
// ──────────────────────────────────────────────────────────────────────────────
export async function getPayoutPeriodInfoHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureWithdrawalSchema();
    const storeId = await resolveScopedStoreId(req, req.query.storeId as string | undefined);
    if (!storeId) throw new AppError('storeId is required', 400);

    const data = await buildPayoutPeriodInfoData(storeId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}


// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/payouts-due
// Super Admin queue: all elapsed unpaid branch payout periods (oldest first).
// Optional query `from`/`to` are ignored (wallet month filter does not scope this list).
// Optional `cursor` paginates active branches.
// ──────────────────────────────────────────────────────────────────────────────
function invalidateWalletPayoutsDueCache(): void {
  invalidateAnalyticsCacheByPrefix(analyticsCacheKey(['wallet-payouts-due']));
}

export async function getPayoutsDueHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== 'SYSTEM_ADMIN') throw new AppError('Forbidden', 403);

    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : undefined;

    // Schema patch once per process; do not block every page behind DDL checks.
    void ensureWithdrawalSchema().catch(() => undefined);

    // PgBouncer can drop idle sockets mid fan-out; reconnect once and retry.
    const page = await retryOnceOnDisconnect(
      async () => listSuperAdminPayoutsDueItems({ from, to, ...(cursor ? { cursor } : {}) }),
      async () => {
        await prisma.$disconnect().catch(() => undefined);
        await prisma.$connect();
      },
    );
    res.json({ success: true, data: page });
  } catch (err) {
    next(err);
  }
}


// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/payout-periods
// Branch (or scoped Super Admin) read-only 15-day period list: Paid, Pending, and in-progress current cycle.
// ──────────────────────────────────────────────────────────────────────────────
export async function getPayoutPeriodsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureWithdrawalSchema();
    const storeId = await resolveScopedStoreId(req, req.query.storeId as string | undefined);
    if (!storeId) throw new AppError('storeId is required', 400);

    const items = await withAnalyticsCache(
      analyticsCacheKey(['wallet-payout-periods', storeId]),
      () => loadPayoutPeriodItems(storeId),
      PAYOUT_PERIODS_CACHE_TTL_MS,
    );

    const data = items.map((item) => ({
      ...item,
      withdrawal: item.withdrawal ? serializeWithdrawal(item.withdrawal) : null,
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/pending-withdrawal
// ──────────────────────────────────────────────────────────────────────────────
export async function getPendingWithdrawalForSettlement(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const storeId = await resolveScopedStoreId(req, req.query.storeId as string | undefined);
    if (!storeId) throw new AppError('storeId is required', 400);

    const items = await listWithdrawalsUnsettledForDartCodes(storeId);

    res.json({
      success: true,
      data: items[0] ?? null,
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/settlement-withdrawals
// ──────────────────────────────────────────────────────────────────────────────
export async function listWithdrawalsForSettlement(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const storeId = await resolveScopedStoreId(req, req.query.storeId as string | undefined);
    if (!storeId) throw new AppError('storeId is required', 400);

    const items = await listWithdrawalsUnsettledForDartCodes(storeId);

    res.json({
      success: true,
      data: items,
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/net-preview
// ──────────────────────────────────────────────────────────────────────────────
export async function getNetPreviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = netPreviewQuerySchema.parse(req.query);
    const storeId = await resolveScopedStoreId(req, parsed.storeId);
    if (!storeId) throw new AppError('storeId is required', 400);

    const { from, to } = await resolveNetPreviewPeriodBounds(storeId, parsed);
    const data = await buildNetPreviewResponseData(storeId, from, to);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/withdrawals
// ──────────────────────────────────────────────────────────────────────────────
export async function listWithdrawalsHandler(req: Request, res: Response) {
  await ensureWithdrawalSchema();
  const {
    status,
    page,
    limit,
    storeId: queryStoreId,
    id,
    from,
    to,
  } = walletWithdrawalsListQuerySchema.parse(req.query);
  const storeId = await resolveScopedStoreId(req, queryStoreId);
  const result = await listWithdrawals({
    storeId,
    id,
    status,
    page,
    limit,
    from,
    to,
  });
  res.json({
    success: true,
    data: {
      ...result,
      items: result.items.map((w) => serializeWithdrawal(w)),
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/withdrawals/:id
// ──────────────────────────────────────────────────────────────────────────────
export async function getWithdrawalByIdHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureWithdrawalSchema();
    const id = String(req.params.id);
    const storeId = await resolveScopedStoreId(req, req.query.storeId as string | undefined);
    const withdrawal = await getWithdrawalById(id, storeId);
    if (!withdrawal) throw new AppError('Withdrawal not found', 404);
    res.json({ success: true, data: serializeWithdrawal(withdrawal) });
  } catch (err) {
    next(err);
  }
}

// GET /admin/wallet/withdrawals/:id/proof-url
export async function getWithdrawalProofUrlHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureWithdrawalSchema();
    const id = String(req.params.id);
    const storeId = await resolveScopedStoreId(req, req.query.storeId as string | undefined);
    const withdrawal = await getWithdrawalById(id, storeId);
    if (!withdrawal) throw new AppError('Withdrawal not found', 404);
    await assertStoreAccess(req, withdrawal.storeId);
    const access = await buildProofAccessResponse(withdrawal.proofUrl);
    res.json({ success: true, data: access });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /admin/wallet/verify-pin
// Pre-check admin PIN before showing the payout confirmation dialog.
// ──────────────────────────────────────────────────────────────────────────────
export async function verifyWalletPinHandler(req: Request, res: Response, next: NextFunction) {
  const user = req.user!;
  try {
    const { password } = walletPinSchema.parse(req.body ?? {});
    await verifyAdminPin(req.user?.sub, password);
    logWalletSecurityEventFromRequest(req, user, { event: 'wallet.pin.verify' });
    res.json({ success: true, data: { verified: true } });
  } catch (err) {
    logPinGatedDeniedIf401(req, user, 'wallet.pin.verify', err);
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /admin/wallet/withdrawals
// ──────────────────────────────────────────────────────────────────────────────
export async function requestWithdrawalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureWithdrawalSchema();
    const user = req.user!;
    await resolveBranchStoreId(req);
    const allowedRole = isBranchScopedRole(user.role) || user.role === 'SYSTEM_ADMIN';
    const branchRequestsBlocked =
      !config.ENABLE_BRANCH_PAYOUT_REQUESTS && user.role !== 'SYSTEM_ADMIN';
    if (!allowedRole || branchRequestsBlocked) {
      throw new AppError(
        branchRequestsBlocked
          ? 'Branch payout requests are currently disabled by the Super Admin.'
          : 'Forbidden',
        403,
      );
    }

    const storeId = user.role === 'SYSTEM_ADMIN'
      ? (req.body?.storeId as string | undefined) ?? user.storeId
      : user.storeId;
    if (!storeId) throw new AppError('Branch not linked to your account', 403);

    const data = withdrawalRequestSchema.parse(req.body ?? {});
    // Independently verify PIN on every payout request (do not trust client pre-check alone).
    await verifyAdminPin(user.sub, data.password);

    const amountCents = data.amount;

    const withdrawal = await requestWithdrawal(
      storeId,
      amountCents,
      data.remarks,
      user.sub!,
      data.periodDays as (typeof PAYOUT_PERIOD_DAYS)[number],
      data.isAdvance,
    );

    logWalletSecurityEventFromRequest(req, user, {
      event: 'wallet.withdrawal.request',
      storeId,
      amountCents,
      withdrawalId: withdrawal.id,
    });

    invalidateAnalyticsCache(analyticsCacheKey(['wallet-payout-periods', storeId]));
    invalidateWalletPayoutsDueCache();

    res.status(201).json({ success: true, data: serializeWithdrawal(withdrawal) });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /admin/wallet/withdrawals/:id/approve
// ──────────────────────────────────────────────────────────────────────────────
export function attachStoreIdFromWalletParams(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.body || typeof req.body !== 'object') {
    req.body = {};
  }
  req.body.storeId = resolveStoreId(req);
  next();
}

export async function attachWithdrawalStoreForUpload(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const withdrawal = await prisma.storeWithdrawal.findUnique({
      where: { id: req.params.id as string },
      select: { storeId: true },
    });
    if (!withdrawal) throw new AppError('Withdrawal not found', 404);
    if (!req.body || typeof req.body !== 'object') {
      req.body = {};
    }
    req.body.storeId = withdrawal.storeId;
    next();
  } catch (err) {
    next(err);
  }
}

export async function approveWithdrawalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureWithdrawalSchema();
    const user = req.user!;
    if (user.role !== 'SYSTEM_ADMIN') throw new AppError('Forbidden', 403);

    const withdrawal = await prisma.storeWithdrawal.findUnique({
      where: { id: req.params.id as string },
    });
    if (!withdrawal) throw new AppError('Withdrawal not found', 404);

    const data = approveWithdrawalBodySchema.parse(req.body ?? {});
    // Independently verify PIN before any approval side effects (upload / status change).
    await verifyAdminPin(user.sub, data.password);

    const proofUrl = await requireSettlementProofUpload(req.file, withdrawal.storeId);

    const [wallet, store, netTransferableEarnings] = await Promise.all([
      getOrCreateWallet(withdrawal.storeId),
      prisma.store.findUnique({
        where: { id: withdrawal.storeId },
        select: { name: true },
      }),
      computeNetTransferableEarnings(withdrawal.storeId),
    ]);
    const balanceBefore = walletBalanceCents(wallet);
    const totalWithdrawnBefore = walletTotalWithdrawnCents(wallet);
    const checkDate = parseSettlementCheckDate(data.paymentMethod, data.checkDate);

    const updated = await withUploadedProofCleanup(proofUrl, () =>
      approveWithdrawal(
        req.params.id as string,
        user.sub!,
        data.paymentMethod,
        proofUrl,
        {
          checkNumber: data.paymentMethod === 'CHECK' ? data.checkNumber?.trim() : null,
          checkDate,
        },
      ),
    );

    const final = await finalizeWithdrawalWithInvoice({
      storeId: withdrawal.storeId,
      storeName: store?.name ?? 'Branch',
      updated,
      paymentMethod: data.paymentMethod,
      balanceBefore,
      totalWithdrawnBefore,
      netTransferableEarnings,
    });

    logWalletSecurityEventFromRequest(req, user, {
      event: 'wallet.withdrawal.approve',
      storeId: withdrawal.storeId,
      amountCents: withdrawalAmountCents(withdrawal),
      withdrawalId: withdrawal.id,
    });

    invalidateAnalyticsCache(analyticsCacheKey(['wallet-payout-periods', withdrawal.storeId]));
    invalidateWalletPayoutsDueCache();

    res.json({ success: true, data: serializeWithdrawal(final) });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /admin/wallet/:storeId/initiate-payout
// ──────────────────────────────────────────────────────────────────────────────
export async function initiatePayoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureWithdrawalSchema();
    const user = req.user!;
    if (user.role !== 'SYSTEM_ADMIN') throw new AppError('Forbidden', 403);

    const storeId = resolveStoreId(req);
    const data = initiatePayoutBodySchema.parse(req.body ?? {});

    await verifyAdminPin(user.sub, data.password);

    const amountCents = data.amount;
    const periodDays = data.periodDays as (typeof PAYOUT_PERIOD_DAYS)[number];
    const periodBounds =
      data.from && data.to ? { from: data.from, to: data.to } : null;
    const checkDate = parseSettlementCheckDate(data.paymentMethod, data.checkDate);

    // Validate the proof file locally only — DO Spaces PutObject has been hanging long
    // enough to trip the App Platform/Cloudflare gateway before the wallet debit commits.
    const proofFile = assertSettlementProofFile(req.file);

    const [prevalidated, wallet, store] = await Promise.all([
      validatePayoutRequest(
        storeId,
        amountCents,
        periodDays,
        data.isAdvance ?? false,
        periodBounds,
      ),
      getOrCreateWallet(storeId),
      prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true },
      }),
    ]);
    const balanceBefore = walletBalanceCents(wallet);
    const totalWithdrawnBefore = walletTotalWithdrawnCents(wallet);

    // Commit the payout first with proofUrl null; attach Spaces URL after the response.
    const updated = await initiateAndApproveWithdrawal(
      storeId,
      amountCents,
      data.remarks,
      user.sub!,
      periodDays,
      data.paymentMethod,
      null,
      data.isAdvance ?? false,
      {
        checkNumber: data.paymentMethod === 'CHECK' ? data.checkNumber?.trim() : null,
        checkDate,
        ...(periodBounds ? { periodBounds } : {}),
        prevalidated,
      },
    );

    logWalletSecurityEventFromRequest(req, user, {
      event: 'wallet.payout.initiate',
      storeId,
      amountCents,
      withdrawalId: updated.id,
    });

    invalidateAnalyticsCache(analyticsCacheKey(['wallet-payout-periods', storeId]));
    invalidateWalletPayoutsDueCache();

    // Respond as soon as the payout is committed. Spaces proof + invoice PDF must not
    // hold the DO/Cloudflare gateway open (504).
    res.status(201).json({ success: true, data: serializeWithdrawal(updated) });

    void (async () => {
      let proofUrl: string | null = null;
      try {
        proofUrl = await uploadSettlementProof(
          proofFile.buffer,
          proofFile.originalname,
          proofFile.mimetype,
          storeId,
        );
        await prisma.storeWithdrawal.update({
          where: { id: updated.id },
          data: { proofUrl },
        });
      } catch (err) {
        console.error('[initiate-payout] background proof upload failed', {
          storeId,
          withdrawalId: updated.id,
          err,
        });
      }

      try {
        const netTransferableEarnings = await computeNetTransferableEarnings(storeId);
        await finalizeWithdrawalWithInvoice({
          storeId,
          storeName: store?.name ?? 'Branch',
          updated: { ...updated, proofUrl: proofUrl ?? updated.proofUrl },
          paymentMethod: data.paymentMethod,
          balanceBefore,
          totalWithdrawnBefore,
          netTransferableEarnings,
        });
      } catch (err) {
        console.error('[initiate-payout] background invoice finalize failed', {
          storeId,
          withdrawalId: updated.id,
          err,
        });
      }
    })();
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /admin/wallet/withdrawals/:id/reject
// ──────────────────────────────────────────────────────────────────────────────
export async function rejectWithdrawalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    if (user.role !== 'SYSTEM_ADMIN') throw new AppError('Forbidden', 403);

    const data = withdrawalRejectSchema.parse(req.body ?? {});
    const withdrawal = await rejectWithdrawal(
      req.params.id as string,
      user.sub!,
      data.reason,
    );
    logWalletSecurityEventFromRequest(req, user, {
      event: 'wallet.withdrawal.reject',
      storeId: withdrawal.storeId,
      amountCents: withdrawalAmountCents(withdrawal),
      withdrawalId: withdrawal.id,
      reason: data.reason,
    });

    invalidateAnalyticsCache(analyticsCacheKey(['wallet-payout-periods', withdrawal.storeId]));
    invalidateWalletPayoutsDueCache();

    res.json({ success: true, data: serializeWithdrawal(withdrawal) });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /admin/wallet/withdrawals/:id
// ──────────────────────────────────────────────────────────────────────────────
export async function cancelWithdrawalHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    await resolveBranchStoreId(req);

    const existing = await prisma.storeWithdrawal.findUnique({
      where: { id: req.params.id as string },
    });
    if (!existing) throw new AppError('Withdrawal not found', 404);
    await assertStoreAccess(req, existing.storeId);

    const withdrawal = await cancelWithdrawal(req.params.id as string, user.sub!);
    logWalletSecurityEventFromRequest(req, user, {
      event: 'wallet.withdrawal.cancel',
      storeId: withdrawal.storeId,
      amountCents: withdrawalAmountCents(withdrawal),
      withdrawalId: withdrawal.id,
    });

    invalidateAnalyticsCache(analyticsCacheKey(['wallet-payout-periods', withdrawal.storeId]));
    invalidateWalletPayoutsDueCache();

    res.json({ success: true, data: serializeWithdrawal(withdrawal) });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/:storeId
// ──────────────────────────────────────────────────────────────────────────────
export async function getWallet(req: Request, res: Response) {
  const { storeId } = req.params;
  await assertStoreAccess(req, storeId as string);

  const dashboardPeriod = parseOptionalWalletPeriod(req);
  const wallet = await getOrCreateWallet(storeId as string);
  const [pendingTotal, netTransferableEarnings, dashboard, store] = await Promise.all([
    getPendingWithdrawalTotal(storeId as string),
    computeNetTransferableEarnings(storeId as string),
    getBranchWalletDashboard(storeId as string, dashboardPeriod),
    prisma.store.findUnique({
      where: { id: storeId as string },
      select: { id: true, name: true, city: true, addressLine: true, phone: true },
    }),
  ]);

  res.json({
    success: true,
    data: {
      ...enrichWalletRow(wallet, pendingTotal, netTransferableEarnings),
      store,
      dashboard,
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/:storeId/transactions
// ──────────────────────────────────────────────────────────────────────────────
export async function getWalletTransactions(req: Request, res: Response) {
  const { storeId } = req.params;
  await assertStoreAccess(req, storeId as string);
  const { page, limit, type, direction, from, to } = walletTransactionsQuerySchema.parse(req.query);

  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    storeId: storeId as string,
    ...(type ? { type } : {}),
    ...(direction ? {
      amount: direction === 'IN' ? { gte: 0 } : { lt: 0 }
    } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  const mappedTransactions = transactions.map((t) => {
    const amountCents = txnAmountCents(t);
    return {
      ...serializeWalletTransaction(t),
      direction: amountCents >= 0 ? 'IN' : 'OUT',
    };
  });

  const paidOrderWhere = {
    storeId: storeId as string,
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const [revenue, aggOut] = await Promise.all([
    fetchSummarizedPaidOrderRevenue(paidOrderWhere),
    prisma.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { ...where, type: { in: ['REFUND', 'PAYOUT'] } } as any,
    }),
  ]);

  res.json({
    success: true,
    data: {
      transactions: mappedTransactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
      summary: {
        ...revenue,
        totalOut: String(Math.abs(decimalFieldToCentsNumber(aggOut._sum.amount))),
      },
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /admin/wallet/:storeId/adjust (SYSTEM_ADMIN only)
// ──────────────────────────────────────────────────────────────────────────────
export async function adjustWallet(req: Request, res: Response, next: NextFunction) {
  try {
  const user = req.user!;
  if (user.role !== 'SYSTEM_ADMIN') throw new AppError('Forbidden', 403);

  const { storeId } = req.params;
  const data = adjustSchema.parse(req.body);
  await verifyAdminPin(user.sub, data.password);

  const wallet = await getOrCreateWallet(storeId as string);

  // Map frontend types to database types
  let dbType: 'ADJUSTMENT' | 'PAYOUT' | 'REFUND' = 'ADJUSTMENT';
  if (data.type === 'REFUND') {
    dbType = 'REFUND';
  } else if (data.type === 'PAYOUT' || data.type === 'DEBIT') {
    dbType = 'PAYOUT';
  } else if (data.type === 'CREDIT' || data.type === 'ADJUSTMENT') {
    dbType = 'ADJUSTMENT';
  }

  // Determine direction
  let isCredit = true;
  if (data.isCredit !== undefined) {
    isCredit = data.isCredit;
  } else if (data.direction !== undefined) {
    isCredit = data.direction === 'IN';
  } else if (dbType === 'PAYOUT' || dbType === 'REFUND') {
    isCredit = false;
  }

  const delta = isCredit ? data.amount : -data.amount;
  void wallet;

  const result = await prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<Array<{ balance: unknown; totalEarnings: unknown; totalWithdrawn: unknown }>>`
      SELECT "balance", "totalEarnings", "totalWithdrawn"
      FROM "store_wallets" WHERE "storeId" = ${storeId as string} FOR UPDATE
    `;
    if (!lockedRows[0]) throw new AppError('Wallet not found', 404);
    const locked = parseLockedStoreWallet({
      balance: lockedRows[0].balance,
      totalWithdrawn: lockedRows[0].totalWithdrawn,
    });
    const currentEarnings = parseDecimalFromDb(lockedRows[0].totalEarnings);
    const currentWithdrawn = parseDecimalFromDb(lockedRows[0].totalWithdrawn);
    const next = walletDataAfterBalanceDelta(locked.balance, delta, undefined, {
      totalEarnings: currentEarnings,
      totalWithdrawn: currentWithdrawn,
    });
    if (next.balance.lt(0)) {
      throw new AppError('Insufficient wallet balance for debit', 400);
    }
    const balanceAfter = Number(next.balance.toFixed(0));
    const updatedWallet = await tx.storeWallet.update({
      where: { storeId: storeId as string },
      data: { balance: next.balance },
    });
    const txn = await tx.walletTransaction.create({
      data: {
        id: require('crypto').randomUUID(),
        storeId: storeId as string,
        type: dbType,
        amount: centsToDecimal(delta),
        balanceAfter: centsToDecimal(balanceAfter),
        description: data.description,
        reference: data.reference ?? `ADJ-${user.sub}`,
        createdById: user.sub,
      },
    });
    return { wallet: updatedWallet, transaction: txn };
  });

  await recalculateWalletBalance(storeId as string);

  logWalletSecurityEventFromRequest(req, user, {
    event: 'wallet.adjustment',
    storeId: storeId as string,
    amountCents: Math.abs(delta),
    transactionId: result.transaction.id,
    reference: result.transaction.reference,
  });

  res.json({
    success: true,
    data: {
      wallet: serializeStoreWallet(result.wallet),
      transaction: serializeWalletTransaction(result.transaction),
    },
  });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/:storeId/settle-info (SYSTEM_ADMIN only)
// ──────────────────────────────────────────────────────────────────────────────
export async function getSettleInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    if (user.role !== 'SYSTEM_ADMIN') throw new AppError('Forbidden', 403);

    await ensureWalletSettlementColumns();

    const storeId = resolveStoreId(req);
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) throw new AppError('Store not found', 404);

    const wallet = await getOrCreateWallet(storeId);
    const today = toDateStr(new Date());
    const minFrom = minFromDate(wallet.lastSettledAt ?? null);

    const earliestUnsettled = await prisma.walletTransaction.findFirst({
      where: { storeId, type: 'ORDER_PAYMENT', settledAt: null },
      orderBy: { createdAt: 'asc' },
    });

    let suggestedFrom = minFrom ?? (earliestUnsettled ? toDateStr(earliestUnsettled.createdAt) : today);
    if (suggestedFrom > today) suggestedFrom = today;

    const unsettledAgg = await prisma.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { storeId, type: 'ORDER_PAYMENT', settledAt: null },
    });

    res.json({
      success: true,
      data: {
        lastSettledAt: wallet.lastSettledAt ?? null,
        minFromDate: minFrom,
        suggestedFrom,
        suggestedTo: today,
        unsettledBalance: unsettledAgg._sum.amount ?? 0,
        currentBalance: wallet.balance,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/:storeId/settle-preview?from=&to= (SYSTEM_ADMIN only)
// ──────────────────────────────────────────────────────────────────────────────
export async function getSettlePreview(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    if (user.role !== 'SYSTEM_ADMIN') throw new AppError('Forbidden', 403);

    await ensureWalletSettlementColumns();

    const storeId = resolveStoreId(req);
    const { from, to } = settleRangeSchema.parse(req.query);

    const wallet = await getOrCreateWallet(storeId);
    assertRangeAfterLastSettled(wallet.lastSettledAt ?? null, from);
    const { fromDate, toDate } = parseSettlementRange(from, to);

    const pending = await getUnsettledInRange(storeId, fromDate, toDate);
    const amount = pending.reduce((sum, txn) => sum + txnAmountCents(txn), 0);

    res.json({
      success: true,
      data: { from, to, amount: String(amount), orderCount: pending.length },
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /admin/wallet/:storeId/settle (SYSTEM_ADMIN only)
// Settles unsettled order payments within the selected date range
// ──────────────────────────────────────────────────────────────────────────────
export async function settleWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    if (user.role !== 'SYSTEM_ADMIN') throw new AppError('Forbidden', 403);

    await ensureWalletSettlementColumns();

    const storeId = resolveStoreId(req);
    const data = settleRangeSchema.parse(req.body ?? {});
    const pin = z.object({ password: adminPinField }).parse(req.body ?? {});
    await verifyAdminPin(user.sub, pin.password);

    const wallet = await getOrCreateWallet(storeId);
    assertRangeAfterLastSettled(wallet.lastSettledAt ?? null, data.from);
    const { fromDate, toDate } = parseSettlementRange(data.from, data.to);

    const pending = await getUnsettledInRange(storeId, fromDate, toDate);
    if (pending.length === 0) {
      throw new AppError('No unsettled payments in the selected date range', 400);
    }

    const payoutAmount = pending.reduce((sum, txn) => sum + txnAmountCents(txn), 0);
    const now = new Date();
    const txnId = require('crypto').randomUUID();
    const payoutDescription =
      data.description ??
      `Settlement ${data.from} to ${data.to} — ${pending.length} order(s)`;
    const breakdown = await computeBreakdownForPeriod(storeId, data.from, data.to);

    const updatedWallet = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "store_wallets" WHERE "storeId" = ${storeId} FOR UPDATE
      `;
      const settled = await tx.walletTransaction.updateMany({
        where: { id: { in: pending.map((p) => p.id) }, settledAt: null },
        data: { settledAt: now },
      });
      if (settled.count !== pending.length) {
        throw new AppError('These payments were already settled', 409);
      }
      const lockedRows = await tx.$queryRaw<Array<{ balance: unknown; totalWithdrawn: unknown }>>`
        SELECT "balance", "totalWithdrawn" FROM "store_wallets" WHERE "storeId" = ${storeId}
      `;
      const locked = parseLockedStoreWallet({
        balance: lockedRows[0]?.balance ?? 0,
        totalWithdrawn: lockedRows[0]?.totalWithdrawn ?? 0,
      });
      const afterDebit = walletDataAfterDebit(locked, payoutAmount);
      const balanceAfter = Number(afterDebit.balance.toFixed(0));
      await tx.storeWallet.update({
        where: { storeId },
        data: {
          balance: afterDebit.balance,
          totalWithdrawn: afterDebit.totalWithdrawn,
          lastSettledAt: toDate,
        },
      });
      await tx.walletTransaction.create({
        data: {
          id: txnId,
          storeId,
          type: 'PAYOUT',
          amount: centsToDecimal(-payoutAmount),
          balanceAfter: centsToDecimal(balanceAfter),
          periodFrom: fromDate,
          periodTo: toDate,
          description: payoutDescription,
          reference: `SETTLE-${data.from}-${data.to}`,
          createdById: user.sub,
        },
      });

      await createApprovedWithdrawalRecord(
        {
          storeId,
          amount: payoutAmount,
          remarks: payoutDescription,
          requestedById: user.sub!,
          reviewedById: user.sub!,
          walletTransactionId: txnId,
          periodFrom: fromDate,
          periodTo: toDate,
          breakdown,
        },
        tx,
      );

      return tx.storeWallet.findUniqueOrThrow({ where: { storeId } });
    });

    const txn = await prisma.walletTransaction.findUniqueOrThrow({ where: { id: txnId } });

    logWalletSecurityEventFromRequest(req, user, {
      event: 'wallet.settle',
      storeId,
      amountCents: payoutAmount,
      transactionId: txnId,
      reference: txn.reference,
    });

    res.json({
      success: true,
      data: {
        wallet: serializeStoreWallet(updatedWallet),
        transaction: serializeWalletTransaction(txn),
        settledAmount: String(payoutAmount),
        orderCount: pending.length,
        from: data.from,
        to: data.to,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/report
// ──────────────────────────────────────────────────────────────────────────────
export async function getWalletReport(req: Request, res: Response) {
  await ensureWithdrawalSchema();
  const user = req.user!;
  const { from, to, storeId: filterStoreId } = walletReportQuerySchema.parse(req.query);

  const resolvedStoreId = await resolveScopedStoreId(req, filterStoreId);
  const data = await buildWalletReportPayload(user, resolvedStoreId, from, to);

  res.json({ success: true, data });
}

export async function getWalletAnalysisHandler(req: Request, res: Response) {
  const { month, storeId: queryStoreId } = walletAnalysisQuerySchema.parse(req.query);
  const resolvedStoreId = await resolveScopedStoreId(req, queryStoreId);
  const data = await getWalletAnalysis({
    monthKey: month,
    storeId: resolvedStoreId ?? null,
  });
  res.json({ success: true, data });
}

// ──────────────────────────────────────────────────────────────────────────────
// Auto-credit wallet — called internally when payment is confirmed PAID
// ──────────────────────────────────────────────────────────────────────────────
export async function creditWalletForOrder(
  orderId: string,
  storeId: string,
  amount: number,
  paymentMethod: string,
): Promise<void> {
  if (!isWalletCreditPaymentMethod(paymentMethod as any)) {
    return;
  }

  const existing = await prisma.walletTransaction.findFirst({
    where: { orderId, type: 'ORDER_PAYMENT' },
    select: { id: true },
  });
  if (existing) return;

  // Fetch full order details for a rich transaction record
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      subtotal: true,
      deliveryFee: true,
      discount: true,
      loyaltyDiscount: true,
      paymentRef: true,
      orderMode: true,
    },
  });

  const centsAmount = lkrToCents(amount);
  await getOrCreateWallet(storeId);

  const descParts = [
    `Order #${order?.orderNumber ?? orderId}`,
    order?.orderMode ? `(${order.orderMode})` : null,
    order && (order.discount + order.loyaltyDiscount) > 0
      ? `Subtotal: ${order.subtotal} · Delivery: ${order.deliveryFee} · Discount: ${order.discount + order.loyaltyDiscount}`
      : null,
    order?.paymentRef ? `Ref: ${order.paymentRef}` : null,
  ].filter(Boolean).join(' · ');

  try {
    await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<Array<{ balance: unknown; totalEarnings: unknown; totalWithdrawn: unknown }>>`
        SELECT "balance", "totalEarnings", "totalWithdrawn" FROM "store_wallets" WHERE "storeId" = ${storeId} FOR UPDATE
      `;
      if (!lockedRows[0]) throw new AppError('Wallet not found', 404);
      const bal = parseDecimalFromDb(lockedRows[0].balance);
      const earnings = parseDecimalFromDb(lockedRows[0].totalEarnings);
      const balanceAfter = bal.plus(centsToDecimal(centsAmount));
      await tx.storeWallet.update({
        where: { storeId },
        data: {
          balance: balanceAfter,
          totalEarnings: earnings.plus(centsToDecimal(centsAmount)),
        },
      });
      const ledgerId = crypto.randomUUID();
      await insertWalletLedgerRow(tx, {
        id: ledgerId,
        storeId,
        orderId,
        type: 'ORDER_PAYMENT',
        amountCents: centsAmount,
        balanceAfterCents: Number(balanceAfter.toFixed(0)),
        paymentMethod,
        paymentRef: order?.paymentRef ?? null,
        description: descParts,
        reference: order?.orderNumber ?? null,
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }

  await recalculateWalletBalance(storeId);
}

/** Cash collected at counter for items added after online payment */
export async function creditWalletAddonPayment(
  orderId: string,
  storeId: string,
  amountLkr: number,
  paymentMethod: string = 'CASH_AT_COUNTER',
): Promise<void> {
  if (amountLkr <= 0) return;

  const existing = await prisma.walletTransaction.findFirst({
    where: { orderId, type: 'ORDER_ADDON_PAYMENT' },
    select: { id: true },
  });
  if (existing) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true },
  });

  const centsAmount = lkrToCents(amountLkr);
  await getOrCreateWallet(storeId);
  const methodLabel = paymentMethod === 'CARD' ? 'card at counter' : 'cash at counter';

  try {
    await prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<Array<{ balance: unknown; totalEarnings: unknown }>>`
        SELECT "balance", "totalEarnings" FROM "store_wallets" WHERE "storeId" = ${storeId} FOR UPDATE
      `;
      if (!lockedRows[0]) throw new AppError('Wallet not found', 404);
      const bal = parseDecimalFromDb(lockedRows[0].balance);
      const earnings = parseDecimalFromDb(lockedRows[0].totalEarnings);
      const balanceAfter = bal.plus(centsToDecimal(centsAmount));
      await tx.storeWallet.update({
        where: { storeId },
        data: {
          balance: balanceAfter,
          totalEarnings: earnings.plus(centsToDecimal(centsAmount)),
        },
      });
      await tx.walletTransaction.create({
        data: {
          id: require('crypto').randomUUID(),
          storeId,
          orderId,
          type: 'ORDER_ADDON_PAYMENT',
          amount: centsToDecimal(centsAmount),
          balanceAfter,
          paymentMethod: paymentMethod as any,
          description: `Order #${order?.orderNumber ?? orderId} · add-on items (${methodLabel})`,
          reference: order?.orderNumber ?? null,
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }

  await recalculateWalletBalance(storeId);
}


// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/cancelled-by-branch-orders
// ──────────────────────────────────────────────────────────────────────────────
export async function getCancelledByBranchOrdersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = netPreviewQuerySchema.parse(req.query);
    const storeId = await resolveScopedStoreId(req, parsed.storeId);
    if (!storeId) throw new AppError('storeId is required', 400);

    const { from, to } = await resolveNetPreviewPeriodBounds(storeId, parsed);

    const refunds = await listCancelledByBranchRefundsForPeriod(storeId, from, to);

    res.json({
      success: true,
      data: {
        from,
        to,
        orderCount: refunds.length,
        totalGatewayFeeLkr: refunds.reduce(
          (sum, refund) => sum + resolveBranchCancellationGatewayFeeLkr(refund),
          0,
        ),
        orders: refunds.map((refund) => ({
          refundId: refund.id,
          orderId: refund.orderId,
          orderNumber: refund.order.orderNumber,
          additionalGatewayFeeLkr: resolveBranchCancellationGatewayFeeLkr(refund),
          completedAt: refund.paidAt ?? refund.processedAt ?? refund.updatedAt,
          processedByAdminId: refund.processedByAdminId,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/payout-detail/:transactionId
// ──────────────────────────────────────────────────────────────────────────────
export async function getPayoutDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const transactionId = req.params.transactionId as string;
    const data = await buildPayoutDetailData(transactionId);
    await assertStoreAccess(req, data.storeId);

    const { storeId: _storeId, ...payload } = data;
    res.json({ success: true, data: payload });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/payout-details?transactionIds=id1,id2,...
// ──────────────────────────────────────────────────────────────────────────────
export async function getPayoutDetailsBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = String(req.query.transactionIds ?? '').trim();
    if (!raw) {
      res.json({ success: true, data: [] });
      return;
    }

    const transactionIds = [
      ...new Set(
        raw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ].slice(0, 50);

    const results: Awaited<ReturnType<typeof buildPayoutDetailData>>[] = [];
    for (const transactionId of transactionIds) {
      try {
        const detail = await buildPayoutDetailData(transactionId);
        await assertStoreAccess(req, detail.storeId);
        results.push(detail);
      } catch (err) {
        // Skip individual failures so one missing payout does not break the appendix
        if (err instanceof AppError && (err.statusCode === 404 || err.statusCode === 400)) {
          continue;
        }
        throw err;
      }
    }

    res.json({
      success: true,
      data: results.map(({ storeId: _storeId, ...payload }) => payload),
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /admin/wallet/security-audit-logs
// ──────────────────────────────────────────────────────────────────────────────
export async function listWalletSecurityAuditLogsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const { filters, page, limit } = parseWalletSecurityAuditListQuery(req.query);

    let storeId = filters.storeId;
    if (user.role === 'STORE_MANAGER' || user.role === 'CASHIER') {
      storeId = user.storeId ?? undefined;
    } else if (storeId) {
      await assertStoreAccess(req, storeId);
    }

    const mergeBranchHistory =
      user.role === 'SYSTEM_ADMIN' && !filters.event && !filters.from && !filters.to;

    const eventPrefixes =
      user.role === 'DELIVERY_ADMIN' && !filters.event
        ? ['delivery.', 'payment.']
        : undefined;

    const auditFetch = await listWalletSecurityAuditLogs({
      storeId,
      event: filters.event,
      eventPrefixes,
      outcome: filters.outcome,
      from: filters.from,
      to: filters.to,
      page: mergeBranchHistory ? 1 : page,
      limit: mergeBranchHistory ? 500 : limit,
    });

    let rows = auditFetch.rows;
    let total = auditFetch.total;

    if (mergeBranchHistory) {
      const legacy = await listLegacyBranchWithdrawalAuditRows(500);
      const merged = mergeWalletSecurityAuditRows(auditFetch.rows, legacy, page, limit);
      rows = merged.rows;
      total = merged.total;
    }

    res.json({
      success: true,
      data: { rows, total, page, limit },
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /admin/wallet/sync
// Reconcile missing paid-order credits; branch users are scoped to their store, system admin to all stores.
// ──────────────────────────────────────────────────────────────────────────────
export async function syncWallets(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    await resolveBranchStoreId(req);
    const scopeStoreId =
      user.role === 'SYSTEM_ADMIN' ? undefined : user.storeId ?? undefined;

    if (!scopeStoreId && user.role !== 'SYSTEM_ADMIN') {
      throw new AppError('Forbidden', 403);
    }

    const result = await syncMissingWalletPayments(scopeStoreId);
    if (scopeStoreId) {
      invalidateAnalyticsCache(analyticsCacheKey(['wallet-payout-periods', scopeStoreId]));
    } else {
      invalidateWalletPayoutsDueCache();
    }

    logWalletSecurityEventFromRequest(req, user, {
      event: 'wallet.sync',
      storeId: scopeStoreId ?? null,
      reference: result.ordersAdded > 0 ? `ordersAdded=${result.ordersAdded}` : 'no_changes',
    });

    res.json({
      success: true,
      message:
        result.ordersAdded > 0
          ? `Synced ${result.ordersAdded} paid order(s) to wallet`
          : 'Wallet is already up to date',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
