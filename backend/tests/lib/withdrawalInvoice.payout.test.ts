import { describe, expect, it } from 'vitest';
import type { ChannelSettlementRow } from '../../src/lib/commission';
import { formatInvoiceLineAmount, formatInvoiceLkr } from '../../src/lib/invoice/format';
import type { GenerateWithdrawalInvoiceInput, InvoiceChannelSummary } from '../../src/lib/invoice/types';
import { buildNetBranchPayoutRows } from '../../src/lib/invoice/dataBuilders';
import { INVOICE_PRIOR_PAYOUT_ONLINE_WALLET_ROW_LABEL } from '../../src/lib/invoice/payoutInvoiceCopy';
import {
  buildInvoiceSummaryRows,
  buildOnlineGrossCalculation,
  buildPage2PayoutSections,
  buildPayoutStatementFromBreakdown,
  buildPlatformSalesRows,
  renderWithdrawalInvoiceToBuffer,
} from '../../src/lib/withdrawalInvoice';

function emptyChannelRow(): ChannelSettlementRow {
  return {
    revenueSubtotal: 0,
    commission: 0,
    rate: 0,
    orderCount: 0,
    grossSalesTotal: 0,
    convenientFeeTotal: 0,
  };
}

describe('buildOnlineGrossCalculation', () => {
  it('shows revenue subtotal only — excludes delivery and convenience fees', () => {
    const pickupOnline: ChannelSettlementRow = {
      ...emptyChannelRow(),
      payhereTotal: 500,
      payhereRevenueSubtotal: 450,
      payhereConvenienceFee: 50,
      revenueSubtotal: 450,
      orderCount: 2,
    };
    const deliveryOnline: ChannelSettlementRow = {
      ...emptyChannelRow(),
      payhereTotal: 1200,
      payhereRevenueSubtotal: 1000,
      payhereDeliveryFee: 150,
      payhereConvenienceFee: 50,
      revenueSubtotal: 1000,
      orderCount: 3,
    };

    const result = buildOnlineGrossCalculation(pickupOnline, deliveryOnline);

    expect(result).toBe('Revenue subtotal 1,450.00');
    expect(result).not.toContain('Delivery fee');
    expect(result).not.toContain('Convenience fee');
    expect(result).not.toContain(' + ');
  });
});

describe('formatInvoiceLkr', () => {
  it('formats currency as LKR 28,080.00', () => {
    expect(formatInvoiceLkr(2_808_000)).toBe('LKR 28,080.00');
  });

  it('formats negative amounts as - LKR 2,312.80', () => {
    expect(formatInvoiceLkr(-231_280)).toBe('- LKR 2,312.80');
  });

  it('formats zero as LKR 0.00', () => {
    expect(formatInvoiceLkr(0)).toBe('LKR 0.00');
  });
});

describe('formatInvoiceLineAmount', () => {
  it('formats line amounts without a currency prefix', () => {
    expect(formatInvoiceLineAmount(2_808_000)).toBe('28,080.00');
    expect(formatInvoiceLineAmount(0)).toBe('0.00');
  });

  it('formats negative line amounts with a leading minus', () => {
    expect(formatInvoiceLineAmount(-231_280)).toBe('- 2,312.80');
  });
});

describe('buildPlatformSalesRows', () => {
  it('always renders four channels plus a highlighted total', () => {
    const cs: InvoiceChannelSummary = {
      channels: [
        { label: 'Pickup cash', orderCount: 0, commissionRatePct: null, grossSalesCents: 0 },
        { label: 'Pickup card', orderCount: 0, commissionRatePct: null, grossSalesCents: 0 },
        { label: 'Pickup online', orderCount: 0, commissionRatePct: null, grossSalesCents: 0 },
        { label: 'Delivery online', orderCount: 1, commissionRatePct: 12, grossSalesCents: 53000 },
      ],
      totalOrders: 1,
      totalGrossSalesCents: 53000,
      commissionBaseCents: 53000,
      onlineWalletGrossCents: 53000,
      onlineGrossCalculation: null,
      convenienceBaseCents: 0,
      commissionRatePct: 12,
    };

    const rows = buildPlatformSalesRows(cs);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ label: 'Pickup cash', orders: '—', amount: '—' });
    expect(rows[3]).toMatchObject({
      label: 'Delivery online',
      orders: '1',
      amount: '530.00',
    });
    expect(rows[4]).toMatchObject({
      label: 'Total platform sales',
      orders: '1',
      amount: 'LKR 530.00',
      bold: true,
      highlight: true,
    });
  });

  it('renders empty dashes when channel summary is missing', () => {
    const rows = buildPlatformSalesRows(null);
    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 4).every((row) => row.amount === '—')).toBe(true);
    expect(rows[4]?.amount).toBe('LKR 0.00');
  });
});

describe('resolvePriorOnlineWalletAmountCentsFromBreakdown', () => {
  it('uses firstPayoutOnlineSubtotalCents on Payout 2 snapshots', async () => {
    const { resolvePriorOnlineWalletAmountCentsFromBreakdown } = await import(
      '../../src/lib/invoice/payoutStatement'
    );
    expect(
      resolvePriorOnlineWalletAmountCentsFromBreakdown(
        {
          cycleStage: 'SECOND',
          firstPayoutOnlineSubtotalCents: 2_149_000,
          commissionFee: 80_936,
        },
        'SECOND',
      ),
    ).toBe(2_149_000);
  });

  it('does not treat Payout 1 subtotal as a prior deduction on Payout 1 invoices', async () => {
    const { resolvePriorOnlineWalletAmountCentsFromBreakdown } = await import(
      '../../src/lib/invoice/payoutStatement'
    );
    expect(
      resolvePriorOnlineWalletAmountCentsFromBreakdown(
        {
          cycleStage: 'FIRST',
          firstPayoutOnlineSubtotalCents: 2_149_000,
        },
        'FIRST',
      ),
    ).toBe(0);
  });
});

describe('buildNetBranchPayoutRows', () => {
  it('includes prior Payout 1 online wallet on Payout 2 invoices (display only)', () => {
    const statement = buildPayoutStatementFromBreakdown(
      {
        cycleStage: 'SECOND',
        onlinePaymentsCollected: 3_160_500,
        firstPayoutOnlineSubtotalCents: 2_149_000,
        commissionFee: 80_936,
        gatewayFee: 19_219,
        sharedPromoJasonContributionAmount: 69_100,
      },
      980_445,
      true,
    );
    const rows = buildNetBranchPayoutRows(statement);
    expect(rows[1]).toMatchObject({
      label: INVOICE_PRIOR_PAYOUT_ONLINE_WALLET_ROW_LABEL,
      amount: '21,490.00',
    });
  });
});

describe('buildInvoiceSummaryRows', () => {
  it('matches the net branch payout section on page 2', () => {
    const input = {
      requestedCents: 500_000,
      channelSummary: { onlineWalletGrossCents: 500_000 },
      promoSummary: { platformPaybackCents: 10_000 },
      payoutStatement: buildPayoutStatementFromBreakdown(
        {
          grossAmount: 500_000,
          onlinePaymentsCollected: 500_000,
          commissionFee: 50_000,
          platformOwnedPromoDiscountTotal: 10_000,
          sharedPromoPlatformContributionAmount: 15_400,
          platformPaybackTotal: 10_000,
        },
        500_000,
        true,
      ),
    } as GenerateWithdrawalInvoiceInput;

    const summary = buildInvoiceSummaryRows(input);
    const netBranch = buildPage2PayoutSections(input.payoutStatement!).find(
      (s) => s.title === 'Net branch payout',
    );
    expect(summary).toEqual(netBranch?.rows);
  });

  it('ends with highlighted branch net payout from the locked statement', () => {
    const input = {
      requestedCents: 848548,
      channelSummary: { onlineWalletGrossCents: 53000 },
      promoSummary: { platformPaybackCents: 800000 },
    } as GenerateWithdrawalInvoiceInput;

    const rows = buildInvoiceSummaryRows(input);
    expect(rows[0]?.label).toBe('Online Wallet Amount');
    expect(rows.at(-1)).toMatchObject({
      label: 'Branch Net Payout',
      amount: 'LKR 8,485.48',
      bold: true,
      highlight: true,
    });
  });
});

describe('buildPayoutStatementFromBreakdown', () => {
  it('maps stored breakdown cents into cost-partner discounts, refunds, and bank penalty', () => {
    const statement = buildPayoutStatementFromBreakdown(
      {
        grossAmount: 2_808_000,
        onlinePaymentsCollected: 2_808_000,
        commissionFee: 182_520,
        branchOwnedPromoDiscountTotal: 188_200,
        platformOwnedPromoDiscountTotal: 413_800,
        sharedPromoBranchContributionAmount: 0,
        sharedPromoPlatformContributionAmount: 0,
        sharedPromoJasonContributionAmount: 0,
        periodLoyaltyDiscountTotal: 100_000,
        platformPaybackTotal: 413_800,
        netPlatformEarning: -231_280,
        customerLateCancelSubtotal: 484_000,
        rejectedRefundSubtotal: 0,
        refundConvenienceFee: 10_000,
        rejectedRefundConvenienceFee: 0,
        refundDeliveryFee: 50_000,
        rejectedRefundDeliveryFee: 0,
        gatewayFee: 53_352,
        gatewayRatePct: 1.9,
        cancelledByBranchGatewayFee: 15_000,
        cancelledByBranchOrderCount: 1,
      },
      3_445_732,
      true,
    );

    expect(statement.totalSaleCents).toBe(2_808_000);
    expect(statement.onlineWalletCents).toBe(2_808_000);
    expect(statement.commissionCents).toBe(182_520);
    expect(statement.branchDiscountCents).toBe(188_200);
    expect(statement.platformDiscountCents).toBe(513_800);
    expect(statement.jasonDiscountCents).toBe(0);
    expect(statement.costPartnerTotalCents).toBe(702_000);
    expect(statement.nonReturningRefundsCents).toBe(484_000);
    expect(statement.platformRefundsCents).toBe(10_000);
    expect(statement.deliveryRefundsCents).toBe(50_000);
    expect(statement.totalRefundCents).toBe(544_000);
    expect(statement.platformDiscountsReportCents).toBe(413_800);
    expect(statement.platformOwnedPromoCents).toBe(413_800);
    expect(statement.sharedPlatformDiscountCents).toBe(0);
    expect(statement.platformPaybackCents).toBe(413_800);
    expect(statement.netPlatformAmountCents).toBe(-331_280);
    expect(statement.bankPenaltyCents).toBe(15_000);
    expect(statement.bankPenaltyOrderCount).toBe(1);
    expect(statement.branchNetPayoutCents).toBe(3_445_732);
  });

  it('maps shared platform discount cost from breakdown', () => {
    const statement = buildPayoutStatementFromBreakdown(
      {
        grossAmount: 500_000,
        commissionFee: 50_000,
        platformOwnedPromoDiscountTotal: 10_000,
        sharedPromoPlatformContributionAmount: 15_400,
        platformPaybackTotal: 10_000,
      },
      450_000,
      true,
    );
    expect(statement.sharedPlatformDiscountCents).toBe(15_400);
    expect(statement.platformDiscountsReportCents).toBe(25_400);
  });

  it('ignores platform payback when payback is disabled', () => {
    const statement = buildPayoutStatementFromBreakdown(
      {
        grossAmount: 100_000,
        commissionFee: 10_000,
        platformPaybackTotal: 8_000,
        platformOwnedPromoDiscountTotal: 8_000,
        sharedPromoPlatformContributionAmount: 0,
      },
      90_000,
      false,
    );
    expect(statement.platformDiscountsReportCents).toBe(8_000);
    expect(statement.netPlatformAmountCents).toBe(2_000);
  });
});

describe('buildPage2PayoutSections', () => {
  const statement = buildPayoutStatementFromBreakdown(
    {
      grossAmount: 2_808_000,
      onlinePaymentsCollected: 2_808_000,
      commissionFee: 182_520,
      branchOwnedPromoDiscountTotal: 188_200,
      platformOwnedPromoDiscountTotal: 513_800,
      sharedPromoJasonContributionAmount: 0,
      periodLoyaltyDiscountTotal: 0,
      platformPaybackTotal: 413_800,
      netPlatformEarning: -231_280,
      customerLateCancelSubtotal: 484_000,
      refundConvenienceFee: 10_000,
      refundDeliveryFee: 50_000,
      gatewayFee: 53_352,
      gatewayRatePct: 1.9,
      cancelledByBranchGatewayFee: 15_000,
      cancelledByBranchOrderCount: 1,
    },
    3_445_732,
    true,
  );

  it('always prints listed discount and refund rows including zeros', () => {
    const discounts = buildPage2PayoutSections(statement).find((s) => s.title === 'Discounts');
    expect(discounts?.rows.map((row) => row.label)).toEqual([
      'Branch',
      'Platform-owned discount',
      'Shared platform discount cost',
      'Loyalty Points by Platform',
      'Jason',
      'Total by Cost Partner',
    ]);
    expect(discounts?.rows.find((row) => row.label === 'Jason')?.amount).toBe('0.00');

    const refunds = buildPage2PayoutSections(statement).find((s) => s.title === 'Refunds');
    expect(refunds?.rows.at(-1)).toMatchObject({
      label: 'Total Refund Amount',
      amount: 'LKR 5,440.00',
      highlight: true,
    });
  });

  it('shows the bank-penalty hint and highlighted branch net payout', () => {
    const netBranch = buildPage2PayoutSections(statement).find((s) => s.title === 'Net branch payout');
    const penalty = netBranch?.rows.find((row) => row.label.startsWith('– Bank penalty'));
    expect(penalty?.hint).toBe('LKR 150 × 1 order');
    expect(penalty?.amount).toBe('150.00');
    expect(netBranch?.rows.at(-1)).toMatchObject({
      label: 'Branch Net Payout',
      amount: 'LKR 34,457.32',
      bold: true,
      highlight: true,
    });
  });

  it('adds extra net-platform and jason rows only when non-zero', () => {
    const withoutJason = buildPage2PayoutSections(statement).find((s) => s.title === 'Net branch payout');
    expect(withoutJason?.rows.some((row) => row.label === '+ Jason Discounts')).toBe(false);
    expect(withoutJason?.rows.some((row) => row.label === '– Net Platform Amount')).toBe(true);

    const withJason = buildPage2PayoutSections({
      ...statement,
      jasonPayoutTopUpCents: 50_000,
      loyaltyDiscountCents: 0,
    }).find((s) => s.title === 'Net branch payout');
    expect(withJason?.rows.some((row) => row.label === '+ Jason Discounts')).toBe(true);
  });
});

describe('renderWithdrawalInvoiceToBuffer', () => {
  it('renders a 2-page PDF with Inter', async () => {
    const buffer = await renderWithdrawalInvoiceToBuffer({
      storeId: 'store-1',
      withdrawalId: 'c2e8f882-aaaa-bbbb-cccc-ddddeeeeffff',
      storeName: 'Bing Chun - Dehiwala',
      branchBalanceCents: 0,
      requestedCents: 848548,
      balanceAfterCents: 0,
      netTransferableEarningsCents: 0,
      netTransferableEarningsAsOf: new Date('2026-09-16T00:00:00.000Z'),
      remainingNetTransferableCents: 0,
      paymentMethod: 'BANK_TRANSFER',
      approvedAt: new Date('2026-09-16T00:00:00.000Z'),
      periodFrom: new Date('2026-08-29T00:00:00.000Z'),
      periodTo: new Date('2026-09-12T23:59:59.999Z'),
      channelSummary: {
        channels: [
          { label: 'Pickup cash', orderCount: 0, commissionRatePct: null, grossSalesCents: 0 },
          { label: 'Pickup card', orderCount: 0, commissionRatePct: null, grossSalesCents: 0 },
          { label: 'Pickup online', orderCount: 0, commissionRatePct: null, grossSalesCents: 0 },
          { label: 'Delivery online', orderCount: 1, commissionRatePct: 12, grossSalesCents: 53000 },
        ],
        totalOrders: 1,
        totalGrossSalesCents: 53000,
        commissionBaseCents: 53000,
        onlineWalletGrossCents: 53000,
        onlineGrossCalculation: null,
        convenienceBaseCents: 0,
        commissionRatePct: 12,
      },
      promoSummary: {
        lines: [],
        platformTotalCents: 800000,
        branchTotalCents: 0,
        sharedTotalCents: 0,
        platformPaybackCents: 800000,
      },
      payoutStatement: {
        totalSaleCents: 2_808_000,
        onlineWalletCents: 2_808_000,
        commissionCents: 182_520,
        branchDiscountCents: 188_200,
        platformDiscountCents: 513_800,
        jasonDiscountCents: 0,
        costPartnerTotalCents: 702_000,
        nonReturningRefundsCents: 484_000,
        platformRefundsCents: 10_000,
        deliveryRefundsCents: 50_000,
        totalRefundCents: 544_000,
        platformDiscountsReportCents: 413_800,
        loyaltyDiscountCents: 0,
        netPlatformAmountCents: -231_280,
        gatewayFeeCents: 53_352,
        gatewayRatePct: 1.9,
        bankPenaltyCents: 15_000,
        bankPenaltyOrderCount: 1,
        jasonPayoutTopUpCents: 0,
        branchNetPayoutCents: 3_445_732,
      },
    });

    expect(buffer.byteLength).toBeGreaterThan(1000);
    expect(buffer.slice(0, 4).toString('latin1')).toBe('%PDF');
    const pdf = buffer.toString('latin1');
    expect((pdf.match(/\/MediaBox/g) ?? []).length).toBe(2);
  });
});
