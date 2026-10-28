import { describe, expect, it } from 'vitest';
import {
  branchDisplayName,
  buildDateQuery,
  buildPeriodQuery,
  formatLkr,
  formatDateShort,
  formatReportPeriodFromDates,
  orderModeLabel,
  orderStatusLabel,
  reportScopeLabel,
} from './reportUtils';

describe('formatLkr', () => {
  it('formats amounts with en-LK grouping', () => {
    expect(formatLkr(1234.5)).toBe('1,234.5');
  });

  it('treats falsy as zero', () => {
    expect(formatLkr(0)).toBe('0');
    expect(formatLkr(NaN)).toBe('0');
  });
});

describe('formatDateShort', () => {
  it('returns em dash when value is missing', () => {
    expect(formatDateShort(null)).toBe('—');
    expect(formatDateShort(undefined)).toBe('—');
  });
});

describe('branchDisplayName', () => {
  it('strips Bing Chun prefix from branch names', () => {
    expect(branchDisplayName('Bing Chun - Colombo')).toBe('Colombo');
    expect(branchDisplayName('Bing Chun – Kandy')).toBe('Kandy');
  });

  it('returns em dash for empty names', () => {
    expect(branchDisplayName(null)).toBe('—');
  });
});

describe('reportScopeLabel', () => {
  const stores = [
    { id: 's1', name: 'Bing Chun - Galle' },
    { id: 's2', name: 'Matara' },
  ];

  it('prefers locked store name', () => {
    expect(reportScopeLabel({ lockedStoreName: 'Bing Chun - Negombo' })).toBe('Negombo');
  });

  it('returns All Branches when no store is selected', () => {
    expect(reportScopeLabel({})).toBe('All Branches');
  });

  it('resolves store name from list', () => {
    expect(reportScopeLabel({ storeId: 's1', stores })).toBe('Galle');
  });

  it('falls back when store id is unknown', () => {
    expect(reportScopeLabel({ storeId: 'missing', stores })).toBe('Selected Branch');
  });
});

describe('buildPeriodQuery', () => {
  it('builds all-time query', () => {
    expect(buildPeriodQuery('all')).toBe('period=all');
  });

  it('builds preset period query', () => {
    expect(buildPeriodQuery('month')).toBe('period=month');
  });

  it('builds custom range when from and to are set', () => {
    const from = new Date(2026, 0, 5);
    const to = new Date(2026, 0, 15);
    expect(buildPeriodQuery('custom', { from, to })).toBe(
      'period=custom&from=2026-01-05&to=2026-01-15',
    );
  });

  it('falls back to month when custom range is incomplete', () => {
    expect(buildPeriodQuery('custom', { from: new Date(2026, 0, 1) })).toBe('period=month');
  });
});

describe('buildDateQuery', () => {
  it('returns empty string when no dates', () => {
    expect(buildDateQuery()).toBe('');
  });

  it('builds query string with from and to', () => {
    expect(buildDateQuery('2026-01-01', '2026-01-31')).toBe('?from=2026-01-01&to=2026-01-31');
  });
});

describe('formatReportPeriodFromDates', () => {
  it('returns default label when no dates', () => {
    expect(formatReportPeriodFromDates()).toBe('All time');
    expect(formatReportPeriodFromDates(undefined, undefined, 'Custom empty')).toBe('Custom empty');
  });

  it('formats a from–to range', () => {
    expect(formatReportPeriodFromDates('2026-03-01', '2026-03-31')).toBe(
      '1 Mar 2026 – 31 Mar 2026',
    );
  });

  it('formats from-only and to-only labels', () => {
    expect(formatReportPeriodFromDates('2026-04-10')).toBe('From 10 Apr 2026');
    expect(formatReportPeriodFromDates(undefined, '2026-04-20')).toBe('Until 20 Apr 2026');
  });
});

describe('orderModeLabel', () => {
  it('maps known modes', () => {
    expect(orderModeLabel('DELIVERY')).toBe('Delivery');
    expect(orderModeLabel('TAKEAWAY')).toBe('Pickup');
  });

  it('returns em dash for unknown empty mode', () => {
    expect(orderModeLabel()).toBe('—');
  });
});

describe('orderStatusLabel', () => {
  it('maps admin-friendly status labels', () => {
    expect(orderStatusLabel('RECEIVED')).toBe('Pending');
    expect(orderStatusLabel('DELIVERED')).toBe('Completed');
  });

  it('returns raw status when unmapped', () => {
    expect(orderStatusLabel('UNKNOWN')).toBe('UNKNOWN');
  });
});
