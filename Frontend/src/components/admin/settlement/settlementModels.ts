import type { MonthlySlabInfo, SlabInfo } from '@/components/admin/commissionUtils';

import type { SettlementBreakdown } from './channelBreakdown';

export type PlatformSalesSummary = {
  totalPlatformSales: number;
  onlineSales: number;
  pickupCash: number;
  pickupCard: number;
  pickupOnline: number;
  deliveryOnline: number;
  offlineCash: number;
  offlineCard: number;
  offlineTotal: number;
  orderCount: number;
};

export type SettlementPreview = {
  period: { from: string; to: string };
  breakdown: SettlementBreakdown;
  totalCommission: number;
  totalProviderFee: number;
  totalOwed: number;
  orderCount: number;
  platformSales?: PlatformSalesSummary;
  slabInfo: SlabInfo;
  monthlySlabInfo?: MonthlySlabInfo[];
};

export type PendingWithdrawalForSettlement = {
  id: string;
  amount: number;
  amountLkr: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  periodFrom: string | null;
  periodTo: string | null;
  breakdown: unknown;
  remarks: string | null;
  isAdvance: boolean;
  createdAt: string;
  hasSettlement?: boolean;
};

export function isWithdrawalSelectableForSettlement(
  withdrawal: PendingWithdrawalForSettlement,
): boolean {
  return (
    (withdrawal.status === 'PENDING' || withdrawal.status === 'APPROVED') &&
    !withdrawal.hasSettlement &&
    !!withdrawal.periodFrom &&
    !!withdrawal.periodTo
  );
}

export type SettlementStatement = {
  id: string;
  statementRef: string;
  storeId: string;
  storeName: string;
  storeWithdrawalId?: string;
  period: { from: string; to: string };
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  paymentMethod: string;
  hasReceipt?: boolean;
  receiptUrl: string | null;
  invoiceRef?: string;
  invoiceUrl?: string | null;
  breakdown: SettlementBreakdown;
  totalCommission: number;
  totalProviderFee: number;
  totalOwed: number;
  platformPaybackAmount?: number;
  submittedAt: string;
  slabInfo?: SlabInfo;
  monthlySlabInfo?: MonthlySlabInfo[];
};

export type SettlementPaymentMethodKey = 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'ONLINE';

export const SETTLEMENT_PAYMENT_METHOD_OPTIONS: Array<{
  value: SettlementPaymentMethodKey;
  label: string;
}> = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHECK', label: 'Check' },
  { value: 'ONLINE', label: 'Online' },
];

export function settlementPaymentMethodLabel(method: string): string {
  return (
    SETTLEMENT_PAYMENT_METHOD_OPTIONS.find((m) => m.value === method)?.label ?? method
  );
}