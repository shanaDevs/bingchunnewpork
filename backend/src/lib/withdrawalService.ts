import crypto from 'crypto';
import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';
import {
  getOrCreateWallet,
  getWalletSummary,
  withdrawableAllTimeBalanceCents,
  type PeriodBreakdown,
} from './walletService';
import { creditPlatformEarning } from './platformEarningsService';
import { ensurePlatformEarningsSchema } from './platformEarningsSchema';
import { ensurePlatformPaybackSchema } from './platformPaybackSchema';
import { buildPeriodChannelPreview, channelPreviewFromPeriodBreakdown } from './periodChannelPreview';
import { sumFirstPayoutOnlineWalletBaseFromBreakdown } from './commission';
import {
  computeFinalPayoutAmountCents,
  parseSharedPromoFromBreakdown,
  resolveFinalPayoutAmountFromBreakdown,
} from './sharedPromoContribution';
import { insertWalletLedgerRow } from './walletTransactionInsert';
import { resolvePlatformProviderReceivableFromBreakdown } from '../internal/paymentClient';
import {
  assertJasonBalanceCoversContribution,
  computeJasonNetBalance,
} from './jasonBalance';
import type {
  Prisma,
  SettlementPaymentMethod,
  StoreWithdrawal,
  WithdrawalStatus,
} from '@prisma/client';
import { centsToDecimal } from './moneyDecimal';
import { withdrawalAmountCents } from './walletApiMoney';
import {
  lockStoreWallet,
  walletDataAfterDebit,
} from './walletStoreUpdates';
import { toUtcDateStr, todayUtcDateStr } from './utcDateString';
import {
  computePeriodBreakdownForPayout,
  computePeriodNetAmountCents,
  resolveCycleContextForWindow,
} from './withdrawalPeriodNet';
import { runWithdrawalApprovalSideEffects } from './withdrawalApprovalSideEffects';
import {
  getNextPayoutStartDate,
  isValidPayoutPeriodDays,
  listElapsedPayoutWindows,
  PAYOUT_PERIOD_DAYS,
  resolvePayoutPeriod,
  type PayoutPeriodDays,
} from './withdrawalPayoutPeriod';

export {
  PAYOUT_PERIOD_DAYS,
  type PayoutPeriodDays,
  type ResolvedPayoutPeriod,
  addDaysToDateStr,
  todayDateStr,
  resolvePayoutPeriod,
  resolvePayoutPeriodOptions,
  resolveOpenRollingPayoutWindow,
  listDuePayoutStoreIds,
  buildElapsedPayoutWindowsFromStart,
  listElapsedPayoutWindows,
  isCalendarPeriodStart,
  getCalendarPeriodEnd,
  getPayoutPeriodEndDate,
  getNextPayoutStartDate,
} from './withdrawalPayoutPeriod';

type LockedStoreWithdrawal = {
  id: string;
  status: WithdrawalStatus;
};

/** Serialize approval for one withdrawal row. Must run inside the caller's transaction. */
async function lockStoreWithdrawal(
  tx: Prisma.TransactionClient,
  withdrawalId: string,
): Promise<LockedStoreWithdrawal> {
  const rows = await tx.$queryRaw<Array<{ id: string; status: WithdrawalStatus }>>`
    SELECT "id", "status"
    FROM "store_withdrawals"
    WHERE "id" = ${withdrawalId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new AppError('Withdrawal not found', 404);
  return row;
}

export type CreateApprovedWithdrawalInput = {
  storeId: string;
  amount: number;
  remarks?: string | null;
  requestedById: string;
  reviewedById: string;
  walletTransactionId: string;
  periodFrom?: Date | null;
  periodTo?: Date | null;
  breakdown?: unknown;
};

export async function listWithdrawals(opts: {
  storeId?: string;
  status?: WithdrawalStatus;
  id?: string;
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}) {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const skip = (page - 1) * limit;

  const createdAt =
    opts.from || opts.to
      ? {
          ...(opts.from ? { gte: new Date(`${opts.from}T00:00:00.000Z`) } : {}),
          ...(opts.to ? { lte: new Date(`${opts.to}T23:59:59.999Z`) } : {}),
        }
      : undefined;

  const where = {
    ...(opts.id ? { id: opts.id } : {}),
    ...(opts.storeId ? { storeId: opts.storeId } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.storeWithdrawal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.storeWithdrawal.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getWithdrawalById(id: string, storeId?: string) {
  return prisma.storeWithdrawal.findFirst({
    where: {
      id,
      ...(storeId ? { storeId } : {}),
    },
  });
}

const PENDING_WITHDRAWAL_UNIQUE = 'withdrawal_one_pending_per_store';

function isPendingWithdrawalUniqueViolation(err: unknown): boolean {
  const prismaErr = err as { code?: string; meta?: { target?: string | string[] } };
  if (prismaErr.code !== 'P2002') return false;
  const target = prismaErr.meta?.target;
  if (!target) return true;
  const fields = Array.isArray(target) ? target : [target];
  return fields.some((field) => String(field).includes(PENDING_WITHDRAWAL_UNIQUE));
}

export async function requestWithdrawal(
  storeId: string,
  amount: number,
  remarks: string | undefined,
  requestedById: string,
  periodDays: PayoutPeriodDays,
  isAdvance = false,
): Promise<StoreWithdrawal> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { isActive: true },
  });
  if (!store?.isActive) {
    throw new AppError('This branch is deactivated and cannot request withdrawals', 403);
  }

  const { fromStr, toStr, breakdown } = await validatePayoutRequest(
    storeId,
    amount,
    periodDays,
    isAdvance,
  );

  try {
    return await prisma.storeWithdrawal.create({
      data: {
        id: crypto.randomUUID(),
        storeId,
        amount: centsToDecimal(amount),
        status: 'PENDING',
        remarks: remarks?.trim() || null,
        periodFrom: new Date(`${fromStr}T00:00:00.000Z`),
        periodTo: new Date(`${toStr}T23:59:59.999Z`),
        requestedById,
        isAdvance,
        breakdown,
        cycleStage: breakdown.cycleStage ?? 'FIRST',
        cyclePairId: breakdown.cyclePairId ?? null,
      },
    });
  } catch (err) {
    if (isPendingWithdrawalUniqueViolation(err)) {
      throw new AppError('A pending withdrawal already exists for this branch', 409);
    }
    throw err;
  }
}

type StoredWithdrawalBreakdown = PeriodBreakdown & {
  /** Locked calculated period net at request time (cents). Same as netAmount. */
  periodNetAmount: number;
  /** Branch wallet request submitted on Request (cents). */
  branchRequestNetAmount: number;
  channelBreakdown: Awaited<ReturnType<typeof buildPeriodChannelPreview>>['breakdown'];
  /** Locked 4-step platform provider receivable at request time. */
  platformProviderReceivable: Awaited<
    ReturnType<typeof resolvePlatformProviderReceivableFromBreakdown>
  >;
};

/** Keys locked in the withdrawal JSON snapshot for Super Admin approval display. */
const WITHDRAWAL_SNAPSHOT_NUMERIC_KEYS = [
  'customerLateCancelSubtotal',
  'customerLateCancelGatewayDeduction',
  'customerLateCancelNetAmount',
  'refundConvenienceFee',
  'refundDeliveryFee',
  'rejectedRefundSubtotal',
  'rejectedRefundGatewayDeduction',
  'rejectedRefundNetAmount',
  'rejectedRefundConvenienceFee',
  'rejectedRefundDeliveryFee',
  'gatewayRatePct',
  'gatewayRate',
  'periodLoyaltyDiscountTotal',
] as const satisfies readonly (keyof PeriodBreakdown)[];

/** Jason discounts are funded by Jason's investment — do not debit them from the branch online wallet. */
function onlineWalletDebitCentsFromRequestedAmount(
  amountCents: number,
  periodNetCents: number,
  jasonCents: number,
): number {
  const jason = Math.max(0, jasonCents);
  if (jason > 0 && Math.abs(amountCents - periodNetCents) <= 1) {
    return Math.max(0, amountCents - jason);
  }
  return amountCents;
}

function assertWithdrawalBreakdownSnapshot(period: PeriodBreakdown): void {
  for (const key of WITHDRAWAL_SNAPSHOT_NUMERIC_KEYS) {
    const value = period[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Payout breakdown snapshot missing ${key}`);
    }
  }
}

/** Build the JSON snapshot stored on StoreWithdrawal (request + approve flows). */
export async function buildStoredWithdrawalBreakdown(
  period: PeriodBreakdown,
  channelBreakdown: Awaited<ReturnType<typeof buildPeriodChannelPreview>>['breakdown'],
  opts?: { branchRequestAmountCents?: number },
): Promise<StoredWithdrawalBreakdown> {
  assertWithdrawalBreakdownSnapshot(period);
  const branchRequestAmountCents = opts?.branchRequestAmountCents ?? period.netAmount;
  /**
   * Net payout (final pay) for payables / branch receivable must follow the server period
   * breakdown — especially `period.netAmount` after `refreshSecondPayoutGatewayAndNet` — plus
   * Jason top-up. Do not derive this from the client-submitted wallet-debit (`branchRequest`);
   * Initiate Payout can send a rounded branch-wallet line that is not identical to stored net.
   */
  const netCents = Math.round(period.netAmount);
  const jasonCents = period.sharedPromoJasonContributionAmount ?? 0;
  /** Payout 2 period net already includes Jason in the walkthrough — do not add it again. */
  const finalPayoutAmount =
    period.cycleStage === 'SECOND'
      ? netCents
      : computeFinalPayoutAmountCents(netCents, jasonCents);
  const platformProviderReceivable = await resolvePlatformProviderReceivableFromBreakdown(period);
  const { channelBreakdown: _ignoredChannelBreakdown, ...periodFields } = period;
  const firstPayoutOnlineSubtotalCents =
    period.cycleStage === 'FIRST'
      ? Math.round(sumFirstPayoutOnlineWalletBaseFromBreakdown(channelBreakdown) * 100)
      : period.cycleStage === 'SECOND' && period.priorOnlineWalletAmountCents != null
        ? period.priorOnlineWalletAmountCents
        : undefined;
  return {
    ...periodFields,
    periodNetAmount: period.netAmount,
    branchRequestNetAmount: branchRequestAmountCents,
    finalPayoutAmount,
    channelBreakdown,
    platformProviderReceivable,
    ...(firstPayoutOnlineSubtotalCents != null
      ? { firstPayoutOnlineSubtotalCents }
      : {}),
  };
}

export type PayoutPeriodBounds = { from: string; to: string };

async function resolveValidatedPayoutBounds(
  storeId: string,
  periodDays: PayoutPeriodDays,
  periodBounds?: PayoutPeriodBounds | null,
): Promise<{ fromStr: string; toStr: string }> {
  const today = todayUtcDateStr();
  let fromStr: string;
  let toStr: string;

  if (periodBounds?.from && periodBounds?.to) {
    fromStr = periodBounds.from;
    toStr = periodBounds.to;
    if (fromStr > toStr) {
      throw new AppError('Start date must be on or before end date', 400);
    }
  } else {
    const resolved = await resolvePayoutPeriod(storeId, periodDays);
    fromStr = resolved.from;
    toStr = resolved.to;
  }

  if (toStr > today) {
    throw new AppError('Payout period cannot be in the future', 400);
  }

  const nextStart = await getNextPayoutStartDate(storeId);
  if (nextStart && fromStr !== nextStart) {
    throw new AppError(
      `Payout period must start on ${nextStart} (the day after your last payout request).`,
      400,
    );
  }

  if (periodBounds?.from && periodBounds?.to) {
    const elapsed = await listElapsedPayoutWindows(storeId, periodDays, 24);
    const eligible = elapsed.some((window) => window.from === fromStr && window.to === toStr);
    if (!eligible) {
      throw new AppError('Selected payout period is not eligible for settlement', 400);
    }
  }

  return { fromStr, toStr };
}

export async function validatePayoutRequest(
  storeId: string,
  amount: number,
  periodDays: PayoutPeriodDays,
  isAdvance: boolean,
  periodBounds?: PayoutPeriodBounds | null,
): Promise<{
  fromStr: string;
  toStr: string;
  breakdown: StoredWithdrawalBreakdown;
  remainingAvailableCents: number;
}> {
  if (amount <= 0) throw new AppError('Withdrawal amount must be greater than zero', 400);

  if (!isValidPayoutPeriodDays(periodDays)) {
    throw new AppError(`Invalid payout period. Choose one of: ${PAYOUT_PERIOD_DAYS.join(', ')} days`, 400);
  }

  const { fromStr, toStr } = await resolveValidatedPayoutBounds(storeId, periodDays, periodBounds);
  const cycle = await resolveCycleContextForWindow(storeId, fromStr, toStr);

  const [walletSummary, periodWithDiscountReport] = await Promise.all([
    getWalletSummary(storeId),
    computePeriodBreakdownForPayout(storeId, fromStr, toStr, cycle),
  ]);
  const channelPreview = channelPreviewFromPeriodBreakdown(
    periodWithDiscountReport,
    fromStr,
    toStr,
  );
  const remainingAvailableCents = withdrawableAllTimeBalanceCents(
    walletSummary.allTimeAvailableBalanceCents,
    walletSummary.pendingWithdrawalTotal,
  );
  const periodNet = periodWithDiscountReport.netAmount;
  const jasonCents = periodWithDiscountReport.sharedPromoJasonContributionAmount ?? 0;
  const onlineWalletDebitCents = onlineWalletDebitCentsFromRequestedAmount(
    amount,
    periodNet,
    jasonCents,
  );
  if (onlineWalletDebitCents > remainingAvailableCents) {
    throw new AppError(
      `Insufficient available balance. Available: LKR ${(remainingAvailableCents / 100).toFixed(2)}`,
      400,
    );
  }

  const PAYOUT_AMOUNT_TOLERANCE_CENTS = 1;
  if (!isAdvance && amount > periodNet + PAYOUT_AMOUNT_TOLERANCE_CENTS) {
    throw new AppError(
      `Amount exceeds net for the selected period (LKR ${(periodNet / 100).toFixed(2)}). Enable "custom amount" to request an advance.`,
      400,
    );
  }

  return {
    fromStr,
    toStr,
    remainingAvailableCents,
    breakdown: await buildStoredWithdrawalBreakdown(
      periodWithDiscountReport,
      channelPreview.breakdown,
      {
        branchRequestAmountCents: amount,
      },
    ),
  };
}

export type ValidatedPayoutRequest = Awaited<ReturnType<typeof validatePayoutRequest>>;

function resolveCheckPaymentFields(
  paymentMethod: SettlementPaymentMethod,
  extras?: ApproveWithdrawalExtras,
): { checkNumber: string | null; checkDate: Date | null } {
  if (paymentMethod !== 'CHECK') {
    return { checkNumber: null, checkDate: null };
  }
  return {
    checkNumber: extras?.checkNumber?.trim() || null,
    checkDate: extras?.checkDate ?? null,
  };
}

export async function initiateAndApproveWithdrawal(
  storeId: string,
  amount: number,
  remarks: string | undefined,
  initiatorId: string,
  periodDays: PayoutPeriodDays,
  paymentMethod: SettlementPaymentMethod,
  proofUrl: string | null,
  isAdvance = false,
  extras?: ApproveWithdrawalExtras & { prevalidated?: ValidatedPayoutRequest },
): Promise<StoreWithdrawal> {
  // Prefer caller-supplied validation (allows Spaces upload to run in parallel).
  const { fromStr, toStr, breakdown, remainingAvailableCents } =
    extras?.prevalidated ??
    (await validatePayoutRequest(
      storeId,
      amount,
      periodDays,
      isAdvance,
      extras?.periodBounds ?? null,
    ));
  const periodFrom = new Date(`${fromStr}T00:00:00.000Z`);
  const periodTo = new Date(`${toStr}T23:59:59.999Z`);

  const sppc = parseSharedPromoFromBreakdown(breakdown);
  const sppcJasonCents = sppc.sharedPromoJasonContributionAmount;
  const paymentCents = resolveFinalPayoutAmountFromBreakdown(breakdown, amount);
  const onlineWalletDebitCents = onlineWalletDebitCentsFromRequestedAmount(
    amount,
    breakdown.netAmount,
    sppcJasonCents,
  );
  const jasonNet = await computeJasonNetBalance();
  assertJasonBalanceCoversContribution(jasonNet, sppcJasonCents);

  const withdrawalId = crypto.randomUUID();
  const txnId = crypto.randomUUID();
  const now = new Date();
  const { checkNumber: checkNum, checkDate: checkDt } = resolveCheckPaymentFields(paymentMethod, extras);

  await ensurePlatformEarningsSchema();

  // Reuse the pre-txn availability check inside the lock — do not recompute
  // period nets under FOR UPDATE (that path timed out the DO/Cloudflare gateway).
  const availableCents = remainingAvailableCents;
  const approvedWithdrawal = await prisma.$transaction(async (tx) => {
    const locked = await lockStoreWallet(tx, storeId);
    if (onlineWalletDebitCents > availableCents) {
      throw new AppError(
        `Insufficient available balance. Available: LKR ${(availableCents / 100).toFixed(2)}`,
        400,
      );
    }
    const afterDebit = walletDataAfterDebit(locked, onlineWalletDebitCents);
    const lockedBalance = Number(afterDebit.balance.toFixed(0));

    await createApprovalWalletLedgerEntries(tx, {
      storeId,
      walletBalanceAfterDebit: lockedBalance,
      paymentCents,
      sppcJasonCents,
      payoutTxnId: txnId,
      payoutDescription: remarks?.trim() || 'Branch withdrawal',
      payoutReference: `WD-${withdrawalId.slice(0, 8)}`,
      createdById: initiatorId,
    });

    await tx.storeWallet.update({
      where: { storeId },
      data: {
        balance: afterDebit.balance,
        totalWithdrawn: afterDebit.totalWithdrawn,
      },
    });

    // Single create (APPROVED) — avoids create-then-update P2025 under PgBouncer
    // when an interactive transaction briefly loses the row mid-flight.
    // walletTransactionId FK requires PAYOUT row above to exist first.
    await tx.storeWithdrawal.create({
      data: {
        id: withdrawalId,
        storeId,
        amount: centsToDecimal(amount),
        status: 'APPROVED',
        remarks: remarks?.trim() || null,
        periodFrom,
        periodTo,
        requestedById: initiatorId,
        reviewedById: initiatorId,
        reviewedAt: now,
        walletTransactionId: txnId,
        paymentMethod,
        proofUrl,
        checkNumber: checkNum,
        checkDate: checkDt,
        isAdvance,
        breakdown,
        cycleStage: breakdown.cycleStage ?? 'FIRST',
        cyclePairId: breakdown.cyclePairId ?? null,
      },
    });

    return tx.storeWithdrawal.findUniqueOrThrow({
      where: { id: withdrawalId },
    });
  });

  await runWithdrawalApprovalSideEffects({
    approvedWithdrawal,
    storeId,
    sppcJasonCents,
    reviewerId: initiatorId,
  });

  return approvedWithdrawal;
}

export type ApproveWithdrawalExtras = {
  checkNumber?: string | null;
  checkDate?: Date | null;
  /** Super Admin initiate from Payouts Due — settle this exact elapsed window. */
  periodBounds?: PayoutPeriodBounds;
};

function resolveApprovalPayoutAmounts(withdrawal: StoreWithdrawal): {
  walletDebitCents: number;
  paymentCents: number;
  sppcPlatformCents: number;
  sppcJasonCents: number;
} {
  const walletDebitCents = withdrawalAmountCents(withdrawal);
  const paymentCents = resolveFinalPayoutAmountFromBreakdown(
    withdrawal.breakdown,
    walletDebitCents,
  );
  const sppc = parseSharedPromoFromBreakdown(withdrawal.breakdown);
  return {
    walletDebitCents,
    paymentCents,
    sppcPlatformCents: sppc.sharedPromoPlatformContributionAmount,
    sppcJasonCents: sppc.sharedPromoJasonContributionAmount,
  };
}

type ApprovalWalletLedgerInput = {
  storeId: string;
  walletBalanceAfterDebit: number;
  paymentCents: number;
  sppcJasonCents: number;
  payoutTxnId: string;
  payoutDescription: string;
  payoutReference: string;
  createdById: string;
};

/** Recompute period net at approval time (same pipeline as validatePayoutRequest). */
async function assertLivePeriodNetCoversWithdrawal(withdrawal: StoreWithdrawal): Promise<void> {
  if (withdrawal.isAdvance) return;
  if (!withdrawal.periodFrom || !withdrawal.periodTo) return;

  const withdrawalCents = withdrawalAmountCents(withdrawal);
  const fromStr = toUtcDateStr(withdrawal.periodFrom);
  const toStr = toUtcDateStr(withdrawal.periodTo);
  const liveNet = await computePeriodNetAmountCents(withdrawal.storeId, fromStr, toStr);
  if (withdrawalCents > liveNet) {
    throw new AppError(
      'Live net for this period is lower than the requested amount. Reject and request again.',
      400,
    );
  }
}

async function createApprovalWalletLedgerEntries(
  tx: Prisma.TransactionClient,
  input: ApprovalWalletLedgerInput,
): Promise<void> {
  const shared = {
    storeId: input.storeId,
    reference: input.payoutReference,
    createdById: input.createdById,
  };

  if (input.sppcJasonCents > 0) {
    await insertWalletLedgerRow(tx, {
      ...shared,
      id: crypto.randomUUID(),
      type: 'ADJUSTMENT',
      amountCents: input.sppcJasonCents,
      balanceAfterCents: input.walletBalanceAfterDebit + input.sppcJasonCents,
      description: 'Shared promo platform contribution (Jason top-up)',
    });
  }

  await insertWalletLedgerRow(tx, {
    ...shared,
    id: input.payoutTxnId,
    type: 'PAYOUT',
    amountCents: -input.paymentCents,
    balanceAfterCents: input.walletBalanceAfterDebit,
    description: input.payoutDescription,
  });
}

export async function approveWithdrawal(
  withdrawalId: string,
  reviewerId: string,
  paymentMethod: SettlementPaymentMethod,
  proofUrl: string | null,
  extras?: ApproveWithdrawalExtras,
): Promise<StoreWithdrawal> {
  const withdrawal = await prisma.storeWithdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal) throw new AppError('Withdrawal not found', 404);
  if (withdrawal.status !== 'PENDING') {
    throw new AppError('Only pending withdrawals can be approved', 400);
  }
  if (withdrawal.requestedById === reviewerId) {
    throw new AppError('You cannot approve a withdrawal you requested', 403);
  }

  await assertLivePeriodNetCoversWithdrawal(withdrawal);

  const wallet = await getOrCreateWallet(withdrawal.storeId);
  const summary = await getWalletSummary(withdrawal.storeId);
  const remainingNet = summary.netTransferableEarnings - summary.totalWithdrawn;

  const withdrawalCents = withdrawalAmountCents(withdrawal);
  if (remainingNet < withdrawalCents) {
    throw new AppError('Insufficient net transferable balance to approve this withdrawal', 400);
  }

  const { walletDebitCents, paymentCents, sppcJasonCents } = resolveApprovalPayoutAmounts(withdrawal);
  const jasonNet = await computeJasonNetBalance();
  assertJasonBalanceCoversContribution(jasonNet, sppcJasonCents);

  void wallet;
  const txnId = crypto.randomUUID();
  const now = new Date();
  const precomputedNet = summary.netTransferableEarnings;

  await ensurePlatformEarningsSchema();
  await ensurePlatformPaybackSchema();

  // Avoid getWalletSummary inside the lock (gateway timeout risk).
  const approvedWithdrawal = await prisma.$transaction(async (tx) => {
    const lockedWithdrawal = await lockStoreWithdrawal(tx, withdrawalId);
    if (lockedWithdrawal.status !== 'PENDING') {
      throw new AppError('Only pending withdrawals can be approved', 409);
    }

    const locked = await lockStoreWallet(tx, withdrawal.storeId);
    const lockedWithdrawn = Number(locked.totalWithdrawn.toFixed(0));
    if (precomputedNet - lockedWithdrawn < withdrawalCents) {
      throw new AppError('Insufficient net transferable balance to approve this withdrawal', 400);
    }

    const { checkNumber: checkNum, checkDate: checkDt } = resolveCheckPaymentFields(paymentMethod, extras);

    const afterDebit = walletDataAfterDebit(locked, walletDebitCents);
    const walletBalanceAfterDebit = Number(afterDebit.balance.toFixed(0));
    await tx.storeWallet.update({
      where: { storeId: withdrawal.storeId },
      data: {
        balance: afterDebit.balance,
        totalWithdrawn: afterDebit.totalWithdrawn,
      },
    });
    await createApprovalWalletLedgerEntries(tx, {
      storeId: withdrawal.storeId,
      walletBalanceAfterDebit,
      paymentCents,
      sppcJasonCents,
      payoutTxnId: txnId,
      payoutDescription: withdrawal.remarks ?? 'Branch withdrawal',
      payoutReference: `WD-${withdrawal.id.slice(0, 8)}`,
      createdById: reviewerId,
    });

    const claimed = await tx.storeWithdrawal.updateMany({
      where: { id: withdrawalId, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        reviewedById: reviewerId,
        reviewedAt: now,
        walletTransactionId: txnId,
        paymentMethod,
        proofUrl,
        checkNumber: checkNum,
        checkDate: checkDt,
      },
    });
    if (claimed.count !== 1) {
      throw new AppError('Only pending withdrawals can be approved', 409);
    }

    return tx.storeWithdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
  });

  if (approvedWithdrawal.periodFrom && approvedWithdrawal.periodTo) {
    const storeRow = await prisma.store.findUnique({
      where: { id: withdrawal.storeId },
      select: { platformDiscountPaybackEnabled: true },
    });

    const paybackWhere = {
      storeId: withdrawal.storeId,
      ownership: 'PLATFORM' as const,
      platformPaybackSettledAt: null,
      platformPaybackReversedAt: null,
      order: {
        paymentStatus: 'PAID' as const,
        status: { not: 'CANCELLED' as const },
        createdAt: {
          gte: approvedWithdrawal.periodFrom,
          lte: approvedWithdrawal.periodTo,
        },
      },
      ...(storeRow?.platformDiscountPaybackEnabled
        ? {}
        : { platformPaybackEligible: true }),
    };

    await prisma.promotionUsage.updateMany({
      where: paybackWhere,
      data: {
        platformPaybackSettledAt: now,
        platformPaybackWithdrawalId: withdrawalId,
        ...(storeRow?.platformDiscountPaybackEnabled ? { platformPaybackEligible: true } : {}),
      },
    });
  }

  await runWithdrawalApprovalSideEffects({
    approvedWithdrawal,
    storeId: withdrawal.storeId,
    sppcJasonCents,
    reviewerId,
    breakdownFallback: withdrawal.breakdown,
  });

  return approvedWithdrawal;
}

export async function rejectWithdrawal(
  withdrawalId: string,
  reviewerId: string,
  reason?: string,
): Promise<StoreWithdrawal> {
  const withdrawal = await prisma.storeWithdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal) throw new AppError('Withdrawal not found', 404);
  if (withdrawal.status !== 'PENDING') {
    throw new AppError('Only pending withdrawals can be rejected', 400);
  }

  const rejected = await prisma.storeWithdrawal.updateMany({
    where: { id: withdrawalId, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      rejectionReason: reason?.trim() || null,
    },
  });
  if (rejected.count !== 1) {
    throw new AppError('Only pending withdrawals can be rejected', 409);
  }
  return prisma.storeWithdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
}

export async function cancelWithdrawal(
  withdrawalId: string,
  requesterId: string,
): Promise<StoreWithdrawal> {
  const withdrawal = await prisma.storeWithdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal) throw new AppError('Withdrawal not found', 404);
  if (withdrawal.status !== 'PENDING') {
    throw new AppError('Only pending withdrawals can be cancelled', 400);
  }
  if (withdrawal.requestedById !== requesterId) {
    throw new AppError('You can only cancel your own withdrawal requests', 403);
  }

  const cancelled = await prisma.storeWithdrawal.updateMany({
    where: { id: withdrawalId, status: 'PENDING', requestedById: requesterId },
    data: { status: 'CANCELLED' },
  });
  if (cancelled.count !== 1) {
    throw new AppError('Only pending withdrawals can be cancelled', 409);
  }
  return prisma.storeWithdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
}

/** Create an already-approved withdrawal linked to an existing PAYOUT transaction (settlement backfill). */
export async function createApprovedWithdrawalRecord(
  input: CreateApprovedWithdrawalInput,
  tx?: Prisma.TransactionClient,
): Promise<StoreWithdrawal> {
  const db = tx ?? prisma;
  const now = new Date();
  const withdrawalId = crypto.randomUUID();

  const withdrawal = await db.storeWithdrawal.create({
    data: {
      id: withdrawalId,
      storeId: input.storeId,
      amount: centsToDecimal(input.amount),
      status: 'APPROVED',
      remarks: input.remarks ?? null,
      periodFrom: input.periodFrom ?? null,
      periodTo: input.periodTo ?? null,
      breakdown: (input.breakdown ?? {}) as object,
      requestedById: input.requestedById,
      reviewedById: input.reviewedById,
      reviewedAt: now,
      walletTransactionId: input.walletTransactionId,
    },
  });

  await creditPlatformEarning(
    {
      storeWithdrawalId: withdrawal.id,
      storeId: withdrawal.storeId,
      breakdown: withdrawal.breakdown,
      periodFrom: withdrawal.periodFrom,
      periodTo: withdrawal.periodTo,
      approvedAt: withdrawal.reviewedAt ?? now,
    },
    tx,
  );

  return withdrawal;
}
