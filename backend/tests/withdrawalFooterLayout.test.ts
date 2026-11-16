import { describe, expect, it } from 'vitest';
import {
  computeWithdrawalFooterLayout,
  layoutFooterBelowNotes,
  resolveWithdrawalFooterLayout,
} from '../src/lib/invoice/withdrawalPdfDrawing';

const A4_PAGE_H = 841.89;

describe('withdrawal invoice footer layout', () => {
  it('keeps default footer when content ends above the reserved zone', () => {
    const defaultLayout = computeWithdrawalFooterLayout(A4_PAGE_H);
    const layout = layoutFooterBelowNotes(A4_PAGE_H, 520);
    expect(layout).toEqual(defaultLayout);
  });

  it('pushes footer below content when it would overlap the net payout table', () => {
    const layout = layoutFooterBelowNotes(A4_PAGE_H, 760);
    const defaultLayout = computeWithdrawalFooterLayout(A4_PAGE_H);
    expect(layout.footerRuleY).toBeGreaterThan(defaultLayout.footerRuleY);
    expect(layout.footerRuleY).toBe(760 + 18);
  });

  it('flags overflow when footer would extend past the page', () => {
    const resolved = resolveWithdrawalFooterLayout(A4_PAGE_H, 820);
    expect(resolved.overflowsPage).toBe(true);
  });
});
