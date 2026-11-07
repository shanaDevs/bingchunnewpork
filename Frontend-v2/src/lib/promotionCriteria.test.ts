import { describe, expect, it } from 'vitest';
import {
  isBranchShareSplitBalanced,
  parseBranchShareSplits,
  seedBranchShareSplits,
  validateSelectedBranchShareSplits,
} from './promotionCriteria';

describe('isBranchShareSplitBalanced', () => {
  it('returns true when branch and platform shares total 100', () => {
    expect(isBranchShareSplitBalanced({ branchSharePct: 50, platformSharePct: 50 })).toBe(true);
  });

  it('returns true for 0/100 and 100/0 splits', () => {
    expect(isBranchShareSplitBalanced({ branchSharePct: 0, platformSharePct: 100 })).toBe(true);
    expect(isBranchShareSplitBalanced({ branchSharePct: 100, platformSharePct: 0 })).toBe(true);
  });

  it('returns false when shares do not total 100', () => {
    expect(isBranchShareSplitBalanced({ branchSharePct: 40, platformSharePct: 50 })).toBe(false);
    expect(isBranchShareSplitBalanced({ branchSharePct: 101, platformSharePct: 0 })).toBe(false);
  });
});

describe('seedBranchShareSplits', () => {
  it('keeps only splits for selected storeIds', () => {
    const result = seedBranchShareSplits(
      ['branch-a'],
      {
        'branch-a': { branchSharePct: 40, platformSharePct: 60 },
        'branch-b': { branchSharePct: 70, platformSharePct: 30 },
      },
      { branchSharePct: 50, platformSharePct: 50 },
    );

    expect(result).toEqual({
      'branch-a': { branchSharePct: 40, platformSharePct: 60 },
    });
  });

  it('seeds missing selected stores from fallback', () => {
    const result = seedBranchShareSplits(
      ['branch-a', 'branch-b'],
      { 'branch-a': { branchSharePct: 40, platformSharePct: 60 } },
      { branchSharePct: 50, platformSharePct: 50 },
    );

    expect(result).toEqual({
      'branch-a': { branchSharePct: 40, platformSharePct: 60 },
      'branch-b': { branchSharePct: 50, platformSharePct: 50 },
    });
  });
});

describe('parseBranchShareSplits', () => {
  it('parses JSON string payloads', () => {
    expect(
      parseBranchShareSplits(
        JSON.stringify({ 'branch-a': { branchSharePct: 45, platformSharePct: 55 } }),
      ),
    ).toEqual({
      'branch-a': { branchSharePct: 45, platformSharePct: 55 },
    });
  });
});

describe('validateSelectedBranchShareSplits', () => {
  it('validates every branch when scope is all and splits are present', () => {
    expect(
      validateSelectedBranchShareSplits(
        'SHARED',
        'all',
        [],
        { 'branch-a': { branchSharePct: 40, platformSharePct: 50 } },
      ),
    ).toMatch(/every branch/);
    expect(
      validateSelectedBranchShareSplits(
        'SHARED',
        'all',
        [],
        { 'branch-a': { branchSharePct: 40, platformSharePct: 60 } },
      ),
    ).toBeNull();
  });
});
