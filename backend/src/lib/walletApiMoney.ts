import type {
  CommissionSettlement,
  JasonLedgerEntry,
  PlatformEarning,
  PlatformMonthlySettlement,
  StoreWallet,
  StoreWithdrawal,
  WalletTransaction,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  decimalToCentsString,
  decimalToLkrString,
  parseDecimalFromDb,
} from './moneyDecimal';

/** Scalar money fields on wallet API responses are cent strings (integer minor units). */
export function serializeStoreWallet(wallet: StoreWallet) {
  return {
    ...wallet,
    balance: decimalToCentsString(wallet.balance),
    totalEarnings: decimalToCentsString(wallet.totalEarnings),
    totalWithdrawn: decimalToCentsString(wallet.totalWithdrawn),
    currentBalance: decimalToCentsString(wallet.balance),
  };
}

export function serializeEnrichedWalletRow<T extends StoreWallet>(
  wallet: T,
  extras: {
    netTransferableEarnings: number;
    currentBalance: number;
    availableBalance: number;
    allTimeAvailableBalanceCents?: number;
    allTimeOnlineWalletCents?: number;
    _count?: { transactions: number };
    store?: T extends { store: infer S } ? S : unknown;
  },
) {
  const base = serializeStoreWallet(wallet);
  return {
    ...base,
    store: (wallet as { store?: unknown }).store ?? extras.store,
    netTransferableEarnings: String(extras.netTransferableEarnings),
    availableBalance: String(extras.availableBalance),
    ...(extras.allTimeAvailableBalanceCents != null
      ? { allTimeAvailableBalanceCents: String(extras.allTimeAvailableBalanceCents) }
      : {}),
    ...(extras.allTimeOnlineWalletCents != null
      ? { allTimeOnlineWalletCents: String(extras.allTimeOnlineWalletCents) }
      : {}),
    _count: extras._count,
  };
}

export function serializeWalletSummary(summary: {
  storeId: string;
  currentBalance: number;
  totalEarnings: number;
  grossLedgerCredits: number;
  netTransferableEarnings: number;
  totalWithdrawn: number;
  pendingWithdrawalTotal: number;
  availableBalance: number;
  onlineWalletAvailableBalance: number;
  allTimeAvailableBalanceCents: number;
  allTimeOnlineWalletCents: number;
}) {
  return {
    storeId: summary.storeId,
    currentBalance: String(summary.currentBalance),
    totalEarnings: String(summary.totalEarnings),
    grossLedgerCredits: String(summary.grossLedgerCredits),
    netTransferableEarnings: String(summary.netTransferableEarnings),
    totalWithdrawn: String(summary.totalWithdrawn),
    pendingWithdrawalTotal: String(summary.pendingWithdrawalTotal),
    availableBalance: String(summary.availableBalance),
    onlineWalletAvailableBalance: String(summary.onlineWalletAvailableBalance),
    allTimeAvailableBalanceCents: String(summary.allTimeAvailableBalanceCents),
    allTimeOnlineWalletCents: String(summary.allTimeOnlineWalletCents),
  };
}

export function serializeWalletTransaction(txn: WalletTransaction) {
  return {
    ...txn,
    amount: decimalToCentsString(txn.amount),
    balanceAfter: decimalToCentsString(txn.balanceAfter),
  };
}

export function serializeWithdrawal<T extends Pick<StoreWithdrawal, 'amount' | 'proofUrl'>>(w: T) {
  const hasProof = Boolean(w.proofUrl);
  return {
    ...w,
    amount: decimalToCentsString(w.amount),
    hasProof,
    proofUrl: null,
  };
}

export function serializeCommissionSettlement(row: CommissionSettlement) {
  return {
    ...row,
    totalCommission: decimalToCentsString(row.totalCommission),
    totalProviderFee: decimalToCentsString(row.totalProviderFee),
    platformPaybackAmount: decimalToCentsString(row.platformPaybackAmount),
  };
}

export function serializePlatformEarning(row: PlatformEarning) {
  return {
    ...row,
    commissionAmount: decimalToCentsString(row.commissionAmount),
    convenienceFeeAmount: decimalToCentsString(row.convenienceFeeAmount),
    platformPaybackAmount: decimalToCentsString(row.platformPaybackAmount),
    sharedPromoContributionAmount: decimalToCentsString(row.sharedPromoContributionAmount),
    loyaltyDiscountAmount: decimalToCentsString(row.loyaltyDiscountAmount),
    netPlatformCommissionAmount: decimalToCentsString(row.netPlatformCommissionAmount),
    completedRefundConvenienceAmount: decimalToCentsString(row.completedRefundConvenienceAmount),
    rejectedRefundConvenienceAmount: decimalToCentsString(row.rejectedRefundConvenienceAmount),
    netPlatformEarningsAmount: decimalToCentsString(row.netPlatformEarningsAmount),
    eligibleProviderAmount: decimalToCentsString(row.eligibleProviderAmount),
    gatewayDeductionAmount: decimalToCentsString(row.gatewayDeductionAmount),
    totalEarned: decimalToCentsString(row.totalEarned),
  };
}

export function serializePlatformMonthlySettlement(row: PlatformMonthlySettlement) {
  return {
    ...row,
    totalCommission: decimalToCentsString(row.totalCommission),
    totalConvenienceFee: decimalToCentsString(row.totalConvenienceFee),
    totalEarned: decimalToCentsString(row.totalEarned),
  };
}

export function serializeJasonLedgerEntry(row: JasonLedgerEntry) {
  return {
    ...row,
    amount: decimalToCentsString(row.amount),
    balanceBefore: row.balanceBefore != null ? decimalToCentsString(row.balanceBefore) : null,
    balanceAfter: row.balanceAfter != null ? decimalToCentsString(row.balanceAfter) : null,
  };
}

export function serializeDeliveryJobFees(totalDeliveryFees: Prisma.Decimal | null | undefined) {
  if (totalDeliveryFees == null) return null;
  return decimalToLkrString(totalDeliveryFees);
}

function walletMoneyFieldToSafeCents(value: unknown, fieldLabel: string): number {
  const d = parseDecimalFromDb(value);
  const n = Number(d.toFixed(0));
  if (!Number.isSafeInteger(n)) {
    throw new Error(`${fieldLabel} exceeds safe integer for legacy math`);
  }
  return n;
}

export function walletBalanceCents(wallet: Pick<StoreWallet, 'balance'>): number {
  return walletMoneyFieldToSafeCents(wallet.balance, 'Wallet balance');
}

export function walletTotalWithdrawnCents(wallet: Pick<StoreWallet, 'totalWithdrawn'>): number {
  return walletMoneyFieldToSafeCents(wallet.totalWithdrawn, 'Wallet totalWithdrawn');
}

export function walletTotalEarningsCents(wallet: Pick<StoreWallet, 'totalEarnings'>): number {
  return walletMoneyFieldToSafeCents(wallet.totalEarnings, 'Wallet totalEarnings');
}

export function withdrawalAmountCents(w: Pick<StoreWithdrawal, 'amount'>): number {
  return walletMoneyFieldToSafeCents(w.amount, 'Withdrawal amount');
}

export function txnAmountCents(txn: Pick<WalletTransaction, 'amount'>): number {
  return walletMoneyFieldToSafeCents(txn.amount, 'Transaction amount');
}
