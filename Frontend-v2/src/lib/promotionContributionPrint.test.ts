import { describe, expect, it } from 'vitest';
import {
  buildPromotionContributionPrintHtml,
  buildPromotionContributionReference,
} from './promotionContributionPrint';

const baseArgs = {
  promotionTitle: 'Summer BOGO',
  promotionCode: 'BOGO2026',
  contributionSource: 'PLATFORM' as const,
  branchScope: 'selected' as const,
  rows: [
    { branchLabel: 'Balangoda', split: { branchSharePct: 20, platformSharePct: 80 } },
    { branchLabel: 'Rawathawatte', split: { branchSharePct: 30, platformSharePct: 70 } },
  ],
  reference: 'BOGO2026',
  dateLabel: '18 September 2026',
  logoSrc: 'https://example.com/logo.avif',
};

describe('buildPromotionContributionPrintHtml', () => {
  it('includes branch names and percentage values', () => {
    const html = buildPromotionContributionPrintHtml(baseArgs);
    expect(html).toContain('Balangoda');
    expect(html).toContain('Rawathawatte');
    expect(html).toContain('20%');
    expect(html).toContain('80%');
    expect(html).toContain('30%');
    expect(html).toContain('70%');
  });

  it('labels the second party as Platform or Jason', () => {
    const platformHtml = buildPromotionContributionPrintHtml(baseArgs);
    expect(platformHtml).toContain('Platform %');
    expect(platformHtml).toContain('Branch + Platform');

    const jasonHtml = buildPromotionContributionPrintHtml({
      ...baseArgs,
      contributionSource: 'JASON',
    });
    expect(jasonHtml).toContain('Jason %');
    expect(jasonHtml).toContain('Branch + Jason');
  });

  it('renders three columns only (no status column)', () => {
    const html = buildPromotionContributionPrintHtml(baseArgs);
    expect(html).not.toContain('<th>Status</th>');
    expect(html).not.toContain('Balanced');
    expect(html).not.toContain('Must total 100%');
    expect(html).not.toContain('status-warn');
  });

  it('still outputs contribution percentages for unbalanced splits', () => {
    const html = buildPromotionContributionPrintHtml({
      ...baseArgs,
      rows: [{ branchLabel: 'Chilaw', split: { branchSharePct: 40, platformSharePct: 50 } }],
    });
    expect(html).toContain('Chilaw');
    expect(html).toContain('40%');
    expect(html).toContain('50%');
  });

  it('escapes HTML in promotion and branch names', () => {
    const html = buildPromotionContributionPrintHtml({
      ...baseArgs,
      promotionTitle: '<script>alert(1)</script>',
      rows: [{ branchLabel: 'Branch <A>', split: { branchSharePct: 50, platformSharePct: 50 } }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Branch &lt;A&gt;');
  });
});

describe('buildPromotionContributionReference', () => {
  it('uses promo code when provided', () => {
    expect(buildPromotionContributionReference('SAVE10')).toBe('SAVE10');
  });

  it('falls back to DRAFT prefix when code is empty', () => {
    expect(buildPromotionContributionReference('')).toMatch(/^DRAFT-\d+$/);
    expect(buildPromotionContributionReference('   ')).toMatch(/^DRAFT-\d+$/);
  });
});
