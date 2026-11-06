import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { dateStringInColombo } from './datetime';
import { resolveSettlementReceiptUrl } from '../middleware/upload';
import {
  dartCodesReceivesLkrFromBreakdown,
  resolveStoredPlatformProviderReceivable,
} from './platformSettlementHelpers';
import { resolveFinalPayoutAmountFromBreakdown } from './sharedPromoContribution';
import { withdrawalAmountCents } from './walletApiMoney';
import { settlementPaymentMethodLabel } from './settlementPaymentMethod';
import {
  platformProviderSettlementInvoiceApiPath,
  withdrawalInvoiceApiPath,
} from './invoice/refs';

export const APPROVED_WITHDRAWAL_PAYOUT_SELECT = {
  id: true,
  storeId: true,
  amount: true,
  reviewedAt: true,
  createdAt: true,
  paymentMethod: true,
  proofUrl: true,
  invoiceRef: true,
  invoiceUrl: true,
  status: true,
  periodFrom: true,
  periodTo: true,
  breakdown: true,
  isAdvance: true,
  walletTransactionId: true,
  store: { select: { name: true } },
  commissionSettlement: { select: { id: true } },
} as const;

export type ApprovedWithdrawalPayoutRow = Prisma.StoreWithdrawalGetPayload<{
  select: typeof APPROVED_WITHDRAWAL_PAYOUT_SELECT;
}>;

function serializeWithdrawalReceiptFields(
  proofUrl: string | null | undefined,
  storeId: string,
): { hasReceipt: boolean; receiptUrl: string | null } {
  const resolved = resolveSettlementReceiptUrl(proofUrl, storeId);
  if (!resolved?.trim()) {
    return { hasReceipt: false, receiptUrl: null };
  }
  if (/^https?:\/\//i.test(resolved)) {
    return { hasReceipt: true, receiptUrl: null };
  }
  return { hasReceipt: true, receiptUrl: resolved };
}

function branchPayoutAmountLkr(withdrawal: ApprovedWithdrawalPayoutRow): number {
  const cents = resolveFinalPayoutAmountFromBreakdown(
    withdrawal.breakdown,
    withdrawalAmountCents(withdrawal),
  );
  return cents / 100;
}

function withdrawalPaidAt(withdrawal: ApprovedWithdrawalPayoutRow): string {
  const at = withdrawal.reviewedAt ?? withdrawal.createdAt;
  return at.toISOString();
}

function withdrawalPeriodFrom(withdrawal: ApprovedWithdrawalPayoutRow): string {
  if (!withdrawal.periodFrom) return dateStringInColombo(withdrawal.createdAt);
  return dateStringInColombo(withdrawal.periodFrom);
}

function withdrawalPeriodTo(withdrawal: ApprovedWithdrawalPayoutRow): string {
  if (!withdrawal.periodTo) return withdrawalPeriodFrom(withdrawal);
  return dateStringInColombo(withdrawal.periodTo);
}

export async function fetchApprovedBranchPayoutWithdrawals(
  storeIds: string[],
  fromDate: Date,
  toDate: Date,
): Promise<ApprovedWithdrawalPayoutRow[]> {
  if (storeIds.length === 0) return [];

  return prisma.storeWithdrawal.findMany({
    where: {
      storeId: { in: storeIds },
      status: 'APPROVED',
      periodFrom: { not: null },
      periodTo: { not: null },
      OR: [
        {
          periodFrom: { lte: toDate },
          periodTo: { gte: fromDate },
        },
        {
          reviewedAt: { gte: fromDate, lte: toDate },
        },
      ],
    },
    orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
    select: APPROVED_WITHDRAWAL_PAYOUT_SELECT,
  });
}

export function mapApprovedWithdrawalToBranchPayoutRow(withdrawal: ApprovedWithdrawalPayoutRow) {
  const methodLabel = withdrawal.paymentMethod
    ? settlementPaymentMethodLabel(withdrawal.paymentMethod)
    : '—';
  const receipt = serializeWithdrawalReceiptFields(withdrawal.proofUrl, withdrawal.storeId);
  const invoiceUrl = withdrawal.invoiceUrl ?? withdrawalInvoiceApiPath(withdrawal.id);

  return {
    id: withdrawal.id,
    payoutSource: 'branchWithdrawal' as const,
    statementRef: `WD-${withdrawal.id.slice(0, 8).toUpperCase()}`,
    paidAt: withdrawalPaidAt(withdrawal),
    amount: branchPayoutAmountLkr(withdrawal),
    paymentMethod: methodLabel,
    hasReceipt: receipt.hasReceipt,
    receiptUrl: receipt.receiptUrl,
    invoiceRef: withdrawal.invoiceRef ?? undefined,
    invoiceUrl,
    status: 'VERIFIED' as const,
    periodFrom: withdrawalPeriodFrom(withdrawal),
    periodTo: withdrawalPeriodTo(withdrawal),
    storeWithdrawalId: withdrawal.id,
    walletTransactionId: withdrawal.walletTransactionId ?? undefined,
    isAdvance: withdrawal.isAdvance,
    storeName: withdrawal.store.name,
  };
}

export async function mapApprovedWithdrawalToPlatformPayoutRow(
  withdrawal: ApprovedWithdrawalPayoutRow,
) {
  const receivable = await resolveStoredPlatformProviderReceivable(withdrawal.breakdown);
  const platformReceivable = dartCodesReceivesLkrFromBreakdown(receivable);
  if (platformReceivable <= 0) return null;

  const base = mapApprovedWithdrawalToBranchPayoutRow(withdrawal);
  const settlementId = withdrawal.commissionSettlement?.id;
  return {
    ...base,
    amount: platformReceivable,
    platformReceivable,
    platformInvoiceUrl: settlementId
      ? platformProviderSettlementInvoiceApiPath(settlementId)
      : undefined,
    platformReceivableSettlementId: settlementId,
  };
}

export function mergeBranchPayoutHistoryRows<
  T extends { id: string; paidAt: string; storeWithdrawalId?: string },
>(
  settlementRows: T[],
  withdrawalRows: T[],
  linkedSettlementWithdrawalIds: Set<string>,
): T[] {
  const supplemental = withdrawalRows.filter(
    (row) => !linkedSettlementWithdrawalIds.has(row.storeWithdrawalId ?? row.id),
  );
  return [...settlementRows, ...supplemental].sort(
    (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
  );
}
