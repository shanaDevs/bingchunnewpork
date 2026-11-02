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
import { dateStringInColombo } from './datetime';
import { platformProviderSettlementInvoiceApiPath } from './invoice/refs';

function paybackEnabledFromBreakdown(breakdown: unknown): boolean {
  const b = breakdown as {
    platformDiscountPaybackEnabled?: boolean;
    platformPaybackTotal?: number;
  } | null;
  if (b?.platformDiscountPaybackEnabled != null) return b.platformDiscountPaybackEnabled;
  return (b?.platformPaybackTotal ?? 0) > 0;
}

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
};

export async function loadSettlementPlatformReceivableDetail(
  settlementId: string,
  allowedStoreIds: string[],
): Promise<SettlementPlatformReceivableDetail> {
  await ensureCommissionSettlementTable();

  const settlement = await prisma.commissionSettlement.findFirst({
    where: {
      id: settlementId,
      ...(allowedStoreIds.length === 1
        ? { storeId: allowedStoreIds[0]! }
        : allowedStoreIds.length > 0
          ? { storeId: { in: allowedStoreIds } }
          : {}),
    },
    include: {
      store: { select: { name: true } },
      storeWithdrawal: { select: { id: true, breakdown: true } },
    },
  });

  if (!settlement) throw new AppError('Settlement not found', 404);
  if (!settlement.storeWithdrawalId || !settlement.storeWithdrawal) {
    throw new AppError('No linked branch payout for platform receivable breakdown', 404);
  }

  const stored = await resolveStoredPlatformProviderReceivable(
    settlement.storeWithdrawal.breakdown,
  );
  const platformReceivable = dartCodesReceivesLkrFromBreakdown(stored);
  const breakdown = settlement.storeWithdrawal.breakdown;

  return {
    id: settlement.id,
    statementRef: settlement.statementRef,
    storeId: settlement.storeId,
    storeName: settlement.store.name,
    storeWithdrawalId: settlement.storeWithdrawalId,
    paymentMethod: settlementPaymentMethodLabel(settlement.paymentMethod),
    status: settlement.status,
    period: {
      from: dateStringInColombo(settlement.periodFrom),
      to: dateStringInColombo(settlement.periodTo),
    },
    submittedAt: settlement.createdAt.toISOString(),
    platformReceivable,
    platformProviderReceivable: { lkr: stored.lkr },
    platformDiscountPaybackEnabled: paybackEnabledFromBreakdown(breakdown),
    sharedPromoPlatformLkr: sharedPromoPlatformLkrFromBreakdown(breakdown),
    platformInvoiceUrl: platformProviderSettlementInvoiceApiPath(settlement.id),
  };
}
