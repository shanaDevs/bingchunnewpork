import {
  sumOnlinePaymentsCollectedFromBreakdown,
  type ChannelSettlementRow,
  type CommissionChannel,
} from '../commission';
import { resolvePayoutStatement } from './payoutStatement';
import {
  formatAmountOnly,
  formatInvoiceLineAmount,
  formatInvoiceLkr,
  formatLkr,
  formatMinus,
  formatPlus,
} from './format';
import {
  INVOICE_FIRST_CYCLE_DEFERRED_AMOUNT_LABEL,
  INVOICE_FIRST_CYCLE_DEFERRED_LINE_PLACEHOLDER,
  INVOICE_PRIOR_PAYOUT_ONLINE_WALLET_ROW_LABEL,
} from './payoutInvoiceCopy';
import {
  INVOICE_CHANNEL_LABELS,
  INVOICE_CHANNEL_ORDER,
} from './constants';
import type {
  GenerateWithdrawalInvoiceInput,
  InvoiceChannelSummary,
  InvoicePayoutStatement,
  InvoicePeriodBreakdown,
  InvoicePromoLine,
  InvoicePromoSummary,
  LineTableRow,
  PromoUsageInvoiceRow,
  WithdrawalTableRow,
} from './types';

export type { InvoicePromoLine, InvoicePromoSummary, PromoUsageInvoiceRow };

export function buildPayoutSettlementTableRows(
  grossSalesCents: number,
  pb: InvoicePeriodBreakdown | null | undefined,
  cs: InvoiceChannelSummary | null | undefined,
  promoSummary?: InvoicePromoSummary | null,
  gatewayRatePct = 1.9,
): LineTableRow[] {
  const rows: LineTableRow[] = [];

  if (!pb || pb.orderCount <= 0) return rows;

  const onlineWalletCents =
    pb.onlineWalletGrossCents > 0 ? pb.onlineWalletGrossCents : cs?.onlineWalletGrossCents ?? 0;
  const gatewayBaseCents =
    pb.gatewayBaseCents > 0 ? pb.gatewayBaseCents : onlineWalletCents;
  const commissionBaseCents = cs?.commissionBaseCents ?? cs?.totalGrossSalesCents ?? grossSalesCents;
  const commissionRateLabel =
    cs?.commissionRatePct != null ? `${cs.commissionRatePct}%` : 'active slab rate';

  if (onlineWalletCents > 0) {
    rows.push({
      cells: [
        'Online gross amount',
        cs?.onlineGrossCalculation ?? 'Pickup online + Delivery online',
        formatLkr(onlineWalletCents),
      ],
      bold: true,
      calcColIndex: 1,
      rowH: 28,
    });
  }

  if (pb.commissionFeeCents > 0) {
    rows.push({
      cells: [
        'Platform Commission',
        `All channels · ${formatAmountOnly(commissionBaseCents)} × ${commissionRateLabel}`,
        formatMinus(pb.commissionFeeCents),
      ],
      danger: true,
      calcColIndex: 1,
      rowH: 30,
    });
  }

  const platformPaybackCents = promoSummary?.platformPaybackCents ?? 0;
  const platformDiscountCents = promoSummary?.platformTotalCents ?? 0;
  if (platformPaybackCents > 0 && pb.commissionFeeCents > 0) {
    rows.push({
      cells: [
        'Discounts applied (platform-funded)',
        `Platform promotions · ${formatAmountOnly(platformDiscountCents)}`,
        formatMinus(platformDiscountCents),
      ],
      danger: true,
      calcColIndex: 1,
      rowH: 28,
    });
    const netCommissionAfterPaybackCents = Math.max(
      0,
      pb.commissionFeeCents - platformDiscountCents,
    );
    rows.push({
      cells: [
        'Net commission after payback',
        `${formatAmountOnly(pb.commissionFeeCents)} − ${formatAmountOnly(platformDiscountCents)}`,
        formatMinus(netCommissionAfterPaybackCents),
      ],
      bold: true,
      calcColIndex: 1,
      rowH: 28,
    });
  }

  if (pb.gatewayFeeCents > 0) {
    rows.push({
      cells: [
        `Payment Gateway Fee (${gatewayRatePct}%)`,
        `${formatAmountOnly(gatewayBaseCents)} × ${gatewayRatePct}%`,
        formatMinus(pb.gatewayFeeCents),
      ],
      danger: true,
      calcColIndex: 1,
    });
  }

  if (platformPaybackCents > 0) {
    rows.push({
      cells: [
        'Platform Discount Payback',
        'Platform-funded promotions credited to branch',
        formatPlus(platformPaybackCents),
      ],
      brand: true,
      calcColIndex: 1,
      rowH: 28,
    });
  }

  rows.push({
    cells: ['Net Payout Amount', '—', formatLkr(pb.netAmountCents)],
    bold: true,
    brand: true,
    separatorBefore: true,
    rowH: 28,
  });

  return rows;
}

export function buildOnlineGrossCalculation(
  pickupOnline: ChannelSettlementRow,
  deliveryOnline: ChannelSettlementRow,
): string | null {
  const pickupRevenue = pickupOnline.revenueSubtotal ?? 0;
  const deliveryRevenue = deliveryOnline.revenueSubtotal ?? 0;
  if (pickupRevenue <= 0 && deliveryRevenue <= 0) return null;

  const revenueSubtotalCents = Math.round((pickupRevenue + deliveryRevenue) * 100);
  return `Revenue subtotal ${formatAmountOnly(revenueSubtotalCents)}`;
}

/** Build channel rows for the invoice sales table. */
export function buildInvoiceChannelSummary(
  breakdown: Record<CommissionChannel, ChannelSettlementRow>,
): InvoiceChannelSummary {
  let totalOrders = 0;
  let totalGrossSalesCents = 0;
  let commissionBaseCents = 0;
  let commissionRatePct: number | null = null;

  const channels = INVOICE_CHANNEL_ORDER.map((key) => {
    const row = breakdown[key];
    const grossSalesCents = Math.round((row.grossSalesTotal ?? 0) * 100);
    totalOrders += row.orderCount;
    totalGrossSalesCents += grossSalesCents;
    commissionBaseCents += Math.round(row.revenueSubtotal * 100);
    if (row.orderCount > 0 && row.rate > 0) {
      commissionRatePct = Math.round(row.rate * 1000) / 10;
    }
    return {
      label: INVOICE_CHANNEL_LABELS[key],
      orderCount: row.orderCount,
      commissionRatePct:
        row.orderCount > 0 && row.rate > 0 ? Math.round(row.rate * 1000) / 10 : null,
      grossSalesCents,
    };
  });

  const pickupOnline = breakdown.pickupOnline;
  const deliveryOnline = breakdown.deliveryOnline;
  const onlineWalletGrossCents = Math.round(
    sumOnlinePaymentsCollectedFromBreakdown(breakdown) * 100,
  );
  const convenienceBaseCents = Math.round(
    (
      (pickupOnline.convenienceFeeBaseTotal ?? 0) +
      (deliveryOnline.convenienceFeeBaseTotal ??
        deliveryOnline.payhereRevenueSubtotal ??
        deliveryOnline.revenueSubtotal ??
        0)
    ) * 100,
  );

  const onlineGrossCalculation = buildOnlineGrossCalculation(pickupOnline, deliveryOnline);

  return {
    channels,
    totalOrders,
    totalGrossSalesCents,
    commissionBaseCents,
    onlineWalletGrossCents,
    onlineGrossCalculation,
    convenienceBaseCents,
    commissionRatePct,
  };
}

function normalizePromoOwnership(ownership: string | null | undefined): InvoicePromoLine['ownership'] {
  const normalized = (ownership ?? 'PLATFORM').toUpperCase();
  if (normalized === 'BRANCH') return 'BRANCH';
  if (normalized === 'SHARED') return 'SHARED';
  return 'PLATFORM';
}

/** Aggregate promotion usages into invoice promo lines grouped by promo code + ownership. */
export function buildInvoicePromoSummaryFromUsages(
  usages: PromoUsageInvoiceRow[],
  storePaybackEnabled: boolean,
): InvoicePromoSummary | null {
  if (usages.length === 0) return null;

  const grouped = new Map<string, InvoicePromoLine>();
  for (const usage of usages) {
    const ownership = normalizePromoOwnership(usage.ownership);
    const key = `${usage.promoCode}::${ownership}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.totalDiscountAmount += usage.totalDiscountAmount;
      existing.platformShareAmount += usage.platformShareAmount;
      existing.branchShareAmount += usage.branchShareAmount;
    } else {
      grouped.set(key, {
        promoCode: usage.promoCode,
        ownership,
        totalDiscountAmount: usage.totalDiscountAmount,
        platformShareAmount: usage.platformShareAmount,
        branchShareAmount: usage.branchShareAmount,
      });
    }
  }

  const lines = Array.from(grouped.values()).sort((a, b) =>
    a.promoCode.localeCompare(b.promoCode),
  );

  let platformTotalCents = 0;
  let branchTotalCents = 0;
  let sharedTotalCents = 0;
  let platformPaybackCents = 0;

  for (const line of lines) {
    if (line.ownership === 'PLATFORM') {
      platformTotalCents += line.totalDiscountAmount;
      if (storePaybackEnabled) {
        platformPaybackCents += line.platformShareAmount;
      }
    } else if (line.ownership === 'BRANCH') {
      branchTotalCents += line.totalDiscountAmount;
    } else {
      sharedTotalCents += line.totalDiscountAmount;
    }
  }

  return {
    lines,
    platformTotalCents,
    branchTotalCents,
    sharedTotalCents,
    platformPaybackCents,
  };
}

export function parseInvoicePeriodBreakdown(value: unknown): InvoicePeriodBreakdown | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  const required = [
    'grossAmount',
    'deliveryFee',
    'commissionFee',
    'gatewayFee',
    'netAmount',
    'orderCount',
  ] as const;
  for (const key of required) {
    if (typeof o[key] !== 'number' || !Number.isFinite(o[key])) return null;
  }

  const gross = o.grossAmount as number;
  const commission = o.commissionFee as number;
  const gateway = o.gatewayFee as number;
  const net = o.netAmount as number;
  const convenienceRaw = o.convenienceFee;
  const onlineWalletRaw =
    typeof o.onlineWalletGross === 'number' && Number.isFinite(o.onlineWalletGross)
      ? o.onlineWalletGross
      : typeof o.gatewayBase === 'number' && Number.isFinite(o.gatewayBase)
        ? o.gatewayBase
        : gross;
  const convenienceFeeCents =
    typeof convenienceRaw === 'number' && Number.isFinite(convenienceRaw)
      ? convenienceRaw
      : Math.max(0, onlineWalletRaw - commission - gateway - net);

  const gatewayBase =
    typeof o.gatewayBase === 'number' && Number.isFinite(o.gatewayBase)
      ? o.gatewayBase
      : onlineWalletRaw;

  return {
    grossAmountCents: gross,
    onlineWalletGrossCents: onlineWalletRaw,
    gatewayBaseCents: gatewayBase,
    deliveryFeeCents: o.deliveryFee as number,
    commissionFeeCents: commission,
    gatewayFeeCents: gateway,
    convenienceFeeCents,
    netAmountCents: net,
    orderCount: o.orderCount as number,
  };
}

function dashOrOrders(count: number): string {
  return count > 0 ? String(count) : '—';
}

function dashOrLineAmount(cents: number): string {
  return cents > 0 ? formatInvoiceLineAmount(cents) : '—';
}

/** Page 1 PLATFORM SALES — always four channels plus a total row. */
export function buildPlatformSalesRows(
  cs: InvoiceChannelSummary | null | undefined,
): WithdrawalTableRow[] {
  const byLabel = new Map((cs?.channels ?? []).map((ch) => [ch.label, ch]));
  const rows: WithdrawalTableRow[] = INVOICE_CHANNEL_ORDER.map((key) => {
    const label = INVOICE_CHANNEL_LABELS[key];
    const ch = byLabel.get(label);
    const orders = ch?.orderCount ?? 0;
    const sales = ch?.grossSalesCents ?? 0;
    return {
      label,
      orders: dashOrOrders(orders),
      amount: dashOrLineAmount(sales),
      muted: orders <= 0,
    };
  });
  rows.push({
    label: 'Total platform sales',
    orders: String(cs?.totalOrders ?? 0),
    amount: formatInvoiceLkr(cs?.totalGrossSalesCents ?? 0),
    bold: true,
    highlight: true,
  });
  return rows;
}

const FIRST_PAYOUT_DEFERRED_LINE_LABELS = new Set([
  'Commission',
  'Platform-owned discount',
  'Shared platform discount cost',
  'Loyalty Points by Platform',
  '– Platform Discounts',
  '– Loyalty Points by Platform',
  '– Net Platform Amount',
]);

const FIRST_PAYOUT_DEFERRED_TOTAL_LABELS = new Set([
  'Total by Cost Partner',
  'Total Refund Amount',
]);

/** Display-only: Payout 1 invoice amounts settled in Payout 2. */
export function formatFirstPayoutInvoiceAmount(
  label: string,
  cents: number,
  cycleStage?: string | null,
  mode: 'line' | 'lkr' = 'line',
): string {
  if (cycleStage !== 'FIRST') {
    return mode === 'lkr' ? formatInvoiceLkr(cents) : formatInvoiceLineAmount(cents);
  }
  if (
    (label === 'Net Platform Amount' || label === 'Branch Net Payout' || label === 'Total Sale') &&
    mode === 'lkr'
  ) {
    return formatInvoiceLkr(cents);
  }
  if (
    label === 'Online Wallet Amount' ||
    label.startsWith('– Payment Gateway Fee') ||
    label === INVOICE_PRIOR_PAYOUT_ONLINE_WALLET_ROW_LABEL ||
    label === 'Branch wallet before gateway'
  ) {
    return mode === 'lkr' ? formatInvoiceLkr(cents) : formatInvoiceLineAmount(cents);
  }
  if (FIRST_PAYOUT_DEFERRED_TOTAL_LABELS.has(label) && mode === 'lkr' && cents === 0) {
    return INVOICE_FIRST_CYCLE_DEFERRED_AMOUNT_LABEL;
  }
  if (FIRST_PAYOUT_DEFERRED_LINE_LABELS.has(label) || cents === 0) {
    return INVOICE_FIRST_CYCLE_DEFERRED_LINE_PLACEHOLDER;
  }
  return mode === 'lkr' ? formatInvoiceLkr(cents) : formatInvoiceLineAmount(cents);
}

/** Net branch payout lines (page 1 invoice summary + page 2 section). */
export function buildNetBranchPayoutRows(
  statement: InvoicePayoutStatement,
  opts?: { cycleStage?: string | null },
): WithdrawalTableRow[] {
  const rateLabel = Number.isInteger(statement.gatewayRatePct)
    ? `${statement.gatewayRatePct}`
    : String(statement.gatewayRatePct);

  const bankHint =
    statement.bankPenaltyOrderCount > 0
      ? `LKR 150 × ${statement.bankPenaltyOrderCount} order${
          statement.bankPenaltyOrderCount === 1 ? '' : 's'
        }`
      : undefined;

  const stage = opts?.cycleStage;
  const rows: WithdrawalTableRow[] = [
    {
      label: 'Online Wallet Amount',
      amount: formatFirstPayoutInvoiceAmount(
        'Online Wallet Amount',
        statement.onlineWalletCents,
        stage,
      ),
    },
  ];
  if (statement.jasonPayoutTopUpCents > 0) {
    rows.push({
      label: '+ Jason Discounts',
      amount: formatFirstPayoutInvoiceAmount(
        '+ Jason Discounts',
        statement.jasonPayoutTopUpCents,
        stage,
      ),
    });
  }
  rows.push({
    label: '+ Non-returning refunds (Branch)',
    amount: formatFirstPayoutInvoiceAmount(
      '+ Non-returning refunds (Branch)',
      statement.nonReturningRefundsCents,
      stage,
    ),
  });
  if (statement.priorOnlineWalletAmountCents > 0) {
    rows.push({
      label: INVOICE_PRIOR_PAYOUT_ONLINE_WALLET_ROW_LABEL,
      amount: formatInvoiceLineAmount(statement.priorOnlineWalletAmountCents),
    });
  }
  if (statement.netPlatformAmountCents !== 0 || opts?.cycleStage === 'FIRST') {
    rows.push({
      label: '– Net Platform Amount',
      amount: formatFirstPayoutInvoiceAmount(
        '– Net Platform Amount',
        Math.abs(statement.netPlatformAmountCents),
        stage,
      ),
    });
  }
  const gatewayBaseCents = Math.max(
    0,
    statement.onlineWalletCents +
      statement.jasonPayoutTopUpCents -
      statement.priorOnlineWalletAmountCents +
      statement.nonReturningRefundsCents -
      Math.abs(statement.netPlatformAmountCents),
  );
  const branchWalletBeforeGatewayCents = Math.max(
    0,
    gatewayBaseCents - statement.bankPenaltyCents,
  );
  const gatewayFeeCentsForRows =
    statement.priorOnlineWalletAmountCents > 0
      ? Math.round(branchWalletBeforeGatewayCents * (statement.gatewayRatePct / 100))
      : statement.gatewayFeeCents;
  const showBeforeGatewaySubtotal = statement.priorOnlineWalletAmountCents > 0;
  const bankPenaltyRow: WithdrawalTableRow = {
    label: '– Bank penalty (branch cancellation)',
    amount: formatFirstPayoutInvoiceAmount(
      '– Bank penalty (branch cancellation)',
      statement.bankPenaltyCents,
      stage,
    ),
    hint: bankHint,
  };
  if (showBeforeGatewaySubtotal) {
    rows.push(bankPenaltyRow);
    rows.push({
      label: 'Branch wallet before gateway',
      amount: formatInvoiceLkr(branchWalletBeforeGatewayCents),
      bold: true,
    });
  }
  rows.push({
    label: `– Payment Gateway Fee ${rateLabel}%`,
    amount: formatFirstPayoutInvoiceAmount(
      `– Payment Gateway Fee ${rateLabel}%`,
      gatewayFeeCentsForRows,
      stage,
    ),
  });
  if (!showBeforeGatewaySubtotal) {
    rows.push(bankPenaltyRow);
  }
  rows.push({
    label: 'Branch Net Payout',
    amount: formatFirstPayoutInvoiceAmount(
      'Branch Net Payout',
      statement.branchNetPayoutCents,
      stage,
      'lkr',
    ),
    bold: true,
    highlight: true,
  });
  return rows;
}

/** Page 1 INVOICE SUMMARY — same breakdown as the net branch payout section. */
export function buildInvoiceSummaryRows(
  input: GenerateWithdrawalInvoiceInput,
  opts?: { withdrawalBreakdown?: unknown; cycleStage?: string | null },
): WithdrawalTableRow[] {
  return buildNetBranchPayoutRows(resolvePayoutStatement(input, opts), opts);
}

/** Page 2 tables keyed by section title. */
export function buildPage2PayoutSections(
  statement: InvoicePayoutStatement,
  opts?: { cycleStage?: string | null },
): {
  title: string;
  rows: WithdrawalTableRow[];
}[] {
  const stage = opts?.cycleStage;
  const netPlatformRows: WithdrawalTableRow[] = [
    {
      label: 'Commission',
      amount: formatFirstPayoutInvoiceAmount('Commission', statement.commissionCents, stage),
    },
    {
      label: '– Platform Discounts',
      amount: formatFirstPayoutInvoiceAmount(
        '– Platform Discounts',
        statement.platformDiscountsReportCents,
        stage,
      ),
    },
  ];
  if (statement.loyaltyDiscountCents > 0 || stage === 'FIRST') {
    netPlatformRows.push({
      label: '– Loyalty Points by Platform',
      amount: formatFirstPayoutInvoiceAmount(
        '– Loyalty Points by Platform',
        statement.loyaltyDiscountCents,
        stage,
      ),
    });
  }
  netPlatformRows.push({
    label: 'Net Platform Amount',
    amount: formatFirstPayoutInvoiceAmount(
      'Net Platform Amount',
      statement.netPlatformAmountCents,
      stage,
      'lkr',
    ),
    bold: true,
    highlight: true,
  });

  const netBranchRows = buildNetBranchPayoutRows(statement, opts);
  const sections: { title: string; rows: WithdrawalTableRow[] }[] = [
    {
      title: 'Branch payout calculation',
      rows: [
        {
          label: 'Total Sale',
          amount: formatFirstPayoutInvoiceAmount('Total Sale', statement.totalSaleCents, stage),
        },
        {
          label: 'Online Wallet Amount',
          amount: formatFirstPayoutInvoiceAmount(
            'Online Wallet Amount',
            statement.onlineWalletCents,
            stage,
          ),
        },
        {
          label: 'Commission',
          amount: formatFirstPayoutInvoiceAmount('Commission', statement.commissionCents, stage),
        },
      ],
    },
    {
      title: 'Discounts',
      rows: [
        {
          label: 'Branch',
          amount: formatFirstPayoutInvoiceAmount('Branch', statement.branchDiscountCents, stage),
        },
        {
          label: 'Platform-owned discount',
          amount: formatFirstPayoutInvoiceAmount(
            'Platform-owned discount',
            statement.platformOwnedPromoCents,
            stage,
          ),
        },
        {
          label: 'Shared platform discount cost',
          amount: formatFirstPayoutInvoiceAmount(
            'Shared platform discount cost',
            statement.sharedPlatformDiscountCents,
            stage,
          ),
        },
        {
          label: 'Loyalty Points by Platform',
          amount: formatFirstPayoutInvoiceAmount(
            'Loyalty Points by Platform',
            statement.loyaltyDiscountCents,
            stage,
          ),
        },
        {
          label: 'Jason',
          amount: formatFirstPayoutInvoiceAmount('Jason', statement.jasonDiscountCents, stage),
        },
        {
          label: 'Total by Cost Partner',
          amount: formatFirstPayoutInvoiceAmount(
            'Total by Cost Partner',
            statement.costPartnerTotalCents,
            stage,
            'lkr',
          ),
          bold: true,
          highlight: true,
        },
      ],
    },
    {
      title: 'Refunds',
      rows: [
        {
          label: 'Non-returning refunds (Branch)',
          amount: formatFirstPayoutInvoiceAmount(
            'Non-returning refunds (Branch)',
            statement.nonReturningRefundsCents,
            stage,
          ),
        },
        {
          label: 'Platform Refunds',
          amount: formatFirstPayoutInvoiceAmount(
            'Platform Refunds',
            statement.platformRefundsCents,
            stage,
          ),
        },
        {
          label: 'Delivery Refunds',
          amount: formatFirstPayoutInvoiceAmount(
            'Delivery Refunds',
            statement.deliveryRefundsCents,
            stage,
          ),
        },
        {
          label: 'Total Refund Amount',
          amount: formatFirstPayoutInvoiceAmount(
            'Total Refund Amount',
            statement.totalRefundCents,
            stage,
            'lkr',
          ),
          bold: true,
          highlight: true,
        },
      ],
    },
  ];
  sections.push({ title: 'Net platform amount', rows: netPlatformRows });
  sections.push({ title: 'Net branch payout', rows: netBranchRows });
  return sections;
}
