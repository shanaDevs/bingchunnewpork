import { describe, expect, it } from 'vitest';
import { buildPromotionReportPrintArgsFromPromo, formatBranchAvailabilityDetail } from './promotionReportFromPromo';
import { buildPromotionReportPrintHtml } from './promotionReportPrint';
import type { AdminPromoRow } from './promotionFormUtils';

const basePrintArgs = {
  reference: 'BOGO2026',
  dateLabel: '18 September 2026',
  logoSrc: 'https://example.com/logo.avif',
  title: 'Summer BOGO',
  code: 'BOGO2026',
  status: 'Active',
  typeLabel: 'Buy 1 Get 1',
  benefit: 'Buy 1 Get 1',
  scheduleLines: ['Starts  Immediately', 'Ends  1 Jan 2027', 'Home page  Shown'],
  usage: '2 total uses',
  ownershipLine: 'Ownership  Shared Promotion',
  contributionPartiesLine: 'Contribution parties  Branch + Platform',
  branchAvailability: 'Balangoda, Rawathawatte',
  targetingTags: ['Weekend', 'Buy 1 Get 1'],
  showContributionTable: true,
  secondPartyColumnLabel: 'Platform',
  contributionRows: [
    { branchLabel: 'Balangoda', branchSharePct: 20, platformSharePct: 80 },
    { branchLabel: 'Rawathawatte', branchSharePct: 30, platformSharePct: 70 },
  ],
};

function sharedPromo(overrides: Partial<AdminPromoRow> = {}): AdminPromoRow {
  return {
    id: 'promo-1',
    code: 'SHARED10',
    title: 'Shared Deal',
    description: '',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    minOrderValue: 0,
    isActive: true,
    usedCount: 3,
    promotionKind: 'PERCENTAGE_DISCOUNT',
    promotionRules: { discountPercent: 10 },
    ownership: 'SHARED',
    contributionSource: 'PLATFORM',
    branchSharePct: 50,
    platformSharePct: 50,
    branchShareSplits: {
      'store-a': { branchSharePct: 20, platformSharePct: 80 },
      'store-b': { branchSharePct: 30, platformSharePct: 70 },
    },
    storeIds: ['store-a', 'store-b'],
    criteria: ['datetime::Weekend'],
    ...overrides,
  };
}

describe('buildPromotionReportPrintHtml', () => {
  it('includes promotion identity, benefit, and usage', () => {
    const html = buildPromotionReportPrintHtml(basePrintArgs);
    expect(html).toContain('Summer BOGO');
    expect(html).toContain('BOGO2026');
    expect(html).toContain('Active');
    expect(html).toContain('2 total uses');
    expect(html).toContain('Buy 1 Get 1');
  });

  it('renders a three-column contribution table without Status', () => {
    const html = buildPromotionReportPrintHtml(basePrintArgs);
    expect(html).toContain('Branch %');
    expect(html).toContain('Platform %');
    expect(html).toContain('20%');
    expect(html).toContain('80%');
    expect(html).not.toContain('<th>Status</th>');
    expect(html).not.toContain('Balanced');
  });

  it('omits contribution table when showContributionTable is false', () => {
    const html = buildPromotionReportPrintHtml({
      ...basePrintArgs,
      showContributionTable: false,
      contributionRows: [],
    });
    expect(html).not.toContain('Per-branch cost sharing');
    expect(html).not.toContain('Platform %');
  });

  it('escapes HTML in title and branch names', () => {
    const html = buildPromotionReportPrintHtml({
      ...basePrintArgs,
      title: '<script>x</script>',
      contributionRows: [{ branchLabel: 'Branch <A>', branchSharePct: 50, platformSharePct: 50 }],
    });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('Branch &lt;A&gt;');
  });
});

describe('formatBranchAvailabilityDetail', () => {
  it('returns All branches when no store ids', () => {
    expect(formatBranchAvailabilityDetail([], [{ id: 's1', name: 'Colombo' }])).toBe('All branches');
  });

  it('lists branch names for selected stores', () => {
    const html = formatBranchAvailabilityDetail(
      ['s1', 's2'],
      [
        { id: 's1', name: 'Balangoda Branch' },
        { id: 's2', name: 'Chilaw' },
      ],
    );
    expect(html).toContain('Balangoda');
    expect(html).toContain('Chilaw');
  });
});

describe('buildPromotionReportPrintArgsFromPromo', () => {
  it('builds SHARED contribution rows from saved splits', () => {
    const args = buildPromotionReportPrintArgsFromPromo(
      sharedPromo(),
      [
        { id: 'store-a', name: 'Balangoda' },
        { id: 'store-b', name: 'Rawathawatte' },
      ],
      '18 September 2026',
    );
    expect(args.showContributionTable).toBe(true);
    expect(args.contributionRows).toHaveLength(2);
    expect(args.contributionRows[0].branchSharePct).toBe(20);
    expect(args.secondPartyColumnLabel).toBe('Platform');
  });

  it('hides contribution table for BRANCH ownership', () => {
    const args = buildPromotionReportPrintArgsFromPromo(
      sharedPromo({ ownership: 'BRANCH', branchShareSplits: null }),
      [],
      '18 September 2026',
    );
    expect(args.showContributionTable).toBe(false);
    expect(args.ownershipLine).toContain('Branch Promotion');
  });
});
