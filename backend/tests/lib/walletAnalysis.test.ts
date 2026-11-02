import { describe, expect, it } from 'vitest';
import {
  buildBranchContributions,
  buildIncomingFlows,
  buildOutgoingFlows,
  classifyWalletTxnDirection,
  computeHealthPercent,
  centsToLkr,
  jasonLedgerPeriodWhere,
  padDailyTrend,
  resolveMonthWindow,
} from '../../src/lib/walletAnalysis';

describe('classifyWalletTxnDirection', () => {
  it('classifies order credits as inflow', () => {
    expect(classifyWalletTxnDirection('ORDER_PAYMENT', 15000)).toBe('inflow');
    expect(classifyWalletTxnDirection('ORDER_ADDON_PAYMENT', 500)).toBe('inflow');
  });

  it('classifies refunds and payouts as outflow', () => {
    expect(classifyWalletTxnDirection('REFUND', -2000)).toBe('outflow');
    expect(classifyWalletTxnDirection('PAYOUT', -8000)).toBe('outflow');
    expect(classifyWalletTxnDirection('REFUND', 2000)).toBe('outflow');
  });

  it('classifies adjustments by sign', () => {
    expect(classifyWalletTxnDirection('ADJUSTMENT', 1000)).toBe('inflow');
    expect(classifyWalletTxnDirection('ADJUSTMENT', -1000)).toBe('outflow');
    expect(classifyWalletTxnDirection('ADJUSTMENT', 0)).toBe('ignore');
  });
});

describe('resolveMonthWindow', () => {
  it('returns full month for past months', () => {
    const window = resolveMonthWindow('2026-01', new Date('2026-09-08T12:00:00.000Z'));
    expect(window.from).toBe('2026-01-01');
    expect(window.to).toBe('2026-01-31');
    expect(window.lastDay).toBe(31);
  });

  it('caps current month at today', () => {
    const window = resolveMonthWindow('2026-09', new Date('2026-09-08T12:00:00.000Z'));
    expect(window.from).toBe('2026-09-01');
    expect(window.to).toBe('2026-09-08');
    expect(window.lastDay).toBe(8);
  });

  it('rejects invalid month keys', () => {
    expect(() => resolveMonthWindow('2026-13')).toThrow(/Invalid month/);
    expect(() => resolveMonthWindow('sep')).toThrow(/Invalid month/);
  });
});

describe('padDailyTrend', () => {
  it('pads every day with zeros and converts cents to LKR', () => {
    const byDay = new Map([
      [1, { inflowCents: 10000, outflowCents: 2500 }],
      [3, { inflowCents: 5000, outflowCents: 0 }],
    ]);
    const points = padDailyTrend(3, byDay);
    expect(points).toEqual([
      { day: 1, label: '1', inflow: 100, outflow: 25 },
      { day: 2, label: '2', inflow: 0, outflow: 0 },
      { day: 3, label: '3', inflow: 50, outflow: 0 },
    ]);
  });
});

describe('computeHealthPercent', () => {
  it('returns retention rate when inflow is positive', () => {
    expect(computeHealthPercent(1000, 250)).toBe(75);
    expect(computeHealthPercent(100, 200)).toBe(0);
  });

  it('handles zero inflow', () => {
    expect(computeHealthPercent(0, 50)).toBe(0);
    expect(computeHealthPercent(0, 0)).toBe(100);
  });
});

describe('buildBranchContributions', () => {
  it('sorts by amount and assigns percentages', () => {
    const rows = buildBranchContributions([
      { branchId: 'a', label: 'A', amountCents: 25000 },
      { branchId: 'b', label: 'B', amountCents: 75000 },
      { branchId: 'c', label: 'C', amountCents: 0 },
    ]);
    expect(rows).toEqual([
      { branchId: 'b', label: 'B', amount: 750, percent: 75 },
      { branchId: 'a', label: 'A', amount: 250, percent: 25 },
    ]);
  });

  it('returns empty when all zero', () => {
    expect(buildBranchContributions([{ branchId: 'a', label: 'A', amountCents: 0 }])).toEqual([]);
  });
});

describe('centsToLkr', () => {
  it('converts integer cents', () => {
    expect(centsToLkr(12345)).toBe(123.45);
  });
});

describe('buildIncomingFlows', () => {
  it('includes Jason investment and the four order channels with exact labels', () => {
    const rows = buildIncomingFlows({
      pickupOnlineLkr: 100,
      deliveryOnlineLkr: 200,
      convenienceLkr: 30,
      deliveryFeeLkr: 40,
      jasonInvestmentLkr: 500,
    });
    expect(rows.map((r) => r.key)).toEqual([
      'pickup',
      'delivery',
      'convenience',
      'deliveryFee',
      'jasonInvestment',
    ]);
    expect(rows.find((r) => r.key === 'jasonInvestment')).toEqual({
      key: 'jasonInvestment',
      label: 'Jason investment',
      amount: 500,
    });
  });

  it('hides zero categories', () => {
    const rows = buildIncomingFlows({
      pickupOnlineLkr: 10,
      deliveryOnlineLkr: 0,
      convenienceLkr: 0,
      deliveryFeeLkr: 0,
      jasonInvestmentLkr: 0,
    });
    expect(rows).toEqual([
      { key: 'pickup', label: 'Online pickup payments', amount: 10 },
    ]);
  });
});

describe('buildOutgoingFlows', () => {
  it('uses the five canonical outgoing categories and labels', () => {
    const rows = buildOutgoingFlows({
      deliveryPartnerLkr: 100,
      platformCommissionLkr: 200,
      paymentGatewayLkr: 50,
      refundBankPenaltyLkr: 25,
      jasonExpensesLkr: 75,
    });
    expect(rows).toEqual([
      { key: 'partner', label: 'Delivery partner payment', amount: 100 },
      { key: 'platform', label: 'Platform provider commission', amount: 200 },
      { key: 'gateway', label: 'Payment gateway payments', amount: 50 },
      { key: 'refundBankPenalty', label: 'Refund bank penalty payment', amount: 25 },
      { key: 'jasonExpenses', label: 'Jason expenses', amount: 75 },
    ]);
  });

  it('does not include branch payouts, other outflows, or broad refunds', () => {
    const keys = buildOutgoingFlows({
      deliveryPartnerLkr: 1,
      platformCommissionLkr: 1,
      paymentGatewayLkr: 1,
      refundBankPenaltyLkr: 1,
      jasonExpensesLkr: 1,
    }).map((r) => r.key);
    expect(keys).not.toContain('payouts');
    expect(keys).not.toContain('other');
    expect(keys).not.toContain('refunds');
    expect(keys).toContain('refundBankPenalty');
  });

  it('maps refund bank penalty independently from full refund wallet totals', () => {
    const penaltyOnly = buildOutgoingFlows({
      deliveryPartnerLkr: 0,
      platformCommissionLkr: 0,
      paymentGatewayLkr: 0,
      refundBankPenaltyLkr: 19.5,
      jasonExpensesLkr: 0,
    });
    expect(penaltyOnly).toEqual([
      {
        key: 'refundBankPenalty',
        label: 'Refund bank penalty payment',
        amount: 19.5,
      },
    ]);
  });
});

describe('jasonLedgerPeriodWhere', () => {
  it('scopes to storeId when a branch filter is set', () => {
    const where = jasonLedgerPeriodWhere('INVESTMENT', '2026-09-01', '2026-09-30', 'store-1');
    expect(where.type).toBe('INVESTMENT');
    expect(where.isActive).toBe(true);
    expect(where.storeId).toBe('store-1');
    expect(where.occurredAt.gte).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(where.occurredAt.lte).toEqual(new Date('2026-09-30T23:59:59.999Z'));
  });

  it('omits storeId for All Branches so global rows are included', () => {
    const where = jasonLedgerPeriodWhere('EXPENSE', '2026-09-01', '2026-09-08', null);
    expect(where.type).toBe('EXPENSE');
    expect(where).not.toHaveProperty('storeId');
  });
});
