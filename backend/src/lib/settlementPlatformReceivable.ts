import type { PlatformProviderReceivableLkr } from '@bingchun/settlement';
import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';
import { ensureCommissionSettlementTable } from './settlementSchema';
import {
  dartCodesReceivesLkrFromBreakdown,
  resolveStoredPlatformProviderReceivable,
} from './platformSettlementHelpers';
import {
  sharedPromoPlatformLkrFromBreakdown,
} from './readyToProcessSupport';
import { settlementPaymentMethodLabel } from './settlementPaymentMethod';
import { toUtcDateStr } from './utcDateString';
import { platformProviderSettlementInvoiceApiPath } from './invoice/refs';
import { paybackEnabledFromBreakdown } from './breakdownPayback';
import { prismaStoreIdScope } from './prismaStoreScope';
import { resolveSettlementReceiptUrl } from '../middleware/upload';

export type SettlementPlatformReceivableDetail = {
  id: string;
  statementRef: string;
  storeId: string;
  storeName: string;
  storeWithdrawalId: string;
  paymentMethod: string;
  status: string;
  period: { from: string; to: string };
  submittedAt: string;
  platformReceivable: number;
  platformProviderReceivable: { lkr: PlatformProviderReceivableLkr };
  platformDiscountPaybackEnabled: boolean;
  sharedPromoPlatformLkr: number;
  platformInvoiceUrl: string;
  hasReceipt: boolean;
};

type StoredPlatformReceivable = Awaited<ReturnType<typeof resolveStoredPlatformProviderReceivable>>;

function storedProofAvailable(
  proofOrReceiptUrl: string | null | undefined,
  storeId: string,
): boolean {
  const resolved = resolveSettlementReceiptUrl(proofOrReceiptUrl, storeId);
  return Boolean(resolved?.trim());
}

function platformPayoutReceiptAvailable(
  settlementReceiptUrl: string | null | undefined,
  withdrawalProofUrl: string | null | undefined,
  storeId: string,
): boolean {
  return (
    storedProofAvailable(settlementReceiptUrl, storeId) ||
    storedProofAvailable(withdrawalProofUrl, storeId)
  );
}

function receivableFieldsFromBreakdown(
  breakdown: unknown,
  stored: StoredPlatformReceivable,
): Pick<
  SettlementPlatformReceivableDetail,
  | 'platformReceivable'
  | 'platformProviderReceivable'
  | 'platformDiscountPaybackEnabled'
  | 'sharedPromoPlatformLkr'
> {
  return {
    platformReceivable: dartCodesReceivesLkrFromBreakdown(stored),
    platformProviderReceivable: { lkr: stored.lkr },
    platformDiscountPaybackEnabled: paybackEnabledFromBreakdown(breakdown),
    sharedPromoPlatformLkr: sharedPromoPlatformLkrFromBreakdown(breakdown),
  };
}

async function loadWithdrawalPlatformReceivableDetail(
  withdrawalId: string,
  allowedStoreIds: string[],
): Promise<SettlementPlatformReceivableDetail> {
  const withdrawal = await prisma.storeWithdrawal.findFirst({
    where: {
      id: withdrawalId,
      status: 'APPROVED',
      ...prismaStoreIdScope(allowedStoreIds),
    },
    select: {
      id: true,
      storeId: true,
      proofUrl: true,
      paymentMethod: true,
      periodFrom: true,
      periodTo: true,
      reviewedAt: true,
      createdAt: true,
      breakdown: true,
      store: { select: { name: true } },
      commissionSettlement: {
        select: { id: true, statementRef: true, paymentMethod: true, status: true, createdAt: true },
      },
    },
  });

  if (!withdrawal) throw new AppError('Branch payout not found', 404);
  if (!withdrawal.periodFrom || !withdrawal.periodTo) {
    throw new AppError('Branch payout period is missing', 404);
  }

  const linkedSettlement = withdrawal.commissionSettlement;
  if (linkedSettlement) {
    return loadSettlementPlatformReceivableDetail(linkedSettlement.id, allowedStoreIds);
  }

  const stored = await resolveStoredPlatformProviderReceivable(withdrawal.breakdown);

  return {
    id: withdrawal.id,
    statementRef: `WD-${withdrawal.id.slice(0, 8).toUpperCase()}`,
    storeId: withdrawal.storeId,
    storeName: withdrawal.store.name,
    storeWithdrawalId: withdrawal.id,
    paymentMethod: withdrawal.paymentMethod
      ? settlementPaymentMethodLabel(withdrawal.paymentMethod)
      : '—',
    status: 'VERIFIED',
    period: {
      from: toUtcDateStr(withdrawal.periodFrom),
      to: toUtcDateStr(withdrawal.periodTo),
    },
    submittedAt: (withdrawal.reviewedAt ?? withdrawal.createdAt).toISOString(),
    ...receivableFieldsFromBreakdown(withdrawal.breakdown, stored),
    platformInvoiceUrl: '',
    hasReceipt: storedProofAvailable(withdrawal.proofUrl, withdrawal.storeId),
  };
}

export async function loadSettlementPlatformReceivableDetail(
  settlementId: string,
  allowedStoreIds: string[],
): Promise<SettlementPlatformReceivableDetail> {
  await ensureCommissionSettlementTable();

  const settlement = await prisma.commissionSettlement.findFirst({
    where: {
      id: settlementId,
      ...prismaStoreIdScope(allowedStoreIds),
    },
    select: {
      id: true,
      storeId: true,
      statementRef: true,
      paymentMethod: true,
      status: true,
      periodFrom: true,
      periodTo: true,
      createdAt: true,
      receiptUrl: true,
      storeWithdrawalId: true,
      store: { select: { name: true } },
      storeWithdrawal: { select: { id: true, breakdown: true, proofUrl: true } },
    },
  });

  if (!settlement) throw new AppError('Settlement not found', 404);
  if (!settlement.storeWithdrawalId || !settlement.storeWithdrawal) {
    throw new AppError('No linked branch payout for platform receivable breakdown', 404);
  }

  const breakdown = settlement.storeWithdrawal.breakdown;
  const stored = await resolveStoredPlatformProviderReceivable(breakdown);

  return {
    id: settlement.id,
    statementRef: settlement.statementRef,
    storeId: settlement.storeId,
    storeName: settlement.store.name,
    storeWithdrawalId: settlement.storeWithdrawalId,
    paymentMethod: settlementPaymentMethodLabel(settlement.paymentMethod),
    status: settlement.status,
    period: {
      from: toUtcDateStr(settlement.periodFrom),
      to: toUtcDateStr(settlement.periodTo),
    },
    submittedAt: settlement.createdAt.toISOString(),
    ...receivableFieldsFromBreakdown(breakdown, stored),
    platformInvoiceUrl: platformProviderSettlementInvoiceApiPath(settlement.id),
    hasReceipt: platformPayoutReceiptAvailable(
      settlement.receiptUrl,
      settlement.storeWithdrawal.proofUrl,
      settlement.storeId,
    ),
  };
}

/** Settlement id or approved branch withdrawal id (super-admin platform payout history). */
export async function loadPlatformPayoutReceivableDetail(
  id: string,
  allowedStoreIds: string[],
): Promise<SettlementPlatformReceivableDetail> {
  await ensureCommissionSettlementTable();

  const settlement = await prisma.commissionSettlement.findFirst({
    where: {
      id,
      ...prismaStoreIdScope(allowedStoreIds),
    },
    select: { id: true },
  });
  if (settlement) {
    return loadSettlementPlatformReceivableDetail(id, allowedStoreIds);
  }
  return loadWithdrawalPlatformReceivableDetail(id, allowedStoreIds);
}
