import { describe, expect, it } from 'vitest';
import {
  isPromoAvailableAtStore,
  parseBranchShareSplits,
  resolveSharePercentages,
  resolveSharePercentagesForStore,
  validateSelectedBranchShareSplits,
  normalizeBranchShareSplits,
} from '../../src/lib/promotionUsage';

describe('isPromoAvailableAtStore', () => {
  it('allows any store when storeIds is null', () => {
    expect(isPromoAvailableAtStore(null, 'store-1')).toBe(true);
  });

  it('allows any store when storeIds is undefined', () => {
    expect(isPromoAvailableAtStore(undefined, 'store-1')).toBe(true);
  });

  it('allows any store when storeIds is empty array', () => {
    expect(isPromoAvailableAtStore([], 'store-1')).toBe(true);
  });

  it('allows store when included in storeIds', () => {
    expect(isPromoAvailableAtStore(['store-1', 'store-2'], 'store-1')).toBe(true);
  });

  it('rejects store when not included in storeIds', () => {
    expect(isPromoAvailableAtStore(['store-1', 'store-2'], 'store-3')).toBe(false);
  });
});

describe('resolveSharePercentagesForStore', () => {
  it('uses per-store split when SHARED and store is in the map', () => {
    expect(
      resolveSharePercentagesForStore(
        'SHARED',
        'store-1',
        50,
        50,
        { 'store-1': { branchSharePct: 40, platformSharePct: 60 } },
      ),
    ).toEqual({ branchSharePct: 40, platformSharePct: 60 });
  });

  it('falls back to promo-level split when store is missing from the map', () => {
    expect(
      resolveSharePercentagesForStore('SHARED', 'store-2', 50, 50, {
        'store-1': { branchSharePct: 40, platformSharePct: 60 },
      }),
    ).toEqual({ branchSharePct: 50, platformSharePct: 50 });
  });

  it('ignores the map for PLATFORM ownership', () => {
    expect(
      resolveSharePercentagesForStore(
        'PLATFORM',
        'store-1',
        0,
        100,
        { 'store-1': { branchSharePct: 40, platformSharePct: 60 } },
      ),
    ).toEqual({ branchSharePct: 0, platformSharePct: 100 });
  });

  it('parseBranchShareSplits skips invalid entries', () => {
    expect(parseBranchShareSplits({ 'store-1': { branchSharePct: 30, platformSharePct: 70 }, bad: 1 })).toEqual({
      'store-1': { branchSharePct: 30, platformSharePct: 70 },
    });
  });

  it('validateSelectedBranchShareSplits requires every selected store', () => {
    expect(
      validateSelectedBranchShareSplits('SHARED', ['a', 'b'], {
        a: { branchSharePct: 50, platformSharePct: 50 },
      }),
    ).toMatch(/every selected branch/);
    expect(
      validateSelectedBranchShareSplits('SHARED', ['a'], {
        a: { branchSharePct: 40, platformSharePct: 60 },
      }),
    ).toBeNull();
  });

  it('normalizeBranchShareSplits keeps all-branch overrides when storeIds is empty', () => {
    expect(
      normalizeBranchShareSplits('SHARED', null, { a: { branchSharePct: 40, platformSharePct: 60 } }),
    ).toEqual({ a: { branchSharePct: 40, platformSharePct: 60 } });
    expect(
      normalizeBranchShareSplits('SHARED', [], { a: { branchSharePct: 40, platformSharePct: 60 } }),
    ).toEqual({ a: { branchSharePct: 40, platformSharePct: 60 } });
  });

  it('normalizeBranchShareSplits keeps only selected store splits for SHARED promos', () => {
    expect(
      normalizeBranchShareSplits('SHARED', ['store-1', 'store-2'], {
        'store-1': { branchSharePct: 30, platformSharePct: 70 },
        'store-2': { branchSharePct: 60, platformSharePct: 40 },
        'store-3': { branchSharePct: 50, platformSharePct: 50 },
      }),
    ).toEqual({
      'store-1': { branchSharePct: 30, platformSharePct: 70 },
      'store-2': { branchSharePct: 60, platformSharePct: 40 },
    });
  });

  it('validateSelectedBranchShareSplits validates keyed stores when scope is all-branches', () => {
    expect(
      validateSelectedBranchShareSplits('SHARED', null, {
        a: { branchSharePct: 40, platformSharePct: 50 },
      }),
    ).toMatch(/every branch/);
    expect(
      validateSelectedBranchShareSplits('SHARED', null, {
        a: { branchSharePct: 40, platformSharePct: 60 },
      }),
    ).toBeNull();
  });

  it('parseBranchShareSplits parses JSON string payloads from the database', () => {
    expect(
      parseBranchShareSplits(
        JSON.stringify({ 'store-1': { branchSharePct: 45, platformSharePct: 55 } }),
      ),
    ).toEqual({
      'store-1': { branchSharePct: 45, platformSharePct: 55 },
    });
  });

  it('resolveSharePercentages still uses the global pair', () => {
    expect(resolveSharePercentages('SHARED', 25, 75)).toEqual({ branchSharePct: 25, platformSharePct: 75 });
  });
});
