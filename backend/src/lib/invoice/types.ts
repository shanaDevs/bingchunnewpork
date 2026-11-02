import type { SettlementPaymentMethod } from '@prisma/client';
import type { CommissionChannel, ChannelSettlementRow } from '../commission';
export type InvoicePromoLine = {
  promoCode: string;
  ownership: 'PLATFORM' | 'BRANCH' | 'SHARED';
  totalDiscountAmount: number;
  platformShareAmount: number;
  branchShareAmount: number;
};

export type InvoicePromoSummary = {
  lines: InvoicePromoLine[];
  platformTotalCents: number;
  branchTotalCents: number;
  sharedTotalCents: number;
  platformPaybackCents: number;
};

export type PromoUsageInvoiceRow = {
  promoCode: string;
  ownership: string;
  totalDiscountAmount: number;
  platformShareAmount: number;
  branchShareAmount: number;
};

export type LineTableColumn = { title: string; width: number; align: 'left' | 'right' | 'center' };

export type LineTableRow = {
  cells: string[];
  bold?: boolean;
  muted?: boolean;
  danger?: boolean;
  brand?: boolean;
  rowH?: number;
  calcColIndex?: number;
  separatorBefore?: boolean;
};

export type FooterLayout = {
  footerRuleY: number;
  paymentTitleY: number;
  colsStartY: number;
  autoTextY: number;
  bottomAccentH: number;
  colLineH: number;
  colHeadH: number;
};

export type InvoicePageLayout = {
  pageW: number;
  pageH: number;
  marginX: number;
  contentW: number;
};

export type TotalLine = {
  label: string;
  amount: string;
  hint?: string;
  bold?: boolean;
  brand?: boolean;
  danger?: boolean;
  credit?: boolean;
  skip?: boolean;
  separatorBefore?: boolean;
};

export type InvoiceChannelRow = {
  label: string;
  orderCount: number;
  commissionRatePct: number | null;
  grossSalesCents: number;
};

export type InvoiceChannelSummary = {
  channels: InvoiceChannelRow[];
  totalOrders: number;
  totalGrossSalesCents: number;
  /** Commission slab base — all-channel item subtotal after discounts (cents). */
  commissionBaseCents: number;
  /** PayHere wallet inflow — pickup online + delivery online totals (cents). */
  onlineWalletGrossCents: number;
  /** Calculation hint for online gross amount row. */
  onlineGrossCalculation: string | null;
  /** Delivery online subtotal base for convenience fee (cents). */
  convenienceBaseCents: number;
  commissionRatePct: number | null;
};

export type InvoicePeriodBreakdown = {
  grossAmountCents: number;
  onlineWalletGrossCents: number;
  gatewayBaseCents: number;
  deliveryFeeCents: number;
  commissionFeeCents: number;
  gatewayFeeCents: number;
  convenienceFeeCents: number;
  netAmountCents: number;
  orderCount: number;
};

/** Page-2 payout breakdown snapshot (cents), locked at invoice finalize. */
export type InvoicePayoutStatement = {
  totalSaleCents: number;
  onlineWalletCents: number;
  commissionCents: number;
  branchDiscountCents: number;
  platformDiscountCents: number;
  jasonDiscountCents: number;
  costPartnerTotalCents: number;
  nonReturningRefundsCents: number;
  platformRefundsCents: number;
  deliveryRefundsCents: number;
  totalRefundCents: number;
  platformDiscountsReportCents: number;
  /** Platform-owned promo total before payback (cents). */
  platformOwnedPromoCents: number;
  /** Platform share of SHARED promotions — commission deduction when payback enabled (cents). */
  sharedPlatformDiscountCents: number;
  /** Credited platform-funded promo deduction (cents). */
  platformPaybackCents: number;
  loyaltyDiscountCents: number;
  netPlatformAmountCents: number;
  gatewayFeeCents: number;
  gatewayRatePct: number;
  bankPenaltyCents: number;
  bankPenaltyOrderCount: number;
  jasonPayoutTopUpCents: number;
  branchNetPayoutCents: number;
};

export type WithdrawalTableRow = {
  label: string;
  amount: string;
  orders?: string;
  hint?: string;
  bold?: boolean;
  muted?: boolean;
  highlight?: boolean;
};

export type GenerateWithdrawalInvoiceInput = {
  storeId: string;
  withdrawalId: string;
  storeName: string;
  /** @deprecated Ledger balance — kept for compatibility; wallet summary uses net transferable earnings. */
  branchBalanceCents: number;
  requestedCents: number;
  /** @deprecated Ledger balance after payout — kept for compatibility. */
  balanceAfterCents: number;
  netTransferableEarningsCents: number;
  netTransferableEarningsAsOf: Date;
  remainingNetTransferableCents: number;
  paymentMethod: SettlementPaymentMethod;
  approvedAt: Date;
  remarks?: string | null;
  checkNumber?: string | null;
  checkDate?: Date | null;
  periodBreakdown?: InvoicePeriodBreakdown | null;
  channelSummary?: InvoiceChannelSummary | null;
  periodFrom?: Date | null;
  periodTo?: Date | null;
  periodLabel?: string | null;
  /** Promo + loyalty discounts in period (display only). Cents. */
  storeDiscountsCents?: number;
  promoSummary?: InvoicePromoSummary | null;
  /** Whether platform discount payback is enabled for this branch. */
  storePaybackEnabled?: boolean;
  gatewayRatePct?: number;
  /** Page-2 payout calculation snapshot. Optional on legacy invoiceData. */
  payoutStatement?: InvoicePayoutStatement | null;
};

export type GenerateCommissionSettlementInvoiceInput = {
  settlementId: string;
  statementRef: string;
  storeId: string;
  storeName: string;
  periodFrom: Date;
  periodTo: Date;
  breakdown: Record<CommissionChannel, ChannelSettlementRow>;
  totalCommission: number;
  platformPaybackAmount?: number;
  paymentMethod: SettlementPaymentMethod | string;
  settledAt: Date;
};
